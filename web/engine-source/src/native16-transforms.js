import {EngineError,requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {native16Descriptor} from './rgb16-surface.js';
import {segmentedWavelet} from './segmented-wavelet.js';
import {segmentedFrequency} from './segmented-frequency.js';
import {segmentedBlocking} from './segmented-blocking.js';
import {FrequencyGpu} from './frequency-gpu.js';
import {waveletParams} from './wavelets.js';
import {native16DomainCachedSurface} from './native16-domain.js';

const owners=new WeakMap();
export const NATIVE16_TRANSFORMS=Object.freeze(['detail.frequency','detail.wavelets','noise.blocking']);
export const native16TransformUnits=operation=>operation==='noise.blocking'?
 'Native uint16 code-value BT601 gray; complete db8 binary64 detail axes, block median(abs(detail))/0.6745 in native gray code units; Float64 noise table and globally normalized RGB8 presentation. No ICC or transfer conversion.':operation==='detail.wavelets'?
 'Native uint16 blue codes; binary64 wavelet coefficients and per-band relative thresholds; RGB8 is presentation of reconstructed uint16 codes.':
 'Native uint16 code-value luminance; original float32 global DFT, masks and reconstruction; four globally normalized RGB8 presentation views.';

function createOwner(surface,{budget,temporarySession,getTemporarySession,storage,maxWorkers}){
 const initial={temporarySession,getTemporarySession,storage,maxWorkers},caches=new Map(),pending=new Set(),retiring=new Set(),lifetime=new AbortController();let active,closing,closed=false,gpu;
 const ack=async action=>{const reply=await action();if(reply===false||reply===0)throw reply;return reply;};
 const allOutputOwners=record=>[record?.surface,...['rgbRecords','planeRecords','maskRecords','flagRecords','tableRecords'].flatMap(key=>Object.values(record?.[key]??{}).map(value=>value.surface))].filter(Boolean);
 async function retirePending(){await retireCompositeOwners([...pending].map(owner=>async()=>{await ack(()=>owner.dispose());pending.delete(owner);}),{requireAck:true,concurrent:true});}
 function resultOwner(record){
  const remaining=new Set(allOutputOwners(record));let flight;
  const owner={dispose(){if(flight)return flight;const task=retireCompositeOwners([...remaining].map(value=>async()=>{await ack(()=>value.dispose());remaining.delete(value);}),{requireAck:true,concurrent:true}).then(()=>{pending.delete(owner);});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
  return owner;
 }
 const owner={
  async prepare(operation){
   if(active)throw new EngineError('BUSY','Native16 transform source is already calculating.');
   if(closed)throw new EngineError('DISPOSED','Native16 transform source is closed.');
   await retirePending();
   for(const [key,value]of caches)if(key!==operation){retiring.add(key);await ack(()=>value.dispose());caches.delete(key);retiring.delete(key);}
   if(operation!=='detail.frequency'){gpu?.dispose();gpu=null;}
  },
  run(operation,params,options){
   if(closed)throw new EngineError('DISPOSED','Native16 transform source is closed.');
   if(active)throw new EngineError('BUSY','Native16 transform source is already calculating.');
   const requested={...initial,...options},backend=requested.backend??'auto',maxWorkers=requested.maxWorkers??1;
   requireValue(['cpu','auto','webgpu'].includes(backend)&&Number.isSafeInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=32,'Invalid native16 transform execution.');
   const linked=new AbortController(),abort=()=>linked.abort();lifetime.signal.addEventListener('abort',abort,{once:true});requested.signal?.addEventListener('abort',abort,{once:true});if(lifetime.signal.aborted||requested.signal?.aborted)linked.abort();const hooks={...requested,signal:linked.signal};
   const task=(async()=>{
    await retirePending();checkAbort(hooks.signal);
    if(retiring.has(operation)||operation==='detail.wavelets'&&caches.has(operation)&&caches.get(operation).wavelet!==waveletParams(params).wavelet){retiring.add(operation);await ack(()=>caches.get(operation).dispose());caches.delete(operation);retiring.delete(operation);}
    if(operation==='detail.frequency'&&backend!=='cpu')gpu??=new FrequencyGpu(budget,{maxWorkers});
    if(gpu)gpu.profile={maxWorkers};
    let record,outputs,accepted=false;
    try{
     record=await (operation==='detail.wavelets'?segmentedWavelet:operation==='noise.blocking'?segmentedBlocking:segmentedFrequency)({surface,session:hooks.temporarySession,ensureTemporarySession:hooks.getTemporarySession},params,{budget,signal:hooks.signal,storage:hooks.storage??'auto',backend,profile:{maxWorkers},cache:caches.get(operation),frequencyGpu:backend==='cpu'?null:gpu,accountedHeapBytes:hooks.accountedHeapBytes??0,onProgress:event=>hooks.onProgress?.(typeof event==='number'?event:event.completed/event.total)});
     outputs=resultOwner(record);checkAbort(hooks.signal);
     const cache=record.waveletCache??record.frequencyCache??record.blockingCache;if(cache)caches.set(operation,cache);
     const provenance={schema:'sherloq.native-input/1',...native16Descriptor(surface),operation,numericalInputDepth:16,presentationOutputDepth:8,profileConversion:'none-native-coded-transform',units:native16TransformUnits(operation)};
     accepted=true;
     return {...record,...(operation==='noise.blocking'?{data:{...record.data,inputDepth:16,sourceMode:'native16 coded grayscale',noiseUnits:'native16-gray-code-values'},semantics:'Exact native UInt16 RGB code values become the existing integer BT601 gray, then binary64 db8 diagonal detail. Block median(abs(detail))/0.6745 remains in native gray code units in the Float64 noise table; the existing global CV_8U normalization and nearest-neighbor RGB8 display remain presentation. No original-file gray decoder, ICC or transfer conversion is used by this native path.'}:{}),provenance,metrics:{...record.metrics,inputDepth:16,sourceDepth:surface.descriptor.sourceDepth??16},dispose:()=>outputs.dispose()};
    }catch(error){
     if(outputs)pending.add(outputs);
     const cache=record?.waveletCache??record?.frequencyCache??record?.blockingCache;
     if(cache&&cache!==caches.get(operation))pending.add(cache);
     const child=error?.cleanupOwner;if(child&&child!==owner)pending.add(child);
     try{await retireCompositeOwners([retirePending],{primary:error,requireAck:true});}
     catch(cleanup){throw withRetirementOwner(cleanup,owner,cleanup);}
     throw error;
    }finally{if(!accepted&&record&&!outputs){const orphan=resultOwner(record);pending.add(orphan);await orphan.dispose();}}
   })().finally(()=>{lifetime.signal.removeEventListener('abort',abort);requested.signal?.removeEventListener('abort',abort);});active=task;void task.finally(()=>{if(active===task)active=null;}).catch(()=>{});return task;
  },
  dispose(){
   closed=true;lifetime.abort();if(closing)return closing;
   const task=(async()=>{await active?.catch(()=>{});await retirePending();await retireCompositeOwners([...caches].map(([key,value])=>async()=>{await ack(()=>value.dispose());caches.delete(key);}),{requireAck:true,concurrent:true});gpu?.dispose();gpu=null;})();
   closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };
 // The native source owns cached transforms, including sampled preview grids.
 // Source backing is retired only after outstanding transform ACKs succeed.
 const previousDispose=surface.dispose.bind(surface);let sourceFlight;
 surface.dispose=()=>{if(sourceFlight)return sourceFlight;const task=(async()=>{await owner.dispose();await ack(previousDispose);})();sourceFlight=task;void task.finally(()=>{if(sourceFlight===task)sourceFlight=null;}).catch(()=>{});return task;};
 return owner;
}

export function runNative16Transform(operation,surface,params={},options={}){
 requireValue(NATIVE16_TRANSFORMS.includes(operation)&&surface?.descriptor?.format==='rgb16'&&options.budget,'A supported budgeted native16 transform source is required.');
 let owner=owners.get(surface);if(!owner){owner=createOwner(surface,options);owners.set(surface,owner);}
 return owner.run(operation,params,options);
}

// Switching numerical depth/tool releases unused transform preparations. Live
// result leases remain readable until their own ACK; Original is never dropped.
export async function prepareNative16TransformCaches(surface,operation){for(const owner of new Set([owners.get(surface),owners.get(native16DomainCachedSurface(surface))].filter(Boolean)))await owner.prepare(operation);}
