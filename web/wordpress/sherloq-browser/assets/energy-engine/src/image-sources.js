import {EngineError,checkAbort} from './errors.js';
import {createBlobSource} from './blob-source.js';import {createTemporarySession} from './temporary-storage.js';import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';import {inspectJpegBlob,decodeJpegRows,JPEG_ID,jpegCodec} from './jpeg.js';
export function contiguousSurface(pixels,budget){const store={byteLength:pixels.data.byteLength,storage:'memory',readInto(target,offset){target.set(pixels.data.subarray(offset,offset+target.length));return target;}};return createRgbSurface(store,{width:pixels.width,height:pixels.height,budget,ownsStore:false});}
// Transaction: no handle is published until all pixels and provenance are ready.
export async function loadSegmentedJpeg(blob,{budget,signal,onProgress,temporarySessionId,onTemporarySession}={}){
 const source=createBlobSource(blob,{budget});let session,sessionPending,store,surface;
 async function ensureTemporarySession({signal:taskSignal}={}){
  checkAbort(taskSignal);if(session)return session;
  if(!sessionPending)sessionPending=(async()=>{const value=await createTemporarySession({budget,signal:taskSignal,id:temporarySessionId});session=value;onTemporarySession?.({id:value.id,backend:value.backend});return value;})().finally(()=>{sessionPending=null;});
  return sessionPending;
 }
 try{
  const header=await inspectJpegBlob(source,{signal}),n=header.sourceWidth*header.sourceHeight,
   coefficientBytes=header.progressive?Math.ceil(header.sourceWidth/8)*Math.ceil(header.sourceHeight/8)*64*6:0,
   decodeAllowance=Math.max(blob.size+coefficientBytes+32*1024**2,jpegCodec.memoryBytes())+9*1024**2,
   fits=n*3+decodeAllowance<=budget.limit-budget.retained-budget.active;
  if(!fits)await ensureTemporarySession({signal});
  store=await createSegmentedBytes(n*3,{budget,storage:fits?'memory':'temporary',temporarySession:session,signal});
  const started=performance.now(),decode=await decodeJpegRows(source,header,store,{budget,signal,onProgress:f=>onProgress?.({phase:'decode',fraction:f})}),decodeMs=performance.now()-started;
  const sha256=await source.sha256({signal,onProgress:f=>onProgress?.({phase:'original-sha256',fraction:f})});checkAbort(signal);
  surface=createRgbSurface(store,{width:header.sourceWidth,height:header.sourceHeight,orientation:header.orientation,budget});
  const provenance={decoder:JPEG_ID,layout:'segmented-scanlines',orientation:header.orientation,orientationApplied:true,sourceSize:[header.sourceWidth,header.sourceHeight],icc:header.icc?'present, not applied (native policy)':'absent',depth:8,alpha:'absent',interpolation:'none'};
  return {kind:'image',segmented:true,source,store,surface,get session(){return session;},ensureTemporarySession,sha256,provenance,retainedBytes:0,metrics:{decodeMs,...decode,storage:store.storage,temporaryBackend:session?.backend??null,temporaryFallback:session?.fallback??null,temporaryBytes:session?store.byteLength:0,originalBlobBytes:blob.size,originalBlobResidency:'browser-managed; not measured as zero RAM'}};
 }catch(error){try{try{await surface?.dispose();if(!surface)await store?.dispose();}finally{await session?.dispose();}}catch(cleanup){error.temporaryCleanupError={code:cleanup.code??'STORAGE_IO',message:cleanup.message};}finally{source.dispose();}throw error;}
}
export async function disposeSegmentedImage(record){try{try{await record.surface.dispose();}finally{await record.session?.dispose();}}finally{record.source.dispose();}}
export function requireSegmentedOperation(operation){if(operation!=='inspection.histogram')throw new EngineError('UNSUPPORTED_LAYOUT','This operation has no qualified segmented-image adapter yet. Full resolution and analysis parameters were preserved.');}
