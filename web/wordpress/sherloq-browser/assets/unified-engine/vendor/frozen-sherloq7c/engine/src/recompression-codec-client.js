import "../../../../../runtime-context.js?v=0.31.0";
import {attachWorkerMessageError} from './worker-message-protocol.js';
import {EngineError,checkAbort,requireValue,serializeEngineError,deserializeEngineError} from './errors.js';
const states=new WeakMap(),MiB=1024**2,PAGE=65536;
export function recompressionCodecWorkspace({width,height},stage){
 requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height*128),'Invalid full-context codec geometry.');
 // The declared Wasm maximum is actually restricted to this admitted extent.
 // Encoded JS output, input/decode transport and module loading have separate
 // credit. The image is never reduced to meet admission.
 const nativeBytes=Math.ceil(((stage.codec==='heic'||stage.codec==='avif'&&stage.lossless?128:64)*MiB+width*height*48)/PAGE)*PAGE;
 if(nativeBytes>4294967296)throw new EngineError('MEMORY_LIMIT','The complete context exceeds this codec’s32-bit native memory address space. No resizing was performed.');
 const encodedAllowanceBytes=width*height*16+16*MiB,transportBytes=width*Math.min(32,height)*3*4+8*MiB,moduleBytes=(stage.codec==='heic'||stage.codec==='avif'&&stage.lossless?48:32)*MiB;
 return {nativeBytes,encodedAllowanceBytes,transportBytes,moduleBytes,workingBytes:nativeBytes+encodedAllowanceBytes+transportBytes+moduleBytes};
}
function retire(state){if(state.closed)return;requireValue(!state.active,'An active codec must acknowledge pending source/storage requests before retirement.');state.closed=true;state.worker?.terminate();state.worker=null;state.detach?.();state.unregister?.();state.unregister=null;const retired=state.backing?.();state.backing=null;state.release?.();state.release=null;if(retired>0)state.budget.notifyBackingRelease?.('wasm',retired);const pool=states.get(state.budget);if(pool?.get(state.lane)===state)pool.delete(state.lane);if(!pool?.size)states.delete(state.budget);}
function capacityPlan(plan,budget,outputBytes){
 // Optional growth room keeps an initialized Wasm worker reusable when the
 // adaptive preview changes dimensions. Never evict useful data for it.
 const round=bytes=>2**Math.ceil(Math.log2(bytes)),capacity={...plan,nativeBytes:Math.min(4294967296,Math.max(128*MiB,round(plan.nativeBytes))),encodedAllowanceBytes:round(plan.encodedAllowanceBytes),transportBytes:round(plan.transportBytes)};
 capacity.workingBytes=capacity.nativeBytes+capacity.encodedAllowanceBytes+capacity.transportBytes+capacity.moduleBytes;
 return !budget.recovering&&budget.total()+capacity.workingBytes+outputBytes<=budget.limit?capacity:plan;
}
function acquire(budget,plan,stage,outputBytes,lane=0,exactCapacity=false){
 requireValue(Number.isSafeInteger(lane)&&lane>=0&&lane<16,'Invalid selected-codec worker lane.');let pool=states.get(budget);if(!pool){pool=new Map();states.set(budget,pool);}let state=pool.get(lane);const key=stage.codec==='heic'?'heic':stage.codec==='avif'&&stage.lossless?'avif-lossless':'magick',fits=state&&['nativeBytes','encodedAllowanceBytes','transportBytes','moduleBytes'].every(k=>state.plan[k]>=plan[k]);
 if(state?.active)throw new EngineError('BUSY','Another complete recompression context owns this codec worker.');
 if(state&&(state.key!==key||!fits)){retire(state);state=null;}
 if(!state){if(!exactCapacity)plan=capacityPlan(plan,budget,outputBytes);const release=budget.reserve(plan.workingBytes);state={budget,plan,key,lane,release,worker:null,closed:false,active:false,sequence:0};try{state.worker=new Worker(new URL('./recompression-codec-worker.js',import.meta.url),{type:'module'});state.backing=budget.registerBacking?.('wasm',plan.nativeBytes,{owner:'recompression',label:'bounded-multi-codec-worker',state:'reserved',reclaimable:true});state.unregister=budget.registerReclaimer?.(()=>{if(!state.active)retire(state);},{allocationKind:'wasm',owner:'recompression',label:'idle-recompression-worker'});pool.set(lane,state);states.set(budget,pool);}catch(error){state.active=false;retire(state);throw error;}}
 state.active=true;return state;
}
// Native provider initialization may occur inside the worker body timer.
// Add that measured phase to cold startup outside the body exactly once.
export function recompressionSetupTiming(totalMilliseconds,value,firstRequest=false){
 const nonnegative=n=>Number.isFinite(n)&&n>0?n:0,cold=firstRequest||value?.cold===true,bodySetupMilliseconds=nonnegative(value?.bodySetupMilliseconds),outsideBody=cold?nonnegative(totalMilliseconds-(Number.isFinite(value?.milliseconds)?value.milliseconds:totalMilliseconds)):0;
 return {cold,bodySetupMilliseconds,setupMilliseconds:Math.max(nonnegative(value?.setupMilliseconds),outsideBody+bodySetupMilliseconds)};
}
export async function runRecompressionCodec(payload,{budget,signal,onProgress,onRequest=()=>{},onAdmitted,codecLane=0,exactCapacity=false}={}){
 checkAbort(signal);const started=performance.now(),required=recompressionCodecWorkspace(payload,payload.stage),state=acquire(budget,required,payload.stage,payload.width*payload.height*3,codecLane,exactCapacity),plan=state.plan,worker=state.worker,requests=new Set(),cold=state.sequence===0,id=++state.sequence;let stopped=false,failed=false;
 let startupFailure,workerFailure=error=>{startupFailure??=error;};
 worker.onerror=event=>workerFailure(new EngineError('WORKER_FAILED',event.message||'Recompression worker failed.'));
 state.detach=attachWorkerMessageError(worker,()=>workerFailure(new EngineError('WORKER_MESSAGE_FAILED','Recompression worker message could not be read.')));
 try{await onAdmitted?.(plan);if(startupFailure)throw startupFailure;checkAbort(signal);return await new Promise((resolve,reject)=>{
  const finish=(fn,value)=>{if(stopped)return;stopped=true;signal?.removeEventListener('abort',abort);fn(value);};
  const ok=value=>finish(resolve,value),fail=error=>{failed=true;finish(reject,error);},abort=()=>fail(new EngineError('CANCELLED','Recompression cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  workerFailure=fail;
  worker.onmessage=event=>{
   if(stopped)return;const data=event.data;
   if(!data||data.id!==id){fail(new EngineError('WORKER_MESSAGE_FAILED','Recompression response belongs to another request.'));return;}
   if(data.progress){try{onProgress?.(data.progress);}catch(error){fail(error);}return;}
   if(data.request){const task=(async()=>{try{checkAbort(signal);const value=await onRequest(data.request,data.value);checkAbort(signal);if(!stopped)worker.postMessage({reply:data.sequence,value},value?.bytes?.buffer instanceof ArrayBuffer?[value.bytes.buffer]:[]);}catch(error){if(!stopped)try{worker.postMessage({reply:data.sequence,error:serializeEngineError(error)});}catch{fail(error);}}})();requests.add(task);task.then(()=>requests.delete(task),()=>requests.delete(task));return;}
   if(data.error)fail(deserializeEngineError(data.error));else if(data.done){if(Number.isSafeInteger(data.value?.codecHeapPeakBytes)&&data.value.codecHeapPeakBytes<=plan.nativeBytes)state.backing?.materialize?.(data.value.codecHeapPeakBytes);const total=performance.now()-started;ok({...data.value,...recompressionSetupTiming(total,data.value,cold)});}else fail(new EngineError('WORKER_MESSAGE_FAILED','Unknown recompression worker response.'));
  };
  try{worker.postMessage({id,payload:{...payload,nativeBytes:plan.nativeBytes}});}catch(error){fail(error);}
 });}catch(error){failed=true;throw error;}finally{
  stopped=true;state.detach?.();state.detach=null;
  if(failed)worker.terminate();await Promise.allSettled([...requests]);state.active=false;
  worker.onmessage=null;worker.onerror=null;
  if(failed)retire(state);
 }
}
export function disposeRecompressionCodecs(budget){const pool=states.get(budget);if(pool){requireValue([...pool.values()].every(state=>!state.active),'Active codecs must acknowledge their requests before disposal.');for(const state of [...pool.values()])retire(state);}}
export function recompressionCodecMemory(budget){const pool=states.get(budget);if(!pool?.size)return null;const rows=[...pool.values()];return{active:rows.some(s=>s.active),workers:rows.length,admittedBytes:rows.reduce((n,s)=>n+s.plan.workingBytes,0),nativeMaximumBytes:rows.reduce((n,s)=>n+s.plan.nativeBytes,0)};}
// Pure admission of independent requested qualities. Existing warm lanes retain
// their actual fees; new parallel lanes use exact bounded capacity, not optional
// growth room that would silently consume a sibling's promised workspace.
export function recompressionParallelPlan({budget,width,height,stage,count,maxWorkers=1,extraBytes=0}){
 const plan=recompressionCodecWorkspace({width,height},stage),key=stage.codec==='heic'?'heic':stage.codec==='avif'&&stage.lossless?'avif-lossless':'magick',pool=states.get(budget),cpuPerWorker=stage.codec==='heic'?2:1,maximum=Math.max(1,Math.min(16,count,Math.floor(maxWorkers/cpuPerWorker)||1));let workers=1;
 const needed=n=>{let bytes=0;for(let lane=0;lane<n;lane++){const old=pool?.get(lane),fits=old&&!old.active&&old.key===key&&['nativeBytes','encodedAllowanceBytes','transportBytes','moduleBytes'].every(k=>old.plan[k]>=plan[k]);bytes+=(fits?0:plan.workingBytes)+width*height*6+extraBytes;}return bytes;};
 const room=Math.max(0,budget.limit-budget.total());while(workers<maximum&&needed(workers+1)<=room)workers++;return{workers,maximum,cpuPerWorker,requiredBytes:needed(workers),availableBytes:room,policy:'requested-quality-parallelism-under-shared-budget'};
}
// A warm worker's complete fee is already live in this budget. Preliminary
// store admission must reserve only a genuinely new codec workspace, otherwise
// the second useful call can fail despite needing less memory than the first.
export function recompressionCodecPlanningBytes(dimensions,stage,{budget,codecLane=0}={}){
 const plan=recompressionCodecWorkspace(dimensions,stage),state=states.get(budget)?.get(codecLane),key=stage.codec==='heic'?'heic':stage.codec==='avif'&&stage.lossless?'avif-lossless':'magick';
 return state&&!state.active&&state.key===key&&['nativeBytes','encodedAllowanceBytes','transportBytes','moduleBytes'].every(k=>state.plan[k]>=plan[k])?0:plan.workingBytes;
}
