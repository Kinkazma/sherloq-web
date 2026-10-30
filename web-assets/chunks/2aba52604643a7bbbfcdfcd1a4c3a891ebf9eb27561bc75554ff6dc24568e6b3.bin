import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort,normalizeResourceError} from './errors.js';
/** Translate only a native WebGPU boundary failure. Callers keep this outside
 * budget admission, input validation and scheduler acquisition. Already
 * structured primary errors retain object identity, including frozen errors. */
export function comparisonGpuBoundaryError(error,{signal}={}){
 let code;try{code=error?.code;}catch{return error;}
 if(typeof code==='string'&&code)return error;
 const dom=typeof DOMException==='function'&&error instanceof DOMException;
 if(dom){
  if(signal?.aborted)try{checkAbort(signal);}catch(cancelled){return cancelled;}
  return normalizeResourceError(new EngineError('GPU_FAILED',error.message||'Native comparison WebGPU operation failed.',{cause:error}),{allocationKind:'gpu'});
 }
 return normalizeResourceError(error,{allocationKind:'gpu'});
}
