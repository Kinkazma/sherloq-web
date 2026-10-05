import "../../runtime-context.js?v=0.14.5";
import {byteLength,byteSubrange} from './memory-range.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {runWithWorkerTransportRecovery,QualityTransportQueue} from './worker-transport-recovery.js';
import {ElasticQualityWorkers} from './elastic-quality-workers.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {createGrayStreamKernel} from './jpeg-gray-stream-kernel.js';
import {EngineError,checkAbort,controlCheckpoint,deserializeEngineError,serializeEngineError,isRecoverableTransportError} from './errors.js';import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {createSegmentedBytes} from './segmented-bytes.js';
export function grayPoolShape(image){const plan=rgbRecompressionPlan(image.surface);return {...plan,encodedCapacityBytes:Math.ceil(plan.width/8)*8*Math.ceil(plan.height/8)*8*2+2048,workerBytes:plan.workingBytes+2*plan.rowBytes*plan.rows+256*1024};}
export async function parallelStoredGrayLosses(image,qualities,count,{budget,maxWorkers=count,signal,onQuality,onProgress}={}){
 const admission={budget,maximum:maxWorkers,resourceOwner:'ela'};
 const shape=grayPoolShape(image),surface=image.surface,states=[],ioTasks=new Set();let stopped=false,maximumHeap=0,encodedPeak=0,sourcePasses=0,completed=0;const encodedStorage=new Set();const metrics=()=>({workers:lanes.snapshot().peakWorkers,elastic:lanes.snapshot(),kernel:'global-gray-jpeg-stored-worker-pool',recompressions:completed,transportRecoveries:jobs.recoveries,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,totalCodecHeapMaximumBytes:lanes.snapshot().peakWorkers*shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,sourcePasses,encodedStorage:encodedStorage.size>1?'mixed':[...encodedStorage][0]??null,maximumEncodedBytes:encodedPeak});
 function rejectState(state,error){state.pending?.reject(error);state.pending=null;}
 function stop(){if(stopped)return;stopped=true;cancelScheduledWorkerCalls(admission);for(const state of states){state.worker.onmessage=null;state.worker.terminate();rejectState(state,new EngineError('CANCELLED','Grayscale quality workers stopped.'));}}
 const rpc=(state,data)=>scheduledWorkerCall(admission,()=>new Promise((resolve,reject)=>{state.pending={resolve,reject,action:data.action};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Grayscale quality workers stopped.');if(state.protocol.failed)throw state.protocol.error;state.protocol.post(data);}catch(error){state.pending=null;reject(error);}}),{signal,label:'jpeg-gray-stream-pool'});
 async function handleIo(state,data){
  try{checkAbort(signal);let bytes;if(data.io==='write'){if(state.written+data.bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Grayscale JPEG exceeded its conservative capacity.');await state.store.write(data.bytes,state.written);state.written+=data.bytes.length;}
   else{const length=Math.min(data.length,state.written-state.readOffset);bytes=new Uint8Array(length);await state.store.readInto(bytes,state.readOffset);state.readOffset+=length;}
   if(!stopped&&!state.protocol.failed)state.protocol.post({ioReply:true,id:data.id,bytes},bytes?[bytes.buffer]:[]);
  }catch(error){if(!stopped&&!state.protocol.failed)try{state.protocol.post({ioReply:true,id:data.id,error:serializeEngineError(error,'WORKER_FAILED')});}catch(failure){state.protocol.fail(failure);}}
 }
 const create=(state={pending:null,store:null,written:0,readOffset:0,ioTasks:new Set()})=>{state.worker=new Worker(new URL('./jpeg-gray-stream-worker.js',import.meta.url),{type:'module'});state.protocol=installWorkerMessageProtocol(state.worker,data=>{
    if(data.io){if(!Number.isSafeInteger(data.id)||!(['write','read'].includes(data.io))||(data.io==='read'?!Number.isSafeInteger(data.length)||data.length<0:!(data.bytes instanceof Uint8Array)))throw workerMessageFailure('gray-stream-parent','message','invalid-io-envelope');const task=handleIo(state,data);ioTasks.add(task);state.ioTasks.add(task);const done=()=>{ioTasks.delete(task);state.ioTasks.delete(task);};task.then(done,done);return;}
    const pending=state.pending;if(!pending)return;if(data.error){state.pending=null;pending.reject(deserializeEngineError(data.error));}else{if(!data.result||typeof data.result!=='object'||!Number.isSafeInteger(data.result.heapBytes)||data.result.heapBytes<=0||(pending.action==='loss'&&typeof data.result.loss!=='number'))throw workerMessageFailure('gray-stream-parent','message','invalid-result-envelope');maximumHeap=Math.max(maximumHeap,data.result.heapBytes);state.pending=null;pending.resolve(data.result);}
   },{label:'gray-stream-parent',onFailure:error=>{state.worker.terminate();rejectState(state,error);}});state.worker.onerror=event=>state.protocol.fail(new EngineError('WORKER_FAILED',event.message??'Grayscale quality worker failed.'));return state;};
 const initialize=state=>runWithWorkerTransportRecovery(async({attempt})=>{if(attempt>1)create(state);try{return await rpc(state,{action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes});}catch(error){if(isRecoverableTransportError(error)){state.worker.terminate();state.protocol.dispose();}throw error;}},{budget,signal,owner:'ela',operation:'gray-stream-init'});
 const lanes=new ElasticQualityWorkers({budget,maxWorkers,workerBytes:shape.workerBytes,windowBytes:shape.windowAllowance,states,create,initialize,signal});
 const jobs=new QualityTransportQueue(qualities,{budget,signal,label:'gray-quality',discard:async state=>{state.worker.terminate();state.protocol.dispose();await Promise.allSettled([...state.ioTasks]);lanes.retire(state);await state.store?.dispose();state.store=null;}});
 const operation=budget.beginOperation?.({owner:'ela',id:'jpeg-gray-stream-pool'});admission.resourceOperation=operation;
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);
  while(jobs.pending.length){
   const first=completed,active=await lanes.take(jobs.pending.length,{operation}),batch=jobs.assign(active),sums=new Map(active.map(state=>[state,0]));
   for(const state of active){const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;state.store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});state.written=0;state.readOffset=0;encodedStorage.add(state.store.storage);}
   await jobs.call(active,s=>rpc(s,{action:'open',quality:s.qualityJob.quality}));
   for(let pass=0;pass<2&&active.length;pass++){
    if(pass)await jobs.call(active,s=>rpc(s,{action:'begin-read'}));sourcePasses++;
    for(let y=0;y<shape.height&&active.length;y+=shape.rows){operation?.setState('io');await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{const outputs=await jobs.call(active,s=>rpc(s,{action:pass?'loss':'write',bytes:part.pixels.data}));if(pass)for(const state of active)sums.set(state,sums.get(state)+outputs.get(state).loss);}finally{part.release();}checkAbort(signal);onProgress?.((first+batch.length*(pass+(y+rows)/shape.height)/2)/qualities.length);}
   }
   let closingFailure;for(const state of active)state.qualityClosed=false;try{await jobs.call(active,async state=>{const result=await rpc(state,{action:'close'});state.qualityClosed=true;return result;});}catch(error){closingFailure=error;}checkAbort(signal);
   for(const state of active)if(state.qualityClosed){await state.store.flush();await state.store.dispose();state.store=null;encodedPeak=Math.max(encodedPeak,state.written);onQuality?.(state.qualityJob.quality,sums.get(state)*(1/(shape.width*shape.height)));completed++;operation?.commit();checkAbort(signal);}
   if(closingFailure)throw closingFailure;
   lanes.finish(active);
  }
  return metrics();
 }catch(error){error.grayPoolMetrics=metrics();throw error;
 }finally{signal?.removeEventListener('abort',stop);stop();await Promise.allSettled([...ioTasks]);try{await Promise.all(states.map(s=>s.store?.dispose()));}finally{lanes.dispose();operation?.release();}}
}

export async function serialStoredGrayLosses(image,qualities,{budget,signal,onQuality,onProgress}={}){
 const shape=grayPoolShape(image),release=budget.reserve(shape.workerBytes);let store,written=0,readOffset=0,maximumHeap=0,maximumEncodedBytes=0;
 const kernel=createGrayStreamKernel({writeEncoded:async bytes=>{checkAbort(signal);if(written+byteLength(bytes)>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Grayscale JPEG exceeded its conservative capacity.');await store.write(bytes,written);written+=byteLength(bytes);},readEncoded:async target=>{checkAbort(signal);const length=Math.min(byteLength(target),written-readOffset);await store.readInto(byteSubrange(target,0,length),readOffset);readOffset+=length;return length;}}),storage=new Set();
 const operation=budget.beginOperation?.({owner:'ela',id:'serial-gray-stream'});
 try{
  await kernel.execute({action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes});
  for(let index=0;index<qualities.length;index++){
   operation?.setState('io');await controlCheckpoint(signal);const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});storage.add(store.storage);written=readOffset=0;let sum=0;
   await kernel.execute({action:'open',quality:qualities[index]});
   for(let pass=0;pass<2;pass++){
    if(pass)await kernel.execute({action:'begin-read'});
    for(let y=0;y<shape.height;y+=shape.rows){operation?.setState('io');await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await image.surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{const output=await kernel.execute({action:pass?'loss':'write',bytes:part.pixels.data});if(pass)sum+=output.loss;maximumHeap=Math.max(maximumHeap,output.heapBytes);}finally{part.release();}onProgress?.((index+(pass+(y+rows)/shape.height)/2)/qualities.length);}
   }
   await kernel.execute({action:'close'});maximumEncodedBytes=Math.max(maximumEncodedBytes,written);await store.dispose();store=null;onQuality?.(qualities[index],sum*(1/(shape.width*shape.height)));operation?.commit();checkAbort(signal);
  }
  return {workers:1,kernel:'global-gray-jpeg-stored-serial',recompressions:qualities.length,sourcePasses:qualities.length*2,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,encodedStorage:storage.size>1?'mixed':[...storage][0],maximumEncodedBytes};
 }finally{kernel.dispose();try{await store?.dispose();}finally{release();operation?.release();}}
}
