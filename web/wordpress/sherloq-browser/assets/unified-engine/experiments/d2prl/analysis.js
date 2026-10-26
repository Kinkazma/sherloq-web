import {createD2prlResultOwnership} from './result-ownership.js';
import {noisesnifferOwnerRetirement as retirement} from '../../src/noisesniffer-owner-retirement.js';
import {scientificJsonBound} from '../../src/scientific-json.js';
import {retainD2prlCheckpoint} from './checkpoint.js';
// Experimental zone/session controller. The injected infer() must be the real
// qualified model pipeline; this controller never invents neural scores.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const SIDE = 448, RAW_BYTES = 3 * SIDE * SIDE * 4;
let sequence = 0;
async function retireOwners(callbacks,failure){
 for(const callback of callbacks)try{await callback();}catch(error){if(failure===undefined)failure=error;else if(failure&&typeof failure==='object')try{failure.details={...failure.details,cleanupFailures:[...(failure.details?.cleanupFailures??[]),{code:error?.code??'CLEANUP_FAILED',message:String(error?.message??error)}]};}catch{}}
 return failure;
}
export function createD2prlAnalysis({budget, infer, project, modelId, releaseInferenceCheckpoint=()=>{}}) {
  requireValue(budget && typeof infer === 'function' && typeof project?.run === 'function' && typeof modelId === 'string' && modelId.length > 0, 'Model, projector and shared budget required');
  const prefix = 'd2prl-session-' + (++sequence) + ':';
  let revision = 0, current, tail = Promise.resolve(), disposed = false, last, lastMetadataRelease, retained, checkpoint, disposal;
  const ownership=createD2prlResultOwnership({budget,rawBytes:RAW_BYTES});
  const clearCheckpoint=async()=>{const old=checkpoint;checkpoint=null;const failure=await retireOwners([()=>project.releaseCheckpoint?.(),...(old?.pinned??[]),...(old?.inserted??[]).map(key=>()=>budget.remove(key)),...[...(old?.inferenceKeys??[])].map(key=>()=>releaseInferenceCheckpoint(key))]);if(failure!==undefined)throw failure;};
  const clearRetained=async()=>{const old=retained;if(!old)return;await old.release();if(retained===old)retained=null;};
  const retainedValues=context=>retained?.analysisId===context.analysisId?retained.values:ownership.values(context.analysisId);
  const geometry = (width, height, zones, exclusions, mode, segmented = false) => {
    requireValue([width, height].every(n => Number.isInteger(n) && n > 0 && n <= (segmented ? 131072 : 8192)) && (segmented || width * height <= 32 * 1024 ** 2), 'D2PRL source geometry');
    requireValue(mode === 'whole-image' || mode === 'regions', 'Explicit zone mode');
    requireValue(Array.isArray(zones) && zones.length > 0 && zones.length <= 256 && Array.isArray(exclusions) && exclusions.length <= 256, 'Active zones and exclusions required');
    const rectangle = (r, minimum) => requireValue(Array.isArray(r) && r.length === 4 && r.every(Number.isInteger) && r[0] >= 0 && r[1] >= 0 && r[2] <= width && r[3] <= height && r[2] - r[0] >= minimum && r[3] - r[1] >= minimum, 'Half-open zone rectangle');
    if (mode === 'whole-image') requireValue(zones.length === 1 && JSON.stringify(zones[0].bounds) === JSON.stringify([0, 0, width, height]), 'Single complete whole-image rectangle required');
    const ids = new Set();
    for (const zone of zones) { requireValue(zone && typeof zone.id === 'string' && zone.id.length > 0 && zone.id.length <= 128 && !ids.has(zone.id) && ['region', 'envelope', 'whole-image'].includes(zone.kind), 'Unique zone identity and explicit provenance kind'); ids.add(zone.id); rectangle(zone.bounds, mode === 'whole-image' ? 1 : 8); }
    exclusions.forEach(r => rectangle(r, 8));
  };
  const start = (work, options = {}) => {
    requireValue(!disposed, 'D2PRL session disposed'); current?.abort(); const controller = new AbortController(), id = ++revision, previous = tail; current = controller;
    const externalAbort = () => controller.abort(); options.signal?.addEventListener('abort', externalAbort, {once: true}); if (options.signal?.aborted) controller.abort();
    const check = () => {checkAbort(controller.signal); if (id !== revision || disposed) throw new EngineError('CANCELLED', 'Superseded D2PRL result');};
    const progress = event => {check(); options.onProgress?.({...event, revision: id}); check();};
    const task = (async () => {
      try {await previous; check(); await ownership.drain();check();return await work({signal: controller.signal, check, progress, revision: id,checkpointKey:options.checkpointKey,resourceOperation:options.resourceOperation});}
      catch(error){if(id===revision&&(error?.code==='CANCELLED'||controller.signal.aborted))await retireOwners([clearCheckpoint],error);throw error;}
      finally {options.signal?.removeEventListener('abort', externalAbort); if (current === controller) current = null;}
    })();
    tail = task.catch(() => {}); return task;
  };
  const projectResult = async (context, values, minimum, exclusions, job, counts,{publish=true,funding=[]}={}) => {
    const result = await project.run({width: context.width, height: context.height, layout: context.layout, mode: context.mode, minimum, exclusions, zones: context.zones.map((zone, i) => ({...zone, raw: values[i].raw}))}, {signal: job.signal,checkpointKey:job.checkpointKey,resourceOperation:job.resourceOperation, onProgress: event => job.progress({...event, stage: 'projection'})});
    let raw,record;try {
      job.check(); const resultId = prefix + job.revision, analysisId = context.analysisId ?? resultId;
      result.metadata = {...result.metadata,...(context.scientificScope?{scientificScope:structuredClone(context.scientificScope)}:{}), modelId, backend: context.backend, pixelSha256: context.pixelSha256, resultId, analysisId, revision: job.revision, sourceProvenance: context.provenance, vote_policy: 'one-model-union', inference_performed: counts.inferences > 0, inferences: counts.inferences, cache_hits: counts.cacheHits, zones: result.metadata.zones.map((zone, i) => ({...zone, kind: context.zones[i].kind, decision: structuredClone(values[i].decision), execution: structuredClone(values[i].execution)}))};
      const snapshot={...context,resultId,analysisId,exclusions:exclusions.map(r=>[...r]),resultMetadata:structuredClone(result.metadata)};
      raw=ownership.bank(analysisId,values,funding);const dispose=result.dispose??result.release;
      record=ownership.register({resultId,context:snapshot,metadata:result.metadata,raw,dispose:()=>dispose.call(result)});raw=null;
      if(publish){const free=budget.reserve(4096+2*scientificJsonBound(snapshot));let next;try{next=structuredClone(snapshot);}catch(error){free();throw error;}lastMetadataRelease?.();lastMetadataRelease=free;last=next;}
      return{...result,release:record.retirement,dispose:record.retirement};
    } catch (error) {await retireOwners(record?[record.retirement]:[()=>result.release(),()=>raw?.release()],error); throw error;}
  };
  return {
    run({pixels, inputSource, zones, mode = 'regions', exclusions = [], minimum = 500, backend = 'gpu', provenance = null, retainRaw = false,scientificScope}, options) {
      const segmented=!!inputSource,width=segmented?inputSource.width:pixels?.width,height=segmented?inputSource.height:pixels?.height;
      requireValue(segmented ? pixels===undefined && typeof inputSource.region==='function' && typeof inputSource.sha256==='function' : pixels?.data instanceof Uint8Array && pixels.data.buffer instanceof ArrayBuffer && pixels.data.length === pixels.width * pixels.height * 3, 'Qualified contiguous RGB8 source required');
      requireValue(typeof retainRaw==='boolean' && ['gpu', 'cpu'].includes(backend) && Number.isInteger(minimum) && minimum >= 0 && minimum <= 5000, 'Explicit backend and component minimum');
      geometry(width, height, zones, exclusions, mode, segmented);
      // Copy small request structures immediately; UI mutations cannot alter an
      // already admitted request. Borrowed RGB must stay unchanged until the
      // request settles; its snapshot is copied under the budget after queuing.
      const context = {width, height, layout:segmented?'segmented':'contiguous', mode, backend, provenance: structuredClone(provenance), zones: zones.map(z => ({id: z.id, kind: z.kind, bounds: [...z.bounds]}))};
      exclusions = exclusions.map(r => [...r]);
      return start(async job => {
        let pinned=[],inserted=[],values=[],sourceRelease,complete=false,retain=false,failure,projectedResult;
        try {
          await clearRetained();last=null;lastMetadataRelease?.();lastMetadataRelease=null;
          let source;if(segmented)context.pixelSha256=await inputSource.sha256({signal:job.signal,onProgress:job.progress});else{sourceRelease=budget.reserve(pixels.data.byteLength*3);source=pixels.data.slice();const digest=await crypto.subtle.digest('SHA-256',source);context.pixelSha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}job.check();
          const identity=JSON.stringify([options?.checkpointKey,modelId,backend,context.pixelSha256,context.width,context.height,context.zones,...(scientificScope?[scientificScope.metadata.fingerprint,context.zones.map(z=>scientificScope.grids.get(z.id)?.identity)]:[])]);
          if(checkpoint&&checkpoint.identity!==identity)await clearCheckpoint();
          checkpoint??={key:options?.checkpointKey,identity,pinned:[],inserted:[],values:[],inferenceKeys:new Set()};
          ({pinned,inserted,values}=checkpoint);
          let inferences = 0, cacheHits = 0;
          for (let i = 0; i < context.zones.length; i++) {
            job.check(); const zone = context.zones[i], [x0, y0, x1, y1] = zone.bounds, width = x1 - x0, height = y1 - y0;
            zone.cacheKey = prefix + JSON.stringify([modelId, backend, context.pixelSha256, context.width, context.height, zone.bounds,...(scientificScope?[scientificScope.grids.get(zone.id)?.identity]:[])]);
            let value=values[i]??budget.get(zone.cacheKey);
            if(value){if(!values[i])pinned.push(budget.reserve(RAW_BYTES));cacheHits++;}
            else {
              const cropRelease = segmented?null:budget.reserve(width * height * 3); let output,inferenceFailure;
              try {
                let input;if(segmented)input=inputSource.region(zone.bounds);else{const rgb = new Uint8Array(width * height * 3); let stamp = performance.now();
                for (let y = 0; y < height; y++) {
                  const offset = ((y + y0) * context.width + x0) * 3; rgb.set(source.subarray(offset, offset + width * 3), y * width * 3);
                  if (performance.now() - stamp >= 8) {await controlCheckpoint(job.signal); stamp = performance.now();}
                }
                input={rgb,width,height};}
                job.progress({phase: 'inference', zone: zone.id, zoneIndex: i, completed: i, total: context.zones.length});
                const checkpointKey=options?.checkpointKey?checkpoint.identity+':'+zone.cacheKey:undefined;if(checkpointKey)checkpoint.inferenceKeys.add(checkpointKey);
                output = await infer({...input, backend,...(scientificScope?{scientificMask:scientificScope.grids.get(zone.id)}:{})}, {checkpointKey,verifiedInputIdentity:checkpoint.identity+':'+zone.cacheKey,signal: job.signal, onProgress: event => job.progress({...event, stage: 'inference', zone: zone.id, zoneIndex: i, completedZones: i, totalZones: context.zones.length})}); job.check();
                requireValue(output?.raw instanceof Float32Array && output.raw.length === RAW_BYTES / 4 && typeof output.release === 'function', 'Actual native-grid model output required');
                pinned.push(budget.reserve(RAW_BYTES)); value = {raw: output.raw, decision: structuredClone(output.decision), execution: structuredClone(output.execution), byteLength: RAW_BYTES};
                budget.put(zone.cacheKey, value); if (budget.get(zone.cacheKey) === value) inserted.push(zone.cacheKey); inferences++;
              } catch(error){inferenceFailure=error;throw error;} finally {const failure=await retireOwners([()=>output?.release(),()=>cropRelease?.()],inferenceFailure);if(inferenceFailure===undefined&&failure!==undefined)throw failure;}
            }
            values[i]=value; job.progress({phase: 'zone-complete', zone: zone.id, completed: i + 1, total: context.zones.length, inferences, cacheHits});
          }
          if(scientificScope)context.scientificScope=structuredClone(scientificScope.metadata);const result = projectedResult = await projectResult(context, values, minimum, exclusions, job, {inferences, cacheHits},{funding:pinned}); if(retainRaw){const loan=ownership.bank(result.metadata.analysisId,values);retained={analysisId:result.metadata.analysisId,values,release:retirement([()=>loan.release()])};} complete = true; return result;
        }catch(error){failure=error;retain=retainD2prlCheckpoint(error,job.signal,options?.checkpointKey);throw error;}
        finally{const retiredFailure=await retireOwners([async()=>{if(!retain){if(complete&&checkpoint)checkpoint.inserted=[];await clearCheckpoint();}},()=>sourceRelease?.()],failure);if(retiredFailure!==undefined){const finalFailure=await retireOwners([()=>projectedResult?.release(),()=>{if(projectedResult&&last?.resultId===projectedResult.metadata?.resultId){last=null;lastMetadataRelease?.();lastMetadataRelease=null;}return projectedResult&&retained?.analysisId===projectedResult.metadata?.analysisId?clearRetained():undefined;}],retiredFailure);if(failure===undefined)throw finalFailure;}}
      }, options);
    },
    refilter({resultId, analysisId, minimum = 500, exclusions, retainRaw = false,publish=true}, options) {
      requireValue(last && (analysisId === undefined ? resultId === last.resultId : resultId === undefined && analysisId === last.analysisId), 'Current completed D2PRL analysis required'); requireValue(typeof publish==='boolean'&&typeof retainRaw==='boolean' && Number.isInteger(minimum) && minimum >= 0 && minimum <= 5000, 'Component minimum');
      const context = structuredClone(last); exclusions = (exclusions ?? context.exclusions).map(r => [...r]); geometry(context.width, context.height, context.zones, exclusions, context.mode, context.layout==='segmented');
      return start(async job => {
        const values = retainedValues(context) ?? context.zones.map(z => budget.get(z.cacheKey));
        if (values.some(v => !v)) throw new EngineError('CACHE_MISS', 'Native grids were evicted; explicit analysis is required');
        const loan=ownership.bank(context.analysisId,values);
        try {const result=await projectResult(context, values, minimum, exclusions, job, {inferences: 0, cacheHits: values.length},{publish});if(publish&&retainRaw&&retained?.analysisId!==context.analysisId){await clearRetained();const kept=ownership.bank(context.analysisId,values);retained={analysisId:context.analysisId,values,release:retirement([()=>kept.release()])};}return result;}
        finally {await loan.release();}
      }, options);
    },
    rememberResultProvenance(resultId,provenance){ownership.provenance(resultId,provenance);},
    resolveResultAnalysisId(resultId){return ownership.result(resultId)?.context.analysisId;},
    readRaw(resultId) {
      requireValue(!disposed && !current,'D2PRL analysis busy or disposed');
      if(ownership.retiring(resultId))throw new EngineError('CACHE_MISS','The requested D2PRL result is retiring');
      const saved=ownership.result(resultId),context=saved?.context??(last?.resultId===resultId?last:null);
      requireValue(context,'Live or current completed D2PRL result required');
      const values = saved?.raw.value??retainedValues(context)??context.zones.map(zone=>budget.get(zone.cacheKey));
      if(values.some(value=>!value))throw new EngineError('CACHE_MISS','Native grids were evicted; explicit analysis is required');
      const release=budget.reserve(RAW_BYTES*values.length*2);
      try{return{width:context.width,height:context.height,rawGrids:values.map((value,i)=>({id:context.zones[i].id,kind:context.zones[i].kind,bounds:[...context.zones[i].bounds],raw:value.raw.slice()})),metadata:{...structuredClone(saved?.metadata??context.resultMetadata),raw_shape:[3,SIDE,SIDE],raw_planes:['union-probability','target-residual','source-residual'],raw_filter_applied:false},...(saved?.provenance?{resultProvenance:structuredClone(saved.provenance)}:{}),release};}
      catch(error){release();throw error;}
    },
    async releaseCheckpoint(key){requireValue(!current,'D2PRL analysis busy');if(key===undefined||checkpoint?.key===key)await clearCheckpoint();},
    cancel() {current?.abort(); revision++;},
    dispose() {if(disposal)return disposal;disposed=true;current?.abort();revision++;disposal=(async()=>{await tail;last=null;lastMetadataRelease?.();lastMetadataRelease=null;const failure=await retireOwners([clearRetained,()=>ownership.drain(),clearCheckpoint,()=>budget.clearPrefix(prefix)]);if(failure!==undefined)throw failure;})().catch(error=>{disposal=null;throw error;});return disposal;}
  };
}
