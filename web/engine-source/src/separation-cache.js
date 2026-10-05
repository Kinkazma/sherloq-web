import {checkAbort,controlCheckpoint,EngineError,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';
import {separationHeapBytes} from './separation-math.js';import {equalizeHistogramLut} from './pixel-utils.js';
const CHUNK=4*1024**2;
import {createRamByteCache,ramByteCacheBytes} from './ram-byte-cache.js';
export const createSeparationCache=(byteLength,histograms)=>createRamByteCache(byteLength,{histograms});
export const separationCacheBytes=(n,denoised)=>ramByteCacheBytes(n*3,denoised?0:6144);
export async function renderSeparationCache(image,p,cached,{budget,signal,onProgress,ioBytes}={}){
 const {width,height}=image.surface.descriptor,n=width*height,base=cached.value,at=performance.now(),overhead=separationHeapBytes()+ioBytes+16384;let output,planning,staging;
 try{
  planning=budget.reserve(overhead+3);output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  const blockBytes=Math.min(CHUNK-CHUNK%3,n*3,Math.floor((budget.limit-budget.retained-budget.active-overhead)/3)*3);if(blockBytes<3)throw new EngineError('MEMORY_LIMIT','Cached separation display does not fit the shared budget.');
  staging=budget.reserve(overhead+blockBytes);const bytes=new Uint8Array(blockBytes),tables=p.denoised?null:p.levels===0?Array.from({length:3},(_,c)=>equalizeHistogramLut(base.histograms.subarray(c*256,(c+1)*256),n)):[Uint8Array.from({length:256},(_,i)=>Math.min(255,Math.trunc(255*i/p.levels)))];let readMs=0,writeMs=0,postprocessMs=0,blocks=0;
  for(let offset=0;offset<n*3;offset+=blockBytes){
   await controlCheckpoint(signal);const part=bytes.subarray(0,Math.min(blockBytes,n*3-offset));let began=performance.now();await base.read(part,offset);readMs+=performance.now()-began;
   began=performance.now();if(tables)for(let i=0;i<part.length;i++)part[i]=tables.length===1?tables[0][part[i]]:tables[(offset+i)%3][part[i]];postprocessMs+=performance.now()-began;
   began=performance.now();await output.write(part,offset);writeMs+=performance.now()-began;blocks++;onProgress?.((offset+part.length)/(n*3));
  }
  await output.flush();checkAbort(signal);
  return{surface:createRgbSurface(output,{width,height,budget}),metrics:{totalMs:performance.now()-at,readMs,kernelMs:0,writeMs,postprocessMs,filterWallMs:0,blocks,sourceReads:0,workers:0,workerJobs:0,storage:output.storage,arithmeticHeapCapacityBytes:separationHeapBytes(),retainedResultBytes:n*3,analysisCacheHit:true,filterCacheBytes:cached.byteLength,scheduling:{policy:'cached-useful-work',preflightExecutions:0,taskExecutions:1,retry:null}}};
 }catch(error){await output?.dispose();throw normalizeResourceError(error);}finally{planning?.();staging?.();}
}
