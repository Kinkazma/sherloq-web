import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort,requireValue} from './errors.js';
const MiB=1024**2;
export function mappedTiffPlan(byteLength,header){
 const pixels=header.width*header.height;requireValue(Number.isSafeInteger(pixels)&&pixels>0&&Number.isSafeInteger(byteLength)&&byteLength>0&&byteLength<=0x7fffffff,'TIFF source exceeds the decoder range.');
 const heapMaximumBytes=Math.ceil((32*MiB+byteLength+pixels*12)/(16*MiB))*16*MiB;
 if(heapMaximumBytes>1536*MiB)throw new EngineError('MEMORY_LIMIT','TIFF mapped decoder exceeds its 1536 MiB heap ceiling.');
 return {heapMaximumBytes,workingBytes:heapMaximumBytes+byteLength*3+pixels*6+8*MiB};
}
export async function mappedTiffKernel(bytes,plan,{grayscale=false,signal,onProgress}={}){
 checkAbort(signal);const {default:create}=await import('../vendor/tiff-mapped/tiff-mapped.js');
 const memory=new WebAssembly.Memory({initial:256,maximum:plan.heapMaximumBytes/65536});let m,pointer=0;
 try{
  m=await create({wasmMemory:memory});checkAbort(signal);onProgress?.(.2);checkAbort(signal);
  pointer=m._malloc(bytes.byteLength);if(!pointer)throw new EngineError('MEMORY_LIMIT','TIFF encoded staging allocation failed.');m.HEAPU8.set(bytes,pointer);
  if(!m._tiff_decode(pointer,bytes.byteLength,Number(grayscale)))throw new EngineError(m._tiff_error()===2?'MEMORY_LIMIT':'INVALID_INPUT','Mapped TIFF decoder rejected the encoded source.');checkAbort(signal);
  const width=m._tiff_width(),height=m._tiff_height(),data=m.HEAPU8.slice(m._tiff_data(),m._tiff_data()+m._tiff_size());
  return {pixels:{width,height,format:grayscale?'gray8':'rgb8',data},metrics:{wasmHeapBytes:m.HEAPU8.buffer.byteLength,wasmMaximumBytes:plan.heapMaximumBytes,memoryMappedInput:true}};
 }finally{m?._tiff_release();if(pointer)m._free(pointer);m=null;}
}
export async function decodeMappedTiff(bytes,header,{signal,grayscale=false,onProgress}={}){
 const plan=mappedTiffPlan(bytes.byteLength,header);checkAbort(signal);
 // Node's explicit local-engine path uses the same bounded kernel for qualification.
 if(typeof Worker==='undefined')return (await mappedTiffKernel(bytes,plan,{signal,grayscale,onProgress})).pixels;
 let worker;
 try{return await new Promise((resolve,reject)=>{
  let timer,finished=false;const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();error?reject(error):resolve(result);};
  const abort=()=>finish(new EngineError('CANCELLED','TIFF decoding cancelled.'));
  worker=new Worker(new URL('./tiff-mapped-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress!==undefined){try{onProgress?.(data.progress);}catch(error){finish(error);}return;}data.failure?finish(new EngineError(data.failure.code,data.failure.message)):finish(null,data.pixels);};
  worker.onerror=()=>finish(new EngineError('CODEC_UNAVAILABLE','TIFF mapped worker failed.'));
  signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(new EngineError('TIMEOUT','TIFF decoding exceeded 60 seconds.')),60000);
  try{worker.postMessage({bytes,plan,grayscale});}catch(error){finish(error);}
 });}finally{worker?.terminate();}
}
