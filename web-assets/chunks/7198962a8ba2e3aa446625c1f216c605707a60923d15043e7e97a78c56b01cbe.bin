import "../../runtime-context.js?v=0.30.0";
import {FourierViewGpu,fourierGpuScalarDomain} from './resampling-fourier-gpu.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {checkAbort} from './errors.js';
const inputRetirementFor=owner=>({dispose(){return owner.release();}});

// Whole retained magnitude -> bounded admitted GPU transport -> the existing
// native-resolution value/RGB stores. Unsupported geometry, arithmetic domain
// or resource admission preserves the unchanged strip CPU presenter.
export async function renderStoredFourierGpu(cache,magnitude,params,values,rgb,{budget,backend,signal,cooperate,blockPixels=65536,gpuFactory=b=>new FourierViewGpu(b)}={}){
 const side=magnitude.geometry.outputSide,count=side*side;if(backend!=='webgpu'||count<65536||!fourierGpuScalarDomain(magnitude.low,magnitude.high,params.gamma,params.rescale))return null;
 let inputFree;try{inputFree=budget.reserve(count*8);}catch(error){if(error?.code==='MEMORY_LIMIT')return{backend:'cpu',fourierPresentationGpuCalls:0,fourierPresentationFallback:error.code};throw error;}
 let input,inputOwner,inputRetirement,output,failed=false,primary;
 try{
  input=await magnitude.plane.read(0,0,side,side,{signal,cooperate});const owners=[];inputOwner=ownGpuArrays({values:input},inputFree,owners,budget);inputFree=null;inputRetirement=inputRetirementFor(inputOwner);cache.pendingRetirements.add(inputRetirement);owners.push({bytes:input.byteLength,release:budget.registerBacking?.('array-buffer',input.byteLength,{owner:'resampling-fourier',label:'fourier-stored-magnitude-copy',identity:input.buffer})});input=null;
  const provider=cache.presentationGpu??=gpuFactory(budget);try{output=await provider.render(inputOwner.values,{low:magnitude.low,high:magnitude.high,gamma:params.gamma,rescale:params.rescale,signal});}catch(error){if(!provider.mayFallback(error))throw error;try{await provider.retire();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}checkAbort(signal);return{backend:'cpu',fourierPresentationGpuCalls:0,fourierPresentationGpuAttempts:1,fourierPresentationFallback:error.code};}
  const rows=Math.max(1,Math.floor(blockPixels/side));for(let y=0;y<side;y+=rows){checkAbort(signal);await cooperate?.();const h=Math.min(rows,side-y),begin=y*side,end=(y+h)*side;await values.write(output.values.subarray(begin,end),0,y,side,h,{signal,cooperate});await rgb.write(output.pixels.subarray(begin*3,end*3),begin*3);checkAbort(signal);}return{...output.metrics,fourierPresentationGpuAttempts:1};
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  let cleanupFailed=false,cleanup;const attempt=async fn=>{try{await fn();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}};await attempt(()=>output?.release());await attempt(async()=>{if(inputRetirement){await inputRetirement.dispose();cache.pendingRetirements.delete(inputRetirement);}else inputFree?.();});
  input=null;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
 }
}
