import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,normalizeResourceError,resourceAllocationKind} from './errors.js';
import {browserMemoryObservation} from './browser-memory.js';

function allocationFailure(cause,bytes,{label,operation}){
 const details={allocationKind:'array-buffer',requestedBytes:bytes,label,browserMemory:browserMemoryObservation(),...(operation?{operation:operation.key??operation}: {})};
 if(cause instanceof RangeError)return new EngineError('MEMORY_ALLOCATION','Unable to allocate '+label+'.',{cause,details});
 return normalizeResourceError(cause,details);
}

// Classify at the constructor, never around the subsequent fill/copy. A valid
// typed-array length can fail here for allocation; a later offset error cannot.
export function allocateTypedArray(Type,length,{label='typed-array',operation}={}){
 const bytes=length*Type?.BYTES_PER_ELEMENT;
 requireValue(typeof Type==='function'&&Number.isInteger(Type.BYTES_PER_ELEMENT)&&Number.isSafeInteger(length)&&length>=0&&Number.isSafeInteger(bytes),'Invalid typed-array allocation.');
 try{return new Type(length);}catch(cause){
  throw allocationFailure(cause,bytes,{label,operation});
 }
}

export function allocateOwnedTypedArray(Type,length,{budget,reserve=bytes=>budget.reserve(bytes),owner='surface',label='typed-array',operation}={}){
 const bytes=length*Type?.BYTES_PER_ELEMENT;
 requireValue(Number.isSafeInteger(length)&&length>=0&&Number.isInteger(Type?.BYTES_PER_ELEMENT)&&Number.isSafeInteger(bytes),'Invalid owned typed-array allocation.');
 const releaseMemory=reserve(bytes);let backing,closed=false,data;
 try{data=allocateTypedArray(Type,length,{label,operation});backing=budget.registerBacking?.('array-buffer',bytes,{owner,label,operation,identity:data.buffer});}
 catch(error){releaseMemory();throw error;}
 const result={data,release(){if(closed)return;closed=true;result.data=null;data=null;const retired=backing?.();backing=null;releaseMemory();if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);}};
 return result;
}

export function allocateBuffer(bytes,{shared=false,label='byte-buffer',operation}={}){
 requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid buffer allocation.');
 try{return shared?new SharedArrayBuffer(bytes):new ArrayBuffer(bytes);}catch(cause){throw allocationFailure(cause,bytes,{label,operation});}
}

export async function readBlobBytes(blob,{label='blob-staging',operation}={}){
 let buffer;try{buffer=await blob.arrayBuffer();}catch(cause){throw allocationFailure(cause,blob.size,{label,operation});}
 return new Uint8Array(buffer);
}

export function copyTypedArray(source,options){
 requireValue(ArrayBuffer.isView(source)&&Number.isSafeInteger(source.length),'Typed array copy required');
 const result=allocateTypedArray(source.constructor,source.length,options);result.set(source);return result;
}
// Called only at a native allocator's null/status boundary. Native heaps and
// JS output copies exhaust different arenas and must not share a recovery key.
export function wasmAllocationFailure(module,label,requestedBytes,cause){
 const currentBytes=(module?.HEAPU8??module?.HEAPF64??module?.HEAPF32)?.buffer?.byteLength;
 return new EngineError('MEMORY_ALLOCATION',label,{cause,details:{allocationKind:'wasm',label,...(Number.isSafeInteger(requestedBytes)&&requestedBytes>0?{requestedBytes}:{}),...(Number.isSafeInteger(currentBytes)?{currentBytes}:{})}});
}
export function nativeModuleFailure(cause,label){
 const failure=normalizeResourceError(cause);
 if(['MEMORY_ALLOCATION','MEMORY_LIMIT','GPU_OUT_OF_MEMORY'].includes(failure?.code)){
  if(failure.code==='MEMORY_ALLOCATION'&&!resourceAllocationKind(failure))failure.details={...failure.details,allocationKind:'wasm',label};
  return failure;
 }
 return new EngineError('CODEC_UNAVAILABLE',label,{cause});
}
export function registerArrayViews(budget,value,options={}){
 const buffers=new Set(Object.values(value).filter(ArrayBuffer.isView).map(array=>array.buffer)),owners=[];let closed=false;
 try{for(const buffer of buffers)owners.push({bytes:buffer.byteLength,release:budget.registerBacking?.('array-buffer',buffer.byteLength,{...options,identity:buffer})});}catch(error){for(const owner of owners)owner.release?.();throw error;}
 return()=>{if(closed)return;closed=true;for(const owner of owners){const retired=owner.release?.();if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??owner.bytes);}owners.length=0;buffers.clear();};
}
export function allocateWasmMemory(descriptor,{label='wasm-memory',operation}={}){
 const {initial,maximum}=descriptor;requireValue(Number.isInteger(initial)&&initial>=0&&initial<=65536&&(maximum===undefined||Number.isInteger(maximum)&&maximum>=initial&&maximum<=65536),'Invalid WebAssembly memory extent');
 try{return new WebAssembly.Memory(descriptor);}catch(cause){if(cause instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Unable to allocate '+label+'.',{cause,details:{allocationKind:'wasm',requestedBytes:initial*65536,maximumBytes:maximum*65536,label,...(operation?{operation:operation.key}: {})}});throw normalizeResourceError(cause);}
}
