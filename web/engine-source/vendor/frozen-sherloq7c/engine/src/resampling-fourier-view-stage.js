import {fourierGpuScalarDomain} from './resampling-fourier-gpu.js';
import {copyTypedArray} from './allocation.js';
import {checkAbort} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';

// A caller-owned native presentation envelope finances these defensive copies;
// the GPU provider's separate result owner remains live until both copies end.
export async function presentFourierWithGpu(magnitude,low,high,params,{provider,backend='cpu',signal}={}){
 if(backend!=='webgpu'||!provider||magnitude.length<65536||!fourierGpuScalarDomain(low,high,params.gamma,params.rescale))return null;
 let owned,failed=false,primary;
 try{
  owned=await provider.render(magnitude,{low,high,gamma:params.gamma,rescale:params.rescale,signal});checkAbort(signal);
  const values=copyTypedArray(owned.values,{label:'fourier-owned-presentation-values'}),pixels=copyTypedArray(owned.pixels,{label:'fourier-owned-presentation-RGB'});checkAbort(signal);
  return{values,pixels,metrics:{...owned.metrics,fourierPresentationGpuAttempts:1,fourierViewWorkers:0}};
 }catch(error){
  failed=true;primary=error;if(!provider.mayFallback(error))throw error;
  try{await provider.retire();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}
  checkAbort(signal);return{metrics:{backend:'cpu',fourierPresentationGpuCalls:0,fourierPresentationGpuAttempts:1,fourierPresentationFallback:error.code,fourierViewWorkers:1}};
 }finally{if(owned)try{await owned.release();}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
