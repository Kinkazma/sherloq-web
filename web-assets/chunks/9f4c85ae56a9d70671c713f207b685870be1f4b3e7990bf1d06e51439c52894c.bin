import "../../../../../runtime-context.js?v=0.31.0";
import {retireCompositeOwners} from './composite-owner-release.js';
import {recompressionParallelPlan} from './recompression-codec-client.js';
import {runRecompressionLanes} from './recompression-parallel.js';
import {getRecompressionGrayGpu} from './recompression-gray-gpu.js';
import {createSelectedRgbRecompression,resolveSelectedPlan,selectedPlanFromBase} from './recompression-probe.js';
import {gray} from './pixel-utils.js';
import {observeJpegGrayCpu} from './jpeg-gray-curve-gpu.js';
import {gpuJpegGrayLosses} from './jpeg-gray-curve-stage.js';
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


async function nativeSegmentedRecompressionLosses(surface,qualities,options={}){
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


// Preserve the historical integer gray conversion before and after the selected
// RGB codec. Each probe starts from the same gray Original, not the prior probe.
async function selectedSegmentedLosses(surface,qualities,options,plan){
 const {budget,signal,onProgress,onQuality,recompressionParams:params}=options,{width,height}=surface.descriptor;requireValue(budget&&qualities.length>0&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(!i||q>qualities[i-1])),'Shared budget and ordered probe qualities required.');
 const grayscale={descriptor:surface.descriptor,async readWindow(rect,hooks={}){const bytes=rect.width*rect.height*3,release=(hooks.reserve??(n=>budget.reserve(n)))(bytes);let part;try{const data=new Uint8Array(bytes);part=await surface.readWindow(rect,hooks);for(let i=0;i<bytes;i+=3){const v=gray(part.pixels.data[i],part.pixels.data[i+1],part.pixels.data[i+2]);data[i]=data[i+1]=data[i+2]=v;}return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release};}catch(error){release();throw error;}finally{await part?.release();}},async readWindowInto(rect,target,hooks={}){let part;try{if(surface.readWindowInto)await surface.readWindowInto(rect,target,hooks);else{part=await surface.readWindow(rect,hooks);target.set(part.pixels.data);}for(let i=0;i<rect.width*rect.height*3;i+=3){const v=gray(target[i],target[i+1],target[i+2]);target[i]=target[i+1]=target[i+2]=v;}return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:target.subarray(0,rect.width*rect.height*3)},release(){}};}finally{await part?.release();}}};
 const image={...options.image,surface:grayscale},raw=new Float64Array(qualities.length),levels=[],backend=options.backend??'auto',gpu=options.gpuAllowed!==false&&backend!=='cpu'?getRecompressionGrayGpu(budget):null,probes=[];let recompressions=0,setupMilliseconds=0,cold=false,gpuJobs=0,gpuMilliseconds=0,gpuReadbacks=0,gpuQueueFences=0,workers=1,primary;
 try{
  if(backend==='webgpu'&&options.gpuAllowed===false)throw new EngineError('GPU_UNAVAILABLE','The selected CPU reference kernel does not admit a GPU gray-loss stage.');
  const unique=new Map(),jobs=[];for(let index=0;index<qualities.length;index++){const selected=selectedPlanFromBase(params,plan,{quality:qualities[index],paletteAxis:'sweep',signal}),stage=selected.stage;levels.push({quality:qualities[index],codec:stage.codec,qualityKind:stage.qualityKind,codecQuality:stage.quality,paletteColors:stage.paletteColors??null});let job=unique.get(selected.identity);if(!job){job={quality:qualities[index],indices:[]};unique.set(selected.identity,job);jobs.push(job);}job.indices.push(index);}
  const parallel=recompressionParallelPlan({budget,width,height,stage:plan.stage,count:jobs.length,maxWorkers:options.maxWorkers??1,extraBytes:gpu?8*1024**2:0}),fractions=new Float64Array(jobs.length),progress=(index,f)=>{fractions[index]=Math.max(fractions[index],f);onProgress?.(fractions.reduce((a,b)=>a+b,0)/jobs.length);};
  const execution=await runRecompressionLanes(jobs,{budget,workers:parallel.workers,cpuPerWorker:parallel.cpuPerWorker,signal,run:async(job,lane,index,jobSignal)=>{
   const probe=probes[lane]??=createSelectedRgbRecompression(image,params,{budget,paletteAxis:'sweep',codecLane:lane,exactCapacity:parallel.workers>1,resolvedPlan:plan});let sum=0,metrics,prepared;
   const visit=onBand=>probe.visit(job.quality,{signal:jobSignal,onProgress:event=>progress(index,event.fraction??0),onBand});
   // Encode ahead of the serialized GPU reducer. Holding its queue while the
   // native encoder runs would serialize every supposedly parallel quality.
   if(gpu){if(parallel.workers>1)prepared=await probe.prepare(job.quality,{signal:jobSignal,onProgress:event=>progress(index,(event.fraction??0)*.8)});const result=await gpu.runQuality(visit,{signal:jobSignal,backend,maximumBandPixels:width*Math.min(32,height),recompressionWasCached:probe.hasEncoded(job.quality)});sum=result.sum;metrics=result.nativeMetrics;gpuJobs+=result.runtime.gpuJobs??0;gpuReadbacks+=result.runtime.gpuReadbacks??0;gpuQueueFences+=result.runtime.queueFences??0;gpuMilliseconds+=result.runtime.kernelMilliseconds??0;setupMilliseconds+=result.runtime.setupMilliseconds??0;cold||=result.runtime.cold===true;}
   else metrics=await visit((a,b)=>{for(let i=0;i<a.length;i+=3)sum+=Math.abs(a[i]-gray(b[i],b[i+1],b[i+2]));});
   const value=sum/(width*height);for(const qi of job.indices){raw[qi]=value;onQuality?.(qualities[qi],value);}recompressions+=(metrics.recompressions??0)+(prepared?.recompressions??0);setupMilliseconds+=(metrics.setupMilliseconds??0)+(prepared?.setupMilliseconds??0);cold||=metrics.cold===true||prepared?.cold===true;progress(index,1);
  }});workers=execution.workers;
  return{raw,metrics:{backend:gpuJobs?'webgpu':'cpu',codecBackend:'cpu',lossBackend:gpuJobs?'webgpu':'cpu',gpuJobs,gpuReadbacks,gpuQueueFences,gpuMilliseconds,...(gpu?.metrics()??{}),workers,kernel:gpuJobs?'selected-codec-native-gray-GPU-MAE':'selected-codec-gray-recompression',experimentalRecompression:true,recompressions,recompressionPlan:plan,probeAxis:'sweep',probeLevels:levels,grayConversion:'native-integer-gray-before-and-after-RGB-codec',setupMilliseconds,cold,scheduling:parallel}};
 }catch(error){primary=error;throw error;}finally{await retireCompositeOwners(probes.map(probe=>()=>probe?.dispose()),primary?{primary}:{});}
}

export async function segmentedRecompressionLosses(surface,qualities,options={}){
 if(options.recompressionParams?.recompression){const plan=await resolveSelectedPlan(options.recompressionParams,options.image??{surface},{paletteAxis:'sweep',signal:options.signal});if(plan)return selectedSegmentedLosses(surface,qualities,options,plan);}
 const {budget,backend='auto',profile,signal,onProgress,onQuality}=options;
 // Native libjpeg clamps Q0 to Q1. Reuse that same completed codec result;
 // the original/reference route still executes its independent101 qualities.
 if(options.gpuAllowed&&qualities[0]===0&&qualities[1]===1){const answer=await segmentedRecompressionLosses(surface,qualities.slice(1),{...options,onQuality:(q,value)=>{if(q===1)onQuality?.(0,value);onQuality?.(q,value);}});return{raw:Float64Array.from(qualities,(q,index)=>answer.raw[Math.max(0,index-1)]),metrics:{...answer.metrics,qualityZeroAlias:'native-Q0-clamps-to-Q1'}};}
 if(options.gpuAllowed&&backend!=='cpu'){const accelerated=await gpuJpegGrayLosses({surface},qualities,{budget,backend,profile,signal,onProgress,onQuality});if(accelerated)return accelerated;}
 const started=performance.now(),result=await nativeSegmentedRecompressionLosses(surface,qualities,options);
 if(options.gpuAllowed)observeJpegGrayCpu(budget,surface.descriptor.width*surface.descriptor.height,qualities.length,performance.now()-started,profile);
 return result;
}
