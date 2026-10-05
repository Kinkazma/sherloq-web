import "../../runtime-context.js?v=0.14.5";
import {disposePixelStoreCaches} from './pixel-store-cache.js';
import {decodePagedJpegRows} from './jpeg-dct-paged.js';
import {prepareOrientedSourceCache} from './oriented-source-cache.js';
import {inspectPngSource} from './png-header-source.js';
import {decodeTiffBlocks,tiffStreamPlan} from './tiff-stream.js';
import {decodePngRows,pngStreamPlan} from './png-stream.js';
import {EngineError,checkAbort} from './errors.js';
import {createBlobSource} from './blob-source.js';import {createTemporarySession} from './temporary-storage.js';import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {inspectJpegBlob,decodeJpegRows,JPEG_ID,jpegCodec} from './jpeg.js';
export function contiguousSurface(pixels,budget){const store={byteLength:pixels.data.byteLength,storage:'memory',readInto(target,offset){target.set(pixels.data.subarray(offset,offset+target.length));return target;}};return createRgbSurface(store,{width:pixels.width,height:pixels.height,budget,ownsStore:false});}
// Transaction: no handle is published until all pixels and provenance are ready.
export async function loadSegmentedJpeg(blob,{budget,signal,onProgress,temporarySessionId,onTemporarySession,getTemporarySession:providedSession}={}){
 const source=createBlobSource(blob,{budget});let session,sessionPending,store,surface;
 async function ensureTemporarySession({signal:taskSignal}={}){
  checkAbort(taskSignal);if(session)return session;
  if(!sessionPending)sessionPending=(async()=>{const value=providedSession?await providedSession({signal:taskSignal}):await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});session=value;if(!providedSession)onTemporarySession?.({id:value.id,backend:value.backend});return value;})().finally(()=>{sessionPending=null;});
  return sessionPending;
 }
 try{
  const header=await inspectJpegBlob(source,{signal}),n=header.sourceWidth*header.sourceHeight,
   coefficientBytes=header.progressive?Math.ceil(header.sourceWidth/8)*Math.ceil(header.sourceHeight/8)*64*6:0,
   paged=header.progressive||blob.size+32*1024**2>512*1024**2,
   decodeAllowance=paged?67*1024**2:Math.max(blob.size+coefficientBytes+32*1024**2,jpegCodec.memoryBytes())+9*1024**2,
   fits=n*3+decodeAllowance<=budget.limit-budget.retained-budget.active;
  if(!fits)await ensureTemporarySession({signal});
  store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
  const started=performance.now(),decode=paged?await decodePagedJpegRows(source,header,store,{budget,signal,getTemporarySession:()=>ensureTemporarySession({signal}),onProgress}):await decodeJpegRows(source,header,store,{budget,signal,onProgress:f=>onProgress?.({phase:'decode',fraction:f})}),decodeMs=performance.now()-started;
  const sha256=await source.sha256({signal,onProgress:f=>onProgress?.({phase:'original-sha256',fraction:f})});checkAbort(signal);
  surface=createRgbSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget});
  const oriented=await prepareOrientedSourceCache(surface,{budget,temporarySession:session,signal,onProgress});surface=oriented.surface;
  const provenance={decoder:JPEG_ID,...(paged?{coefficientStorage:'global-virtual-arrays',coefficientCacheBytes:8*1024**2}:{}),layout:'segmented-scanlines',orientation:header.orientation,orientationApplied:true,sourceSize:[header.sourceWidth,header.sourceHeight],icc:header.icc?'present, not applied (native policy)':'absent',depth:8,alpha:'absent',interpolation:'none'};
  return {kind:'image',segmented:true,ownsTemporarySession:!providedSession,source,store,surface,get session(){return session;},ensureTemporarySession,sha256,provenance,retainedBytes:0,metrics:{decodeMs,...decode,...oriented.metrics,storage:store.storage,temporaryBackend:session?.backend??null,temporaryFallback:session?.fallback??null,temporaryBytes:session?store.byteLength+(oriented.metrics.orientationCacheBytes??0):0,originalBlobBytes:blob.size,originalBlobResidency:'browser-managed; not measured as zero RAM'}};
 }catch(error){try{try{await surface?.dispose();if(!surface)await store?.dispose();}finally{if(!providedSession)await session?.dispose();}}catch(cleanup){error.temporaryCleanupError={code:cleanup.code??'STORAGE_IO',message:cleanup.message};}finally{source.dispose();}throw error;}
}
export async function disposeSegmentedImage(record){
 let failure;try{await disposePixelStoreCaches(record);}catch(e){failure=e;}for(const resource of [record.plotsCache,record.emCache,record.waveletCache,record.blockingCache,record.frequencyCache,record.prnuCache,record.resamplingCache,record.noisesnifferCache,record.stereoCache,record.thumbnailAnalysis,record.energyCache,record.zeroAnalysis,record.rgbRecompression,record.surface,record.ownsTemporarySession!==false?record.session:null,record.source])try{await resource?.dispose();}catch(e){failure??=e;}if(failure)throw failure;
}
export async function loadSegmentedPng(blob,{header,animationDetected=false,budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 if(animationDetected)throw new EngineError('UNSUPPORTED_FORMAT','Animated PNG needs a separately qualified segmented frame policy.');
 const source=createBlobSource(blob,{budget});let session,sessionPending,store,surface;
 async function ensureTemporarySession({signal:taskSignal}={}){
  checkAbort(taskSignal);if(session)return session;if(!sessionPending)sessionPending=(async()=>{const value=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});session=value;onTemporarySession?.({id:value.id,backend:value.backend});return value;})().finally(()=>{sessionPending=null;});return sessionPending;
 }
 try{
  const n=header.sourceWidth*header.sourceHeight,plan=pngStreamPlan(header.sourceWidth,header.sourceHeight),fits=n*3+plan.workingBytes+2*1024**2<=budget.limit-budget.retained-budget.active;
  if(!fits)await ensureTemporarySession({signal});store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
  const started=performance.now(),decode=await decodePngRows(source,header,store,{budget,signal,onProgress:f=>onProgress?.({phase:'decode',fraction:f})}),decodeMs=performance.now()-started;
  const sha256=await source.sha256({signal,onProgress:f=>onProgress?.({phase:'original-sha256',fraction:f})});checkAbort(signal);
  surface=createRgbSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget});
  const oriented=await prepareOrientedSourceCache(surface,{budget,temporarySession:session,signal,onProgress});surface=oriented.surface;
  const provenance={decoder:'libpng-1.6.43/emscripten-4.0.15/scanlines-v1',format:'png',layout:'segmented-scanlines',orientation:header.orientation,orientationApplied:true,sourceSize:[header.sourceWidth,header.sourceHeight],sourceDepth:header.depth,analysisDepth:8,interlace:header.interlace,icc:header.icc?'present, not applied (native policy)':'absent',alpha:header.alpha?'present, native IMREAD_COLOR conversion; not retained':'absent',interpolation:'none',frames:'static PNG'};
  return {kind:'image',segmented:true,source,store,surface,get session(){return session;},ensureTemporarySession,sha256,provenance,retainedBytes:0,metrics:{decodeMs,...decode,...oriented.metrics,storage:store.storage,temporaryBackend:session?.backend??null,temporaryFallback:session?.fallback??null,temporaryBytes:session?store.byteLength+(oriented.metrics.orientationCacheBytes??0):0,originalBlobBytes:blob.size,originalBlobResidency:'browser-managed; not measured as zero RAM'}};
 }catch(error){try{try{await surface?.dispose();if(!surface)await store?.dispose();}finally{await session?.dispose();}}catch(cleanup){error.temporaryCleanupError={code:cleanup.code??'STORAGE_IO',message:cleanup.message};}finally{source.dispose();}throw error;}
}
export async function loadSegmentedTiff(blob,{header,budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 const source=createBlobSource(blob,{budget});let session,sessionPending,store,surface;
 async function ensureTemporarySession({signal:taskSignal}={}){
  checkAbort(taskSignal);if(session)return session;if(!sessionPending)sessionPending=(async()=>{const value=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});session=value;onTemporarySession?.({id:value.id,backend:value.backend});return value;})().finally(()=>{sessionPending=null;});return sessionPending;
 }
 try{
  const n=header.sourceWidth*header.sourceHeight,plan=tiffStreamPlan(header),fits=n*3+plan.workingBytes+2*1024**2<=budget.limit-budget.retained-budget.active;
  if(!fits)await ensureTemporarySession({signal});store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
  const started=performance.now(),decode=await decodeTiffBlocks(source,header,store,{budget,signal,onProgress:f=>onProgress?.({phase:'decode',fraction:f})}),decodeMs=performance.now()-started;
  const sha256=await source.sha256({signal,onProgress:f=>onProgress?.({phase:'original-sha256',fraction:f})});checkAbort(signal);
  surface=createRgbSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:1,budget});
  const provenance={decoder:'libtiff-4.6.0/emscripten-4.0.15/blocks-v1',format:'tiff',...(header.bigTiff?{container:'BigTIFF'}:{}),layout:'segmented-strips-tiles',orientation:header.orientation,orientationApplied:true,tiffOrientation:'native strip/tile transforms and placement',sourceSize:[header.sourceWidth,header.sourceHeight],sourceDepth:header.depth,analysisDepth:8,icc:header.icc?'present, not applied (native policy)':'absent',alpha:header.alpha?'present, native IMREAD_COLOR conversion; not retained':'absent',interpolation:'none',frames:'first image only'};
  return {kind:'image',segmented:true,source,store,surface,get session(){return session;},ensureTemporarySession,sha256,provenance,retainedBytes:0,metrics:{decodeMs,...decode,storage:store.storage,temporaryBackend:session?.backend??null,temporaryFallback:session?.fallback??null,temporaryBytes:session?store.byteLength:0,originalBlobBytes:blob.size,originalBlobResidency:'browser-managed; not measured as zero RAM'}};
 }catch(error){try{try{await surface?.dispose();if(!surface)await store?.dispose();}finally{await session?.dispose();}}catch(cleanup){error.temporaryCleanupError={code:cleanup.code??'STORAGE_IO',message:cleanup.message};}finally{source.dispose();}throw error;}
}
export function requireSegmentedOperation(operation){if(operation!=='inspection.histogram')throw new EngineError('UNSUPPORTED_LAYOUT','This operation has no qualified segmented-image adapter yet. Full resolution and analysis parameters were preserved.');}

/** Reuse the common native PNG/JPEG source paths, selected by original bytes. */
export async function loadM2SegmentedOriginal(blob,options){
 const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());
 if(signature[0]===255&&signature[1]===216)return loadSegmentedJpeg(blob,options);
 const source=createBlobSource(blob,{budget:options.budget});const release=options.budget.reserve(4*1024**2);
 try{const {header,metrics}=await inspectPngSource(source,{signal:options.signal,account:n=>options.budget.reserve(n)});return await loadSegmentedPng(blob,{...options,header,animationDetected:metrics.animationDetected});}finally{release();source.dispose();}
}
