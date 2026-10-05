import createModule from '../vendor/jpeg-dct-paged/jpeg-dct-paged.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

export const pagedJpegDctHistograms=(source,options)=>runPagedJpeg(source,options);
export async function decodePagedJpegRows(source,header,store,options){
 requireValue(store.byteLength===header.sourceWidth*header.sourceHeight*3,'Original JPEG RGB destination size required.');
 return (await runPagedJpeg(source,{...options,decoded:{header,store}})).metrics;
}
async function runPagedJpeg(source,{budget,getTemporarySession,signal,onProgress,wasmBinary,cacheBytes=8*1024**2,decoded}={}){
 requireValue(source&&budget&&typeof getTemporarySession==='function'&&Number.isSafeInteger(cacheBytes)&&cacheBytes>=65536&&cacheBytes<=8*1024**2,'Invalid paged JPEG coefficient context.');
 const release=budget.reserve(66*1024**2),stores=new Map();let m,pointer=0,encodedOffset=0,serial=0,peak=0,live=0,readBytes=0,writeBytes=0,created=0,decodedBytes=0,maxDecodedChunkBytes=0;
 const close=async id=>{const store=stores.get(id);if(store){await store.dispose();stores.delete(id);live-=store.byteLength;}};
 try{
  checkAbort(signal);
  m=await createModule({...(wasmBinary?{wasmBinary}:{}),wasmMemory:new WebAssembly.Memory({initial:256,maximum:1024}),
   readEncoded:async(ptr,length)=>{
    await controlCheckpoint(signal);const count=Math.min(length,source.byteLength-encodedOffset);if(!count)return 0;
    const part=await source.read(encodedOffset,count,{signal});try{m.HEAPU8.set(part.bytes,ptr);encodedOffset+=count;onProgress?.({phase:decoded?'decode-coefficients':'dct-coefficients',fraction:(decoded ? .5 : .8)*encodedOffset/source.byteLength,encodedBytes:encodedOffset,totalEncodedBytes:source.byteLength});return count;}finally{part.release();}
   },
   openBacking:async size=>{checkAbort(signal);const store=await(await getTemporarySession()).create(size,{signal}),id=++serial;stores.set(id,store);created++;live+=size;peak=Math.max(peak,live);return id;},
   backingIO:async(id,ptr,offset,size,writing)=>{
    await controlCheckpoint(signal);const store=stores.get(id);requireValue(store,'Missing JPEG coefficient backing store.');
    const view=m.HEAPU8.subarray(ptr,ptr+size);if(writing){await store.write(view,offset);writeBytes+=size;}else{await store.readInto(view,offset);readBytes+=size;}
   },closeBacking:close,
   writeDecoded:async(ptr,offset,length)=>{await controlCheckpoint(signal);requireValue(decoded&&offset===decodedBytes,'Sequential decoded JPEG rows required.');await decoded.store.write(m.HEAPU8.subarray(ptr,ptr+length),offset);decodedBytes+=length;maxDecodedChunkBytes=Math.max(maxDecodedChunkBytes,length);onProgress?.({phase:'decode',fraction:.5+.5*decodedBytes/decoded.store.byteLength,decodedBytes,totalDecodedBytes:decoded.store.byteLength});},
   reportRows:async(completed,total)=>{await controlCheckpoint(signal);onProgress?.({phase:'dct-histograms',fraction:.8+.2*completed/total,completed,total});}
  });
  if(!decoded){pointer=m._malloc((4+9*258)*4);if(!pointer)throw new EngineError('MEMORY_ALLOCATION','JPEG histogram allocation failed.');}
  const ok=decoded?await m.ccall('jpeg_decode_paged','number',['number','number','number'],[decoded.header.sourceWidth,decoded.header.sourceHeight,cacheBytes],{async:true}):await m.ccall('dct_paged_run','number',['number','number'],[pointer,cacheBytes],{async:true});
  if(m.ioFailure)throw m.ioFailure;
  if(!ok)throw new EngineError(m._dct_paged_error()===2?'MEMORY_ALLOCATION':'INVALID_INPUT','Stored JPEG coefficient decoding failed.');
  checkAbort(signal);if(decoded){requireValue(decodedBytes===decoded.store.byteLength,'Complete original JPEG decode required.');await decoded.store.flush();}
  return {...(!decoded?{histograms:new Uint32Array(m.HEAPU8.slice(pointer,pointer+(4+9*258)*4).buffer)}:{}),metrics:{kernel:decoded?'libjpeg-rgb-global-coefficients-paged':'libjpeg-global-coefficients-paged',heapCapacityBytes:m.HEAPU8.buffer.byteLength,heapMaximumBytes:64*1024**2,coefficientCacheBytes:cacheBytes,encodedReadBytes:encodedOffset,maxEncodedReadBytes:65536,coefficientStores:created,temporaryPeakBytes:peak,coefficientReadBytes:readBytes,coefficientWriteBytes:writeBytes,...(decoded?{decodedBytes,maxDecodedChunkBytes}:{})}};
 }finally{
  try{if(m){await m.ccall('dct_paged_close',null,[],[],{async:true});if(pointer)m._free(pointer);}const results=await Promise.allSettled([...stores.keys()].map(close));const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}
  finally{release();}
 }
}
