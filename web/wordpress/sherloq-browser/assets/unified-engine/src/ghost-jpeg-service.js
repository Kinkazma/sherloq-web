import "../../runtime-context.js?v=0.30.0";
import {GhostJpegExactGpu as GhostJpegGpu} from './ghost-jpeg-exact-gpu.js';
import {checkAbort,EngineError,requireValue} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
import {ghostContextInputPlan,readGhostContextInput} from './ghost-context-input.js';
import {rolledRgbSurface} from './rolled-rgb-surface.js';
const services=new WeakMap();
export async function consumeGhostGpuResult(owned,consume){
 let value,failed=false,primary;
 try{value=await consume(owned);}catch(error){failed=true;primary=error;}
 try{await owned.release();}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else{failed=true;primary=cleanup;}}
 if(failed)throw primary;return value;
}
export function createGhostJpegService(budget,{createProvider=()=>new GhostJpegGpu(budget,{acknowledgeReadback:true})}={}){
 let provider,queue=Promise.resolve(),closed=false,lastFailure=null;const inputs=new Set();
 const beforeWork=async signal=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Ghost JPEG service closed.');if(provider?.closed||provider?.pending?.size||provider?.lost||provider?.retirementNeeded||provider?.orphanPipelineFees?.size){await provider.dispose();provider=null;checkAbort(signal);}for(const result of [...(provider?.pendingResults??[])])await result.release();for(const entry of [...inputs])await entry.release();checkAbort(signal);};
 return {
  run(image,qualities,{backend='cpu',signal,onSubmitted,onProgress}={}){
   // Automatic selection remains closed until measured complete-cost policy
   // qualification. No synthetic probe or user-agent rule is introduced.
   if(backend!=='webgpu')return Promise.resolve(null);
   requireValue(Array.isArray(qualities),'Native Ghost quality list required.');qualities=qualities.slice();
   const work=async()=>{
    await beforeWork(signal);if(!globalThis.navigator?.gpu)return null;
    try{provider??=createProvider();return await provider.run(image.data,image.width,image.height,qualities,{signal,onSubmitted,onProgress});}
    catch(error){checkAbort(signal);if(!provider?.mayFallback(error))throw error;lastFailure=error.code;try{await provider.dispose();provider=null;}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}return null;}
   };
   const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;
  },
  runSurface(surface,qualities,{backend='cpu',signal,onSubmitted,onProgress,phaseX=0,phaseY=0}={}){
   if(backend!=='webgpu')return Promise.resolve(null);requireValue(Array.isArray(qualities)&&qualities.length>0&&qualities.length<=101&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(!i||q>qualities[i-1])),'Ordered native Ghost qualities required.');qualities=qualities.slice();const inputPlan=ghostContextInputPlan(surface);
   const work=async()=>{
    await beforeWork(signal);if(!globalThis.navigator?.gpu)return null;let input,result,failed=false,primary,cleanupFailed=false,fallback=false;
    try{
     provider??=createProvider();await provider.initialize(signal);checkAbort(signal);
     const {width,height}=inputPlan,blocks=Math.ceil(width/8)*Math.ceil(height/8)+2*Math.ceil(width/16)*Math.ceil(height/16),cells=Math.floor(width/16)*Math.floor(height/16),sourceBytes=Math.ceil(inputPlan.rgbBytes/4)*4,bankBytes=blocks*256,resultBytes=qualities.length*cells*8,limits=provider.device.limits;
     const pipelineBytes=Math.max(0,3-provider.pipelines.size)*4*1024**2,minimumWorkspace=sourceBytes*2+bankBytes*2+resultBytes*4+195076*8*3+qualities.length*2304+2*1024**2;
     if([sourceBytes,bankBytes,resultBytes].some(bytes=>bytes>limits.maxStorageBufferBindingSize||bytes>limits.maxBufferSize)||inputPlan.totalBytes+pipelineBytes+minimumWorkspace>budget.limit-budget.total()){await provider.dispose();provider=null;return null;}
     // No pixel read precedes this admission. Only this already certified
     // context is rolled/materialized; excluded Original RGB is unreachable.
     input=await readGhostContextInput(rolledRgbSurface(surface,phaseX,phaseY,budget),{budget,signal,onProgress,registry:inputs});
     result=await provider.run(input.image.data,width,height,qualities,{signal,onSubmitted});
    }catch(error){failed=true;primary=error;fallback=!signal?.aborted&&!!provider?.mayFallback(error);}
    if((fallback||provider?.pending?.size)&&provider)try{await provider.dispose();provider=null;}catch(cleanup){cleanupFailed=true;if(failed)attachGpuCleanup(primary,cleanup);else{failed=true;primary=cleanup;}}
    if(!cleanupFailed&&input)try{await input.release();}catch(cleanup){cleanupFailed=true;if(failed)attachGpuCleanup(primary,cleanup);else{failed=true;primary=cleanup;}}
    if(failed||cleanupFailed){if(result)try{await result.release();}catch(cleanup){attachGpuCleanup(primary,cleanup);}if(fallback&&!cleanupFailed){lastFailure=primary.code;return null;}throw primary;}
    return result;
   };
   const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;
  },
  ownsResources(){return !!provider||inputs.size>0;},
  metrics(){return {gpuFallback:lastFailure};},
  async dispose(){closed=true;await queue;await provider?.dispose();provider=null;for(const entry of [...inputs])await entry.release();}
 };
}
export function getGhostJpegService(budget){let service=services.get(budget);if(!service){service=createGhostJpegService(budget);services.set(budget,service);}return service;}
export const hasGhostJpegResources=budget=>services.get(budget)?.ownsResources()??false;
export async function disposeGhostJpegService(budget){const service=services.get(budget);if(service){await service.dispose();if(services.get(budget)===service)services.delete(budget);}}
