import {EngineError,serializeEngineError} from './errors.js';
// mapAsync may reject before WebGPU exposes the allocator's scoped failure.
// Drain both scopes and retain both pieces of evidence instead of discarding it.
export async function closeGpuErrorScopes(device,{cause,label,requestedBytes,validationCode='GPU_FAILED'}={}){
 let memory,validation;try{memory=await device.popErrorScope();validation=await device.popErrorScope();}catch(error){if(cause){cause.details={...cause.details,scopeCleanup:serializeEngineError(error)};return cause;}throw error;}
 if(memory)return new EngineError('MEMORY_ALLOCATION',memory.message,{cause:cause??memory,details:{allocationKind:'gpu',label,...(Number.isSafeInteger(requestedBytes)?{requestedBytes}:{}),gpuScope:serializeEngineError(memory)}});
 if(cause)return cause;
 if(validation)return new EngineError(validationCode,validation.message,{cause:validation,details:{label}});
 return null;
}
