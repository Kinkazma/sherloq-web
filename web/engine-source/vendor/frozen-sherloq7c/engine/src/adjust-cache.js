import {checkAbort,controlCheckpoint,EngineError,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';
import {ADJUST_HEAP_BYTES,adjustOtsu} from './adjust-math.js';
export async function renderAdjustCache(image,p,cached,{budget,signal,onProgress,ioBytes}={}){
 const {width,height}=image.surface.descriptor,n=width*height,base=cached.value,at=performance.now(),overhead=ADJUST_HEAP_BYTES+ioBytes+16384;let output,planning,staging;
 try{
  planning=budget.reserve(overhead+3);output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  const blockBytes=Math.min(4*1024**2,n*3,Math.floor((budget.limit-budget.retained-budget.active-overhead)/3)*3);if(blockBytes<3)throw new EngineError('MEMORY_LIMIT','Cached adjustment display does not fit the shared budget.');
  staging=budget.reserve(overhead+blockBytes);const threshold=p.threshold===0?await adjustOtsu(base.histogram,n,{signal}):p.threshold,bytes=new Uint8Array(blockBytes);let readMs=0,writeMs=0,finishMs=0,blocks=0;
  for(let offset=0;offset<n*3;offset+=blockBytes){
   await controlCheckpoint(signal);const part=bytes.subarray(0,Math.min(blockBytes,n*3-offset));let began=performance.now();await base.read(part,offset);readMs+=performance.now()-began;
   began=performance.now();if(p.threshold<255||p.invert)for(let i=0;i<part.length;i++){const v=p.threshold<255?(part[i]>threshold?255:0):part[i];part[i]=p.invert?255-v:v;}finishMs+=performance.now()-began;
   began=performance.now();await output.write(part,offset);writeMs+=performance.now()-began;blocks++;onProgress?.((offset+part.length)/(n*3));
  }
  await output.flush();checkAbort(signal);
  return{surface:createRgbSurface(output,{width,height,budget}),metrics:{totalMs:performance.now()-at,readMs,localMs:0,histogramMs:0,equalizeMs:0,writeMs,finishMs,blocks,sourceReads:0,workers:0,storage:output.storage,arithmeticHeapCapacityBytes:ADJUST_HEAP_BYTES,retainedResultBytes:n*3,analysisCacheHit:true,prefixCacheBytes:cached.byteLength,otsuThreshold:p.threshold===0?threshold:null}};
 }catch(error){await output?.dispose();throw normalizeResourceError(error);}finally{planning?.();staging?.();}
}
