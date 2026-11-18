import {rawSensorChannelLayout} from './raw-sensor-histogram-core.js?v=0.33.2';
import {allocateTypedArray} from './unified-engine/src/allocation.js';
import {EngineError, checkAbort, requireValue} from './unified-engine/src/errors.js';
import {histogramSummary} from './unified-engine/src/histogram.js';
import {createFloat32HistogramAggregate} from './native-channel-histogram-core.js?v=0.33.2';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';

const binCount = 65536;
const bindingFields = ['imageId', 'sourceSurfaceId', 'sourceRevision', 'sourceSha256', 'kind'];
const isSha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;

function sameBinding(actual, expected) {
  return !!actual && bindingFields.every(field => actual[field] === expected[field]);
}

function sameChannels(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((channel, index) => channel === expected[index]);
}

function sensorMetadata(receipt, bindingOriginal) {
  const descriptor = receipt?.descriptor;
  const calibration = descriptor?.provenance?.calibration;
  requireValue(receipt?.domain === 'sensor' && receipt.frame === 0
    && sameBinding(receipt.bindingOriginal, bindingOriginal) && descriptor?.domain === 'sensor'
    && descriptor.id === receipt.sourceId && descriptor.revision === receipt.revision
    && descriptor.format === 'native-samples' && descriptor.identityStatus === 'fixed'
    && sameBinding(descriptor.bindingOriginal, bindingOriginal)
    && descriptor.sampleModel === 'raw-decoded-sensor' && descriptor.orientation === 1
    && descriptor.sourceWidth === descriptor.width && descriptor.sourceHeight === descriptor.height
    && isPositiveInteger(descriptor.width) && isPositiveInteger(descriptor.height)
    && Number.isSafeInteger(descriptor.width * descriptor.height)
    && calibration?.schema === 'raw-sensor-post-unpack/1' && isSha256(calibration.sha256)
    && isPositiveInteger(calibration.bytes), 'The sensor receipt must match the canonical Original and raw grid.');
  if (!['uint16', 'float32'].includes(descriptor.sampleType)) {
    throw new EngineError('SENSOR_HISTOGRAM_UNSUPPORTED', 'Unsupported raw sensor sample type.');
  }
  const containerBits = descriptor.sampleType === 'uint16' ? 16 : 32;
  requireValue(descriptor.containerBits === containerBits && [1, 3, 4].includes(descriptor.channels)
    && Array.isArray(descriptor.channelMap) && descriptor.channelMap.length === descriptor.channels
    && descriptor.channelMap.every((name, index) => name === 'sensor-' + index)
    && (descriptor.sourceDepth === null || isPositiveInteger(descriptor.sourceDepth) && descriptor.sourceDepth <= containerBits)
    && descriptor.sampleSemantics?.stage === 'post-unpack-before-raw2image'
    && descriptor.sampleSemantics.developmentApplied === false
    && descriptor.valueEncoding?.kind === 'decoded-sensor-sample'
    && descriptor.valueEncoding.normalization === 'none', 'Unexpected raw sensor representation.');
  return Object.freeze({
    bindingOriginal,
    sourceId: receipt.sourceId,
    sourceRevision: receipt.revision,
    domain: 'sensor',
    frame: 0,
    width: descriptor.width,
    height: descriptor.height,
    orientation: 1,
    sampleType: descriptor.sampleType,
    sourceDepth: descriptor.sourceDepth,
    containerBits: descriptor.containerBits,
    channels: Object.freeze([...descriptor.channelMap]),
    sampleSemantics: Object.freeze({...descriptor.sampleSemantics}),
    valueEncoding: Object.freeze({...descriptor.valueEncoding}),
    calibration: Object.freeze({schema: calibration.schema, sha256: calibration.sha256, bytes: calibration.bytes}),
  });
}

function checkWindow(window, source, metadata, rect) {
  requireValue(window?.sourceLeaseId === source.sourceLeaseId && typeof window.windowLeaseId === 'string'
    && window.sourceId === metadata.sourceId && window.revision === metadata.sourceRevision
    && window.domain === 'sensor' && window.frame === 0 && sameBinding(window.bindingOriginal, metadata.bindingOriginal)
    && window.origin?.[0] === rect.x && window.origin?.[1] === rect.y
    && window.width === rect.width && window.height === rect.height
    && window.sampleType === metadata.sampleType && window.containerBits === metadata.containerBits
    && window.sourceDepth === metadata.sourceDepth
    && window.sampleModel === 'raw-decoded-sensor'
    && ['kind', 'normalization', 'units'].every(key => window.valueEncoding?.[key] === metadata.valueEncoding[key])
    && window.channels === metadata.channels.length && sameChannels(window.channelMap, metadata.channels)
    && window.samples instanceof (metadata.sampleType === 'uint16' ? Uint16Array : Float32Array)
    && window.samples.length === rect.width * rect.height * metadata.channels.length,
  'The sensor window differs from its captured receipt and grid.');
}

// The caller supplies the already loaded Original client and its aggregate
// allocator. No capture of a developed RGB rectangle enters this operation.
export async function readRawSensorHistogram(client, original, {
  reserve, signal, maximumWindowBytes = 1024 ** 2, onProgress, byFilter=false, rect:requestedRect,
} = {}) {
  const bindingOriginal = Object.freeze({
    imageId: original?.id,
    sourceSurfaceId: original?.surface?.id,
    sourceRevision: original?.surface?.revision,
    sourceSha256: original?.sha256,
    kind: 'encoded',
  });
  requireValue(typeof client?.prepareSourceSamples === 'function'
    && typeof client.readSourceSamples === 'function' && typeof client.retireSourceSamples === 'function'
    && typeof reserve === 'function' && isPositiveInteger(maximumWindowBytes)
    && typeof bindingOriginal.imageId === 'string' && typeof bindingOriginal.sourceSurfaceId === 'string'
    && isPositiveInteger(bindingOriginal.sourceRevision) && isSha256(bindingOriginal.sourceSha256),
  'A funded histogram requires the loaded canonical Original client.');
  checkAbort(signal);

  let source, retiredSource, window, release, scratchRelease, floatAggregate, data, published = false, disposing, finishing, closed = false;
  let releaseRefused = false, scratchRefused = false;
  let refusal = false;
  async function retireReceipt(receipt) {
    const acknowledgement = await client.retireSourceSamples(receipt);
    if (acknowledgement === false || acknowledgement === 0) throw acknowledgement;
    requireValue(acknowledgement?.retired === true, 'The SourceSamples retirement was not acknowledged.');
  }
  async function retireWindow() {
    if (window) {
      await retireReceipt(window);
      window = null;
    }
  }
  async function retireSource() {
    if (source) {
      await retireReceipt(source);
      retiredSource = source;
      source = null;
    }
  }
  async function releaseAggregate() {
    if (!release) return;
    const releaseOnce = async () => {
      const acknowledgement = await release();
      if (acknowledgement === false || acknowledgement === 0) throw acknowledgement;
    };
    try {
      await releaseOnce();
    } catch (primary) {
      if (!releaseRefused || !retiredSource) {
        releaseRefused = true;
        throw primary;
      }
      // Normal release can succeed after a transient failure. If it still
      // refuses, the exact previously acknowledged receipt lets the existing
      // control link resume the captured peer's retirement before release.
      try {
        await retireReceipt(retiredSource);
        await releaseOnce();
      } catch (cleanup) {
        throw withRetirementOwner(primary, owner, cleanup);
      }
    }
    release = null;
    retiredSource = null;
  }
  async function releaseScratch() {
    if (!scratchRelease) return;
    floatAggregate = null;
    const releaseOnce = async () => {
      const acknowledgement = await scratchRelease();
      if (acknowledgement === false || acknowledgement === 0) throw acknowledgement;
    };
    try {await releaseOnce();} catch (primary) {
      if (!scratchRefused || !retiredSource) {scratchRefused = true; throw primary;}
      try {await retireReceipt(retiredSource); await releaseOnce();}
      catch (cleanup) {throw withRetirementOwner(primary, owner, cleanup);}
    }
    scratchRelease = null;
  }
  const owner = {
    get data() {return published ? data : null;},
    finish() {
      checkAbort(signal);
      requireValue(!closed && !disposing && data && !scratchRelease, 'The whole sensor histogram is not complete.');
      if (published) return Promise.resolve(owner);
      if (finishing) return finishing;
      const task = (async () => {
        try {
          await retireSource();
        } catch (error) {
          refusal = true;
          throw withRetirementOwner(error, owner, error);
        }
        checkAbort(signal);
        if (disposing) throw new EngineError('CANCELLED', 'The raw sensor histogram is closing.');
        published = true;
        return owner;
      })();
      finishing = task;
      task.then(() => {finishing = null;}, () => {finishing = null;});
      return task;
    },
    dispose() {
      if (closed) return Promise.resolve();
      if (disposing) return disposing;
      published = false;
      const task = (async () => {
        if (finishing) await Promise.allSettled([finishing]);
        await retireWindow();
        await retireSource();
        await releaseScratch();
        await releaseAggregate();
        data = null;
        closed = true;
      })();
      disposing = task;
      task.then(() => {disposing = null;}, () => {disposing = null;});
      return task;
    },
  };

  try {
    source = await client.prepareSourceSamples({imageId: bindingOriginal.imageId, domain: 'sensor', frame: 0, bindingOriginal}, {signal});
    checkAbort(signal);
    const metadata = sensorMetadata(source, bindingOriginal);
    const fullWidth=metadata.width,fullHeight=metadata.height,region=requestedRect??{x:0,y:0,width:fullWidth,height:fullHeight};
    requireValue([region.x,region.y,region.width,region.height].every(Number.isSafeInteger)&&region.x>=0&&region.y>=0&&region.width>0&&region.height>0&&region.x+region.width<=fullWidth&&region.y+region.height<=fullHeight,'Sensor region is outside its physical grid.');
    const width=region.width,height=region.height,facts=metadata.sampleSemantics?.sensor;
    requireValue(typeof byFilter==='boolean'&&(!byFilter||facts?.schema==='sherloq.raw-sensor-facts/1'),'Filter histograms need preserved sensor facts.');
    const layout=byFilter?rawSensorChannelLayout(facts):null,channels=layout?.channels??metadata.channels,channelCount=channels.length;
    const counts=new Array(channelCount).fill(0),sparse=layout?.cfa===true;
    const channelAt=(i,rect)=>layout.channelAt(rect.x+i%rect.width,rect.y+Math.floor(i/rect.width));
    const maximumPixels = Math.floor(maximumWindowBytes / ((metadata.sampleType === 'uint16' ? 2 : 4) * metadata.channels.length));
    requireValue(maximumPixels > 0, 'The window admission must hold at least one raw sensor site.');

    const length = channelCount * binCount;
    release = await reserve(2 * length * Float64Array.BYTES_PER_ELEMENT);
    requireValue(typeof release === 'function', 'The histogram workspace must have a retirement handle.');
    checkAbort(signal);
    const bins = allocateTypedArray(Float64Array, length, {label: 'raw-sensor-histogram-bins'});
    const cumulative = allocateTypedArray(Float64Array, length, {label: 'raw-sensor-histogram-cumulative'});
    const tileWidth = Math.min(width, maximumPixels);
    const tileHeight = tileWidth === width ? Math.floor(maximumPixels / width) : 1;
    const total = width * height;
    if (metadata.sampleType === 'float32') {
      // Prefix counts become suffix counts after pass one; neither pass keeps
      // the sensor image or a sorted copy. The one-word decoder is scratch too.
      scratchRelease = await reserve(length * Float64Array.BYTES_PER_ELEMENT + Float32Array.BYTES_PER_ELEMENT);
      requireValue(typeof scratchRelease === 'function', 'Float32 rank workspace needs a retirement handle.');
      checkAbort(signal);
      floatAggregate = createFloat32HistogramAggregate({channels: channelCount, total, bins, cumulative,
        ranks: allocateTypedArray(Float64Array, length, {label: 'raw-sensor-float32-ranks'}),
        sampleCell: allocateTypedArray(Float32Array, 1, {label: 'raw-sensor-float32-rank-word'})});
      for (let pass = 0; pass < 2; pass++) {
        let observed = 0;
        for (let y = 0; y < height; y += tileHeight) {
          for (let x = 0; x < width; x += tileWidth) {
            checkAbort(signal);
            const rect = {x:region.x+x, y:region.y+y, width: Math.min(tileWidth, width - x), height: Math.min(tileHeight, height - y)};
            window = await client.readSourceSamples({...source, rect}, {signal});
            checkAbort(signal);
            checkWindow(window, source, metadata, rect);
            if(sparse){if(pass===0)floatAggregate.appendFirstSparse(window.samples,i=>channelAt(i,rect));else floatAggregate.appendSecondSparse(window.samples,i=>channelAt(i,rect));}
            else if (pass === 0) floatAggregate.appendFirst(window.samples);
            else floatAggregate.appendSecond(window.samples);
            try {await retireWindow();} catch (error) {
              refusal = true;
              throw withRetirementOwner(error, owner, error);
            }
            observed += rect.width * rect.height;
            checkAbort(signal);
            onProgress?.({observed, total, pass: pass + 1, passes: 2});
          }
        }
        requireValue(observed === total, 'The Float32 pass must cover the complete raw sensor grid.');
        if (pass === 0) floatAggregate.beginSecond();
      }
      data = Object.freeze({schema: 'sherloq.raw-sensor-histogram/1', source: metadata, channels, rect:{...region}, ...floatAggregate.finish()});
      floatAggregate = null;
      try {await releaseScratch();} catch (error) {
        refusal = true;
        throw withRetirementOwner(error, owner, error);
      }
      return await owner.finish();
    }
    let observed = 0;
    for (let y = 0; y < height; y += tileHeight) {
      for (let x = 0; x < width; x += tileWidth) {
        checkAbort(signal);
        const rect = {x:region.x+x, y:region.y+y, width: Math.min(tileWidth, width - x), height: Math.min(tileHeight, height - y)};
        window = await client.readSourceSamples({...source, rect}, {signal});
        checkAbort(signal);
        checkWindow(window, source, metadata, rect);
        let samples = window.samples;
        if(sparse){for(let index=0;index<samples.length;index++){const channel=channelAt(index,rect);bins[channel*binCount+samples[index]]++;counts[channel]++;}}
        else for (let channel = 0; channel < channelCount; channel++) {
          const offset = channel * binCount;
          for (let index = channel; index < samples.length; index += channelCount) {
            bins[offset + samples[index]]++;
          }
          counts[channel]+=rect.width*rect.height;
        }
        samples = null;
        try {
          await retireWindow();
        } catch (error) {
          refusal = true;
          throw withRetirementOwner(error, owner, error);
        }
        observed += rect.width * rect.height;
        checkAbort(signal);
        onProgress?.({observed, total});
      }
    }
    checkAbort(signal);
    requireValue(observed === total, 'The histogram must cover the complete raw sensor grid.');
    const summaries = channels.map((_, channel) => {
      const offset = channel * binCount;
      let count = 0;
      for (let code = 0; code < binCount; code++) {
        count += bins[offset + code];
        cumulative[offset + code] = count;
      }
      requireValue(count === (sparse?counts[channel]:total), 'A sensor histogram channel lost observations.');
      // The common summary's channel stride is 256. Pass one native channel.
      return histogramSummary(bins.subarray(offset, offset + binCount), 0, 0, binCount - 1, sparse?counts[channel]:total);
    });
    data = Object.freeze({
      schema: 'sherloq.raw-sensor-histogram/1',
      source: metadata, channels, binCount, bins, cumulative, total, summaries, rect:{...region},...(sparse?{channelCounts:counts}:{}),
    });
    return await owner.finish();
  } catch (primary) {
    if (refusal) throw primary;
    try {
      await owner.dispose();
    } catch (cleanup) {
      throw withRetirementOwner(primary, owner, cleanup);
    }
    throw primary;
  }
}
