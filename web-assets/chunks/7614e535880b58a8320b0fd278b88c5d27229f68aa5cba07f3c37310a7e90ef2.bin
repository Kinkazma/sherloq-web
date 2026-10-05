import {rolledRgbSurface} from './rolled-rgb-surface.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';import {createSegmentedBytes} from './segmented-bytes.js';
const MiB=1024**2,IO=256*1024;
export function rgbRecompressionPlan(surface){
 const {width,height,sourceWidth=width}=surface.descriptor;requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'JPEG dimensions must be within1–65500.');
 const rowBytes=width*3,rows=Math.min(32,height),heapMaximumBytes=Math.ceil((8*MiB+rowBytes*48)/(16*MiB))*16*MiB;
 // Conservative TJBUFSIZE bound, padded MCUs, valid for the fixed baseline4:2:0.
 const encodedCapacityBytes=Math.ceil(width/16)*16*Math.ceil(height/16)*16*6+2048;
 return {width,height,rowBytes,rows,heapMaximumBytes,encodedCapacityBytes,workingBytes:heapMaximumBytes+8*MiB+IO,windowAllowance:2*rowBytes*rows+sourceWidth*3+4*MiB};
}
// Two completed encoded qualities per source; native RGB is never cached whole.
export function createRgbRecompression(image,budget){
 const plan=rgbRecompressionPlan(image.surface),cache=new Map(),pinned=new Set();let disposed=false;
 const unregister=budget.registerReclaimer?.(bytes=>{for(const [key,entry]of cache){if(budget.total()+bytes<=budget.limit)break;if(entry.store.storage!=='memory'||pinned.has(key))continue;cache.delete(key);void entry.store.dispose();}});
 return {
  async visit(quality,{signal,onProgress,onBand,wasmBinary,phaseX=0,phaseY=0,sampling='420'}={}){
   requireValue(!disposed&&Number.isInteger(quality)&&quality>=0&&quality<=100&&typeof onBand==='function','Live RGB recompression source, quality and band consumer required.');requireValue([phaseX,phaseY].every(n=>Number.isInteger(n)&&n>=0&&n<=7),'Invalid JPEG circular phase.');requireValue(['420','444'].includes(sampling),'Invalid JPEG sampling.');const surface=phaseX||phaseY?rolledRgbSurface(image.surface,phaseX,phaseY,budget):image.surface,key=phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':'');await controlCheckpoint(signal);const release=budget.reserve(plan.workingBytes);let m,pointer=0,entry=cache.get(key),created,writeBuffer,buffered=0,written=0,readOffset=0;
   pinned.add(key);const cached=!!entry;if(entry){cache.delete(key);cache.set(key,entry);}try{
    if(!entry){if(cache.size>=2){const key=cache.keys().next().value,old=cache.get(key);cache.delete(key);await old.store.dispose();}
     const fits=plan.encodedCapacityBytes+plan.windowAllowance<=budget.limit-budget.retained-budget.active;
     created=await createSegmentedBytes(plan.encodedCapacityBytes,{budget,storage:fits?'memory':'temporary',getTemporarySession:image.ensureTemporarySession,temporarySession:image.session,signal});writeBuffer=new Uint8Array(IO);
    }
    const flush=async()=>{if(buffered){await created.write(writeBuffer.subarray(0,buffered),written);written+=buffered;buffered=0;}};
    const writeEncoded=async(pointer,length)=>{checkAbort(signal);if(written+buffered+length>plan.encodedCapacityBytes)throw new EngineError('MEMORY_LIMIT','JPEG encoded output exceeds its conservative capacity.');for(let at=0;at<length;){const n=Math.min(length-at,IO-buffered);writeBuffer.set(m.HEAPU8.subarray(pointer+at,pointer+at+n),buffered);buffered+=n;at+=n;if(buffered===IO)await flush();}};
    const readEncoded=async(pointer,length)=>{checkAbort(signal);const count=Math.min(length,entry.byteLength-readOffset);if(count>0){await entry.store.readInto(m.HEAPU8.subarray(pointer,pointer+count),readOffset);readOffset+=count;}return count;};
    const {default:create}=await import('../vendor/jpeg-rgb-stream/jpeg-rgb-stream.js');m=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536}),writeEncoded,readEncoded,...(wasmBinary?{wasmBinary}:{})});
    const call=async(name,types=[],args=[])=>{const ok=await m.ccall(name,'number',types,args,{async:true});if(m.ioFailure)throw m.ioFailure;if(!ok)throw new EngineError(m._rgb_stream_error()===2?'MEMORY_LIMIT':'COMPUTE_FAILED','Global RGB JPEG scanline recompression failed.');checkAbort(signal);};
    pointer=m._malloc(plan.rowBytes*plan.rows);if(!pointer)throw new EngineError('MEMORY_LIMIT','JPEG RGB band allocation failed.');let peak=m.HEAPU8.buffer.byteLength;
    if(!cached){await call(sampling==='444'?'rgb_stream_open_444':'rgb_stream_open',['number','number','number'],[plan.width,plan.height,quality]);for(let y=0;y<plan.height;y+=plan.rows){await controlCheckpoint(signal);const count=Math.min(plan.rows,plan.height-y),part=await surface.readWindow({x:0,y,width:plan.width,height:count},{signal});try{m.HEAPU8.set(part.pixels.data,pointer);await call('rgb_stream_write',['number','number'],[pointer,count]);}finally{part.release();}peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'jpeg-encode',fraction:(y+count)/plan.height});}
     await call('rgb_stream_end_write');await flush();await created.flush();checkAbort(signal);entry={store:created,byteLength:written};cache.set(key,entry);created=null;writeBuffer=null;
    }
    await call('rgb_stream_begin_read',['number','number'],[plan.width,plan.height]);
    for(let y=0;y<plan.height;y+=plan.rows){await controlCheckpoint(signal);const count=Math.min(plan.rows,plan.height-y);await call('rgb_stream_read',['number','number'],[pointer,count]);const part=await surface.readWindow({x:0,y,width:plan.width,height:count},{signal});try{await onBand(part.pixels.data,m.HEAPU8.subarray(pointer,pointer+plan.rowBytes*count),{y,rows:count});}finally{part.release();}peak=Math.max(peak,m.HEAPU8.buffer.byteLength);onProgress?.({phase:'jpeg-render',fraction:(y+count)/plan.height});}
    await call('rgb_stream_end_read');return {workers:1,kernel:'global-rgb-jpeg-scanlines',sampling,recompressedCache:cached,recompressions:cached?0:1,sourcePasses:cached?1:2,encodedBytes:entry.byteLength,encodedCapacityBytes:plan.encodedCapacityBytes,encodedStorage:entry.store.storage,cacheEntries:cache.size,rowsPerChunk:plan.rows,maxSourceWindowBytes:plan.rows*plan.rowBytes,codecHeapCapacityBytes:peak,codecHeapMaximumBytes:plan.heapMaximumBytes};
   }finally{pinned.delete(key);if(m){m._rgb_stream_close();if(pointer)m._free(pointer);}try{await created?.dispose();}finally{release();}}
  },
  hasEncoded(quality,{phaseX=0,phaseY=0,sampling='420'}={}){return cache.has(phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':''));},
  async retainEncoded(quality,entry,{phaseX=0,phaseY=0,sampling='420'}={}){
   requireValue(!disposed&&entry?.store&&Number.isSafeInteger(entry.byteLength)&&entry.byteLength>0,'Completed encoded JPEG required.');const key=phaseX+'/'+phaseY+'/'+quality+(sampling==='444'?'/444':''),old=cache.get(key);if(old){cache.delete(key);if(old.store!==entry.store)await old.store.dispose();}
   while(cache.size>=2){const oldest=cache.keys().next().value,value=cache.get(oldest);cache.delete(oldest);await value.store.dispose();}cache.set(key,entry);
  },
  async dispose(){disposed=true;unregister?.();const entries=[...cache.values()];cache.clear();const results=await Promise.allSettled(entries.map(e=>e.store.dispose()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 };
}
