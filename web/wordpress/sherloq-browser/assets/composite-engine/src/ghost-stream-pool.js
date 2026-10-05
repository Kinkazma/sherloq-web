import {EngineError,checkAbort,controlCheckpoint} from './errors.js';import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {rolledRgbSurface} from './rolled-rgb-surface.js';import {createSegmentedBytes} from './segmented-bytes.js';
export function ghostPoolShape(image){const plan=rgbRecompressionPlan(image.surface),cells=Math.floor(plan.width/16)*Math.floor(plan.height/16);return {...plan,cells,workerBytes:plan.workingBytes+2*plan.rowBytes*plan.rows+cells*8+256*1024};}
export async function parallelGhostPlanes(image,qualities,count,{budget,signal,phaseX,phaseY,onPlane,onProgress}={}){
 const shape=ghostPoolShape(image),surface=rolledRgbSurface(image.surface,phaseX,phaseY,budget),release=budget.reserve(count*shape.workerBytes),states=[],ioTasks=new Set();let stopped=false,maximumHeap=0,encodedPeak=0,sourcePasses=0,completed=0;const encodedStorage=new Set();const metrics=()=>({workers:count,kernel:'global-rgb-jpeg-ghost-worker-pool',recompressions:completed,qualityPlanesComputed:completed,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,totalCodecHeapMaximumBytes:count*shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,sourcePasses,encodedStorage:encodedStorage.size>1?'mixed':[...encodedStorage][0]??null,maximumEncodedBytes:encodedPeak});
 function rejectState(state,error){state.pending?.reject(error);state.pending=null;}
 function stop(){if(stopped)return;stopped=true;for(const state of states){state.worker.onmessage=null;state.worker.terminate();rejectState(state,new EngineError('CANCELLED','Ghost quality workers stopped.'));}}
 const rpc=(state,data)=>new Promise((resolve,reject)=>{state.pending={resolve,reject};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Ghost quality workers stopped.');state.worker.postMessage(data);}catch(error){state.pending=null;reject(error);}});
 async function handleIo(state,data){
  try{checkAbort(signal);let bytes;if(data.io==='write'){if(state.written+data.bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Ghost JPEG exceeded its conservative capacity.');await state.store.write(data.bytes,state.written);state.written+=data.bytes.length;}
   else{const length=Math.min(data.length,state.written-state.readOffset);bytes=new Uint8Array(length);await state.store.readInto(bytes,state.readOffset);state.readOffset+=length;}
   if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,bytes},bytes?[bytes.buffer]:[]);
  }catch(error){if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,error:{code:error.code??'WORKER_FAILED',message:error.message}});}
 }
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);for(let i=0;i<count;i++){const state={worker:new Worker(new URL('./ghost-stream-worker.js',import.meta.url),{type:'module'}),pending:null,store:null,written:0,readOffset:0};states.push(state);state.worker.onmessage=({data})=>{
    if(data.io){const task=handleIo(state,data);ioTasks.add(task);task.finally(()=>ioTasks.delete(task));return;}
    const pending=state.pending;state.pending=null;if(!pending)return;if(data.error)pending.reject(new EngineError(data.error.code,data.error.message));else{maximumHeap=Math.max(maximumHeap,data.result.heapBytes);pending.resolve(data.result);}
   };state.worker.onerror=()=>rejectState(state,new EngineError('WORKER_FAILED','Ghost quality worker failed.'));}
  await Promise.all(states.map(s=>rpc(s,{action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes})));
  for(let first=0;first<qualities.length;first+=count){
   const batch=qualities.slice(first,first+count),active=states.slice(0,batch.length),planes=batch.map(()=>new Float64Array(shape.cells));
   for(const state of active){const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;state.store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});state.written=0;state.readOffset=0;encodedStorage.add(state.store.storage);}
   await Promise.all(active.map((s,i)=>rpc(s,{action:'open',quality:batch[i]})));
   for(let pass=0;pass<2;pass++){
    if(pass)await Promise.all(active.map(s=>rpc(s,{action:'begin-read'})));sourcePasses++;
    for(let y=0;y<shape.height;y+=shape.rows){await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{const outputs=await Promise.all(active.map(s=>rpc(s,{action:pass?'blocks':'write',bytes:part.pixels.data})));if(pass)for(let i=0;i<outputs.length;i++)planes[i].set(outputs[i].blocks,(y/16)*Math.floor(shape.width/16));}finally{part.release();}checkAbort(signal);onProgress?.({phase:pass?'ghost-workers-render':'ghost-workers-encode',fraction:(first+batch.length*(pass+(y+rows)/shape.height)/2)/qualities.length,qualities:batch});}
   }
   await Promise.all(active.map(s=>rpc(s,{action:'close'})));checkAbort(signal);
   for(let i=0;i<batch.length;i++){const state=active[i];await state.store.flush();await image.rgbRecompression.retainEncoded(batch[i],{store:state.store,byteLength:state.written},{phaseX,phaseY});state.store=null;encodedPeak=Math.max(encodedPeak,state.written);onPlane?.(batch[i],planes[i]);completed++;checkAbort(signal);}
  }
  return metrics();
 }catch(error){error.ghostPoolMetrics=metrics();throw error;
 }finally{signal?.removeEventListener('abort',stop);stop();await Promise.allSettled([...ioTasks]);try{await Promise.all(states.map(s=>s.store?.dispose()));}finally{release();}}
}
