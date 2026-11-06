import {ElaJpegArchiveBridge} from './ela-jpeg-archive-bridge.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {createJpegEntryRetirement} from './jpeg-encoded-cache-owners.js';
import {Budget} from './cache.js';
import {createReusableRgbWindow} from './reusable-rgb-window.js';
import {wasmAllocationFailure,allocateTypedArray,allocateWasmMemory} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {wasmRange,closeMemoryRanges} from './memory-range.js';
import {rolledRgbSurface} from './rolled-rgb-surface.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';import {createSegmentedBytes} from './segmented-bytes.js';
const MiB=1024**2,IO=256*1024;
export function rgbRecompressionPlan(surface){
 const {width,height,sourceWidth=width}=surface.descriptor;requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'JPEG dimensions must be within1–65500.');
 const rowBytes=width*3,rows=Math.min(32,height),heapMaximumBytes=Math.ceil((8*MiB+rowBytes*48)/(16*MiB))*16*MiB;
 // Conservative TJBUFSIZE bound, padded MCUs, valid for the fixed baseline4:2:0.
 const encodedCapacityBytes=Math.ceil(width/16)*16*Math.ceil(height/16)*16*6+2048;
 return {width,height,rowBytes,rows,heapMaximumBytes,encodedCapacityBytes,workingBytes:heapMaximumBytes+8*MiB+IO,windowAllowance:2*rowBytes*rows+sourceWidth*3+4*MiB};
}
// Two completed encoded qualities per source; native RGB is never cached whole.
export function createRgbRecompression(image,budget,{createArchive=b=>new ElaJpegArchiveBridge(b)}={}){
 const scheduler=getExecutionScheduler(budget),plan=rgbRecompressionPlan(image.surface),cache=new Map(),pinned=new Set(),retiring=createJpegEntryRetirement();let disposed=false,archive=null,archiveFallback=null;
 const retire=entry=>retiring.retire(entry);
 const unregister=budget.registerReclaimer?.(bytes=>{for(const [key,entry]of cache){if(budget.total()+bytes<=budget.limit)break;if(entry.store.storage!=='memory'||pinned.has(key))continue;cache.delete(key);retiring.defer(entry);}});
 // An actual ArrayBuffer refusal needs backing, not the conservative JPEG
 // capacity reservation. Retire completed optional qualities before unrelated
 // runtime credit, and wait for each store's readers/transport ACKs to finish.
 const unregisterBacking=budget.registerAsyncReclaimer?.(async({all=false,shortfallBytes=0,signal}={})=>{await retiring.drain();let freed=0;for(const [key,entry]of cache){if(!all&&freed>=shortfallBytes)break;checkAbort(signal);if(entry.store.storage!=='memory'||pinned.has(key))continue;const bytes=entry.store.allocatedBackingBytes;cache.delete(key);await retire(entry);freed+=bytes;}return freed;},{allocationKind:'array-buffer',priority:50,discardOnAllocationFailure:true});
 // Only the ELA callers opt into this path. A cached encoded quality still
 // uses its unchanged native scanline decoder. No public archive is omitted.
 async function archiveVisit(quality,{signal,onProgress,onBand,phaseX,phaseY,sampling,wasmBinary,backend,elaParams,elaTable}){
  if(backend!=='webgpu'||quality<1||plan.width*plan.height<262144||phaseX||phaseY||sampling!=='420'||wasmBinary||!globalThis.navigator?.gpu)return null;
  const key='0/0/'+quality;if(cache.has(key))return null;
  const blocks=Math.ceil(plan.width/8)*Math.ceil(plan.height/8)+2*Math.ceil(plan.width/16)*Math.ceil(plan.height/16),rgbBytes=plan.width*plan.height*3,coefficientBytes=blocks*128;
  // Admission is conservative and does not allocate a second pipeline or
  // execute a trial recompression. Native scanlines remain the bounded path.
  const required=72*MiB+rgbBytes*16+coefficientBytes*6+blocks*256+plan.encodedCapacityBytes+plan.windowAllowance;
  if(coefficientBytes>24*MiB||required>budget.limit-budget.total()){archiveFallback={code:'MEMORY_LIMIT',policy:'complete-context-native-entropy-admission'};return null;}
  let created,written=0,committed=false,result,failed=false,primary,cleanupFailed=false,mayFallback=false;const ioBudget=new Budget(8*MiB),reserveIO=bytes=>ioBudget.reserve(bytes);pinned.add(key);
  try{
   if(cache.size>=2){const oldest=cache.keys().next().value,entry=cache.get(oldest);cache.delete(oldest);await retire(entry);}
   created=await createSegmentedBytes(plan.encodedCapacityBytes,{budget,storage:'memory',getTemporarySession:image.ensureTemporarySession,temporarySession:image.session,signal});archive??=createArchive(budget);
   const runtime=await archive.visit(image.surface,quality,{signal,onProgress,onBand,params:elaParams,table:elaTable,
    writeEncoded:async range=>{checkAbort(signal);if(written+range.byteLength>plan.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','Native coefficient JPEG exceeds its conservative encoded capacity.');await created.write(range,written,{reserve:reserveIO});written+=range.byteLength;},
    onEncoded:async()=>{await created.flush();checkAbort(signal);const entry={store:created,byteLength:written,origin:'native-ISLOW420-GPU-and-native-entropy'};cache.set(key,entry);created=null;committed=true;}
   });const entry=cache.get(key);result={...runtime,recompressedCache:false,encodedBytes:written,encodedCapacityBytes:plan.encodedCapacityBytes,encodedStorage:entry.store.storage,encodedCacheOrigin:entry.origin,cacheEntries:cache.size,archiveSourceBufferedBytes:rgbBytes};
  }catch(error){failed=true;primary=error;mayFallback=!signal?.aborted&&!committed&&!!archive?.mayFallback?.(error);}
  finally{pinned.delete(key);try{if(created)await retire({store:created});}catch(error){cleanupFailed=true;if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}}
  if(failed){if(!mayFallback||cleanupFailed)throw primary;try{await archive.dispose();archive=null;}catch(cleanup){attachGpuCleanup(primary,cleanup);throw primary;}archiveFallback={code:primary?.code??'GPU_FAILED',policy:'native-scanlines-after-acknowledged-GPU-refusal'};return null;}
  return result;
 }
 return {
  async visit(quality,{signal,onProgress,onBand,wasmBinary,phaseX=0,phaseY=0,sampling='420',backend='cpu',elaParams,elaTable}={}){
   requireValue(!disposed&&Number.isInteger(quality)&&quality>=0&&quality<=100&&typeof onBand==='function','Live RGB recompression source, quality and band consumer required.');requireValue([phaseX,phaseY].every(n=>Number.isInteger(n)&&n>=0&&n<=7),'Invalid JPEG circular phase.');requireValue(['420','444'].includes(sampling),'Invalid JPEG sampling.');requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid JPEG archive backend.');checkAbort(signal);await retiring.drain();archiveFallback=null;const accelerated=await archiveVisit(quality,{signal,onProgress,onBand,phaseX,phaseY,sampling,wasmBinary,backend,elaParams,elaTable});if(accelerated)return accelerated;const surface=phaseX||phaseY?rolledRgbSurface(image.surface,phaseX,phaseY,budget):image.surface,key=phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':'');await controlCheckpoint(signal);const release=budget.reserve(plan.workingBytes),ioBudget=new Budget(8*MiB),reserveIO=bytes=>ioBudget.reserve(bytes);let sourceWindow,m,heapBacking,heapBytes=0,pointer=0,entry=cache.get(key),created,writeBuffer,buffered=0,written=0,readOffset=0,ioFailed=false,ioPrimary,failed=false,primary;
   pinned.add(key);const cached=!!entry,cooperate=createCooperator(signal);if(entry){cache.delete(key);cache.set(key,entry);}try{
    sourceWindow=await createReusableRgbWindow(surface,{budget,rows:plan.rows,bytes:plan.windowAllowance,signal});
    if(!entry){if(cache.size>=2){const key=cache.keys().next().value,old=cache.get(key);cache.delete(key);await retire(old);}
     const fits=plan.encodedCapacityBytes+plan.windowAllowance<=budget.limit-budget.retained-budget.active;
     created=await createSegmentedBytes(plan.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',getTemporarySession:image.ensureTemporarySession,temporarySession:image.session,signal});writeBuffer=allocateTypedArray(Uint8Array,IO,{label:'jpeg-encoded-write'});
    }
    const flush=async()=>{if(buffered){await created.write(writeBuffer.subarray(0,buffered),written,{reserve:reserveIO});written+=buffered;buffered=0;}};
    const writeEncoded=async(pointer,length)=>{checkAbort(signal);if(written+buffered+length>plan.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','JPEG encoded output exceeds its conservative capacity.');for(let at=0;at<length;){const n=Math.min(length-at,IO-buffered);writeBuffer.set(m.HEAPU8.subarray(pointer+at,pointer+at+n),buffered);buffered+=n;at+=n;if(buffered===IO)await flush();}};
    const readEncoded=async(pointer,length)=>{checkAbort(signal);const count=Math.min(length,entry.byteLength-readOffset);if(count>0){await entry.store.readInto(wasmRange(m,pointer,count),readOffset,{reserve:reserveIO});readOffset+=count;}return count;};
    const ioCallback=fn=>async(...args)=>{try{return await fn(...args);}catch(error){ioFailed=true;ioPrimary=error;throw error;}};
    const {default:create}=await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:plan.heapMaximumBytes/65536},{label:'jpeg-scanline-heap'}),writeEncoded:ioCallback(writeEncoded),readEncoded:ioCallback(readEncoded),...(wasmBinary?{wasmBinary}:{})});
    heapBacking=budget.registerBacking?.('wasm',plan.heapMaximumBytes,{owner:'ela',label:'jpeg-scanline-heap',state:'reserved'});heapBytes=m.HEAPU8.byteLength;heapBacking?.materialize(heapBytes);
    const call=async(name,types=[],args=[])=>{let ok,failed=false,primary;try{ok=await scheduler.run({cpu:1,signal,resourceOwner:'ela',label:'jpeg-scanline'},()=>m.ccall(name,'number',types,args,{async:true}));}catch(error){failed=true;primary=error;}if(ioFailed){failed=true;primary=ioPrimary;}try{heapBytes=m.HEAPU8.byteLength;heapBacking?.materialize(heapBytes);}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}if(failed)throw primary;if(m.ioFailure)throw m.ioFailure;if(!ok)throw (m._rgb_stream_error()===2?wasmAllocationFailure(m,'Global RGB JPEG scanline recompression failed.'):new EngineError('COMPUTE_FAILED','Global RGB JPEG scanline recompression failed.'));checkAbort(signal);};
    pointer=m._malloc(plan.rowBytes*plan.rows);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','JPEG RGB band allocation failed.',{details:{allocationKind:'wasm',requestedBytes:plan.rowBytes*plan.rows,currentBytes:m.HEAPU8.byteLength}});let peak=m.HEAPU8.buffer.byteLength;
    if(!cached){await call(sampling==='444'?'rgb_stream_open_444':'rgb_stream_open',['number','number','number'],[plan.width,plan.height,quality]);for(let y=0;y<plan.height;y+=plan.rows){await cooperate();const count=Math.min(plan.rows,plan.height-y),part=await sourceWindow.read({x:0,y,width:plan.width,height:count});try{m.HEAPU8.set(part.pixels.data,pointer);await call('rgb_stream_write',['number','number'],[pointer,count]);}finally{part.release();}peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'jpeg-encode',fraction:(y+count)/plan.height});}
     await call('rgb_stream_end_write');await flush();await created.flush();checkAbort(signal);entry={store:created,byteLength:written};cache.set(key,entry);created=null;writeBuffer=null;
    }
    await call('rgb_stream_begin_read',['number','number'],[plan.width,plan.height]);
    for(let y=0;y<plan.height;y+=plan.rows){await cooperate();const count=Math.min(plan.rows,plan.height-y);await call('rgb_stream_read',['number','number'],[pointer,count]);const part=await sourceWindow.read({x:0,y,width:plan.width,height:count});try{await onBand(part.pixels.data,m.HEAPU8.subarray(pointer,pointer+plan.rowBytes*count),{y,rows:count});}finally{part.release();}peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'jpeg-render',fraction:(y+count)/plan.height});}
    await call('rgb_stream_end_read');return {workers:1,kernel:'global-rgb-jpeg-scanlines',sampling,backend:'cpu',...(archiveFallback?{archiveGpuFallback:archiveFallback}:{}),recompressedCache:cached,recompressions:cached?0:1,sourcePasses:cached?1:2,encodedBytes:entry.byteLength,encodedCapacityBytes:plan.encodedCapacityBytes,encodedStorage:entry.store.storage,cacheEntries:cache.size,rowsPerChunk:plan.rows,maxSourceWindowBytes:plan.rows*plan.rowBytes,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:plan.heapMaximumBytes};
   }catch(error){failed=true;primary=error;throw error;}finally{pinned.delete(key);if(m){m._rgb_stream_close();closeMemoryRanges(m);if(pointer)m._free(pointer);}m=null;heapBacking?.();if(heapBytes)budget.notifyBackingRelease?.('wasm',heapBytes);await retireCompositeOwners([()=>created&&retire({store:created}),()=>sourceWindow?.dispose(),release],failed?{primary}:{});}
  },
  hasEncoded(quality,{phaseX=0,phaseY=0,sampling='420'}={}){return cache.has(phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':''));},
  async retainEncoded(quality,entry,{phaseX=0,phaseY=0,sampling='420'}={}){
   requireValue(!disposed&&entry?.store&&Number.isSafeInteger(entry.byteLength)&&entry.byteLength>0,'Completed encoded JPEG required.');await retiring.drain();const key=phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':''),old=cache.get(key);if(old){cache.delete(key);if(old.store!==entry.store)await retire(old);}
   while(cache.size>=2){const oldest=cache.keys().next().value,value=cache.get(oldest);cache.delete(oldest);await retire(value);}cache.set(key,entry);
  },
  async dispose(){disposed=true;for(const entry of cache.values())retiring.defer(entry);cache.clear();await retireCompositeOwners([()=>retiring.drain(),async()=>{if(archive){await archive.dispose();archive=null;}}]);unregister?.();unregisterBacking?.();}
 };
}
