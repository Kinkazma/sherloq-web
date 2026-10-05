import "../../runtime-context.js?v=0.14.5";
import {EngineError,serializeEngineError,deserializeEngineError} from './errors.js';

// Called only at a validated WebAssembly.Memory constructor/grow boundary.
// Preserve the physical allocator evidence across both worker boundaries;
// an already coded logical refusal still remains a policy-domain refusal.
export function denseAllocationError(error,details){
 if(error?.code){error.details={...details,...error.details};return error;}
 return new EngineError('MEMORY_ALLOCATION',`Dense WebAssembly allocation failed: ${error?.message??error}`,{cause:error,details:{...details,allocationKind:'wasm'}});
}
export function serializeDenseError(error){return serializeEngineError(error,'WORKER_FAILED');}
export function deserializeDenseError(value){return deserializeEngineError(value);}
