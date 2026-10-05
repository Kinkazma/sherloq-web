// Source ownership, independent real crop jobs and cache-only recomposition.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
import {segmentationZoneConcurrency, runSegmentationZones} from './zone-scheduler.js';
let sequence = 0;
export function createSegmentationAnalysis({budget, prepare, inference, project, createLane}) {
  requireValue(budget && prepare && inference?.model && project, 'Actual segmentation pipeline required');
  const model = inference.model, rawBytes = model.side ** 2 * (model.kind === 'softmax' ? 3 : 1) * 4, prefix = 'segmentation-' + (++sequence) + ':';
  const lanes = [{prepare, inference}];
  let revision = 0, current, tail = Promise.resolve(), last, disposed = false;
  const validate = (width, height, zones, mode, segmented = false) => {
    requireValue([width, height].every(v => Number.isInteger(v) && v > 0 && v <= (segmented ? 131072 : 8192)) && (segmented || width * height <= 32 * 1024 ** 2), 'Source geometry');
    requireValue(['regions', 'whole-image'].includes(mode) && Array.isArray(zones) && zones.length > 0 && zones.length <= 256, 'Explicit active zones');
    const ids = new Set();
    for (const zone of zones) {
      const b = zone.bounds, minimum = mode === 'whole-image' ? 1 : 8;
      requireValue(typeof zone.id === 'string' && zone.id.length > 0 && zone.id.length <= 128 && !ids.has(zone.id) && ['region', 'envelope', 'whole-image'].includes(zone.kind), 'Unique zone provenance'); ids.add(zone.id);
      requireValue(Array.isArray(b) && b.length === 4 && b.every(Number.isInteger) && b[0] >= 0 && b[1] >= 0 && b[2] <= width && b[3] <= height && b[2] - b[0] >= minimum && b[3] - b[1] >= minimum, 'Half-open source bounds');
    }
    if (mode === 'whole-image') requireValue(zones.length === 1 && JSON.stringify(zones[0].bounds) === JSON.stringify([0, 0, width, height]), 'Whole source required');
  };
  const start = (work, options = {}) => {
    requireValue(!disposed, 'Segmentation session disposed'); current?.abort(); const controller = new AbortController(), id = ++revision, previous = tail; current = controller;
    const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, {once: true}); if (options.signal?.aborted) controller.abort();
    const check = () => {checkAbort(controller.signal); if (id !== revision || disposed) throw new EngineError('CANCELLED', 'Superseded segmentation result');};
    const progress = event => {check(); options.onProgress?.({...event, revision: id}); check();};
    const task = (async () => {try {await previous; check(); return await work({signal: controller.signal, check, progress, revision: id});} finally {options.signal?.removeEventListener('abort', abort); if (current === controller) current = null;}})();
    tail = task.catch(() => {}); return task;
  };
  const finish = async (context, values, job, counts) => {
    const projectionStarted = performance.now();
    // Useful sessions stay warm while they leave room for the requested result.
    // Segmented stores otherwise choose disk before calling Budget.room(), so
    // retire our idle ONNX helpers first instead of forcing large planes to disk.
    // This also applies to the single-lane hybrid worker: zone concurrency and
    // ownership of reclaimable sessions are independent capabilities.
    let releasedSessionBytes = 0;
    if (context.layout === 'segmented' && typeof inference.releaseIdle === 'function') {
      const resultAndStaging = context.width * context.height * (model.kind === 'softmax' ? 15 : 7) + 96 * 1024 ** 2;
      for (let i = lanes.length - 1; i >= 0 && budget.limit - budget.total() < resultAndStaging; i--) {
        const bytes = lanes[i].inference.residentBytes ?? 0;
        lanes[i].inference.releaseIdle?.(); releasedSessionBytes += bytes - (lanes[i].inference.residentBytes ?? 0);
      }
    }
    const result = await project.run({...context, side: model.side, kind: model.kind, zones: context.zones.map((zone, i) => ({...zone, raw: values[i].raw}))}, {signal: job.signal, onProgress: job.progress});
    try {
      job.check(); const resultId = prefix + job.revision, analysisId = context.analysisId ?? resultId;
      result.metadata = {...result.metadata, modelId: model.id, variant: model.variant, backend: inference.backend ?? 'cpu', execution: {...context.execution, projectionReleasedSessionBytes: releasedSessionBytes}, timings: {...counts.timings, projectionMs: performance.now() - projectionStarted}, pixelSha256: context.pixelSha256, resultId, analysisId, revision: job.revision, sourceProvenance: context.provenance, inferences: counts.inferences, cache_hits: counts.cacheHits, inference_performed: counts.inferences > 0, zones: result.metadata.zones.map((zone, i) => ({...zone, kind: context.zones[i].kind}))};
      last = {...context, allZones: context.allZones ?? context.zones, resultId, analysisId, resultMetadata: structuredClone(result.metadata)}; return result;
    } catch (error) {await result.release(); throw error;}
  };
  return {
    get idleInferenceBytes() {return lanes.reduce((sum,lane)=>sum+(lane.inference.residentBytes??0),0);},
    run({pixels, inputSource, zones, mode = 'regions', exclusions = [], compare = false, provenance = null}, options) {
      const segmented=!!inputSource,width=segmented?inputSource.width:pixels?.width,height=segmented?inputSource.height:pixels?.height;
      requireValue(segmented ? pixels===undefined && typeof inputSource.region==='function' && typeof inputSource.sha256==='function' : pixels?.data instanceof Uint8Array && pixels.data.buffer instanceof ArrayBuffer && pixels.data.length === pixels.width * pixels.height * 3, 'Contiguous qualified RGB8 required');
      requireValue(Array.isArray(exclusions) && !exclusions.length && compare === false, 'Exclusions and Compare are unsupported by native CMSeg/MGCF');
      validate(width, height, zones, mode, segmented);
      const context = {width, height, layout:segmented?'segmented':'contiguous', mode, provenance: structuredClone(provenance), zones: zones.map(z => ({id: z.id, kind: z.kind, bounds: [...z.bounds]}))}; last = null;
      return start(async job => {
        const pinned = [], inserted = []; let sourceRelease, complete = false;
        try {
          const snapshotStarted = performance.now();
          const timings = {cropMs: 0, preparationMs: 0, neuralRpcMs: 0, modelLoadMs: 0, inferenceMs: 0, outputCopyMs: 0, gpuWriteBytes: 0, gpuReadBytes: 0};
          let source;if(segmented)context.pixelSha256=await inputSource.sha256({signal:job.signal,onProgress:job.progress});else{sourceRelease=budget.reserve(pixels.data.byteLength*3);source=pixels.data.slice();context.pixelSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source)),b=>b.toString(16).padStart(2,'0')).join('');}job.check();
          timings.snapshotAndHashMs = performance.now() - snapshotStarted;
          let inferences = 0, cacheHits = 0, completedZones = 0;const parameterRuns=[],sessionRuns=[];
          const groups = [], byKey = new Map();
          for (let i = 0; i < context.zones.length; i++) {
            const zone = context.zones[i];
            zone.cacheKey = prefix + JSON.stringify([model.id, context.pixelSha256, context.width, context.height, zone.bounds]);
            let group = byKey.get(zone.cacheKey);
            if (!group) {group = {index:i, indices:[]}; byKey.set(zone.cacheKey, group); groups.push(group);}
            group.indices.push(i);
          }
          const wanted = createLane ? segmentationZoneConcurrency({budget,model,lanes,zones:groups.map(g=>context.zones[g.index]),segmented}) : 1;
          while (lanes.length > wanted) {const lane = lanes.pop(); lane.inference.dispose(); lane.prepare.dispose();}
          while (lanes.length < wanted) lanes.push(createLane());
          const zoneStarted = performance.now();
          const scheduled = await runSegmentationZones({count:groups.length,lanes,signal:job.signal,run:async (groupIndex,lane,signal) => {
            job.check(); const group=groups[groupIndex],i=group.index,zone = context.zones[i], [x0, y0, x1, y1] = zone.bounds, width = x1 - x0, height = y1 - y0;
            let value = budget.get(zone.cacheKey);
            if (value) {pinned.push(budget.reserve(rawBytes)); cacheHits++;}
            else {
              const cropRelease = segmented?null:budget.reserve(width * height * 3); let prepared, output;
              try {
                const cropStarted = performance.now();
                let input;if(segmented)input=inputSource.region(zone.bounds);else{const crop = new Uint8Array(width * height * 3); let stamp = performance.now();
                for (let y = 0; y < height; y++) {const offset = ((y + y0) * context.width + x0) * 3; crop.set(source.subarray(offset, offset + width * 3), y * width * 3); if (performance.now() - stamp >= 8) {await controlCheckpoint(signal); stamp = performance.now();}}
                input={data:crop,width,height};}
                const onProgress = event => job.progress({...event, zone: zone.id, zoneIndex: i, completedZones, totalZones: context.zones.length});
                timings.cropMs += performance.now() - cropStarted; const prepareStarted = performance.now();
                prepared = await lane.prepare.run({...input, side: model.side}, {signal, onProgress});
                timings.preparationMs += performance.now() - prepareStarted; const inferStarted = performance.now();
                output = await lane.inference.run(prepared.tensor, {signal, onProgress}); job.check();
                if(output.parameterCache)parameterRuns.push(output.parameterCache);
                if(output.sessionCache)sessionRuns.push(output.sessionCache);
                timings.neuralRpcMs += performance.now() - inferStarted;
                for (const name of ['modelLoadMs', 'inferenceMs', 'outputCopyMs', 'gpuWriteBytes', 'gpuReadBytes', 'correlationMs', 'backboneMs', 'backboneSetupMs', 'parameterLoadMs', 'attentionMatmulMs', 'graphDistanceMs', 'correlationGpuMs']) timings[name] = (timings[name] ?? 0) + (output.timings?.[name] ?? 0);
                if(model.splitGraph)for(const name of ['encoderMs','headMs'])timings[name]=(timings[name]??0)+(output.timings?.[name]??0);
                requireValue(output.raw instanceof Float32Array && output.raw.byteLength === rawBytes, 'Actual model probability grid required');
                pinned.push(budget.reserve(rawBytes)); value = {raw: output.raw, byteLength: rawBytes, heapBytes: output.heapBytes, gpuPeakBufferBytes: output.gpu?.peakAccountedBytes ?? 0, parameterCache:output.parameterCache, sessionCache:output.sessionCache, correlationWorkers: output.workers ?? 0, correlationHeapBytes: output.correlationObservedHeapBytes ?? 0}; budget.put(zone.cacheKey, value); if (budget.get(zone.cacheKey) === value) inserted.push(zone.cacheKey); inferences++;
              } finally {output?.release(); prepared?.release(); cropRelease?.();}
            }
            cacheHits += group.indices.length - 1; completedZones += group.indices.length;
            job.progress({phase: 'zone-complete', completed: completedZones, total: context.zones.length, inferences, cacheHits});
            return value;
          }});
          timings.zoneWallMs = performance.now() - zoneStarted;
          const values = new Array(context.zones.length);
          groups.forEach((group,i)=>group.indices.forEach(index=>{values[index]=scheduled.values[i];}));
          context.execution = {...(model.splitGraph?{onnxStages:2,stageBackends:model.stageBackends.slice(),intermediateBytes:640*40*40*4+8}:{}),...(values.some(v=>v.sessionCache)?{sessionCache:{enabled:true,...Object.fromEntries(['creations','reuses','pressureEvictions'].map(key=>[key,sessionRuns.reduce((n,v)=>n+(v[key]??0),0)]))}}:{}),...(values.some(v=>v.parameterCache)?{parameterCache:{enabled:true,...Object.fromEntries(['hits','misses','hitBytes','fetchBytes','evictions'].map(key=>[key,parameterRuns.reduce((n,v)=>n+(v[key]??0),0)])),sessionPeakResidentBytes:Math.max(...values.map(v=>v.parameterCache?.sessionPeakResidentBytes??0))}}:{}),backend: inference.backend ?? 'cpu', independentZones: scheduled.concurrency, wasmMaximumBytes: 512 * 1024 ** 2, gpuMaximumBytes: inference.gpuMaximumBytes ?? (inference.backend === 'webgpu-cpu' ? 512 * 1024 ** 2 : 0), observedHeapBytes: Math.max(...values.map(v => v.heapBytes ?? 0)), gpuPeakBufferBytes: Math.max(...values.map(v => v.gpuPeakBufferBytes ?? 0)), ...(model.family === 'vig' ? {graphDistanceBackend:inference.graphDistanceBackend??'wasm-cpu',convolutionWorkerMaximumBytes:64*1024**2, observedConvolutionWorkers:Math.max(...values.map(v=>v.correlationWorkers??0))} : {}), ...(model.family === 'tnt' ? {attentionBackend:inference.attentionBackend??'wasm-cpu',linearWorkerMaximumBytes:64*1024**2, observedLinearWorkers:Math.max(...values.map(v=>v.correlationWorkers??0))} : {}), ...(model.family === 'cmseg' ? {correlationBackend:inference.correlationBackend??'wasm-cpu',correlationWorkerMaximumBytes: 64 * 1024 ** 2, observedCorrelationWorkers: Math.max(...values.map(v => v.correlationWorkers ?? 0)), observedCorrelationHeapBytes: Math.max(...values.map(v => v.correlationHeapBytes ?? 0))} : {})};
          const result = await finish(context, values, job, {inferences, cacheHits, timings}); complete = true; return result;
        } finally {if (!complete) inserted.forEach(key => budget.remove(key)); pinned.forEach(free => free()); sourceRelease?.();}
      }, options);
    },
    reproject({analysisId, zoneIds}, options) {
      requireValue(last && analysisId === last.analysisId && Array.isArray(zoneIds) && zoneIds.length > 0 && new Set(zoneIds).size === zoneIds.length, 'Current analysis and nonempty unique zone subset required');
      const context = structuredClone(last), selected = new Set(zoneIds); requireValue(zoneIds.every(id => context.allZones.some(zone => zone.id === id)), 'Only cached analysis zones may be requested');
      if(context.execution?.sessionCache)for(const key of ['creations','reuses','pressureEvictions'])context.execution.sessionCache[key]=0;
      if(context.execution?.parameterCache)for(const key of ['hits','misses','hitBytes','fetchBytes','evictions'])context.execution.parameterCache[key]=0;
      context.zones = context.allZones.filter(z => selected.has(z.id)); validate(context.width, context.height, context.zones, context.mode, context.layout==='segmented');
      return start(async job => {
        const values = context.zones.map(z => budget.get(z.cacheKey)); if (values.some(v => !v)) throw new EngineError('CACHE_MISS', 'Model grids evicted; explicit analysis required');
        const release = budget.reserve(rawBytes * values.length); try {return await finish(context, values, job, {inferences: 0, cacheHits: values.length});} finally {release();}
      }, options);
    },
    readRaw(resultId) {
      requireValue(!disposed && !current && last?.resultId === resultId, 'Current completed result required');
      const values = last.zones.map(z => budget.get(z.cacheKey)); if (values.some(v => !v)) throw new EngineError('CACHE_MISS', 'Model grids evicted; explicit analysis required');
      const release = budget.reserve(rawBytes * values.length * 2);
      try {return {width: last.width, height: last.height, rawGrids: values.map((v, i) => ({id: last.zones[i].id, kind: last.zones[i].kind, bounds: [...last.zones[i].bounds], raw: v.raw.slice()})), metadata: {...structuredClone(last.resultMetadata), raw_shape: [model.kind === 'softmax' ? 3 : 1, model.side, model.side], raw_filter_applied: false}, release};}
      catch (error) {release(); throw error;}
    },
    cancel() {current?.abort(); revision++;},
    async dispose() {if (disposed) return; disposed = true; current?.abort(); revision++; await tail; for (const lane of lanes.splice(1)) {lane.inference.dispose(); lane.prepare.dispose();} budget.clearPrefix(prefix); last = null;}
  };
}
