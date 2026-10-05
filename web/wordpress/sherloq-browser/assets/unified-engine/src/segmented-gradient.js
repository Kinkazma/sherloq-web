import {createPixelStoreCache} from './pixel-store-cache.js';import {pixelStripPool} from './pixel-strip-pool.js';import {pixelStripStage} from './pixel-strip-stage.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {equalizeHistogramLut} from './pixel-utils.js';
import {GRADIENT_HEAP_BYTES,releaseGradientWasm,gradientDerivatives,gradientLengths,gradientRender,gradientLut} from './gradient-math.js';
import {createRamByteCache,ramByteCacheBytes} from './ram-byte-cache.js';import {gradientCacheStore} from './gradient-cache.js';

export function gradientToneLut(histogram,n,p){
 const lut=new Uint8Array(768),intensity=Math.trunc(p.intensity/100*127);
 for(let c=0;c<3;c++){
  if(p.equalize){lut.set(equalizeHistogramLut(histogram.subarray(c*256,(c+1)*256),n),c*256);
  }else for(let i=0;i<256;i++)lut[c*256+i]=Math.trunc(Math.max(0,Math.min(255,(i*-255+intensity*255)/(2*intensity-255))));
 }return lut;
}

// Derivatives are stored before global maxima, lengths or histograms are used.
export async function segmentedGradient(image,p,{budget,signal,onProgress,rowsPerBlock,cacheKey,maxWorkers=1}={}){
 const d=image.surface.descriptor,w=d.width,h=d.height,n=w*h;
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid gradient row group.');
 if(p.equalize&&n>2147483647)throw new EngineError('NUMERIC_RANGE','Native int32 equalization counts require at most 2147483647 pixels.');checkAbort(signal);
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0,overhead=GRADIENT_HEAP_BYTES+ioBytes+w*24+Math.max(w,h)*3+16384;
 const heapRows=Math.floor((GRADIENT_HEAP_BYTES-2*1024**2-w*8)/(w*8));
 if(heapRows<1)throw new EngineError('MEMORY_LIMIT','One gradient row exceeds the fixed arithmetic heap.');
 const targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w)),heapRows),key=cacheKey&&cacheKey+w+'/'+h,cacheBytes=ramByteCacheBytes(n*4,48),minimumOutput=!image.session&&!image.ensureTemporarySession?n*3+Math.min(4*1024**2,n*3):0;
 const external=key&&image.pixelStoreCaches?.get('gradient');let cached=external?.key===key?external:key&&budget.get(key);
 if(cached&&cached.byteLength+minimumOutput+overhead+w*16>budget.limit-budget.retained-budget.active){budget.remove(key);cached=null;}
 const pool=pixelStripPool(image,budget,{maxWorkers,pixelBytes:24});let pendingCache,slopes,output,planning,staging,cacheLease,base=cached?.value,cacheReady=!!cached;const stats=new Float64Array(base?.stats??[0,0,Infinity,0,Infinity,0]),histogram=new Float64Array(768),timings={derivativesMs:0,lengthsMs:0,renderMs:0,toneMs:0};let blocks=0;const started=performance.now();
 function releaseCache(){cacheLease?.();cacheLease=null;if(base&&cacheReady&&!base.store)budget.put(key,{value:base,byteLength:cacheBytes});}
 try{
  if(cached){budget.remove(key);cacheLease=budget.reserve(cached.byteLength);}
  planning=budget.reserve(overhead+w*16);
  const storage={budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal};
  if(!base&&key&&cacheBytes+minimumOutput+w*(targetRows-1)*16<=budget.limit-budget.retained-budget.active){cacheLease=budget.reserve(cacheBytes);base=createRamByteCache(n*4);}
  if(!base&&key&&(image.session||image.ensureTemporarySession)){pendingCache=await createPixelStoreCache(image,'gradient',key,n*4,{},storage);base=pendingCache.record.value;}
  slopes=base?.store??(base?gradientCacheStore(base,budget):await createSegmentedBytes(n*4,storage));output=await createSegmentedBytes(n*3,storage);planning();planning=null;
  const rows=Math.min(targetRows,Math.floor((budget.limit-budget.retained-budget.active-overhead)/(w*16)));
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Gradient staging does not fit the shared budget.');
  staging=budget.reserve(overhead+w*rows*12);
  let at=performance.now();
  if(!cached){let releasedOwner=false;if(globalThis.Worker&&maxWorkers>1){releaseGradientWasm();staging();staging=budget.reserve(overhead-GRADIENT_HEAP_BYTES+w*rows*12);releasedOwner=true;}let completed=0;await pool.run({count:Math.ceil(h/rows),pixels:w*(rows+2),key:'gradient/derivatives/'+w+'/'+rows,signal,prepareBytes:w*(rows+3)*3,
   prepare:async i=>{const y=i*rows,count=Math.min(rows,h-y),top=Math.max(0,y-1),bottom=Math.min(h,y+count+1),window=await image.surface.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});try{return {op:'gradient-derivatives',rgb:window.pixels.data,width:w,height:bottom-top,start:y-top,rows:count};}finally{window.release();}},local:async j=>{const r=releasedOwner?budget.reserve(GRADIENT_HEAP_BYTES):null;try{return await pixelStripStage(j);}finally{r?.();}},
   consume:async(part,i)=>{stats[0]=Math.max(stats[0],part.stats[0]);stats[1]=Math.max(stats[1],part.stats[1]);stats[2]=Math.min(stats[2],part.stats[2]);stats[3]=Math.max(stats[3],part.stats[3]);await slopes.write(part.bytes,i*rows*w*4);blocks++;completed+=Math.min(rows,h-i*rows);onProgress?.(.35*completed/h);}
  });if(releasedOwner){staging();staging=budget.reserve(overhead+w*rows*12);}}
  await slopes.flush();checkAbort(signal);if(!cached){timings.derivativesMs=performance.now()-at;if(base)base.stats=stats.slice();}else onProgress?.(.35);
  if(p.mode===3){at=performance.now();await slopes.visit(async(bytes,offset)=>{const limits=await gradientLengths(bytes,stats,p.invert,{signal});stats[4]=Math.min(stats[4],limits[0]);stats[5]=Math.max(stats[5],limits[1]);onProgress?.(.35+.15*(offset+bytes.length)/(n*4));},{signal,blockBytes:w*rows*4});timings.lengthsMs=performance.now()-at;}
  at=performance.now();await slopes.visit(async(bytes,offset)=>{const part=await gradientRender(bytes,stats,p,n,{signal});for(let i=0;i<768;i++)histogram[i]+=part.histogram[i];await output.write(part.bytes,offset/4*3);onProgress?.(.5+.3*(offset+bytes.length)/(n*4));},{signal,blockBytes:w*rows*4});await output.flush();timings.renderMs=performance.now()-at;
  if(p.equalize||Math.trunc(p.intensity/100*127)>0){at=performance.now();const lut=gradientToneLut(histogram,n,p);await output.visit(async(bytes,offset)=>{await output.write(await gradientLut(bytes,lut,{signal}),offset);onProgress?.(.8+.2*(offset+bytes.length)/(n*3));},{signal,blockBytes:w*rows*3});await output.flush();timings.toneMs=performance.now()-at;}
  onProgress?.(1);checkAbort(signal);if(!base?.store)await slopes.dispose();slopes=null;await pendingCache?.publish();cacheReady=true;staging();staging=null;releaseCache();
  return{surface:createRgbSurface(output,{width:w,height:h,budget}),semantics:'Native luminance-gradient display with source-wide derivative maxima, blue-channel normalization and channel equalization. Exact full-resolution oriented pixels; neutral zero derivative=127.',metrics:{...pool.metrics(),totalMs:performance.now()-started,...timings,blocks,sourceReads:blocks,analysisCacheHit:!!cached,derivativeCacheStored:!!base&&(!!base.store||budget.get(key)?.value===base),derivativeCacheBytes:base?cacheBytes:0,derivativeCacheStorage:base?.store?'temporary':base?'memory':null,rowsPerBlock:rows,storage:output.storage,retainedResultBytes:n*3,arithmeticHeapCapacityBytes:Math.max(1,pool.peak)*GRADIENT_HEAP_BYTES}};
 }catch(error){await Promise.allSettled([!base?.store?slopes?.dispose():undefined,output?.dispose()]);throw normalizeResourceError(error);}finally{pool.clear();planning?.();staging?.();releaseCache();await pendingCache?.cleanup();}
}
