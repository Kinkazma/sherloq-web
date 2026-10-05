import "../../runtime-context.js?v=0.14.5";
import {createGrayStreamKernel} from './jpeg-gray-stream-kernel.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {createSegmentedBytes} from './segmented-bytes.js';
export function grayPoolShape(image){const plan=rgbRecompressionPlan(image.surface);return {...plan,encodedCapacityBytes:Math.ceil(plan.width/8)*8*Math.ceil(plan.height/8)*8*2+2048,workerBytes:plan.workingBytes+2*plan.rowBytes*plan.rows+256*1024};}
export async function parallelStoredGrayLosses(image,qualities,count,{budget,signal,onQuality,onProgress}={}){
 const shape=grayPoolShape(image),surface=image.surface,release=budget.reserve(count*shape.workerBytes),states=[],ioTasks=new Set();let stopped=false,maximumHeap=0,encodedPeak=0,sourcePasses=0,completed=0;const encodedStorage=new Set();const metrics=()=>({workers:count,kernel:'global-gray-jpeg-stored-worker-pool',recompressions:completed,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,totalCodecHeapMaximumBytes:count*shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,sourcePasses,encodedStorage:encodedStorage.size>1?'mixed':[...encodedStorage][0]??null,maximumEncodedBytes:encodedPeak});
 function rejectState(state,error){state.pending?.reject(error);state.pending=null;}
 function stop(){if(stopped)return;stopped=true;for(const state of states){state.worker.onmessage=null;state.worker.terminate();rejectState(state,new EngineError('CANCELLED','Grayscale quality workers stopped.'));}}
 const rpc=(state,data)=>new Promise((resolve,reject)=>{state.pending={resolve,reject};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Grayscale quality workers stopped.');state.worker.postMessage(data);}catch(error){state.pending=null;reject(error);}});
 async function handleIo(state,data){
  try{checkAbort(signal);let bytes;if(data.io==='write'){if(state.written+data.bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Grayscale JPEG exceeded its conservative capacity.');await state.store.write(data.bytes,state.written);state.written+=data.bytes.length;}
   else{const length=Math.min(data.length,state.written-state.readOffset);bytes=new Uint8Array(length);await state.store.readInto(bytes,state.readOffset);state.readOffset+=length;}
   if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,bytes},bytes?[bytes.buffer]:[]);
  }catch(error){if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,error:{code:error.code??'WORKER_FAILED',message:error.message}});}
 }
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);for(let i=0;i<count;i++){const state={worker:new Worker(new URL('./jpeg-gray-stream-worker.js',import.meta.url),{type:'module'}),pending:null,store:null,written:0,readOffset:0};states.push(state);state.worker.onmessage=({data})=>{
    if(data.io){const task=handleIo(state,data);ioTasks.add(task);task.finally(()=>ioTasks.delete(task));return;}
    const pending=state.pending;state.pending=null;if(!pending)return;if(data.error)pending.reject(new EngineError(data.error.code,data.error.message));else{maximumHeap=Math.max(maximumHeap,data.result.heapBytes);pending.resolve(data.result);}
   };state.worker.onerror=()=>rejectState(state,new EngineError('WORKER_FAILED','Grayscale quality worker failed.'));}
  await Promise.all(states.map(s=>rpc(s,{action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes})));
  for(let first=0;first<qualities.length;first+=count){
   const batch=qualities.slice(first,first+count),active=states.slice(0,batch.length),sums=new Float64Array(batch.length);
   for(const state of active){const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;state.store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});state.written=0;state.readOffset=0;encodedStorage.add(state.store.storage);}
   await Promise.all(active.map((s,i)=>rpc(s,{action:'open',quality:batch[i]})));
   for(let pass=0;pass<2;pass++){
    if(pass)await Promise.all(active.map(s=>rpc(s,{action:'begin-read'})));sourcePasses++;
    for(let y=0;y<shape.height;y+=shape.rows){await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{const outputs=await Promise.all(active.map(s=>rpc(s,{action:pass?'loss':'write',bytes:part.pixels.data})));if(pass)for(let i=0;i<outputs.length;i++)sums[i]+=outputs[i].loss;}finally{part.release();}checkAbort(signal);onProgress?.((first+batch.length*(pass+(y+rows)/shape.height)/2)/qualities.length);}
   }
   await Promise.all(active.map(s=>rpc(s,{action:'close'})));checkAbort(signal);
   for(let i=0;i<batch.length;i++){const state=active[i];await state.store.flush();await state.store.dispose();state.store=null;encodedPeak=Math.max(encodedPeak,state.written);onQuality?.(batch[i],sums[i]*(1/(shape.width*shape.height)));completed++;checkAbort(signal);}
  }
  return metrics();
 }catch(error){error.grayPoolMetrics=metrics();throw error;
 }finally{signal?.removeEventListener('abort',stop);stop();await Promise.allSettled([...ioTasks]);try{await Promise.all(states.map(s=>s.store?.dispose()));}finally{release();}}
}

export async function serialStoredGrayLosses(image,qualities,{budget,signal,onQuality,onProgress}={}){
 const shape=grayPoolShape(image),release=budget.reserve(shape.workerBytes);let store,written=0,readOffset=0,maximumHeap=0,maximumEncodedBytes=0;
 const kernel=createGrayStreamKernel({writeEncoded:async bytes=>{checkAbort(signal);if(written+bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Grayscale JPEG exceeded its conservative capacity.');await store.write(bytes,written);written+=bytes.length;},readEncoded:async target=>{checkAbort(signal);const length=Math.min(target.length,written-readOffset);await store.readInto(target.subarray(0,length),readOffset);readOffset+=length;return length;}}),storage=new Set();
 try{
  await kernel.execute({action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes});
  for(let index=0;index<qualities.length;index++){
   await controlCheckpoint(signal);const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});storage.add(store.storage);written=readOffset=0;let sum=0;
   await kernel.execute({action:'open',quality:qualities[index]});
   for(let pass=0;pass<2;pass++){
    if(pass)await kernel.execute({action:'begin-read'});
    for(let y=0;y<shape.height;y+=shape.rows){await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await image.surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{const output=await kernel.execute({action:pass?'loss':'write',bytes:part.pixels.data});if(pass)sum+=output.loss;maximumHeap=Math.max(maximumHeap,output.heapBytes);}finally{part.release();}onProgress?.((index+(pass+(y+rows)/shape.height)/2)/qualities.length);}
   }
   await kernel.execute({action:'close'});maximumEncodedBytes=Math.max(maximumEncodedBytes,written);await store.dispose();store=null;onQuality?.(qualities[index],sum*(1/(shape.width*shape.height)));checkAbort(signal);
  }
  return {workers:1,kernel:'global-gray-jpeg-stored-serial',recompressions:qualities.length,sourcePasses:qualities.length*2,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,encodedStorage:storage.size>1?'mixed':[...storage][0],maximumEncodedBytes};
 }finally{kernel.dispose();try{await store?.dispose();}finally{release();}}
}
