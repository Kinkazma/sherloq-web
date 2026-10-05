import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';import {energyStreamBytes} from './energy-stream.js';import {createSegmentedBytes} from './segmented-bytes.js';
export function energyPoolShape(image){const plan=rgbRecompressionPlan(image.surface);return {...plan,workerBytes:plan.workingBytes+2*plan.rowBytes*plan.rows+energyStreamBytes(plan.width,plan.height)+plan.width*32*4+256*1024};}
export async function parallelEnergyPlanes(image,qualities,count,{budget,signal,onPlane,onProgress}={}){
 const shape=energyPoolShape(image),surface=image.surface,release=budget.reserve(count*shape.workerBytes),states=[],ioTasks=new Set();let planning,stopped=false,maximumHeap=0,encodedPeak=0,sourcePasses=0,completed=0;const encodedStorage=new Set();const metrics=()=>({workers:count,kernel:'global-rgb-jpeg-energy-worker-pool',recompressions:completed,qualityPlanesComputed:completed,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:shape.heapMaximumBytes,totalCodecHeapMaximumBytes:count*shape.heapMaximumBytes,maxSourceWindowBytes:shape.rows*shape.rowBytes,sourcePasses,encodedStorage:encodedStorage.size>1?'mixed':[...encodedStorage][0]??null,maximumEncodedBytes:encodedPeak});
 function rejectState(state,error){state.pending?.reject(error);state.pending=null;}
 function stop(){if(stopped)return;stopped=true;for(const state of states){state.worker.onmessage=null;state.worker.terminate();rejectState(state,new EngineError('CANCELLED','Energy quality workers stopped.'));}}
 const rpc=(state,data)=>new Promise((resolve,reject)=>{state.pending={resolve,reject};try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Energy quality workers stopped.');state.worker.postMessage(data);}catch(error){state.pending=null;reject(error);}});
 async function handleIo(state,data){
  try{checkAbort(signal);let bytes;if(data.io==='write'){if(state.written+data.bytes.length>shape.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Energy JPEG exceeded its conservative capacity.');await state.store.write(data.bytes,state.written);state.written+=data.bytes.length;}
   else if(data.io==='energy'){await state.plane.write(data.bytes,data.y*shape.width*4);}
   else{const length=Math.min(data.length,state.written-state.readOffset);bytes=new Uint8Array(length);await state.store.readInto(bytes,state.readOffset);state.readOffset+=length;}
   if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,bytes},bytes?[bytes.buffer]:[]);
  }catch(error){if(!stopped)state.worker.postMessage({ioReply:true,id:data.id,error:{code:error.code??'WORKER_FAILED',message:error.message}});}
 }
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);for(let i=0;i<count;i++){const state={worker:new Worker(new URL('./energy-stream-worker.js',import.meta.url),{type:'module'}),pending:null,store:null,plane:null,written:0,readOffset:0};states.push(state);state.worker.onmessage=({data})=>{
    if(data.io){const task=handleIo(state,data);ioTasks.add(task);task.finally(()=>ioTasks.delete(task));return;}
    const pending=state.pending;state.pending=null;if(!pending)return;if(data.error)pending.reject(new EngineError(data.error.code,data.error.message));else{maximumHeap=Math.max(maximumHeap,data.result.heapBytes);pending.resolve(data.result);}
   };state.worker.onerror=()=>rejectState(state,new EngineError('WORKER_FAILED','Energy quality worker failed.'));}
  await Promise.all(states.map(s=>rpc(s,{action:'init',width:shape.width,height:shape.height,heapBytes:shape.heapMaximumBytes})));
  for(let first=0;first<qualities.length;first+=count){
   const batch=qualities.slice(first,first+count),active=states.slice(0,batch.length);
   planning=budget.reserve(shape.windowAllowance);
   for(const state of active){state.plane=await createSegmentedBytes(shape.width*shape.height*4,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});const fits=shape.encodedCapacityBytes+shape.windowAllowance<=budget.limit-budget.retained-budget.active;state.store=await createSegmentedBytes(shape.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});state.written=0;state.readOffset=0;encodedStorage.add(state.store.storage);}
   planning();planning=null;
   await Promise.all(active.map((s,i)=>rpc(s,{action:'open',quality:batch[i]})));
   for(let pass=0;pass<2;pass++){
    if(pass)await Promise.all(active.map(s=>rpc(s,{action:'begin-read'})));sourcePasses++;
    for(let y=0;y<shape.height;y+=shape.rows){await controlCheckpoint(signal);const rows=Math.min(shape.rows,shape.height-y),part=await surface.readWindow({x:0,y,width:shape.width,height:rows},{signal});try{await Promise.all(active.map(s=>rpc(s,{action:pass?'energy':'write',bytes:part.pixels.data})));}finally{part.release();}checkAbort(signal);onProgress?.({phase:pass?'energy-workers-render':'energy-workers-encode',fraction:(first+batch.length*(pass+(y+rows)/shape.height)/2)/qualities.length,qualities:batch});}
   }
   const closed=await Promise.allSettled(active.map(s=>rpc(s,{action:'close'})));checkAbort(signal);
   // Publish each completely closed quality before retrying a failed companion.
   for(let i=0;i<batch.length;i++)if(closed[i].status==='fulfilled'){const state=active[i];await state.plane.flush();await state.store.flush();const store=state.plane;await onPlane(batch[i],{width:shape.width,height:shape.height,format:'float32',layout:'row-major',store,dispose:()=>store.dispose()});state.plane=null;await image.rgbRecompression.retainEncoded(batch[i],{store:state.store,byteLength:state.written});state.store=null;encodedPeak=Math.max(encodedPeak,state.written);completed++;checkAbort(signal);}
   const failure=closed.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  }
  return metrics();
 }catch(error){error.energyPoolMetrics=metrics();throw error;
 }finally{planning?.();signal?.removeEventListener('abort',stop);stop();await Promise.allSettled([...ioTasks]);try{await Promise.all(states.flatMap(s=>[s.store?.dispose(),s.plane?.dispose()]));}finally{release();}}
}
