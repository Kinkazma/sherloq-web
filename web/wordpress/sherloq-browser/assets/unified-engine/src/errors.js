import "../../runtime-context.js?v=0.14.5";
export class EngineError extends Error {
  constructor(code, message, {cause,details}={}) { super(message,cause===undefined?undefined:{cause}); this.name = 'EngineError'; this.code = code;if(details!==undefined)this.details=details; }
}
const MEMORY_CODES=new Set(['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY']);
// Only allocator-specific evidence is recoverable. Generic RangeErrors also
// represent invalid lengths, offsets, stack overflow and programming mistakes.
const ALLOCATION_MESSAGE=/(?:array\s*buffer|sharedarraybuffer|typed\s*array) allocation failed|(?:failed|unable|could not) to allocate (?:memory|an? (?:array\s*buffer|buffer))|(?:webassembly\.memory|memory\.grow).*?(?:out of memory|could not allocate|failed to grow|maximum memory size exceeded)|\bout of memory\b|\baborted\(oom\)|\bstd::bad_alloc\b/i;
export function normalizeResourceError(error,details){
 const original=error;let evidence=error;const seen=new Set();
 if(error?.details?.recovery?.loopDetected)return error;
 if(MEMORY_CODES.has(error?.code)){if(details!==undefined)error.details={...error.details,...details};return error;}
 if(error?.code&& !['INTERNAL','COMPUTE_FAILED','WORKER_FAILED','NEURAL_EXECUTION','NUMERIC_RANGE','GPU_FAILED',...MEMORY_CODES].includes(error.code))return error;
 while(evidence&&!seen.has(evidence)){seen.add(evidence);if(MEMORY_CODES.has(evidence.code)||evidence.name==='GPUOutOfMemoryError'||ALLOCATION_MESSAGE.test(evidence.message??''))break;evidence=evidence.cause;}
 if(!evidence||seen.has(evidence)&&!MEMORY_CODES.has(evidence.code)&&evidence.name!=='GPUOutOfMemoryError'&&!ALLOCATION_MESSAGE.test(evidence.message??''))return original;
 const code=MEMORY_CODES.has(original?.code)?original.code:MEMORY_CODES.has(evidence.code)?evidence.code:'MEMORY_ALLOCATION';
 const normalized=new EngineError(code,original?.message??String(original),{cause:original,details:{...evidence?.details,...original?.details,...details,...(evidence?.details?.recovery?.loopDetected?{recovery:evidence.details.recovery}:{})}});if(original?.stack)normalized.stack=original.stack;return normalized;
}
// Return a backing domain only with explicit allocator evidence. Admission
// limits and generic memory failures keep ordinary policy-based reclamation.
export function resourceAllocationKind(error){
 if(error?.code==='MEMORY_LIMIT')return null;const seen=new Set();
 for(let value=error;value&&!seen.has(value);value=value.cause){
  seen.add(value);const kind=value.details?.allocationKind;if(['array-buffer','wasm','gpu'].includes(kind))return kind;
  if(value.code==='GPU_OUT_OF_MEMORY'||value.name==='GPUOutOfMemoryError')return 'gpu';
  const message=value.message??'';
  if(/(?:webassembly\.memory|memory\.grow).*?(?:out of memory|could not allocate|failed to grow|maximum memory size exceeded)/i.test(message))return 'wasm';
  if(/(?:array\s*buffer|sharedarraybuffer|typed\s*array) allocation failed|(?:failed|unable|could not) to allocate (?:an? )?(?:array\s*buffer|sharedarraybuffer|typed\s*array)/i.test(message))return 'array-buffer';
 }
 return null;
}
// Policy admission has its own causal opportunity, never a backing domain.
export function isFixedAdmissionError(error){return error?.code==='MEMORY_LIMIT'&&error.details?.admissionScope==='fixed';}
export function resourceRecoveryKind(error){return error?.code==='MEMORY_LIMIT'?(isFixedAdmissionError(error)?null:'policy'):resourceAllocationKind(error);}
// A replayed policy transaction must also reacquire its own returned prefix.
// Physical allocator extents and the original failed reservation stay distinct.
export function resourceRecoveryBytes(error){
 const retry=error?.code==='MEMORY_LIMIT'?error.details?.admission?.retryBytes:undefined;
 const bytes=Number.isSafeInteger(retry)&&retry>0?retry:error?.details?.requestedBytes;
 return Number.isSafeInteger(bytes)&&bytes>0?bytes:undefined;
}
export function isRecoverableTransportError(error){return error?.code==='WORKER_MESSAGE_FAILED'&&!error?.details?.recovery?.loopDetected;}
// Only a fetch/stream owner may classify a transient network failure. Hash,
// range, storage and arbitrary TypeErrors are never inferred to be retryable.
export function isRecoverableNetworkError(error){return error?.code==='NETWORK_TRANSIENT'&&!error?.details?.recovery?.loopDetected;}
export function isRecoverableResourceError(error){const value=normalizeResourceError(error);return (MEMORY_CODES.has(value?.code)||isRecoverableTransportError(value)||isRecoverableNetworkError(value))&&!value?.details?.recovery?.loopDetected;}
// Structural dependency failures settle automatically, without blindly replaying
// the same graph. Explicit resume may rebuild it while retaining checkpoints.
export function isResumableResourceError(error){return error?.code==='RESOURCE_DEPENDENCY_CYCLE'||isRecoverableResourceError({...error,details:{...error?.details,recovery:undefined}});}
function encodeError(value,fallback,seen){
 if(seen.has(value))return {code:fallback,name:'Error',message:'Circular error cause'};seen.add(value);
 const output={code:value?.code??fallback,name:value?.name??'Error',message:value?.message??String(value)};
 if(value?.stack)output.stack=value.stack;if(value?.details!==undefined){try{output.details=structuredClone(value.details);}catch{output.details={diagnostic:String(value.details)};}}
 if(value?.cause!==undefined)output.cause=encodeError(value.cause,fallback,seen);return output;
}
export function serializeEngineError(error,fallback='INTERNAL'){return encodeError(normalizeResourceError(error),fallback,new Set());}
export function deserializeEngineError(value){
 const error=new EngineError(value?.code??'INTERNAL',value?.message??String(value),{details:value?.details,...(value?.cause!==undefined?{cause:deserializeEngineError(value.cause)}:{})});if(value?.name)error.name=value.name;if(value?.stack)error.stack=value.stack;return error;
}
// Compatibility at legacy RPC clients; structured current replies retain every cause.
export function deserializeWorkerError(value,message){return value&&typeof value==='object'?deserializeEngineError(value):new EngineError(value??'WORKER_FAILED',message??'Worker failed.');}
export function requireValue(ok, message) { if (!ok) throw new EngineError('INVALID_INPUT', message); }
export function checkAbort(signal) { if (signal?.aborted) throw new EngineError('CANCELLED', 'Task cancelled.'); }
export async function checkpoint(signal) { checkAbort(signal); if (globalThis.scheduler?.yield) await globalThis.scheduler.yield(); else await new Promise(resolve => setTimeout(resolve, 0)); checkAbort(signal); }

// Resource-owning worker jobs must also admit control-message tasks. A boosted
// scheduler.yield continuation can otherwise outrun a queued cancellation message.
export async function controlCheckpoint(signal){checkAbort(signal);await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);}

// Bounded cooperation during useful chunked work. Check cancellation every time,
// but avoid a clamped timer for every small storage page.
export function createCooperator(signal){let next=performance.now()+8;return async()=>{checkAbort(signal);if(performance.now()<next)return;await controlCheckpoint(signal);next=performance.now()+8;};}
