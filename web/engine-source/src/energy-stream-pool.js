import {Budget} from './cache.js';
import {createReusableRgbWindow} from './reusable-rgb-window.js';
import {allocateTypedArray} from './allocation.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {runWithWorkerTransportRecovery,QualityTransportQueue} from './worker-transport-recovery.js';
import {ElasticQualityWorkers} from './elastic-quality-workers.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,controlCheckpoint,deserializeEngineError,serializeEngineError,isRecoverableTransportError} from './errors.js';import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {energyStreamBytes} from './energy-stream.js';import {createSegmentedBytes} from './segmented-bytes.js';
export function energyPoolShape(image){const plan=rgbRecompressionPlan(image.surface);return {...plan,workerBytes:plan.workingBytes+2*plan.rowBytes*plan.rows+energyStreamBytes(plan.width,plan.height)+plan.width*32*4+256*1024};}
export async function parallelEnergyPlanes(image,qualities,count,{budget,maxWorkers=count,signal,onPlane,onProgress}={}){
 const admission={budget,maximum:maxWorkers,resourceOwner:'ela'};
 const shape=energyPoolShape(image),surface=image.surface,states=[],ioTasks=new Set();let sourceWindow,stopped=false,maximumHeap=0,encodedPeak=0,sourcePasses=0,completed=0;const encodedStorage=new Set();const metrics=()=>({workers:lanes.snapshot().peakWorkers,elastic:lanes.snapshot(),kernel:'global-rgb-jpeg-energy-worker-pool',recompressions:completed,transportRecoveries:jobs.recoveries,qualityPlanesComputed:completed,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,totalCodecHeapMaximumBytes:lanes.snapshot().peakWorkers*shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,sourcePasses,encodedStorage:encodedStorage.size>1?'mixed':[...encodedStorage][0]??null,maximumEncodedBytes:encodedPeak});
 function rejectState(state,error){state.pending?.reject(error);state.pending=null;}
 function stop(){if(stopped)return;stopped=true;cancelScheduledWorkerCalls(admission);for(const state of states){state.protocol?.dispose();state.worker.onmessage=null;state.worker.terminate();rejectState(state,new EngineError('CANCELLED','Energy quality workers stopped.'));}}
 const rpc=(state,data)=>scheduledWorkerCall(admission,()=>new Promise((resolve,reject)=>{state.pending={resolve,reject,action:data.action};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Energy quality workers stopped.');if(state.protocol.failed)throw state.protocol.error;state.protocol.post(data);}catch(error){state.pending=null;reject(error);}}),{signal,label:'energy-stream-pool',domains:data.action==='init'?{wasm:shape.heapMaximumBytes}:data.bytes?{'array-buffer':data.bytes.byteLength}:{}});
  async function handleIo(state,data){
  // Partition the 8 MiB already included in this lane's workingBytes; storage
  // must not ask the global budget again after the lane has been admitted.
  const reserve=bytes=>(state.ioBudget??=new Budget(8*1024**2)).reserve(bytes);
  try{checkAbort(signal);let bytes;if(data.io==='write'){if(state.written+data.bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Energy JPEG exceeded its conservative capacity.');await state.store.write(data.bytes,state.written,{reserve});state.written+=data.bytes.length;}
   else if(data.io==='energy'){await state.plane.write(data.bytes,data.y*shape.width*4,{reserve});}
   else{const length=Math.min(data.length,state.written-state.readOffset);bytes=allocateTypedArray(Uint8Array,length,{label:'energy-jpeg-read',operation});await state.store.readInto(bytes,state.readOffset,{reserve});state.readOffset+=length;}
   if(!stopped&&!state.protocol.failed)state.protocol.post({ioReply:true,id:data.id,bytes},bytes?[bytes.buffer]:[]);
  }catch(error){if(!stopped&&!state.protocol.failed)try{state.protocol.post({ioReply:true,id:data.id,error:serializeEngineError(error,'WORKER_FAILED')});}catch(failure){state.protocol.fail(failure);}}
 }
 const create=(state={pending:null,store:null,plane:null,written:0,readOffset:0,ioTasks:new Set()})=>{state.worker=new Worker(new URL('./energy-stream-worker.js',import.meta.url),{type:'module'});state.protocol=installWorkerMessageProtocol(state.worker,data=>{
    if(data.io){if(!Number.isSafeInteger(data.id)||!(['write','read','energy'].includes(data.io))||(data.io==='read'?!Number.isSafeInteger(data.length)||data.length<0:!(data.bytes instanceof Uint8Array)))throw workerMessageFailure('energy-stream-parent','message','invalid-io-envelope');const task=handleIo(state,data);ioTasks.add(task);state.ioTasks.add(task);const done=()=>{ioTasks.delete(task);state.ioTasks.delete(task);};task.then(done,done);return;}
    const pending=state.pending;if(!pending)return;if(data.error){state.pending=null;pending.reject(deserializeEngineError(data.error));}else{if(!data.result||typeof data.result!=='object'||!Number.isSafeInteger(data.result.heapBytes)||data.result.heapBytes<=0)throw workerMessageFailure('energy-stream-parent','message','invalid-result-envelope');if(state.heapBacking){if(data.result.heapBytes<state.nativeBytes)budget.notifyBackingRelease?.('wasm',state.nativeBytes-data.result.heapBytes);state.nativeBytes=data.result.heapBytes;state.heapBacking.materialize(state.nativeBytes);}maximumHeap=Math.max(maximumHeap,data.result.heapBytes);state.pending=null;pending.resolve(data.result);}
   },{label:'energy-stream-parent',onFailure:error=>{state.worker.terminate();rejectState(state,error);}});state.worker.onerror=event=>state.protocol.fail(new EngineError('WORKER_FAILED',event.message??'Energy quality worker failed.'));return state;};
 const initialize=state=>{const releaseHeap=state.releaseHeap;state.nativeBytes=0;state.heapBacking=budget.registerBacking?.('wasm',shape.heapMaximumBytes,{owner:'ela',label:'energy-quality-worker',state:'reserved'});state.releaseHeap=()=>{state.heapBacking?.();state.heapBacking=null;if(state.nativeBytes)budget.notifyBackingRelease?.('wasm',state.nativeBytes);state.nativeBytes=0;releaseHeap();};return runWithWorkerTransportRecovery(async({attempt})=>{if(attempt>1)create(state);try{return await rpc(state,{action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes});}catch(error){if(isRecoverableTransportError(error)){state.worker.terminate();state.protocol.dispose();}throw error;}},{budget,signal,owner:'ela',operation:'energy-stream-init'});};
 const lanes=new ElasticQualityWorkers({budget,maxWorkers,workerBytes:shape.workerBytes,windowBytes:0,states,create,initialize,signal});
 const jobs=new QualityTransportQueue(qualities,{budget,signal,label:'energy-quality',discard:async state=>{state.worker.terminate();state.protocol.dispose();await Promise.allSettled([...state.ioTasks]);lanes.retire(state);await state.store?.dispose();state.store=null;await state.plane?.dispose();state.plane=null;},onRecovery:onProgress});
 const operation=budget.beginOperation?.({owner:'ela',id:'energy-stream-pool'});admission.resourceOperation=operation;
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);sourceWindow=await createReusableRgbWindow(surface,{budget,rows:shape.rows,bytes:shape.windowAllowance,signal,operation});
  while(jobs.pending.length){
   const first=completed,active=await lanes.take(jobs.pending.length,{operation}),batch=jobs.assign(active);
   for(const state of active){state.plane=await createSegmentedBytes(shape.width*shape.height*4,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;state.store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});state.written=0;state.readOffset=0;encodedStorage.add(state.store.storage);}
   await jobs.call(active,s=>rpc(s,{action:'open',quality:s.qualityJob.quality}));
   for(let pass=0;pass<2&&active.length;pass++){
    if(pass)await jobs.call(active,s=>rpc(s,{action:'begin-read'}));sourcePasses++;
    for(let y=0;y<shape.height&&active.length;y+=shape.rows){operation?.setState('io');await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await sourceWindow.read({x:0,y,width:shape.width,height:rows});try{await jobs.call(active,s=>rpc(s,{action:pass?'energy':'write',bytes:part.pixels.data}));}finally{part.release();}checkAbort(signal);onProgress?.({phase:pass?'energy-workers-render':'energy-workers-encode',fraction:(first+batch.length*(pass+(y+rows)/shape.height)/2)/qualities.length,qualities:batch});}
   }
   let closingFailure;for(const state of active)state.qualityClosed=false;try{await jobs.call(active,async state=>{const result=await rpc(state,{action:'close'});state.qualityClosed=true;return result;});}catch(error){closingFailure=error;}checkAbort(signal);
   // Publish each completely closed quality before retrying a failed companion.
   for(const state of active)if(state.qualityClosed){await state.plane.flush();await state.store.flush();const store=state.plane;await onPlane(state.qualityJob.quality,{width:shape.width,height:shape.height,format:'float32',layout:'row-major',store,dispose:()=>store.dispose()});state.plane=null;await image.rgbRecompression.retainEncoded(state.qualityJob.quality,{store:state.store,byteLength:state.written});state.store=null;encodedPeak=Math.max(encodedPeak,state.written);completed++;operation?.commit();checkAbort(signal);}
   if(closingFailure)throw closingFailure;
   lanes.finish(active);
  }
  return metrics();
 }catch(error){error.energyPoolMetrics=metrics();throw error;
 }finally{signal?.removeEventListener('abort',stop);stop();await Promise.allSettled([...ioTasks]);try{await Promise.all(states.flatMap(s=>[s.store?.dispose(),s.plane?.dispose()]));}finally{lanes.dispose();sourceWindow?.dispose();operation?.release();}}
}
