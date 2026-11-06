// Optional bounded WebGPU initializer. The native Float64 solve certifies the
// result after the seed has been copied and its external owner has retired.
import {createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {runGridGpuSeed} from './target-grid-gpu-guarded.mjs';
import {runGridGpuBlockSeed} from './target-grid-gpu-block.mjs';
import {runGridGpuSchwarzSeed} from './target-grid-gpu-schwarz.mjs';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const optionalFailures=new Set(['GPU_UNAVAILABLE','GPU_LIMIT','GPU_MEMORY','GPU_VALIDATION','GPU_SHADER','MEMORY_LIMIT','MEMORY_ALLOCATION']);
export function createBoundedGpuInitializer({mode='auto',seedMode='schwarz',iterations=1024,windowBytes=64*1024**2,segmentBytes=32*1024**2,bandRows,haloRows=8,momentum=.95,pairComponents=true,sweeps=1}={}){
 if(!['auto','required'].includes(mode)||!['scalar','block','schwarz'].includes(seedMode))throw fail('INVALID_INPUT','Invalid GPU initializer policy.');
 const run=seedMode==='block'?runGridGpuBlockSeed:seedMode==='schwarz'?runGridGpuSchwarzSeed:runGridGpuSeed;
 return async({source,preparation,budget,micro,signal})=>{
  if(signal?.aborted)throw fail('CANCELLED','GPU initializer cancelled.');
  if(!preparation.edges)return{metrics:{actualGpuWork:false,reason:'no-edges'},release(){}};
  if(!globalThis.navigator?.gpu){if(mode==='required')throw fail('GPU_UNAVAILABLE','WebGPU unavailable');return{metrics:{actualGpuWork:false,reason:'GPU_UNAVAILABLE'},release(){}};}
  let bank,views,gpuResult,retired=false;
  const cleanup=()=>{if(retired)return;if(gpuResult){gpuResult.release();gpuResult=null;}if(bank){bank.dispose();bank=null;}views=null;retired=true;};
  try{
   bank=await createResidentArray(Uint32Array,source.width*source.height,{budget,segmentBytes,signal,label:'bounded GPU seed'});
   views=bank.segments.map(a=>new Float32Array(a.buffer,a.byteOffset,a.length));const length=bank.length,per=bank.segmentElements;
   const locate=i=>{if(retired)throw fail('DISPOSED','GPU initializer seed retired');if(!Number.isSafeInteger(i)||i<0||i>=length)throw fail('INVALID_INPUT','GPU seed pixel out of range');};
   const seed={get(i){locate(i);return views[Math.floor(i/per)][i%per];},set(i,value){locate(i);views[Math.floor(i/per)][i%per]=value;}};
   gpuResult=await run({width:source.width,height:source.height,levelAt:i=>source.maxAt(i),median:preparation.median,weakScale:preparation.weakScale,normalizer:preparation.normalizer},micro,{seed,iterations,windowBytes,segmentBytes,bandRows:bandRows??source.height,haloRows,momentum,pairComponents,sweeps,signal,reserve:n=>budget.reserve(n)});
   return{initial:seed,metrics:{...gpuResult.metrics,seedMode,seedBytes:4*length},release:cleanup};
  }catch(error){
   try{cleanup();}catch(cleanupError){const primary=error&&typeof error==='object'&&Object.isExtensible(error)?error:new AggregateError([error,cleanupError],'GPU initializer retirement failed.',{cause:error});primary.cleanupError=cleanupError;primary.retryCleanup=cleanup;throw primary;}
   const optionalFailure=optionalFailures.has(error?.code)||(error instanceof DOMException&&['NotSupportedError','OperationError'].includes(error.name));
   if(mode==='auto'&&optionalFailure&&!signal?.aborted&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup)return{metrics:{actualGpuWork:false,reason:error.code??error.name},release(){}};
   throw error;
  }
 };
}
