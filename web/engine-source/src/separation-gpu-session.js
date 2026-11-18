import {retireWaveletStripOwners,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {createSeparationColorBatchGpu} from './separation-color-batch-gpu.js';
import {checkAbort} from './errors.js';
import {gpuRetirementBlocked,gpuRetirementFailure} from './gpu-attempt-retirement.js';
import {createSeparationGpu,separationGpuColdAdmission,separationGpuSequenceColdAdmission} from './separation-filter-gpu.js';
export const SEPARATION_GPU_OPENING_BYTES=136*1024**2;
export function separationGpuAdmission(w,h,rows,p,{budget,backend='auto',sampleDepth=8,session,priorBytes=0}={}){
 try{
  if(budget.recovering||['gpu','array-buffer','wasm'].some(kind=>budget.isBackingUnderPressure?.(kind)))return{known:false,reason:'separation-resource-recovery'};
  if(session)return session.admissionPlan(w,h,rows,p,{budget});
  if(backend==='cpu'||!globalThis.navigator?.gpu)return{known:true,state:'not-requested',available:false,missingResidentBytes:0,hostBytes:0};
  // Do not let an optional final turn the ordinary opening into a CPU route.
  // A refusal remains conservative until the final really retires and the
  // unchanged run checks the actual ledger again.
  if(budget.limit-budget.total()-priorBytes<SEPARATION_GPU_OPENING_BYTES)return{known:false,reason:'separation-gpu-opening-headroom'};
  return{...separationGpuColdAdmission(w,h,rows,p,{sampleDepth}),openingBytes:SEPARATION_GPU_OPENING_BYTES};
 }catch{return{known:false,reason:'separation-gpu-state-uninspectable'};}
}
// Same opening policy as separationGpuAdmission, with a single owner's
// sequential union plan. No source/table construction or device probe occurs.
export function separationGpuSequenceAdmission(requests,{budget,backend='auto',session,priorBytes=0}={}){
 try{
  if(budget.recovering||['gpu','array-buffer','wasm'].some(kind=>budget.isBackingUnderPressure?.(kind)))return{known:false,reason:'separation-resource-recovery'};
  if(session)return session.admissionPlanSequence(requests,{budget});
  if(backend==='cpu'||!globalThis.navigator?.gpu)return{known:true,state:'not-requested',available:false,missingResidentBytes:0,hostBytes:0};
  if(budget.limit-budget.total()-priorBytes<SEPARATION_GPU_OPENING_BYTES)return{known:false,reason:'separation-gpu-opening-headroom'};
  return{...separationGpuSequenceColdAdmission(requests),openingBytes:SEPARATION_GPU_OPENING_BYTES};
 }catch{return{known:false,reason:'separation-gpu-state-uninspectable'};}
}
// Owned per invocation. Useful raw/residual caches remain in their existing
// image/budget owners; no device or source buffer escapes this lifetime.
export async function openSeparationGpu({budget,backend='auto',signal,batchColor=false,sampleDepth=8,nativeGpuRetirement,retirementTicket,retirementCacheOwner,onOwner,native16GaussianRadius=10}={}){
 let engine,last,reason=null,closed=false,closing,closeComplete=false,constructing=true,setupTransferred=false;const constructionOwners=sampleDepth===16?new Set():null;let setupReceipt;
 if(backend==='cpu')return null;

 const close=()=>{if(closing)return closing;closed=true;const task=(async()=>{if(sampleDepth===16)for(const owner of [...constructionOwners])await owner.dispose();if(engine){await engine.dispose();last=engine.stats;engine=null;}if(sampleDepth===16&&!setupTransferred&&!constructionOwners.size)if(setupReceipt?.acknowledge(session))setupReceipt=null;closeComplete=true;})();closing=task;void task.finally(()=>{if(engine&&closing===task)closing=null;}).catch(()=>{});return task;};
 const session={
  admissionPlan(w,h,rows,p,{budget:expectedBudget=budget}={}){
   if(expectedBudget!==budget||constructing||constructionOwners?.size||setupReceipt||closing&&!closeComplete)return{known:false,reason:'separation-session-not-idle'};
   if(engine&&!closed)return engine.admissionPlan(w,h,rows,p,{budget});
   if(closeComplete||!engine&&reason)return{known:true,state:closeComplete?'closed':'unavailable',available:false,missingResidentBytes:0,hostBytes:0};
   return{known:false,reason:'separation-session-incomplete'};
  },
  admissionPlanSequence(requests,{budget:expectedBudget=budget}={}){
   if(expectedBudget!==budget||constructing||constructionOwners?.size||setupReceipt||closing&&!closeComplete)return{known:false,reason:'separation-session-not-idle'};
   if(engine&&!closed)return engine.admissionPlanSequence(requests,{budget});
   if(closeComplete||!engine&&reason)return{known:true,state:closeComplete?'closed':'unavailable',available:false,missingResidentBytes:0,hostBytes:0};
   return{known:false,reason:'separation-session-incomplete'};
  },
  admissionPlanProgram(w,h,rows,program,{budget:expectedBudget=budget}={}){
   if(expectedBudget!==budget||constructing||constructionOwners?.size||setupReceipt||closing&&!closeComplete)return{known:false,reason:'separation-session-not-idle'};
   if(engine&&!closed)return engine.admissionPlanProgram(w,h,rows,program,{budget});
   if(closeComplete||!engine&&reason)return{known:true,state:closeComplete?'closed':'unavailable',available:false,missingResidentBytes:0,hostBytes:0};
   return{known:false,reason:'separation-session-incomplete'};
  },
  get available(){return !!engine&&!closed;},
  async run(...args){if(!engine||closed)return null;try{return await engine.run(...args);}catch(error){if(sampleDepth===16&&gpuRetirementBlocked(error))throw error;const signal=args.at(-1)?.signal;checkAbort(signal);if(!['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;reason={code:error.code,message:error.message};if(sampleDepth===16){try{await close();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:close},cleanup);}return null;}await close();return null;}},
  async runNativeProgram(...args){if(!engine||closed)return null;try{return await engine.runNativeProgram(...args);}catch(error){if(sampleDepth===16&&gpuRetirementBlocked(error))throw error;const signal=args.at(-1)?.signal;checkAbort(signal);if(!['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;reason={code:error.code,message:error.message};if(sampleDepth===16){try{await close();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:close},cleanup);}return null;}await close();return null;}},
  runWindows:batchColor?async(...args)=>{if(!engine||closed)return null;return engine.runWindows(...args);}:undefined,
  snapshot(){const stats=engine?.stats??last;return{backend:stats?.calls?(stats.precisionFallbacks||stats.precisionRepairs?'webgpu-cpu-native-precision':'webgpu-native-preparation'):'cpu',gpu:stats??null,gpuFallback:reason??(stats?.precisionFallbacks?{code:'GPU_BINARY64_BOUNDARY_CPU',message:'Observed Gaussian keeps native binary64 arithmetic'}:null)};},
  dispose:close
 };
 if(sampleDepth===16){onOwner?.(session);onOwner=null;if(nativeGpuRetirement&&retirementTicket)setupReceipt=nativeGpuRetirement.adopt(retirementTicket,session);nativeGpuRetirement=retirementTicket=null;}
 try{
 if(!globalThis.navigator?.gpu)reason={code:'GPU_UNAVAILABLE',message:'WebGPU unavailable; native CPU retained'};
 else if(budget.limit-budget.total()<SEPARATION_GPU_OPENING_BYTES)reason={code:'GPU_HEADROOM',message:'Native CPU fallback and shared workspaces have priority over optional GPU staging'};
 else try{engine=await (batchColor?createSeparationColorBatchGpu:createSeparationGpu)({budget,signal,sampleDepth,...(!batchColor?{native16GaussianRadius}:{}),...(sampleDepth===16?{adoptConstruction:owner=>constructionOwners.add(owner),retireConstruction:owner=>{constructionOwners.delete(owner);if(!constructing&&!engine&&!setupTransferred&&!constructionOwners.size)if(setupReceipt?.acknowledge(session))setupReceipt=null;},adoptEngine:owner=>{engine=owner;}}:{})});}catch(error){if(sampleDepth===16&&gpuRetirementBlocked(error))throw error;checkAbort(signal);if(!['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;if(batchColor)try{await retireWaveletStripOwners(budget,{pendingOnly:true});}catch(cleanup){appendWaveletCleanup(error,cleanup);throw error;}checkAbort(signal);reason={code:error.code,message:error.message};}
  if(sampleDepth===16&&setupReceipt){if(engine){setupReceipt.transfer(session,retirementCacheOwner);setupTransferred=true;setupReceipt=null;}else if(!constructionOwners.size){setupReceipt.acknowledge(session);setupReceipt=null;}}
  retirementCacheOwner=null;return session;
 }finally{constructing=false;retirementCacheOwner=null;if(sampleDepth===16&&!engine&&!setupTransferred&&!constructionOwners.size)if(setupReceipt?.acknowledge(session))setupReceipt=null;}
}
