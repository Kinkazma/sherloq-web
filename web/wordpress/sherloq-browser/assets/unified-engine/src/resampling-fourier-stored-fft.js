import "../../runtime-context.js?v=0.30.0";
import {FourierFftGpu} from './resampling-fourier-fft-gpu.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {checkAbort} from './errors.js';
import {invalidateFourierFftPolicies} from './resampling-fourier-fft-policy.js';
export const fourierFftPolicy=(params,backend,count)=>backend==='webgpu'&&count>=65536&&(params.gamma===0||params.gamma>=1)?'DD-fft-v1':'native-fft-v1';
const retirementFor=owner=>({dispose(){return owner.release();}});

// Retained input planes remain complete. No window, axis, precision parameter
// or source domain is reduced to fit the optional graphics transport.
export async function createStoredFourierGpuSpectrum(cache,input,{budget,backend,params,signal,cooperate,onFallback,onSubmitted,deferReadbackAck=true,gpuFactory=b=>new FourierFftGpu(b)}={}){
 const side=input.width,count=side*side;if(input.height!==side||fourierFftPolicy(params,backend,count)!=='DD-fft-v1')return null;
 let fee;try{fee=budget.reserve(count*8);}catch(error){if(error?.code==='MEMORY_LIMIT'){onFallback?.(error.code);return null;}throw error;}
 let inputOwner,inputRetirement,provider,spectrum,failed=false,primary;
 try{
  const values=await input.read(0,0,side,side,{signal,cooperate}),owners=[];inputOwner=ownGpuArrays({values},fee,owners,budget);fee=null;inputRetirement=retirementFor(inputOwner);cache.pendingRetirements.add(inputRetirement);owners.push({bytes:values.byteLength,release:budget.registerBacking?.('array-buffer',values.byteLength,{owner:'resampling-fourier',label:'fourier-FFT-prepared-copy',identity:values.buffer})});
  provider=gpuFactory(budget);const priorLossObserver=provider.onDeviceLost;provider.onDeviceLost=()=>{try{priorLossObserver?.();}finally{invalidateFourierFftPolicies(budget);}};cache.pendingRetirements.add(provider);
  try{spectrum=await provider.transform(inputOwner.values,side,{resident:true,deferReadbackAck,signal,onSubmitted});}
  catch(error){if(!provider.mayFallback(error))throw error;try{await provider.dispose();cache.pendingRetirements.delete(provider);}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}checkAbort(signal);onFallback?.(error.code);return null;}
  cache.pendingRetirements.delete(provider);return spectrum;
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  let cleanupFailed=false,cleanup;const attempt=async fn=>{try{await fn();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}};
  await attempt(async()=>{if(inputRetirement){await inputRetirement.dispose();cache.pendingRetirements.delete(inputRetirement);}else fee?.();});
  if(failed||cleanupFailed){if(provider){cache.pendingRetirements.add(provider);await attempt(async()=>{await provider.dispose();cache.pendingRetirements.delete(provider);});}}
  if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
 }
}
export async function writeStoredFourierGpuMagnitude(cache,spectrum,params,target,{budget,signal,cooperate,blockPixels=65536}={}){
 if(spectrum?.kind!=='fourier-DD-gpu')return null;
 let output,retirement,failed=false,primary;
 try{
  try{output=await spectrum.owner.magnitude({center:params.center,highpass:params.highpass,signal});}
  catch(error){if(!spectrum.owner.mayFallback(error))throw error;return {fallback:error.code};}
  retirement=retirementFor(output);cache.pendingRetirements.add(retirement);
  // Fractional gamma below one is excluded before FFT admission. A retained
  // near-zero highpass field can still amplify roundoff after normalization;
  // preserve the native FFT instead of clipping or painting those values.
  const scale=params.rescale?1:output.high>output.low?1/(output.high-output.low):0,errorEnvelope=output.errorBound*(2*params.gamma+1)*scale;
  if(errorEnvelope>5e-5)return {fallback:'GPU_PRECISION',errorEnvelope};
  const side=output.outputSide,rows=Math.max(1,Math.floor(blockPixels/side));
  for(let y=0;y<side;y+=rows){checkAbort(signal);await cooperate?.();const h=Math.min(rows,side-y);await target.write(output.values.subarray(y*side,(y+h)*side),0,y,side,h,{signal,cooperate});checkAbort(signal);}
  return {low:output.low,high:output.high,errorBound:output.errorBound,metrics:{...output.metrics,fourierNumericalEnvelope:errorEnvelope}};
 }catch(error){failed=true;primary=error;throw error;}
 finally{if(output)try{await output.release();cache.pendingRetirements.delete(retirement);}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
