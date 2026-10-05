import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
export const STREAM_WORKER_HEAP=32*1024**2;
export function streamPoolShape(surface){const {width,height,sourceWidth=width}=surface.descriptor,rowBytes=width*3,rows=Math.min(height,Math.max(1,Math.floor(1024**2/rowBytes)));return {width,height,rows,workerBytes:STREAM_WORKER_HEAP+2*rows*rowBytes+1024**2,windowBytes:rows*rowBytes+sourceWidth*3+65536};}
export async function parallelSegmentedLosses(surface,qualities,count,{budget,signal,onProgress,onQuality}={}){
 const shape=streamPoolShape(surface),{width,height,rows}=shape,release=budget.reserve(count*shape.workerBytes),workers=[],pending=new Set();let maximumHeap=0;
 const stop=()=>{for(const worker of workers)worker.terminate();for(const fail of [...pending])fail(new EngineError('CANCELLED','JPEG scanline workers stopped.'));pending.clear();};
 const rpc=(worker,data)=>new Promise((resolve,reject)=>{
  const fail=error=>{pending.delete(fail);reject(error);};pending.add(fail);
  worker.onmessage=({data})=>{pending.delete(fail);if(data.error){reject(new EngineError(data.error,'JPEG scanline worker failed.'));return;}maximumHeap=Math.max(maximumHeap,data.heapBytes);resolve(data);};
  worker.onerror=()=>fail(new EngineError('WORKER_FAILED','JPEG scanline worker failed.'));try{checkAbort(signal);worker.postMessage(data);}catch(error){fail(error);}
 });
 signal?.addEventListener('abort',stop,{once:true});
 try{
  checkAbort(signal);for(let i=0;i<count;i++)workers.push(new Worker(new URL('./jpeg-stream-worker.js',import.meta.url),{type:'module'}));
  await Promise.all(workers.map(w=>rpc(w,{action:'init',width,height,rows,heapBytes:STREAM_WORKER_HEAP})));checkAbort(signal);
  const raw=new Float64Array(qualities.length),reciprocal=1/(width*height);
  for(let start=0;start<qualities.length;start+=count){
   const current=qualities.slice(start,start+count),active=workers.slice(0,current.length),sums=new Float64Array(current.length);
   await Promise.all(active.map((w,i)=>rpc(w,{action:'open',quality:current[i]})));
   for(let pass=0;pass<2;pass++){
    if(pass)await Promise.all(active.map(w=>rpc(w,{action:'begin-read'})));
    for(let y=0;y<height;y+=rows){
     await controlCheckpoint(signal);const countRows=Math.min(rows,height-y),part=await surface.readWindow({x:0,y,width,height:countRows},{signal});
     try{const values=await Promise.all(active.map(w=>rpc(w,{action:pass?'loss':'write',bytes:part.pixels.data})));if(pass)for(let i=0;i<values.length;i++)sums[i]+=values[i].loss;}
     finally{part.release();}
     checkAbort(signal);onProgress?.((start+current.length*(pass+(y+countRows)/height)/2)/qualities.length);checkAbort(signal);
    }
   }
   await Promise.all(active.map(w=>rpc(w,{action:'close'})));checkAbort(signal);
   for(let i=0;i<current.length;i++){raw[start+i]=sums[i]*reciprocal;onQuality?.(current[i],raw[start+i]);}checkAbort(signal);
  }
  return {raw,metrics:{workers:count,recompressions:qualities.length,rowsPerChunk:rows,codecHeapCapacityBytes:maximumHeap,codecHeapMaximumBytes:STREAM_WORKER_HEAP,totalCodecHeapMaximumBytes:count*STREAM_WORKER_HEAP,kernel:'global-jpeg-scanlines-pool',sourcePasses:Math.ceil(qualities.length/count)*2}};
 }finally{signal?.removeEventListener('abort',stop);stop();release();}
}
