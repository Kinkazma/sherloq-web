import "../../runtime-context.js?v=0.14.5";
import {deserializeWorkerError} from './errors.js';
import {ElasticQualityWorkers} from './elastic-quality-workers.js';
import {scheduledWorkerCall,cancelScheduledWorkerCalls} from './scheduled-worker-call.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
export const STREAM_WORKER_HEAP=32*1024**2;
export function streamPoolShape(surface){const {width,height,sourceWidth=width}=surface.descriptor,rowBytes=width*3,rows=Math.min(height,Math.max(1,Math.floor(1024**2/rowBytes)));return {width,height,rows,workerBytes:STREAM_WORKER_HEAP+2*rows*rowBytes+1024**2,windowBytes:rows*rowBytes+sourceWidth*3+65536};}
export async function parallelSegmentedLosses(surface,qualities,count,{budget,maxWorkers=count,signal,onProgress,onQuality}={}){
 const admission={budget,maximum:maxWorkers,resourceOwner:'ela'};
 const shape=streamPoolShape(surface),{width,height,rows}=shape,states=[],pending=new Set();let maximumHeap=0,stopped=false,sourcePasses=0;
 const stop=()=>{if(stopped)return;stopped=true;cancelScheduledWorkerCalls(admission);for(const state of states)state.worker.terminate();for(const fail of [...pending])fail(new EngineError('CANCELLED','JPEG scanline workers stopped.'));pending.clear();};
 const rpc=(worker,data)=>scheduledWorkerCall(admission,()=>new Promise((resolve,reject)=>{
  const fail=error=>{pending.delete(fail);reject(error);};pending.add(fail);
  worker.onmessage=({data})=>{pending.delete(fail);if(data.error){reject(deserializeWorkerError(data.error,'JPEG scanline worker failed.'));return;}maximumHeap=Math.max(maximumHeap,data.heapBytes);resolve(data);};
  worker.onerror=()=>fail(new EngineError('WORKER_FAILED','JPEG scanline worker failed.'));try{checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','JPEG scanline workers stopped.');worker.postMessage(data);}catch(error){fail(error);}
 }),{signal,label:'segmented-recompression-pool'});
 const lanes=new ElasticQualityWorkers({budget,maxWorkers,workerBytes:shape.workerBytes,windowBytes:shape.windowBytes,states,create:()=>({worker:new Worker(new URL('./jpeg-stream-worker.js',import.meta.url),{type:'module'})}),initialize:state=>rpc(state.worker,{action:'init',width,height,rows,heapBytes:STREAM_WORKER_HEAP}),signal});
 const operation=budget.beginOperation?.({owner:'ela',id:'segmented-recompression-pool'});admission.resourceOperation=operation;
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);
  const raw=new Float64Array(qualities.length),reciprocal=1/(width*height);
  for(let start=0;start<qualities.length;){
   const selected=await lanes.take(qualities.length-start,{operation}),current=qualities.slice(start,start+selected.length),active=selected.map(state=>state.worker),sums=new Float64Array(current.length);
   await Promise.all(active.map((w,i)=>rpc(w,{action:'open',quality:current[i]})));
   for(let pass=0;pass<2;pass++){
    if(pass)await Promise.all(active.map(w=>rpc(w,{action:'begin-read'})));sourcePasses++;
    for(let y=0;y<height;y+=rows){
     operation?.setState('io');await controlCheckpoint(signal);const countRows=Math.min(rows,height-y),part=await surface.readWindow({x:0,y,width,height:countRows},{signal});
     try{const values=await Promise.all(active.map(w=>rpc(w,{action:pass?'loss':'write',bytes:part.pixels.data})));if(pass)for(let i=0;i<values.length;i++)sums[i]+=values[i].loss;}
     finally{part.release();}
     checkAbort(signal);onProgress?.((start+current.length*(pass+(y+countRows)/height)/2)/qualities.length);checkAbort(signal);
    }
   }
   await Promise.all(active.map(w=>rpc(w,{action:'close'})));checkAbort(signal);
   for(let i=0;i<current.length;i++){raw[start+i]=sums[i]*reciprocal;onQuality?.(current[i],raw[start+i]);operation?.commit();}checkAbort(signal);
   lanes.finish(selected);start+=current.length;
  }
  return {raw,metrics:{workers:lanes.snapshot().peakWorkers,elastic:lanes.snapshot(),recompressions:qualities.length,rowsPerChunk:rows,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:STREAM_WORKER_HEAP,totalCodecHeapMaximumBytes:lanes.snapshot().peakWorkers*STREAM_WORKER_HEAP,kernel:'global-jpeg-scanlines-pool',sourcePasses}};
 }finally{signal?.removeEventListener('abort',stop);stop();lanes.dispose();operation?.release();}
}
