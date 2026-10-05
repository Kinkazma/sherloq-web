import {createPixelStoreCache} from './pixel-store-cache.js';
import {adjustStage} from './adjust-stage.js';
import {AdjustWorkers} from './adjust-workers.js';
import {AdaptiveConcurrency,isWorkerResourceFailure} from './adaptive-concurrency.js';
import {createRamByteCache,ramByteCacheBytes} from './ram-byte-cache.js';
import {renderAdjustCache} from './adjust-cache.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {ADJUST_HEAP_BYTES,adjustWorkspace,adjustHeapBytes,adjustTileHistogram,adjustClaheTables,adjustMapRows,adjustOtsu} from './adjust-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {equalizeHistogramLut,gray} from './pixel-utils.js';
const reflected=(i,n)=>{if(n===1)return 0;const x=i%(2*(n-1));return Math.min(x,2*(n-1)-x);};
const semantics='Native adjustment order: sharpen, HSV controls, LUT, global value equalization/8x8 CLAHE, global Otsu or fixed RGB threshold, inversion. Full-resolution display transform, not an authenticity decision.';
export async function segmentedAdjust(image,p,{budget,signal,onProgress,rowsPerBlock,cacheKey,maxWorkers=1,adaptive=new AdaptiveConcurrency()}={}){
 const {width:w,height:h}=image.surface.descriptor,n=w*h,halo=Math.floor(p.sharpen/4),padding=w%8!==0||h%8!==0,pw=padding?w+8-w%8:w,ph=padding?h+8-h%8:h,otsu=p.threshold===0;
 requireValue(Number.isSafeInteger(n*3)&&n<=2147483647,'Adjustment exceeds the qualified native integer histogram domain.');requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid adjustment row group.');requireValue(Number.isSafeInteger(maxWorkers)&&maxWorkers>=1,'Invalid adjustment worker limit.');checkAbort(signal);
 if(adjustWorkspace(w,Math.min(h,1+2*halo))>ADJUST_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','One adjustment row and its halo exceed the fixed64MiB heap.');
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0,metadataBytes=ioBytes+256*1024+Math.max(w,h)*3,heapRows=Math.floor((ADJUST_HEAP_BYTES-4*1024**2-256*1024)/(w*48)),maxRows=heapRows>=h?h:heapRows-2*halo;
 const prefixKey=cacheKey&&cacheKey+[w,h,halo,p.brightness,p.saturation,p.hue,p.gamma,p.shadows,p.highlights,p.width===255?0:p.sweep,p.width,p.equalize].join('/');const external=prefixKey&&image.pixelStoreCaches?.get('adjust');let cached=external?.key===prefixKey?external:prefixKey&&budget.get(prefixKey);
 if(cached&&!image.session&&!image.ensureTemporarySession&&cached.byteLength+ADJUST_HEAP_BYTES+ioBytes+16384+3+n*3+Math.min(4*1024**2,n*3)>budget.limit-budget.retained-budget.active){budget.remove(prefixKey);cached=null;}
 if(cached){let borrowed;budget.remove(prefixKey);try{borrowed=budget.reserve(cached.byteLength);const result=await renderAdjustCache(image,p,cached,{budget,signal,onProgress,ioBytes});result.semantics=semantics;result.metrics.haloRows=halo;result.metrics.clahePaddedSize=p.equalize>=2?[pw,ph]:null;return result;}finally{borrowed?.();if(!cached.value.store)budget.put(prefixKey,cached);}}
 const targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w)),maxRows),minimumRows=Math.min(targetRows,Math.max(1,2*halo)),maximum=typeof Worker==='undefined'?1:Math.min(32,maxWorkers,Math.ceil(h/targetRows));
 const heapBytes=c=>c===1?ADJUST_HEAP_BYTES:adjustHeapBytes()+c*ADJUST_HEAP_BYTES,overhead=c=>heapBytes(c)+metadataBytes+c*65536,batchBytes=(c,rows)=>overhead(c)+c*w*(rows*2+Math.min(h,rows+2*halo))*3;
 const key=JSON.stringify([w,h,p]),plan=adaptive.select(key,maximum,budget,c=>batchBytes(c,minimumRows)),started=performance.now();let count=plan.count,retry=null,executions=0;
 async function attempt(){
 let pendingCache,output,planning,staging,cacheLease,base,workers,workerJobs=0,cacheWriteMs=0,reads=0,blocks=0,readMs=0,localMs=0,histogramMs=0,equalizeMs=0,finishMs=0,writeMs=0;let hist,grayHist;const abort=()=>workers?.clear();signal?.addEventListener('abort',abort,{once:true});
 function addGray(bytes){for(let i=0;i<bytes.length;i+=3)grayHist[gray(bytes[i],bytes[i+1],bytes[i+2])]++;}
 async function histogram(bytes,rows,y,prepared){const at=performance.now();if(p.equalize===1){for(let i=2;i<bytes.length;i+=3)hist[bytes[i]]++;}else if(p.equalize>=2){const part=prepared??await adjustTileHistogram(bytes,w,rows,y,pw,ph,{signal});for(let i=0;i<16384;i++)hist[i]+=part[i];}else if(grayHist)addGray(bytes);histogramMs+=performance.now()-at;}
 async function cacheBytes(bytes,offset){if(!base)return;const at=performance.now();try{await base.write(bytes,offset);}catch(error){if(!(error instanceof RangeError))throw error;base=null;cacheLease?.();cacheLease=null;}cacheWriteMs+=performance.now()-at;}
 try{
  planning=budget.reserve(batchBytes(count,minimumRows));
  const prefixBytes=ramByteCacheBytes(n*3,1024),eligible=halo||p.brightness||p.saturation||p.hue||p.gamma!==10||p.shadows||p.highlights||p.width<255||p.equalize,minimumOutput=!image.session&&!image.ensureTemporarySession?n*3+Math.min(4*1024**2,n*3):0;
  // Cache only an actual transformed prefix, after admitting one useful row.
  // This private copy can change new-result storage, never a live result.
  if(prefixKey&&eligible&&prefixBytes+minimumOutput+batchBytes(count,targetRows)-batchBytes(count,minimumRows)<=budget.limit-budget.retained-budget.active){cacheLease=budget.reserve(prefixBytes);base=createRamByteCache(n*3);}
  if(!base&&prefixKey&&eligible&&(image.session||image.ensureTemporarySession)){pendingCache=await createPixelStoreCache(image,'adjust',prefixKey,n*3,{}, {budget,signal});base=pendingCache.record.value;}
  hist=p.equalize===1?new Float64Array(256):p.equalize>=2?new Int32Array(16384):null;grayHist=otsu||base?new Int32Array(256):null;if(base)base.histogram=grayHist;output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  const available=budget.limit-budget.retained-budget.active-overhead(count),rows=Math.min(targetRows,Math.floor((available-count*w*Math.min(h-1,2*halo)*3)/(count*w*9)));
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Adjustment row staging does not fit.');staging=budget.reserve(overhead(count)+count*w*rows*6);if(count>1)workers=new AdjustWorkers(count);checkAbort(signal);const dispatchAccountedBytes=budget.total(),admittedArithmeticHeapBytes=heapBytes(count),filterStarted=performance.now();
  async function batch(y){const jobs=[],leases=[];try{
   for(let i=0;i<count&&y+i*rows<h;i++){
    await controlCheckpoint(signal);const coreY=y+i*rows,coreRows=Math.min(rows,h-coreY),top=Math.max(0,coreY-halo),bottom=Math.min(h,coreY+coreRows+halo),at=performance.now(),window=await image.surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});leases.push(window.release);readMs+=performance.now()-at;reads++;
    const input={image:window.pixels,params:p,start:coreY-top,rows:coreRows,y:coreY,pw,ph},promise=workers?workers.call(i,input):adjustStage(input,{signal});if(workers)workerJobs++;jobs.push(promise.then(value=>({value,y:coreY,rows:coreRows}),error=>({error})));
   }
   const results=await Promise.all(jobs);checkAbort(signal);
   for(const r of results){if(r.error)throw r.error;checkAbort(signal);const {value,y:coreY,rows:coreRows}=r,bytes=value.bytes;localMs+=value.localMs;histogramMs+=value.histogramMs;await histogram(bytes,coreRows,coreY,value.histogram);if(!p.equalize)await cacheBytes(bytes,coreY*w*3);const at=performance.now();await output.write(bytes,coreY*w*3);writeMs+=performance.now()-at;blocks++;onProgress?.(.5*(coreY+coreRows)/h);}
  }catch(error){workers?.clear();await Promise.all(jobs);throw error;}finally{for(const release of leases)release();}}
  for(let y=0;y<h;y+=rows*count)await batch(y);checkAbort(signal);const filterWallMs=performance.now()-filterStarted;
  workers?.clear();workers=null;staging();staging=budget.reserve(overhead(1)+w*rows*6);
  await output.flush();checkAbort(signal);
  if(p.equalize){
   // OpenCV pads both dimensions if either needs padding, including a full
   // extra tile step on a dimension already divisible by8. At most8 rows repeat.
   if(p.equalize>=2&&ph>h){const bytes=new Uint8Array(w*3);for(let y=h;y<ph;y++){await controlCheckpoint(signal);await output.readInto(bytes,reflected(y,h)*w*3);await histogram(bytes,1,y);}}
   const tables=p.equalize===1?equalizeHistogramLut(hist,n):await adjustClaheTables(hist,(pw/8)*(ph/8),p.equalize,{signal}),at=performance.now();
   await output.visit(async(bytes,offset)=>{const mapped=await adjustMapRows(bytes,w,bytes.length/(w*3),offset/(w*3),pw,ph,p.equalize,tables,{signal});if(grayHist)addGray(mapped);await cacheBytes(mapped,offset);await output.write(mapped,offset);onProgress?.(.5+.3*(offset+bytes.length)/(n*3));},{signal,blockBytes:w*rows*3});equalizeMs=performance.now()-at;
  }
  const threshold=otsu?await adjustOtsu(grayHist,n,{signal}):p.threshold;
  if(p.threshold<255||p.invert){const at=performance.now();await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i++){let v=p.threshold<255?(bytes[i]>threshold?255:0):bytes[i];bytes[i]=p.invert?255-v:v;}await output.write(bytes,offset);onProgress?.(.8+.2*(offset+bytes.length)/(n*3));},{signal,blockBytes:w*rows*3});finishMs=performance.now()-at;}
  await output.flush();onProgress?.(1);checkAbort(signal);
  if(base){cacheLease?.();cacheLease=null;if(base.store)await pendingCache.publish();else budget.put(prefixKey,{value:base,byteLength:prefixBytes});}
  return{surface:createRgbSurface(output,{width:w,height:h,budget}),semantics,metrics:{analysisCacheHit:false,prefixCacheStorage:base?.store?'temporary':base?'memory':null,prefixCacheStored:!!base&&(!!base.store||budget.get(prefixKey)?.value===base),prefixCacheBytes:base?prefixBytes:0,cacheWriteMs,totalMs:performance.now()-started,readMs,localMs,histogramMs,equalizeMs,finishMs,writeMs,filterWallMs,workers:count,workerJobs,dispatchAccountedBytes,sourceReads:reads,blocks,rowsPerBlock:rows,haloRows:halo,clahePaddedSize:p.equalize>=2?[pw,ph]:null,otsuThreshold:otsu?threshold:null,storage:output.storage,arithmeticHeapCapacityBytes:admittedArithmeticHeapBytes,retainedResultBytes:n*3}};
 }catch(error){workers?.clear();await output?.dispose();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Adjustment allocation failed after admission.');throw error;}finally{signal?.removeEventListener('abort',abort);workers?.clear();planning?.();staging?.();cacheLease?.();await pendingCache?.cleanup();}
 }
 let result;try{executions++;result=await attempt();}catch(error){checkAbort(signal);if(count===1||!isWorkerResourceFailure(error))throw error;adaptive.reduce(key,count);retry={failedWorkers:count,code:error.code??'MEMORY_ALLOCATION'};count=1;executions++;result=await attempt();}
 adaptive.observe(key,{count,maximum,milliseconds:performance.now()-started,units:n});result.metrics.scheduling={...plan,preflightExecutions:0,taskExecutions:executions,retry};return result;
}
