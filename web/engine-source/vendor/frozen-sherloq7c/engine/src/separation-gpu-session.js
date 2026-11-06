import {retireWaveletStripOwners,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {createSeparationColorBatchGpu} from './separation-color-batch-gpu.js';
import {checkAbort} from './errors.js';
import {createSeparationGpu} from './separation-filter-gpu.js';
// Owned per invocation. Useful raw/residual caches remain in their existing
// image/budget owners; no device or source buffer escapes this lifetime.
export async function openSeparationGpu({budget,backend='auto',signal,batchColor=false}={}){
 let engine,last,reason=null,closed=false,closing;
 if(backend==='cpu')return null;
 if(!globalThis.navigator?.gpu)reason={code:'GPU_UNAVAILABLE',message:'WebGPU unavailable; native CPU retained'};
 else if(budget.limit-budget.total()<136*1024**2)reason={code:'GPU_HEADROOM',message:'Native CPU fallback and shared workspaces have priority over optional GPU staging'};
 else try{engine=await (batchColor?createSeparationColorBatchGpu:createSeparationGpu)({budget,signal});}catch(error){checkAbort(signal);if(!['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;if(batchColor)try{await retireWaveletStripOwners(budget,{pendingOnly:true});}catch(cleanup){appendWaveletCleanup(error,cleanup);throw error;}checkAbort(signal);reason={code:error.code,message:error.message};}
 const close=()=>{if(closing)return closing;closed=true;const task=(async()=>{if(engine){await engine.dispose();last=engine.stats;engine=null;}})();closing=task;void task.finally(()=>{if(engine&&closing===task)closing=null;}).catch(()=>{});return task;};
 return{
  get available(){return !!engine&&!closed;},
  async run(...args){if(!engine||closed)return null;try{return await engine.run(...args);}catch(error){const signal=args.at(-1)?.signal;checkAbort(signal);if(!['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;reason={code:error.code,message:error.message};await close();return null;}},
  runWindows:batchColor?async(...args)=>{if(!engine||closed)return null;return engine.runWindows(...args);}:undefined,
  snapshot(){const stats=engine?.stats??last;return{backend:stats?.calls?(stats.precisionFallbacks||stats.precisionRepairs?'webgpu-cpu-native-precision':'webgpu-native-preparation'):'cpu',gpu:stats??null,gpuFallback:reason??(stats?.precisionFallbacks?{code:'GPU_BINARY64_BOUNDARY_CPU',message:'Observed Gaussian keeps native binary64 arithmetic'}:null)};},
  dispose:close
 };
}
