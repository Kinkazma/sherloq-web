import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort,normalizeResourceError} from './errors.js';
// Only use these wrappers around an actual WebGPU API call. Admission,
// scheduler, source I/O, user callbacks and input errors retain their identities.
export function nativeGpuBoundaryError(error,{signal}={}){
 let code;try{code=error?.code;}catch{return error;}
 if(typeof code==='string'&&code)return error;
 if(typeof DOMException==='function'&&error instanceof DOMException){
  if(signal?.aborted)try{checkAbort(signal);}catch(cancelled){return cancelled;}
  return normalizeResourceError(new EngineError('GPU_FAILED',error.message||'Native WebGPU operation failed.',{cause:error}),{allocationKind:'gpu'});
 }
 return normalizeResourceError(error,{allocationKind:'gpu'});
}
export function nativeGpuSync(operation,options){try{return operation();}catch(error){throw nativeGpuBoundaryError(error,options);}}
export async function nativeGpuAsync(operation,options){try{return await operation();}catch(error){throw nativeGpuBoundaryError(error,options);}}
export function gpuFallbackError(error){let code;try{code=error?.code;}catch{return false;}return ['UNSUPPORTED_BACKEND','GPU_UNAVAILABLE','GPU_FAILED','GPU_OUT_OF_MEMORY','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(code);}
