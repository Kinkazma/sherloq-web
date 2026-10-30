import "../../runtime-context.js?v=0.30.0";
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
// Only the newly transported cleanup tree is bounded here. The primary error,
// its normalization/allocation classification and historical cause contract
// keep their existing projection. Primitive cleanup values remain primitives.
const CLEANUP_NODES=128,CLEANUP_DEPTH=8,CLEANUP_COLLECTION=128;
const cleanupMarker=message=>({code:'DIAGNOSTIC_SECONDARY_LIMIT',name:'Error',message});
const unreadableCleanup=key=>({code:'DIAGNOSTIC_PROPERTY_UNREADABLE',name:'Error',message:'Cleanup error property could not be read: '+key});
function cleanupField(value,key){try{return value!==null&&(typeof value==='object'||typeof value==='function')&&key in value?{present:true,value:value[key]}:{present:false};}catch{return{present:true,value:unreadableCleanup(key)};}}
function cleanupValue(value,fallback,seen,state,depth,decode){
 if(state.remaining<=0)return decode?deserializeEngineError(cleanupMarker('[cleanup limit]')):cleanupMarker('[cleanup limit]');
 if(depth>CLEANUP_DEPTH){state.remaining--;return decode?deserializeEngineError(cleanupMarker('[cleanup limit]')):cleanupMarker('[cleanup limit]');}
 if(value===null||typeof value!=='object'){
  state.remaining--;
  if(typeof value==='function'||typeof value==='symbol'){let message;try{message=String(value);}catch{message='[unprintable cleanup value]';}return decode?new EngineError(fallback,message):{code:fallback,name:'Error',message};}
  return value;
 }
 try{return decode?decodeError(value,state,depth,true):encodeError(value,fallback,seen,state,depth,true);}
 catch{return decode?deserializeEngineError(unreadableCleanup('cleanup value')):unreadableCleanup('cleanup value');}
}
function cleanupRelations(input,output,fallback,seen,state,depth,decode){
 const one=cleanupField(input,'cleanupError');if(one.present)output.cleanupError=cleanupValue(one.value,fallback,seen,state,depth+1,decode);
 const many=cleanupField(input,'cleanupErrors');if(!many.present)return;
 let list;try{list=Array.isArray(many.value);}catch{many.value=unreadableCleanup('cleanupErrors');list=false;}
 if(!list){output.cleanupErrors=cleanupValue(many.value,fallback,seen,state,depth+1,decode);return;}
 const length=cleanupField(many.value,'length').value;
 if(!Number.isSafeInteger(length)||length<0){output.cleanupErrors=cleanupValue(unreadableCleanup('length'),fallback,seen,state,depth+1,decode);return;}
 const values=[];let n=0;
 for(;n<Math.min(length,CLEANUP_COLLECTION)&&state.remaining>0;n++)values.push(cleanupValue(cleanupField(many.value,String(n)).value,fallback,seen,state,depth+1,decode));
 if(n<length){
  const replace=values.length>=CLEANUP_COLLECTION||state.remaining<=0&&values.length>0;
  const marker=cleanupMarker('[cleanup entries omitted: '+(length-n+(replace?1:0))+']');
  // Keep the omission visible inside the same bounded collection. A final
  // subtree may have consumed the shared budget, so replace its last slot.
  const entry=decode?deserializeEngineError(marker):marker;
  if(replace)values[values.length-1]=entry;else values.push(entry);
 }
 output.cleanupErrors=values;
}
function encodeError(value,fallback,seen,secondary={remaining:CLEANUP_NODES},depth=0,limited=false){
 if(limited){if(depth>CLEANUP_DEPTH||secondary.remaining--<=0)return cleanupMarker('[cleanup limit]');}
 if(seen.has(value))return {code:fallback,name:'Error',message:'Circular error cause'};seen.add(value);
 const output={code:value?.code??fallback,name:value?.name??'Error',message:value?.message??String(value)};
 if(value?.stack)output.stack=value.stack;if(value?.details!==undefined){try{output.details=structuredClone(value.details);}catch{output.details={diagnostic:String(value.details)};}}
 if(value?.cause!==undefined)output.cause=encodeError(value.cause,fallback,seen,secondary,depth+(limited?1:0),limited);
 cleanupRelations(value,output,fallback,seen,secondary,depth,false);return output;
}
export function serializeEngineError(error,fallback='INTERNAL'){return encodeError(normalizeResourceError(error),fallback,new Set());}
// A transform owner summary never invokes an Error getter or copies raw details.
// Only own data properties are observed; all strings are clipped before copying.
function retirementData(value,key){try{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}}
export function projectWaveletRetirementFailure(reason,{attemptOrdinal=0,entryOrdinal=0,firstInSet=false,origin='cleanup-owner'}={}){
 const ordinal=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 const reasonType=reason===null?'null':typeof reason,details={waveletRetirement:{attemptOrdinal:ordinal(attemptOrdinal),entryOrdinal:ordinal(entryOrdinal),firstInSet:!!firstInSet,origin:origin==='plans'?'plans':'cleanup-owner',reasonType}};
 let code='WAVELET_RETIRE_FAILED',name='Error',message, truncated=false;
 const clip=(value,limit)=>{if(value.length>limit)truncated=true;return value.slice(0,limit);};
 if(reason!==null&&(reasonType==='object'||reasonType==='function')){
  const c=retirementData(reason,'code'),n=retirementData(reason,'name'),m=retirementData(reason,'message');
  if(typeof c==='string')code=clip(c,32);if(typeof n==='string')name=clip(n,32);message=typeof m==='string'?clip(m,128):'[non-primitive retirement failure]';
 }else if(reasonType==='string')message=clip(reason,128);
 else if(reasonType==='number'){message=String(reason);details.waveletRetirement.reasonValue=reason;}
 else if(reasonType==='boolean'){message=reason?'true':'false';details.waveletRetirement.reasonValue=reason;}
 else if(reason===null)message='null';else if(reason===undefined)message='undefined';else message='['+reasonType+' retirement failure]';
 if(truncated)details.waveletRetirement.truncated=true;
 return {code,name,message,details};
}
export function waveletRetirementOmission(omitted,unit='observations'){return {code:'DIAGNOSTIC_SECONDARY_LIMIT',name:'Error',message:'[transform retirement diagnostics omitted]',details:{waveletRetirement:{omitted,unit:unit==='summary-records'?'summary-records':'observations'}}};}
// Optional owner DTOs share the SAME secondary node budget as the historical
// cleanup relations. No raw additional Error/details enters encodeError here.
export function serializeEngineErrorWithCleanupSummaries(error,summaries,fallback='INTERNAL'){
 if(!summaries?.length)return serializeEngineError(error,fallback);
 const state={remaining:CLEANUP_NODES-1},output=encodeError(normalizeResourceError(error),fallback,new Set(),state);
 const values=Object.hasOwn(output,'cleanupErrors')?(Array.isArray(output.cleanupErrors)?output.cleanupErrors:[output.cleanupErrors]):[];
 let copied=0;
 // Two nodes account for the DTO and its fixed scalar details. Reserve one
 // shared node for a visible omission marker instead of exceeding the limit.
 for(;copied<Math.min(32,summaries.length)&&state.remaining>=2&&values.length<CLEANUP_COLLECTION;copied++){values.push(summaries[copied]);state.remaining-=2;}
 if(copied<summaries.length){const marker=waveletRetirementOmission(summaries.length-copied,'summary-records');if(values.length>=CLEANUP_COLLECTION)values[values.length-1]=marker;else values.push(marker);}
 output.cleanupErrors=values;return output;
}

function decodeError(value,secondary={remaining:CLEANUP_NODES},depth=0,limited=false){
 if(limited){if(depth>CLEANUP_DEPTH||secondary.remaining--<=0)return new EngineError('DIAGNOSTIC_SECONDARY_LIMIT','[cleanup limit]');}
 const error=new EngineError(value?.code??'INTERNAL',value?.message??String(value),{details:value?.details,...(value?.cause!==undefined?{cause:decodeError(value.cause,secondary,depth+(limited?1:0),limited)}:{})});if(value?.name)error.name=value.name;if(value?.stack)error.stack=value.stack;
 cleanupRelations(value,error,'INTERNAL',new Set(),secondary,depth,true);return error;
}
export function deserializeEngineError(value){return decodeError(value);}
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
