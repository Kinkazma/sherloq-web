// Execution adapter only. Every pixel passes through the same canonical LCMS.
import {createSourceSamplesCodecPeer} from './source-samples-codec-peer.js';
import {EngineError, requireValue, checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {colorTransformOptions,COLOR_TRANSFORM_LAYOUTS} from './color-managed-runtime.js';
import {COLOR_NATIVE_RESOURCE} from './color-managed-resource.js';
import {describeCanonicalColorLane} from './canonical-color-plan.js';

const constructors={uint8:Uint8Array,uint16:Uint16Array,float32:Float32Array};
const ack = async action => { const value = await action(); if (value === false || value === 0) throw value; return value; };

/** localTransform is borrowed from the same captured Original projector.
 * Each returned receipt must be retired after its store-write ACK. It never
 * becomes a public SourceSamples method or an independent Original owner.
 * Creation is synchronous and allocates no funded backing. The caller MUST
 * adopt this owner before invoking convert; calculation failures remain exact,
 * and only actual retirement refusals carry a retry owner. */
export function createCanonicalColorExecution({budget, scheduler, localTransform, transformOptions,
  maximumPixels, executionPlan,
  workerURL = new URL('./canonical-color-worker.js', import.meta.url),
  workerFactory = url => new Worker(url, {type: 'module'}), signal} = {}) {
  const options = colorTransformOptions(transformOptions);
  const input=COLOR_TRANSFORM_LAYOUTS.inputs[options.inputFormat],output=COLOR_TRANSFORM_LAYOUTS.outputs[options.outputFormat],Input=constructors[input?.sampleType],Output=constructors[output?.sampleType];
  requireValue(input && output && Input && Output
    && budget?.reserve && localTransform?.convert && typeof workerFactory === 'function'
    && Number.isSafeInteger(maximumPixels) && maximumPixels > 0
    && executionPlan?.workerCount >= 2,
  'The canonical colour owner needs an explicit borrowed transform and budget.');
  const localMetadata = localTransform.metadata;
  const sameSignature = metadata => metadata?.inputFormat === options.inputFormat
    && metadata.outputFormat === options.outputFormat && metadata.intent === options.intent
    && metadata.blackPointCompensation === options.blackPointCompensation
    && metadata.inputUnits === options.inputUnits && metadata.extendedPolicy === options.extendedPolicy;
  requireValue(sameSignature(localMetadata)
    && /^[a-f0-9]{64}$/.test(localMetadata.inputProfileSha256 ?? ''),
  'The borrowed local transform differs from the exact canonical colour contract.');
  const lanePlan=executionPlan.lanePlan,expected=describeCanonicalColorLane({inputFormat:options.inputFormat,outputFormat:options.outputFormat,
    profileBytes:options.inputProfileBytes.byteLength,maximumChunkPixels:lanePlan?.maximumChunkPixels,
    maximumMemoryBytes:lanePlan?.maximumMemoryBytes});
  requireValue(Object.entries(expected).every(([key,value])=>lanePlan[key]===value),
    'The selected lane differs from its exact funded colour contract.');
  // Borrow the exact Core scheduler; never create another quota or registry.
  requireValue(scheduler?.budget===budget&&Number.isInteger(scheduler.capacity?.cpu)
    &&scheduler.capacity.cpu>0,'The captured Core execution scheduler is required.');
  const maximum=scheduler.capacity.cpu,
    workerCount=executionPlan.workerCount,maximumMemoryBytes=lanePlan.maximumMemoryBytes,
    maximumChunkPixels=lanePlan.maximumChunkPixels;
  requireValue(Number.isInteger(workerCount)&&workerCount>=2&&workerCount<=maximum,
    'The selected lane count exceeds the captured Core scheduler.');
  const stop = new AbortController(), joined = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const lanes = [], results = new Map(), waiting = new Set(), failedOperations = new Set();
  let band, operation, retirement, closing = false, closed = false, serial = 0, failed = false, primary,
    profileFee, profileReady = false, launchFunding, pendingResultFee, declined=false;
  const metrics = {policy: 'canonical LCMS workers after a complete useful serial band',
    schedulerCapacity: scheduler.capacity.cpu, maximumWorkers: maximum,
    createdWorkers: 0, remotePixels: 0, remoteCmmMs: 0,
    maximumActiveConversions: 0, activeConversions: 0, completedBands: 0,
    assessment: executionPlan.assessment,
    costModel: executionPlan.costModel};
  const wake = () => { for (const resume of waiting) resume(); waiting.clear(); };
  const fail = error => {
    if(closing&&!operation&&!band){wake();return;}
    if (!failed) { failed = true; primary = error; }
    band?.reject(primary); wake();
  };
  const abort = () => fail(new EngineError('CANCELLED', 'The canonical colour projection was cancelled.'));
  joined.addEventListener('abort', abort, {once: true});
  const open = () => {
    checkAbort(joined);
    if (closing || closed) throw new EngineError('CLOSED', 'The canonical colour owner is retiring.');
    if (failed) throw primary;
  };

  async function prepareProfile() {
    if (profileReady) return;
    // Profile views may share a much larger backing. Capture only the exact
    // declared bytes, under a durable credit, before any structured clone.
    requireValue(profileFee,'The exact ICC copy must be funded before preparation.');
    const exactProfile = new Uint8Array(options.inputProfileBytes.byteLength);
    exactProfile.set(options.inputProfileBytes); options.inputProfileBytes = exactProfile;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', options.inputProfileBytes)),
      value => value.toString(16).padStart(2, '0')).join('');
    requireValue(digest === localMetadata.inputProfileSha256,
      'The canonical worker ICC differs from the borrowed local transform.');
    checkAbort(joined); profileReady = true;
  }

  async function requestBlock(lane) {
    requireValue(!lane.assigned, 'A colour lane still owns its preceding block.');
    for (;;) {
      if (closing || failed || joined.aborted) return {done: true};
      if (!band || band.next >= band.pixels) {
        await new Promise(resolve => waiting.add(resolve)); continue;
      }
      const current = band;
      const lease = await scheduler.acquire({cpu: 1, signal: joined,
        label: 'canonical-color-cmm', resourceOwner: 'original-color-projection', operation: current.resourceOperation});
      // Other lanes may have claimed the last block while admission awaited.
      if (closing || failed || band !== current || current.next >= current.pixels) { lease.release(); continue; }
      const start = current.next, pixels = Math.min(maximumChunkPixels, current.pixels - start);
      current.next += pixels;
      const assignment = {id: ++serial, start, pixels, lease, band: current};
      lane.assigned = assignment;
      try {
        // A subarray would clone the whole parent band's backing. This exact
        // slice is one of the two input transports reserved before creation.
        const length = pixels * input.channels, samples = new Input(length);
        samples.set(new Input(current.samples.buffer,
          current.samples.byteOffset + start * input.bytesPerPixel, length));
        metrics.activeConversions++;
        metrics.maximumActiveConversions = Math.max(metrics.maximumActiveConversions, metrics.activeConversions);
        return {id: assignment.id, pixels, samples};
      } catch (error) { lane.assigned = null; lease.release(); throw error; }
    }
  }

  function acceptBlock(lane, value) {
    const assigned = lane.assigned;
    requireValue(assigned && value.id === assigned.id && value.pixels instanceof Output
      && value.pixels.length === assigned.pixels * output.channels
      && Number.isSafeInteger(value.heapBytes) && value.heapBytes <= maximumMemoryBytes
      && Number.isFinite(value.convertMs) && value.convertMs >= 0,
    'The canonical colour response differs from its exact admitted block.');
    lane.backing?.resize(maximumMemoryBytes, {materializedBytes: value.heapBytes});
    // The lane's resident transport fee remains held until physical retirement.
    // A failed/cancelled band is never exposed to the caller.
    if (!failed && band === assigned.band) {
      assigned.band.result.pixels.set(value.pixels, assigned.start * output.channels);
      assigned.band.committed += assigned.pixels;
      metrics.remotePixels += assigned.pixels;
      metrics.remoteCmmMs += value.convertMs;
    }
    lane.assigned = null; assigned.lease.release(); metrics.activeConversions--;
    if (!failed && assigned.band.committed === assigned.band.pixels) assigned.band.resolve();
    return {accepted: true};
  }

  function startLane(lane) {
    lane.startedAt=performance.now();
    try {
      lane.backing = budget.registerBacking?.('wasm', maximumMemoryBytes,
        {owner: 'original-color-projection', label: 'canonical-color-cmm', state: 'reserved'});
      let resolveReady, rejectReady;
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      lane.peer = createSourceSamplesCodecPeer({workerURL, workerFactory:url=>{const captured=workerFactory(url);lane.workerCreated=true;metrics.createdWorkers++;return captured;}, signal: joined,
        async handleRequest(action, value) {
          try {
            if (action === 'ready') {
              requireValue(!lane.ready && value?.inputProfileSha256 === localMetadata.inputProfileSha256
                && sameSignature(value)
                && Number.isSafeInteger(value.heapBytes) && value.heapBytes <= maximumMemoryBytes,
              'The worker acquired a different canonical transform.');
              lane.backing?.resize(maximumMemoryBytes, {materializedBytes: value.heapBytes});
              lane.ready = true; lane.startupMs = performance.now() - lane.startedAt; resolveReady(); return {accepted: true};
            }
            requireValue(lane.ready, 'The colour worker has not acquired its transform.');
            if (action === 'next') return await requestBlock(lane);
            if (action === 'converted') return acceptBlock(lane, value);
            throw new EngineError('INVALID_INPUT', 'Unknown internal colour-worker action.');
          } catch (error) { rejectReady(error); fail(error); throw error; }
        }});
      lane.started = scheduler.run({cpu: 1, signal: joined, label: 'canonical-color-cmm-prepare',
        resourceOwner: 'original-color-projection'}, async () => {
        lane.completion = lane.peer.start({options, admission: lanePlan});
        lane.completion.catch(error => { rejectReady(error); fail(error); });
        await ready;
      });
      lane.started.catch(fail); return lane;
    } catch (error) { fail(error); throw error; }
  }

  const owner = {
    async convert(samples) {
      open(); requireValue(!operation && samples instanceof Input
        && samples.length % input.channels === 0 && samples.length > 0,
      'One exact canonical colour band may execute at a time.');
      const pixels = samples.length / input.channels;
      requireValue(pixels <= maximumPixels, 'The band exceeds its admitted maximum.');
      if(declined)return null;
      let release;
      try{
        if(!launchFunding){
          const total=workerCount*lanePlan.residentBytes+lanePlan.profileBytes+pixels*output.bytesPerPixel;
          requireValue(Number.isSafeInteger(total),'The launch exceeds safe resource accounting.');
          try{launchFunding=budget.reserve(total);}catch(error){
            if(error?.code==='MEMORY_LIMIT'){declined=true;metrics.admission='serial-before-worker';return null;}
            throw error;
          }
          // Durable ownership precedes every split, allocation and await.
          requireValue(typeof launchFunding.split==='function','The captured launch reservation must be splittable.');
          profileFee=launchFunding.split(lanePlan.profileBytes);
          for(let i=0;i<workerCount;i++){
            const lane={release:null,assigned:null,peer:null,certificate:null,ready:false,
              startedAt:null,startupMs:null,workerCreated:false};
            lanes.push(lane);lane.release=launchFunding.split(lanePlan.residentBytes);
          }
          pendingResultFee=launchFunding.split(pixels*output.bytesPerPixel);release=pendingResultFee;
        }else{pendingResultFee=budget.reserve(pixels*output.bytesPerPixel);release=pendingResultFee;}
      }catch(error){fail(error);throw error;}
      let result, receipt;
      try {
        result = {pixels: null, release, published: false};
        receipt = Object.freeze({get pixels() { return result.pixels; }});
        results.set(receipt, result);pendingResultFee=null;
        result.pixels = new Output(pixels * output.channels);
      }catch (error) { fail(error);throw error; }
      const resourceOperation = budget.beginOperation?.({owner: 'original-color-projection', id: 'canonical-color-band'});
      const task = (async () => {
        try {
          await prepareProfile();
          await new Promise((resolve,reject)=>{
            band={samples,result,pixels,next:0,committed:0,resolve,reject,resourceOperation};
            try{for(const lane of lanes)if(!lane.started)startLane(lane);wake();}catch(error){fail(error);}
          });
          open(); result.published = true; metrics.completedBands++; return receipt;
        } catch (error) {
          fail(error); throw error;
        } finally {
          band = null;
          // A failed lane may still own an admitted CPU task. Its parent
          // operation stays live until the captured endpoint has retired.
          if (failed && resourceOperation) failedOperations.add(resourceOperation);
          else resourceOperation?.release();
        }
      })();
      operation = task;
      try { return await task; } finally { operation = null; }
    },
    retireResult(receipt) {
      const result = results.get(receipt);
      requireValue(result, 'The colour result belongs to another receipt.');
      if (result.retirement) return result.retirement;
      const task = (async () => {
        // The immutable receipt never exposes its release function. Keep both
        // pixels and credit reachable until the exact release acknowledges.
        await ack(() => result.release());
        results.delete(receipt); result.pixels = null; result.release = null;
        return {retired: true};
      })().catch(error=>{throw withRetirementOwner(error,{dispose:()=>owner.retireResult(receipt)},error);});
      result.retirement = task;
      task.then(() => { result.retirement = null; }, () => { result.retirement = null; });
      return task;
    },
    dispose() {
      if (closed) return Promise.resolve(); if (retirement) return retirement;
      closing = true;
      for(const lane of lanes)if(!lane.ready)lane.retirementAbortRequested=true;
      // Also interrupt unused preparation/fetch after the last band completed.
      // fail() distinguishes this normal retirement from cancelled active work.
      stop.abort(); wake();
      const task = (async () => {
        await Promise.allSettled([operation, ...lanes.map(l => l.started)].filter(Boolean));
        // closing+wake drains parked next requests. A real done/failed must
        // precede close, otherwise the late failure could reject its close
        // control although the endpoint still owes the native-close ACK.
        await Promise.allSettled(lanes.map(l => l.completion).filter(Boolean));
        // Do not claim a store-write ACK on behalf of the consumer.
        if ([...results.values()].some(result => result.published))
          throw new EngineError('BUSY', 'A published colour result still needs its consumer ACK.');
        for (const lane of lanes) {
          if (!lane.certificate) {
            if (lane.peer) {
              await ack(() => lane.peer.dispose());
              lane.certificate = await lane.peer.terminate();
            } else lane.certificate = {terminated: true, kind: 'never-created'};
            requireValue(lane.certificate?.terminated === true, 'The colour worker has no retirement certificate.');
          }
          if (lane.assigned) { lane.assigned.lease.release(); lane.assigned = null; metrics.activeConversions--; }
          if (lane.backing) {
            const retired = lane.backing(); lane.backing = null;
            if (retired) budget.notifyBackingRelease?.('wasm', retired);
          }
          if (lane.release) { await ack(() => lane.release()); lane.release = null; }
        }
        for (const receipt of [...results.keys()]) await owner.retireResult(receipt);
        if(pendingResultFee){await ack(()=>pendingResultFee());pendingResultFee=null;}
        for (const resourceOperation of failedOperations) resourceOperation.release();
        failedOperations.clear();
        if (profileFee) { await ack(() => profileFee()); profileFee = null; }
        if(launchFunding){await ack(()=>launchFunding());launchFunding=null;}
        options.inputProfileBytes = null;
        joined.removeEventListener('abort', abort); closed = true;
      })().catch(error=>{throw withRetirementOwner(error,owner,error);});
      retirement = task;
      task.then(() => { retirement = null; }, () => { retirement = null; }); return task;
    },
    metrics() {
      const startup = lanes.map(l => l.startupMs).filter(Number.isFinite);
      return {...metrics, closed, closing, failed,
        residentWorkers: lanes.filter(l => l.workerCreated&&l.release).length,
        fundedLanes:lanes.filter(l=>l.release).length,
        resultReceipts: results.size, declined, lanePlan,
        retirementAbortRequested:lanes.filter(l=>l.workerCreated&&l.retirementAbortRequested).length,
        startupMs: {minimum: startup.length ? Math.min(...startup) : 0,
          maximum: startup.length ? Math.max(...startup) : 0, total: startup.reduce((a,b) => a+b,0)},
        retiredWorkers: lanes.filter(l => l.workerCreated&&l.certificate?.terminated).length,
        nativeCloseAcknowledged: lanes.filter(l => l.certificate?.nativeCloseAcknowledged).length,
        capturedWorkerExits: lanes.filter(l => l.certificate?.kind === 'captured-worker-exit').length,
        browserTerminateRequested: lanes.filter(l => l.certificate?.kind === 'browser-terminate-requested').length};
    },
  };
  checkAbort(joined); return owner;
}
