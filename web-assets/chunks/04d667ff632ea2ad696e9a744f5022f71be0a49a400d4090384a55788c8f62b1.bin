import "../../runtime-context.js?v=0.30.0";
import {createResamplingEmWorkerMath} from './resampling-em-worker-math.js';
import {acquireEmProductPolicy} from './resampling-em-policy.js';
import {createEmProductSelector} from './resampling-em-product-selector.js';
import {createResamplingEmGpu} from './resampling-em-gpu.js';
import {createResamplingEmGpuMath} from './resampling-em-gpu-math.js';
import {EngineError,requireValue,createCooperator,checkAbort} from './errors.js';
async function retireFailedConstructor(error){if(!error?.gpuCleanup)return;try{await error.gpuCleanup();}catch(cleanup){if(Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),cleanup];throw error;}}
const gpuRefusal=error=>['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(error?.code);
// One native global fit. GPU computes only independent native matrix products;
// a refused product is consumed exactly once by the original CPU arithmetic.
export async function resamplingEmGpuStage(gray,rect,size,plane,{budget,workingBytes,signal,onProgress,region=0,adaptive=false,policyProfile='default',gpuFactory=createResamplingEmGpu,mathFactory}={}){
 const[x0,y0,x1,y1]=rect,width=x1-x0,height=y1-y0,cols=width-size+1,n=cols*(height-size+1);requireValue(Number.isSafeInteger(workingBytes)&&workingBytes>0,'An admitted native EM workspace is required.');
 const release=budget.reserve(workingBytes),cooperate=createCooperator(signal);let gpu,math,primary,hasPrimary=false,gpuMetrics,gpuFallbackReason,gpuDisabled=false,policy,selector;const acceptedGpu={calls:0,gramCalls:0,productCalls:0};
 try{
  if(adaptive){try{policy=await acquireEmProductPolicy({budget,width,height,size,profile:policyProfile,signal});}catch(error){checkAbort(signal);if(!gpuRefusal(error))throw error;return null;}if(!policy)return null;selector=policy.selector;if(policy.reused&&['gram','product'].every(mode=>selector.choose(mode,Math.min(8192,n))==='cpu'))return{preferWholeCpu:true,productSelection:selector.snapshot(),productPolicyReused:true,productPolicyCacheable:policy.cacheable,productPolicyBasis:policy.basis,productPolicyCpuPreferred:policy.cpuPreferred};}
  if(!adaptive)try{gpu=await gpuFactory({budget,signal});}catch(error){await retireFailedConstructor(error);checkAbort(signal);if(!gpuRefusal(error))throw error;return null;}
  const background=adaptive&&(!policy.reused||['gram','product'].some(mode=>selector.choose(mode,8192)!=='webgpu')),makeMath=mathFactory??(background?createResamplingEmWorkerMath:createResamplingEmGpuMath);try{math=await makeMath({budget});}catch(error){if(error?.emMathCleanup)math={dispose:error.emMathCleanup};throw error;}await math.create(width,height,size);checkAbort(signal);let state,minimum=Infinity,maximum=-Infinity,jobs=0;
  for(let iteration=0;iteration<100;iteration++){
   for(let phase=0;phase<2;phase++){
    let inverse;
    for(let first=0;first<n;first+=8192){if(math.background)checkAbort(signal);else await cooperate();const count=Math.min(8192,n-first),top=Math.floor(first/cols),bottom=Math.floor((first+count-1)/cols)+size,values=await gray.read(x0,y0+top,width,bottom-top,{signal});
     if(iteration===0&&phase===0)for(const v of values){requireValue(Number.isFinite(v),'Non-finite EM source.');minimum=Math.min(minimum,v);maximum=Math.max(maximum,v);}
     let weights;if(phase){weights=new Float64Array(count);await plane.store.readInto(new Uint8Array(weights.buffer),first*8);}
     const result=await math.batch(values,first,count,top,weights??null);checkAbort(signal);let product,gpuObservation;
     try{
      const mode=phase?'product':'gram',useGpu=!gpuDisabled&&count>=256&&(!selector||selector.choose(mode,count)==='webgpu');
      const gpuPathStarted=performance.now();if(useGpu&&!gpu)try{gpu=await gpuFactory({budget,signal,adapter:policy?.takeAdapter()});}catch(error){await retireFailedConstructor(error);checkAbort(signal);if(!gpuRefusal(error))throw error;policy?.invalidate();gpuFallbackReason=error.code;gpuDisabled=true;}
      if(useGpu&&gpu){try{if(phase&&!inverse)inverse=await math.inverse();product=await gpu.run(mode,values,phase?inverse:result,{width,height,size,first,count,top},{signal,...(!phase?{carry:await math.gramCarry()}:{})});await math.accept(product.values,product.blocks);checkAbort(signal);acceptedGpu.calls++;acceptedGpu[phase?'productCalls':'gramCalls']++;gpuObservation={mode,count,started:gpuPathStarted,compilation:product.compilationMilliseconds??0};}catch(error){checkAbort(signal);if(!gpuRefusal(error))throw error;gpuFallbackReason=error.code;gpuMetrics=gpu.metrics;if(error.code==='GPU_LIMIT')selector?.refuse(mode);else{policy?.invalidate();await gpu.dispose();gpu=null;gpuDisabled=true;}const nativeAt=performance.now();await math.acceptCpu();checkAbort(signal);selector?.native(mode,count,performance.now()-nativeAt);}}
      else{const nativeAt=performance.now();await math.acceptCpu();checkAbort(signal);selector?.native(mode,count,performance.now()-nativeAt);}

     }finally{product?.release();}if(gpuObservation)selector?.gpu(gpuObservation.mode,gpuObservation.count,performance.now()-gpuObservation.started-gpuObservation.compilation);
     jobs++;if(!phase)await plane.store.write(new Uint8Array(result.buffer,result.byteOffset,result.byteLength),first*8);
     onProgress?.({phase:phase?'em-coefficients':'em-weights',region,iteration:iteration+1,completed:first+count,total:n});
    }
    if(iteration===0&&phase===0&&minimum===maximum)throw new EngineError('NUMERIC_RANGE','The selected region has no usable intensity variation.');
    state=await math.finish();checkAbort(signal);
   }
   onProgress?.({phase:'em-iteration',region,completed:state.iterations,total:100});if(state.status!==1)break;
  }
  checkAbort(signal);await plane.store.flush();checkAbort(signal);gpuMetrics=gpu?.metrics??gpuMetrics;return{iterations:state.iterations,converged:state.status===2,heapBytes:math.heapBytes(),completedStripJobs:jobs,preflightExecutions:0,nativeMathTransport:math.transport??'local',backend:acceptedGpu.calls?'webgpu':'cpu',gpuCalls:acceptedGpu.calls,gpuGramCalls:acceptedGpu.gramCalls,gpuProductCalls:acceptedGpu.productCalls,gpuAttemptedCalls:gpuMetrics?.calls??0,gpuMilliseconds:gpuMetrics?.milliseconds??0,...(selector?{productSelection:selector.snapshot(),productPolicyReused:policy.reused,productPolicyCacheable:policy.cacheable,productPolicyBasis:policy.basis,productPolicyCpuPreferred:policy.cpuPreferred}:{}),...(gpuFallbackReason?{gpuFallbackReason}:{})};
 }catch(error){hasPrimary=true;primary=error;throw error;}finally{
  const pendingOwners=new Set([gpu,math].filter(Boolean));let unregister,workspaceReleased=false;
  const retire=async()=>{const errors=[];for(const value of [...pendingOwners])try{await value.dispose();pendingOwners.delete(value);}catch(error){errors.push(error);}if(!pendingOwners.has(math)&&!workspaceReleased){release();workspaceReleased=true;}if(!pendingOwners.size){unregister?.();unregister=null;}if(errors.length)throw errors[0];};
  let cleanup,hasCleanup=false;try{await retire();}catch(error){hasCleanup=true;cleanup=error;unregister=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await retire();return Math.max(0,before-budget.total());},{owner:'resampling-em-stage',label:'native-worker-or-device-retirement',allocationKind:'working'});}
  if(!hasPrimary&&!hasCleanup&&!signal?.aborted)policy?.commit();policy?.release();if(hasCleanup){if(hasPrimary){if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}else throw cleanup;}if(!hasPrimary)checkAbort(signal);
 }
}
