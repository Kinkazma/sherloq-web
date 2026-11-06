// Optional bounded WebGPU initializer. The native Float64 solve certifies the
// result after the seed has been copied and its external owner has retired.
import {createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {runGridGpuSeed} from './target-grid-gpu-guarded.mjs';
import {runGridGpuBlockSeed} from './target-grid-gpu-block.mjs';
import {runGridGpuSchwarzSeed} from './target-grid-gpu-schwarz.mjs';
import {runGridGpuPdhgSeed} from './target-grid-gpu-pdhg.mjs';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const optionalFailures=new Set(['GPU_UNAVAILABLE','GPU_LIMIT','GPU_MEMORY','GPU_VALIDATION','GPU_SHADER','MEMORY_LIMIT','MEMORY_ALLOCATION']);
export function createBoundedGpuInitializer({mode='auto',seedMode='schwarz',iterations,windowBytes,segmentBytes=32*1024**2,bandRows,haloRows=8,momentum=.95,pairComponents=true,minimumSavedLaneWork=1800000000,sweeps=1,bulkSeedTransfers=true,batchIterations=128,pdhgInitialTauScale=1}={}){
 if(![1,4,16,64].includes(pdhgInitialTauScale))throw fail('INVALID_INPUT','Unsupported explicit PDHG initial primal scale.');
 if(!['auto','required'].includes(mode)||!['scalar','block','schwarz','pdhg','conditioned'].includes(seedMode)||typeof bulkSeedTransfers!=='boolean'||!Number.isInteger(batchIterations)||batchIterations<1||batchIterations>512)throw fail('INVALID_INPUT','Invalid GPU initializer policy.');
 return async({source,preparation,graph,budget,micro,precision,onProgress,signal,seedDestination,smallPalette})=>{
  if(signal?.aborted)throw fail('CANCELLED','GPU initializer cancelled.');
  // Experimental seed preconditioning only. Capture the native preparation
  // before any await; the common F64 solve/certificate remains authoritative.
  const minGap=seedMode==='conditioned'?preparation.minNeighborGap:null,weak=seedMode==='conditioned'?preparation.weakScale:null;
  const validGap=Number.isFinite(minGap)&&minGap>0&&Number.isFinite(weak)&&weak>0,minRatio=validGap?minGap/weak:null;
  const pixels=seedMode==='conditioned'?source.width*source.height:null,components=seedMode==='conditioned'?preparation.components:null;
  const validDensity=Number.isSafeInteger(pixels)&&pixels>0&&Number.isSafeInteger(components)&&components>0&&components<=pixels,componentDensity=validDensity?components/pixels:null;
  // The original stiffness predicate remains sufficient. A dense quotient
  // additionally pays the split native workspace above C=6N/8; its stricter
  // seed is selected by this graph property independently of absolute image size.
  const originalCondition=validGap&&Number.isFinite(minRatio)&&minRatio<1/8;
  const denseCondition=validGap&&Number.isFinite(minRatio)&&validDensity&&components>.75*pixels&&minRatio<.5;
  const selectedMode=seedMode==='conditioned'?(originalCondition||denseCondition?'pdhg':'schwarz'):seedMode;
  const selectionMetrics=seedMode==='conditioned'?{requestedSeedMode:'conditioned',seedMode:selectedMode,selectedMode,seedSelection:{criterion:'min-positive-neighbor-gap / weakScale < 1/8 OR (componentDensity > 3/4 AND ratio < 1/2)',threshold:1/8,denseThreshold:.75,denseRatioThreshold:.5,minNeighborGap:Number.isFinite(minGap)&&minGap>0?minGap:null,weakScale:Number.isFinite(weak)&&weak>0?weak:null,minRatio:Number.isFinite(minRatio)?minRatio:null,componentDensity,originalCondition,denseCondition,reason:originalCondition?'native-gap-ratio-below-1/8':denseCondition?'dense-component-graph-and-gap-ratio-below-1/2':validGap&&Number.isFinite(minRatio)?'schwarz-graph-conditioning-candidate':'missing-or-invalid-native-gap'}}:{};
  const run=selectedMode==='pdhg'?runGridGpuPdhgSeed:selectedMode==='block'?runGridGpuBlockSeed:selectedMode==='schwarz'?runGridGpuSchwarzSeed:runGridGpuSeed;
  // Preserve the public facade's existing512 iteration palette shortcut
  // when the experimental tag actually selects the same Schwarz kernel.
  const selectedIterations=seedMode==='conditioned'&&selectedMode==='schwarz'&&smallPalette&&micro===1&&precision==='1e-2'&&iterations===undefined?512:iterations;
  if(!preparation.edges)return{metrics:{...selectionMetrics,actualGpuWork:false,reason:'no-edges'},release(){}};
  // A few graph unknowns are cheaper to solve directly than a dense pixel GPU
  // seed. This applies to every image size and keeps the same native solver
  // and certificate. Explicit WebGPU requests still require the accelerator.
  if(mode==='auto'&&preparation.components<=16)return{metrics:{...selectionMetrics,actualGpuWork:false,reason:'compact-native-graph',components:preparation.components,edges:preparation.edges},release(){}};
  if(!globalThis.navigator?.gpu){if(mode==='required')throw fail('GPU_UNAVAILABLE','WebGPU unavailable');return{metrics:{...selectionMetrics,actualGpuWork:false,reason:'GPU_UNAVAILABLE'},release(){}};}
  let bank,views,gpuResult,retired=false;
  const cleanup=()=>{if(retired)return;if(gpuResult){gpuResult.release();gpuResult=null;}if(bank){bank.dispose();bank=null;}views=null;graph=null;retired=true;};
  try{
   const length=source.width*source.height,borrowed=seedDestination!=null;let per;
   if(borrowed){if(seedDestination.length!==length||typeof seedDestination.get!=='function'||typeof seedDestination.set!=='function')throw fail('INVALID_INPUT','A native-length borrowed seed destination is required.');}
   else{bank=await createResidentArray(Uint32Array,length,{budget,segmentBytes,signal,label:'bounded GPU seed'});views=bank.segments.map(a=>new Float32Array(a.buffer,a.byteOffset,a.length));per=bank.segmentElements;}
   const locate=i=>{if(retired)throw fail('DISPOSED','GPU initializer seed retired');if(!Number.isSafeInteger(i)||i<0||i>=length)throw fail('INVALID_INPUT','GPU seed pixel out of range');};
   // A supplied destination remains owned by its native caller. Its owner must
   // keep it live through initial-seed ingestion; this initializer only borrows
   // the already-funded storage and retires its own GPU resources.
   const seed=borrowed?{get(i){locate(i);return seedDestination.get(i);},set(i,value){locate(i);seedDestination.set(i,value);}}:{get(i){locate(i);return views[Math.floor(i/per)][i%per];},set(i,value){locate(i);views[Math.floor(i/per)][i%per]=value;}};
   if(bulkSeedTransfers&&borrowed&&typeof seedDestination.readInto==='function')seed.readInto=(target,first=0)=>{if(retired)throw fail('DISPOSED','GPU initializer seed retired');return seedDestination.readInto(target,first);};
   if(bulkSeedTransfers&&borrowed&&typeof seedDestination.writeSpan==='function')seed.writeSpan=(first,values)=>{if(retired)throw fail('DISPOSED','GPU initializer seed retired');return seedDestination.writeSpan(first,values);};
   if(bulkSeedTransfers&&!borrowed){
    const span=(first,values)=>{if(retired)throw fail('DISPOSED','GPU initializer seed retired');if(!(values instanceof Float32Array)||!Number.isSafeInteger(first)||first<0||first>length-values.length)throw fail('INVALID_INPUT','Invalid GPU seed span');};
    seed.readInto=(target,first=0)=>{span(first,target);for(let at=0;at<target.length;){const pixel=first+at,segment=views[Math.floor(pixel/per)],offset=pixel%per,count=Math.min(target.length-at,segment.length-offset);target.set(segment.subarray(offset,offset+count),at);at+=count;}return target;};
    seed.writeSpan=(first,values)=>{span(first,values);for(let at=0;at<values.length;){const pixel=first+at,segment=views[Math.floor(pixel/per)],offset=pixel%per,count=Math.min(values.length-at,segment.length-offset);segment.set(values.subarray(at,at+count),offset);at+=count;}};
   }
   gpuResult=await run({width:source.width,height:source.height,levelAt:i=>source.maxAt(i),...(typeof graph?.readLevelSpan==='function'?{readLevelSpan:(target,first)=>graph.readLevelSpan(target,first)}:{}),graph,median:preparation.median,weakScale:preparation.weakScale,normalizer:preparation.normalizer},micro,{seed,iterations:selectedIterations??(micro===0&&precision==='1e-2'?4096:1024),windowBytes:windowBytes??Math.floor(Math.max(0,budget.limit-budget.total())*.8),segmentBytes,bandRows:bandRows??source.height,haloRows,momentum,pairComponents,minimumSavedLaneWork,sweeps,batchIterations,pdhgInitialTauScale,onProgress,signal,reserve:n=>budget.reserve(n)});
   return{initial:borrowed?seedDestination:seed,metrics:{...gpuResult.metrics,...selectionMetrics,seedMode:selectedMode,seedBytes:borrowed?0:4*length,seedCapacityBytes:4*length,seedStorage:borrowed?'borrowed-native-f32-scratch':'owned-segmented-bank'},release:cleanup};
  }catch(error){
   try{cleanup();}catch(cleanupError){const primary=error&&typeof error==='object'&&Object.isExtensible(error)?error:new AggregateError([error,cleanupError],'GPU initializer retirement failed.',{cause:error});primary.cleanupError=cleanupError;primary.retryCleanup=cleanup;throw primary;}
   const optionalFailure=optionalFailures.has(error?.code)||(error instanceof DOMException&&['NotSupportedError','OperationError'].includes(error.name));
   if(mode==='auto'&&optionalFailure&&!signal?.aborted&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup)return{metrics:{...selectionMetrics,actualGpuWork:false,reason:error.code??error.name},release(){}};
   throw error;
  }
 };
}
