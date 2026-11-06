import {EngineError,normalizeResourceError,resourceAllocationKind} from './errors.js';

// Error boundaries add execution context; they never replace the allocator's
// cause/domain with a message-only error or grow a heap after a JS/GPU refusal.
export function neuralRuntimeError(error,{provider,phase,heapBytes=0,maximumBytes}={}){
 let failure=normalizeResourceError(error),kind=resourceAllocationKind(failure);
 if(!failure?.code&&/Model (identity|length)/.test(error?.message??''))failure=new EngineError('MODEL_IDENTITY',error.message,{cause:error});
 if(!kind&&failure?.code==='MEMORY_ALLOCATION'&&provider==='wasm'&&phase==='inference'&&/std::bad_alloc|\baborted\(oom\)/i.test(error?.message??'')){
  failure=new EngineError('MEMORY_ALLOCATION',error.message,{cause:error,details:{...failure.details,allocationKind:'wasm'}});kind='wasm';
 }
 if(failure?.code==='MEMORY_ALLOCATION')failure.details={...failure.details,executionPhase:phase,...(kind==='wasm'?{currentBytes:heapBytes,maximumBytes,nativeHeapExhausted:phase==='inference'&&Number.isFinite(maximumBytes)&&heapBytes>=maximumBytes}: {})};
 return failure;
}
