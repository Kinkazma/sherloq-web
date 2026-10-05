import "../../runtime-context.js?v=0.14.5";
import {wasmAllocationFailure,allocateWasmMemory} from './allocation.js';
import {parallelStoredGrayLosses,serialStoredGrayLosses,grayPoolShape} from './jpeg-gray-stream-pool.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {parallelSegmentedLosses,streamPoolShape} from './segmented-recompression-pool.js';
import createModule from '../vendor/jpeg-stream/jpeg-stream.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
// One global JPEG stream per quality; strip boundaries never reset codec state.
async function serialSegmentedLosses(surface,qualities,{budget,signal,onProgress,onQuality}={}){
 const {width,height,sourceWidth=width}=surface.descriptor;
 requireValue(budget&&qualities.length>0&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(!i||q>qualities[i-1])),'Shared budget and ordered qualities required.');
 requireValue(width<=65500&&height<=65500,'JPEG dimensions exceed native codec limits.');checkAbort(signal);
 const rowBytes=width*3,rows=Math.min(height,Math.max(1,Math.floor(1024**2/rowBytes))),windowAllowance=rows*rowBytes+sourceWidth*3+65536;
 const available=budget.limit-budget.retained-budget.active-windowAllowance;
 const heapBytes=Math.min(128*1024**2,Math.floor(available/(16*1024**2))*16*1024**2);
 if(heapBytes<32*1024**2)throw new EngineError('MEMORY_LIMIT','No room for bounded JPEG scanline recompression.');
 const release=budget.reserve(heapBytes+4096);let m,pointer=0,stream=0;
 try{
  m=await createModule({wasmMemory:allocateWasmMemory({initial:256,maximum:heapBytes/65536})});checkAbort(signal);
  pointer=m._malloc(rows*rowBytes);if(!pointer)throw wasmAllocationFailure(m,'JPEG scanline allocation failed.',rows*rowBytes);
  const raw=new Float64Array(qualities.length),reciprocal=1/(width*height);
  const error=()=>(m._stream_error()===2?wasmAllocationFailure(m,'Global JPEG native allocation failed.'):new EngineError('INVALID_INPUT','Global JPEG scanline recompression failed.'));
  for(let index=0;index<qualities.length;index++){
   await controlCheckpoint(signal);stream=m._stream_open(width,height,qualities[index]);if(!stream)throw error();
   let sum=0;
   for(let pass=0;pass<2;pass++){
    if(pass&&!m._stream_begin_read(stream))throw error();
    for(let y=0;y<height;y+=rows){
     await controlCheckpoint(signal);const count=Math.min(rows,height-y),part=await surface.readWindow({x:0,y,width,height:count},{signal});
     try{m.HEAPU8.set(part.pixels.data,pointer);if(!pass){if(!m._stream_write(stream,pointer,count))throw error();}else{const loss=m._stream_read_loss(stream,pointer,count);if(loss<0)throw error();sum+=loss;}}
     finally{part.release();}
     checkAbort(signal);onProgress?.((index+(pass+(y+count)/height)/2)/qualities.length);
    }
   }
   m._stream_close(stream);stream=0;raw[index]=sum*reciprocal;onQuality?.(qualities[index],raw[index]);checkAbort(signal);
  }
  return {raw,metrics:{workers:1,recompressions:qualities.length,rowsPerChunk:rows,codecHeapCapacityBytes:m.HEAPU8.buffer.byteLength,codecHeapMaximumBytes:heapBytes,kernel:'global-jpeg-scanlines',sourcePasses:qualities.length*2}};
 }finally{if(stream)m._stream_close(stream);if(pointer)m._free(pointer);m=null;release();}
}


export async function segmentedRecompressionLosses(surface,qualities,options={}){
 const {budget,signal,onProgress,onQuality,maxWorkers=1,adaptive=new AdaptiveConcurrency()}=options;
 requireValue(budget&&qualities.length>0&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(!i||q>qualities[i-1])),'Shared budget and ordered qualities required.');
 requireValue(Number.isInteger(maxWorkers)&&maxWorkers>=1,'Positive worker capacity required.');
 requireValue(surface.descriptor.width<=65500&&surface.descriptor.height<=65500,'JPEG dimensions exceed native codec limits.');checkAbort(signal);
 // The legacy mem_dest path keeps the entire encoded JPEG and reallocates it.
 // Route potentially larger outputs through bounded external bytes from the
 // first useful quality, preserving global codec state and scalar cache keys.
 if(options.image&&Math.ceil(surface.descriptor.width/8)*8*Math.ceil(surface.descriptor.height/8)*8*6+8192>16*1024**2){
  const shape=grayPoolShape(options.image),maximum=typeof Worker==='undefined'?1:Math.min(qualities.length,maxWorkers),key='stored/'+shape.width+'/'+shape.height,plan=adaptive.select(key,maximum,budget,count=>count*shape.workerBytes+shape.windowAllowance),values=new Map(),started=performance.now();let metrics,retry=null,callbackError;
  const record=(q,v)=>{values.set(q,v);try{onQuality?.(q,v);}catch(e){callbackError=e;throw e;}};
  const progress=f=>{try{onProgress?.(f);}catch(e){callbackError=e;throw e;}};
  try{metrics=plan.ceiling>1?await parallelStoredGrayLosses(options.image,qualities,plan.count,{budget,maxWorkers:plan.ceiling,signal,onQuality:record,onProgress:progress}):await serialStoredGrayLosses(options.image,qualities,{budget,signal,onQuality:record,onProgress:progress});}
  catch(error){checkAbort(signal);if(callbackError||plan.ceiling===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,plan.count,{error});const remaining=qualities.filter(q=>!values.has(q)),completed=values.size;retry={code:error.code,failedWorkers:plan.count,remainingQualities:remaining.length};metrics=await serialStoredGrayLosses(options.image,remaining,{budget,signal,onQuality:record,onProgress:f=>progress((completed+f*remaining.length)/qualities.length)});}
  const elapsed=performance.now()-started;adaptive.observe(key,{count:metrics.workers,maximum,milliseconds:elapsed,units:shape.width*shape.height*qualities.length});return {raw:Float64Array.from(qualities,q=>values.get(q)),metrics:{...metrics,recompressions:qualities.length,kernelMs:elapsed,scheduling:{...plan,preflightExecutions:0,taskExecutions:retry?2:1,retry}}};
 }
 const shape=streamPoolShape(surface),maximum=typeof Worker==='undefined'||shape.width*shape.height<100000?1:Math.min(qualities.length,maxWorkers),key=shape.width+'/'+shape.height;
 const plan=adaptive.select(key,maximum,budget,count=>count>1?count*shape.workerBytes+shape.windowBytes:32*1024**2+shape.windowBytes),started=performance.now(),values=new Map();let result,retry=null,callbackError;
 const record=(q,value)=>{values.set(q,value);try{onQuality?.(q,value);}catch(error){callbackError=error;throw error;}};
 const progress=f=>{try{onProgress?.(f);}catch(error){callbackError=error;throw error;}};
 try{result=plan.ceiling>1?await parallelSegmentedLosses(surface,qualities,plan.count,{budget,maxWorkers:plan.ceiling,signal,onProgress:progress,onQuality:record}):await serialSegmentedLosses(surface,qualities,{budget,signal,onProgress:progress,onQuality:record});}
 catch(error){checkAbort(signal);if(callbackError||plan.ceiling===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,plan.count,{error});const remaining=qualities.filter(q=>!values.has(q)),completed=values.size;retry={code:error.code??'MEMORY_ALLOCATION',failedWorkers:plan.count,remainingQualities:remaining.length};result=await serialSegmentedLosses(surface,remaining,{budget,signal,onQuality:record,onProgress:f=>progress((completed+f*remaining.length)/qualities.length)});}
 const elapsed=performance.now()-started;adaptive.observe(key,{count:result.metrics.workers,maximum,milliseconds:elapsed,units:shape.width*shape.height*qualities.length});
 return {raw:Float64Array.from(qualities,q=>values.get(q)),metrics:{...result.metrics,recompressions:qualities.length,scheduling:{...plan,preflightExecutions:0,taskExecutions:retry?2:1,retry},kernelMs:elapsed}};
}
