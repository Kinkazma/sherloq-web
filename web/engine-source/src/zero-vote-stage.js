import {allocateOwnedTypedArray} from './allocation.js';
import {checkAbort,createCooperator} from './errors.js';
import {zeroVoteGpuPlan} from './zero-vote-gpu.js';
import {createZeroVoteRefiner} from './zero-vote-refiner.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
export async function runZeroGpuVoteStage(luminance,plan,gpu,{budget,signal,onProgress,onNativeOwner}={}){
 checkAbort(signal);if(gpu.disabled)return{fallback:{code:'GPU_DISABLED'}};
 try{zeroVoteGpuPlan(plan.width,plan.height);}catch(error){if(error?.code==='GPU_LIMIT')return{fallback:{code:error.code}};throw error;}
 let input,refiner,nativeOwner,result,failed=false,primary,fallback=false,gpuAttemptJobs=0;const progress=e=>{if(['zero-gpu-blocks-submitted','zero-gpu-votes-submitted'].includes(e.phase))gpuAttemptJobs++;onProgress?.(e);};const allocationContext={},cooperate=createCooperator(signal),started=performance.now();
 try{
  try{input=allocateOwnedTypedArray(Uint8Array,plan.n,{budget,owner:'zero',label:'zero-resident-luminance'});}catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)){allocationContext.refusal=error;throw error;}throw error;}
  for(let at=0;at<plan.n;at+=1024**2){await cooperate();await luminance.readInto(input.data.subarray(at,Math.min(plan.n,at+1024**2)),at);checkAbort(signal);}
  refiner=await createZeroVoteRefiner(input.data,plan.width,plan.height,{budget,signal,allocationContext,onOwner:owner=>{nativeOwner=owner;onNativeOwner?.(owner);}});result=await gpu.run(input.data,plan.width,plan.height,{refiner,signal,onProgress:progress});result.metrics.nativeRefiner=refiner.metrics;
 }catch(error){failed=true;primary=error;fallback=!signal?.aborted&&(allocationContext.refusal===error||gpu.mayFallback(error));}
 finally{
  let cleanupFailed=false,cleanup;const attempt=async f=>{try{await f();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}};
  await attempt(()=>refiner?.dispose());if(!refiner)await attempt(()=>nativeOwner?.dispose());await attempt(()=>input?.release());
  if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else{failed=true;primary=cleanup;}fallback=false;}
 }
 if(failed){if(result)try{await result.release();}catch(error){attachGpuCleanup(primary,error);fallback=false;}if(fallback){try{await gpu.dispose();}catch(error){attachGpuCleanup(primary,error);throw primary;}gpu.disabled=true;return{fallback:{code:primary?.code??'GPU_FAILED'},gpuAttemptJobs};}throw primary;}
 result.metrics.gpuAttemptJobs=gpuAttemptJobs;result.metrics.completeStageMs=performance.now()-started;return result;
}
