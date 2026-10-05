import "../../runtime-context.js?v=0.14.5";
import {createPixelStoreCache} from './pixel-store-cache.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {separationHalo,separationWorkspace,separationHeapBytes,SEPARATION_HEAP_BYTES} from './separation-math.js';
import {createSeparationCache,separationCacheBytes,renderSeparationCache} from './separation-cache.js';
import {separationStage} from './separation-stage.js';import {SeparationWorkers} from './separation-workers.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {equalizeHistogramLut} from './pixel-utils.js';import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';
export function separationEqualizeLuts(histograms,count){return Array.from({length:3},(_,c)=>equalizeHistogramLut(histograms.subarray(c*256,(c+1)*256),count));}

const semantics='Original Median/Gaussian/Box/Bilateral/NLM filtering with full-resolution neighborhoods. Denoised output or absolute residual; equalization is global per channel. NLM radius controls strength, not its fixed7x7 template/21x21 search.';
export async function segmentedSeparation(image,p,{budget,signal,onProgress,rowsPerBlock,maxWorkers=1,adaptive=new AdaptiveConcurrency(),cacheKey}={}){
 const {width:w,height:h}=image.surface.descriptor,n=w*h,halo=separationHalo(p),equalize=!p.denoised&&p.levels===0;
 requireValue(Number.isSafeInteger(n*3)&&n<=2147483647,'Separation exceeds the qualified native integer histogram domain.');requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid separation row group.');requireValue(Number.isSafeInteger(maxWorkers)&&maxWorkers>=1,'Invalid separation worker limit.');checkAbort(signal);
 const minimumWindow=Math.min(h,1+2*halo);if(separationWorkspace(w,minimumWindow,p)>SEPARATION_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','A separation row and its real halo exceed the fixed64MiB heap.');
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0,lineBytes=Math.max(w,h)*3;
 const filterKey=cacheKey&&cacheKey+[w,h,p.mode,p.radius,p.mode===3?p.sigma:0,Number(p.grayscale),Number(p.denoised)].join('/');const external=filterKey&&image.pixelStoreCaches?.get('separation');let cached=external?.key===filterKey?external:filterKey&&budget.get(filterKey);
 if(cached&&!image.session&&!image.ensureTemporarySession&&cached.byteLength+separationHeapBytes()+ioBytes+16384+3+n*3+Math.min(4*1024**2,n*3)>budget.limit-budget.retained-budget.active){budget.remove(filterKey);cached=null;}
 if(cached){
  let borrowed;budget.remove(filterKey);
  try{borrowed=budget.reserve(cached.byteLength);const result=await renderSeparationCache(image,p,cached,{budget,signal,onProgress,ioBytes});result.semantics=semantics;result.metrics.haloRows=halo;return result;}
  finally{borrowed?.();if(!cached.value.store)budget.put(filterKey,cached);}
 }
 const targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w))),maxWindowRows=Math.floor((SEPARATION_HEAP_BYTES-4*1024**2-(p.mode===4?w*21*21*4:0))/(w*32)),heapRows=maxWindowRows>=h?h:maxWindowRows-2*halo;
 const minimumRows=Math.min(targetRows,heapRows,Math.max(1,2*halo)),maximum=typeof Worker==='undefined'?1:Math.min(32,maxWorkers,Math.ceil(h/targetRows));
 const heapBytes=count=>count===1?SEPARATION_HEAP_BYTES:separationHeapBytes()+count*SEPARATION_HEAP_BYTES;
 const overhead=count=>heapBytes(count)+ioBytes+16384+count*6144;
 const batchBytes=(count,rows)=>overhead(count)+lineBytes+count*w*(rows+Math.min(h,rows+2*halo))*3;
 const key=[w,h,p.mode,p.radius,p.mode===3?p.sigma:0,Number(p.grayscale),Number(p.denoised),Number(equalize)].join('/'),plan=adaptive.select(key,maximum,budget,c=>batchBytes(c,minimumRows)),started=performance.now();let count=plan.count,retry=null,executions=0;
 async function attempt(){
  let pendingCache,planning,staging,output,workers,cacheLease,base,blocks=0,workerJobs=0,sourceReads=0,readMs=0,kernelMs=0,writeMs=0,postprocessMs=0,cacheWriteMs=0;
  const abort=()=>workers?.clear();signal?.addEventListener('abort',abort,{once:true});
  try{
   checkAbort(signal);planning=budget.reserve(batchBytes(count,minimumRows));
   const cacheBytes=separationCacheBytes(n,p.denoised),extraRows=batchBytes(count,Math.min(targetRows,heapRows))-batchBytes(count,minimumRows);
   // Useful worker admission has priority. Optional cache may affect where the
   // new output lives, but never reduces workers or evicts an owned result.
   if(filterKey&&cacheBytes+extraRows+(!image.session&&!image.ensureTemporarySession?n*3+Math.min(4*1024**2,n*3):0)<=budget.limit-budget.retained-budget.active){cacheLease=budget.reserve(cacheBytes);base=createSeparationCache(n*3,p.denoised?null:new Float64Array(768));}
   if(!base&&filterKey&&(image.session||image.ensureTemporarySession)){pendingCache=await createPixelStoreCache(image,'separation',filterKey,n*3,{histograms:p.denoised?null:new Float64Array(768)},{budget,signal});base=pendingCache.record.value;}
   output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
   const available=budget.limit-budget.retained-budget.active-overhead(count)-lineBytes,rows=Math.min(targetRows,heapRows,Math.floor((available-count*w*Math.min(h-1,2*halo)*3)/(count*w*6)));
   if(rows<1)throw new EngineError('MEMORY_LIMIT','Separation row staging does not fit the shared budget.');
   staging=budget.reserve(overhead(count)+count*w*rows*3);if(count>1)workers=new SeparationWorkers(count);checkAbort(signal);
   const dispatchAccountedBytes=budget.total(),histograms=base?.histograms??(equalize?new Float64Array(768):null),filterStarted=performance.now(),rawResidual=!!base&&!p.denoised;
   async function batch(y){
    const jobs=[],leases=[];
    try{
     // Storage reads and writes are ordered, because distinct ranges can share
     // an IndexedDB page. Only independent arithmetic jobs overlap.
     for(let i=0;i<count&&y+i*rows<h;i++){
      await controlCheckpoint(signal);const coreY=y+i*rows,coreRows=Math.min(rows,h-coreY),top=Math.max(0,coreY-halo),bottom=Math.min(h,coreY+coreRows+halo),at=performance.now();
      const window=await image.surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});leases.push(window.release);readMs+=performance.now()-at;sourceReads++;
      const input={image:window.pixels,start:coreY-top,rows:coreRows,params:rawResidual?{...p,levels:0}:p},promise=workers?workers.call(i,input):separationStage(input.image,input.params,input.start,coreRows,{signal});if(workers)workerJobs++;
      jobs.push(promise.then(value=>({value,y:coreY,rows:coreRows}),error=>({error})));
     }
     const results=await Promise.all(jobs);checkAbort(signal);
     for(const r of results){
      if(r.error)throw r.error;checkAbort(signal);const {value,y:coreY,rows:coreRows}=r;kernelMs+=value.kernelMs;postprocessMs+=value.postprocessMs;
      if(histograms)for(let i=0;i<768;i++)histograms[i]+=value.histograms[i];
      if(base){
       const at=performance.now();try{await base.write(value.bytes,coreY*w*3);}catch(error){if(!(error instanceof RangeError))throw error;base=null;cacheLease?.();cacheLease=null;}cacheWriteMs+=performance.now()-at;
       // Worker output was raw when this batch started; render independently
       // even if optional cache allocation just failed.
      }
      if(value.histograms&&!equalize&&!p.denoised){const at=performance.now();for(let i=0;i<value.bytes.length;i++)value.bytes[i]=Math.min(255,Math.trunc(255*value.bytes[i]/p.levels));postprocessMs+=performance.now()-at;}
      const at=performance.now();await output.write(value.bytes,coreY*w*3);writeMs+=performance.now()-at;blocks++;onProgress?.((equalize?.8:1)*(coreY+coreRows)/h);
     }
    }catch(error){workers?.clear();await Promise.all(jobs);throw error;}finally{for(const release of leases)release();}
   }
   for(let y=0;y<h;y+=rows*count)await batch(y);checkAbort(signal);const filterWallMs=performance.now()-filterStarted;
   workers?.clear();workers=null;staging();staging=budget.reserve(separationHeapBytes()+ioBytes+16384);
   if(equalize){
    const tables=separationEqualizeLuts(histograms,n),available=budget.limit-budget.retained-budget.active,blockBytes=Math.min(4*1024**2,Math.floor(available/3)*3);if(blockBytes<3)throw new EngineError('MEMORY_LIMIT','Global residual equalization staging does not fit.');
    const at=performance.now();await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i++)bytes[i]=tables[(offset+i)%3][bytes[i]];await output.write(bytes,offset);onProgress?.(.8+.2*(offset+bytes.length)/(n*3));},{signal,blockBytes});postprocessMs+=performance.now()-at;
   }
   await output.flush();checkAbort(signal);const surface=createRgbSurface(output,{width:w,height:h,budget});
   if(base){cacheLease?.();cacheLease=null;if(base.store)await pendingCache.publish();else budget.put(filterKey,{value:base,byteLength:cacheBytes});}
   return{surface,semantics,metrics:{analysisCacheHit:false,filterCacheStorage:base?.store?'temporary':base?'memory':null,filterCacheStored:!!base&&(!!base.store||budget.get(filterKey)?.value===base),filterCacheBytes:base?cacheBytes:0,totalMs:performance.now()-started,readMs,kernelMs,writeMs,postprocessMs,cacheWriteMs,filterWallMs,blocks,sourceReads,rowsPerBlock:rows,haloRows:halo,workers:count,workerJobs,dispatchAccountedBytes,storage:output.storage,arithmeticHeapCapacityBytes:heapBytes(count),retainedResultBytes:n*3}};
  }catch(error){workers?.clear();await output?.dispose();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Separation allocation failed after admission.');throw error;}finally{signal?.removeEventListener('abort',abort);workers?.clear();planning?.();staging?.();cacheLease?.();await pendingCache?.cleanup();}
 }
 let result;
 try{executions++;result=await attempt();}
 catch(error){checkAbort(signal);if(count===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,count);retry={failedWorkers:count,code:error.code??'MEMORY_ALLOCATION'};count=1;executions++;result=await attempt();}
 adaptive.observe(key,{count,maximum,milliseconds:performance.now()-started,units:n});result.metrics.scheduling={...plan,preflightExecutions:0,taskExecutions:executions,retry};return result;
}
