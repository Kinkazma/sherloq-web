import {mayFallbackMedianGpu,drainMedianGpuRetirements,attachMedianCleanup} from './median-gpu-retirement.js';
import {EngineError,checkAbort} from './errors.js';
import {medianAnalyze,medianGeometry} from './median.js';
import {MEDIAN_FORMATS,MEDIAN_HEAP_LIMIT,medianBlockFeatures} from './median-features.js';
import {usefulBatchPlan,createUsefulBatchPolicy} from './useful-batch-policy.js';
import {createMedianFeaturesGpu} from './median-features-gpu.js';
const fallbackCodes=new Set(['GPU_UNAVAILABLE','GPU_FAILED','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION']);
export function medianGpuBatchPlan(featureCount,availableBytes){
 const format=MEDIAN_FORMATS[featureCount];if(!format||!Number.isSafeInteger(availableBytes)||availableBytes<0)return{batchSize:0};
 const [windows,levels]=format,layers=1+windows*levels,fields=2*layers+windows*levels;
 // Exact live GPU extents: stack+readback, horizontal/output/map-readback,
 // packed upload and returned features. Fixed allowance covers native heap,
 // all pipelines, coefficient/uniform pages and small alignment headroom.
 const bytesPerBlock=layers*4096*4*2+fields*4096*8*3+4096*4+(featureCount+1)*8,fixedBytes=40*1024**2;
 return{batchSize:Math.max(0,Math.min(32,Math.floor((availableBytes-fixedBytes)/bytesPerBlock))),bytesPerBlock,fixedBytes,availableBytes};
}
// Shared only across the contexts of one invocation. All intermediate GPU
// resources close before publication; useful analysis grids keep their old owner.
export function createMedianGpuRunner({budget,backend='auto',signal}={}){
 let gpu,last,batchPlan,attempted=false,unavailable,unavailableFailure,hasUnavailableFailure=false,lastUseful,closed=false,busy=false,pending,closing,retired=false;
 const usefulTotals={runs:0,cpuBlocks:0,gpuBlocks:0,calibrationExecutions:0};
 const life=new AbortController(),combined=signal?AbortSignal.any([signal,life.signal]):life.signal;
 const closeGpu=async()=>{if(gpu){const owner=gpu;try{await owner.dispose();last=owner.stats;if(gpu===owner)gpu=null;}catch(error){last=owner.stats;throw error;}}};
 const closeAfterFailure=async primary=>{try{await closeGpu();}catch(cleanup){attachMedianCleanup(primary,cleanup);throw primary;}};
 async function runUseful(image,model,hooks,context,blocks){
  const desired=context.cpuKernel==='reference'?1:Math.min(32,context.medianPool?.profile.maxWorkers??1),plan=usefulBatchPlan(blocks,desired),policy=createUsefulBatchPolicy({totalWork:blocks,pageWork:plan.page});
  if(!plan.canObserveBoth){const value=context.medianPool?await context.medianPool.run(image,model,hooks):await medianAnalyze(image,model,{...hooks,fast:context.cpuKernel!=='reference'});lastUseful={...policy.snapshot(),plan,completedWork:blocks,cpuBlocks:blocks,gpuBlocks:0};usefulTotals.runs++;usefulTotals.cpuBlocks+=blocks;value.runtime={...value.runtime,backend:'cpu',usefulAuto:lastUseful};return value;}
  let initializedCpu=false,cpuWorkers=1,usedCpu=0,usedGpu=0;
  const pool=context.cpuKernel==='reference'?null:context.medianPool;
  async function cpu(blocks,featureCount,options){
   if(!initializedCpu){initializedCpu=true;if(pool){const bytes=MEDIAN_HEAP_LIMIT+256*1024,headroom=hooks.workerHeadroomBytes??0;cpuWorkers=Math.min(plan.concurrency,Math.max(1,Math.floor((budget.limit-budget.total()-headroom)/bytes)));if(cpuWorkers>1)try{pool.resize(cpuWorkers,bytes);}catch(error){pool.clear();cpuWorkers=1;if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;}}}
   const count=blocks.length/4096,free=budget.reserve(count*(featureCount+1)*8);let complete=false;
   try{let out;if(cpuWorkers>1)out=await pool.extractBatch(blocks,featureCount,options);else{const features=new Float64Array(count*featureCount),variances=new Float64Array(count);for(let at=0;at<count;at++){const result=await medianBlockFeatures(blocks.subarray(at*4096,(at+1)*4096),featureCount,{...options,fast:context.cpuKernel!=='reference'});features.set(result.features,at*featureCount);variances[at]=result.variance;}out={features,variances};}checkAbort(options.signal);complete=true;let live=true;return{...out,release(){if(live){live=false;free();}}};}finally{if(!complete)free();}
  }
  const extractBatch=async(blocks,featureCount,options)=>{
   const work=blocks.length/4096,chosen=policy.choose(work),at=performance.now();let out,actual=chosen;
   if(chosen==='webgpu'){
    if(!attempted){attempted=true;batchPlan=medianGpuBatchPlan(featureCount,Math.max(0,budget.limit-budget.total()));if(!globalThis.navigator?.gpu)unavailable={code:'GPU_UNAVAILABLE',message:'WebGPU unavailable'};else if(batchPlan.batchSize<work)unavailable={code:'GPU_HEADROOM',message:'Useful CPU owners have priority over optional GPU staging'};else try{gpu=await createMedianFeaturesGpu({budget,signal:options.signal});}catch(error){try{await drainMedianGpuRetirements(budget);}catch(cleanup){attachMedianCleanup(error,cleanup);throw error;}if(!mayFallbackMedianGpu(error))throw error;checkAbort(options.signal);unavailable={code:error.code,message:error.message};}}
    if(gpu)try{out=await gpu.extractBatch(blocks,featureCount,options);}catch(error){try{await drainMedianGpuRetirements(budget);}catch(cleanup){attachMedianCleanup(error,cleanup);throw error;}if(!mayFallbackMedianGpu(error))throw error;checkAbort(options.signal);unavailable={code:error.code,message:error.message};await closeAfterFailure(error);}
    if(!out){policy.refuse(unavailable?.code);actual='cpu';}
   }
   if(!out)out=await cpu(blocks,featureCount,options);
   let acknowledged=false;return{...out,async release(){if(acknowledged)return;await out.release?.();policy.observe(actual,{work,milliseconds:Math.max(Number.EPSILON,performance.now()-at)});if(actual==='webgpu')usedGpu+=work;else usedCpu+=work;acknowledged=true;}};
  };
  try{const value=await medianAnalyze(image,model,{...hooks,batchSize:plan.page,extractBatch});lastUseful={...policy.snapshot(),plan,cpuBlocks:usedCpu,gpuBlocks:usedGpu};usefulTotals.runs++;usefulTotals.cpuBlocks+=usedCpu;usefulTotals.gpuBlocks+=usedGpu;value.runtime={...value.runtime,workers:cpuWorkers,backend:usedGpu?'webgpu-cpu-useful-native-median-features':'cpu',kernel:'native-median-features-disjoint-useful-pages',usefulAuto:lastUseful,gpu:gpu?.stats??last??null,...(unavailable?{gpuFallback:unavailable}:{})};return value;}finally{if(initializedCpu&&pool)pool.clear();}
 }
 return{
  async run(image,model,hooks={},context={}){
   if(closed)throw new EngineError('DISPOSED','Median feature runner is closed');if(busy)throw new EngineError('BUSY','Median feature runner is busy');
   const selected=hooks.signal?AbortSignal.any([hooks.signal,combined]):combined;checkAbort(selected);const g=medianGeometry(image.width,image.height),blocks=g.blockColumns*g.blockRows;busy=true;let finish;pending=new Promise(r=>finish=r);
   const runCpu=async reason=>{const value=context.medianPool?await context.medianPool.run(image,model,{...hooks,signal:selected}):await medianAnalyze(image,model,{...hooks,signal:selected,fast:context.cpuKernel!=='reference'});value.runtime={...value.runtime,backend:'cpu',...(reason?{gpuFallback:reason}:{}),...(last?.calls?{retiredGpu:last}:{})};return value;};
   try{
    await drainMedianGpuRetirements(budget);checkAbort(selected);if(closed)throw new EngineError('DISPOSED','Median feature runner is closed');
    if(backend==='cpu'||!budget)return await runCpu();
    if(backend==='auto')return await runUseful(image,model,{...hooks,signal:selected},context,blocks);
    if(!attempted){attempted=true;
     if(!globalThis.navigator?.gpu)unavailable={code:'GPU_UNAVAILABLE',message:'WebGPU unavailable; original native features retained'};
     else if(!(batchPlan=medianGpuBatchPlan(model.metadata.features,Math.max(0,budget.limit-budget.total()))).batchSize)unavailable={code:'GPU_HEADROOM',message:'Owned model and original feature fallback have priority over optional GPU workspace'};
     else try{gpu=await createMedianFeaturesGpu({budget,signal:selected});}catch(error){try{await drainMedianGpuRetirements(budget);}catch(cleanup){attachMedianCleanup(error,cleanup);throw error;}if(!mayFallbackMedianGpu(error))throw error;checkAbort(selected);unavailableFailure=error;hasUnavailableFailure=true;unavailable={code:error.code??'GPU_UNAVAILABLE',message:error.message};}
    }
    if(!gpu){if(hasUnavailableFailure)throw unavailableFailure;throw new EngineError(unavailable?.code??'GPU_UNAVAILABLE',unavailable?.message??'The requested GPU median owner is unavailable');}
    try{
     const before=gpu.stats,value=await medianAnalyze(image,model,{...hooks,signal:selected,batchSize:batchPlan.batchSize,extractBatch:gpu.extractBatch.bind(gpu)}),after=gpu.stats;
     value.runtime={...value.runtime,workers:1,backend:after.backend,kernel:'exact-native-median-maps-webgpu-binary64',gpu:{...after,batchPlan,callBlocks:after.blocks-before.blocks,callGpuMs:after.gpuMs-before.gpuMs,callFinishMs:after.finishMs-before.finishMs,callCompileMs:after.compileMs-before.compileMs}};return value;
    }catch(error){if(!mayFallbackMedianGpu(error))throw error;checkAbort(selected);unavailable={code:error.code,message:error.message,replay:'same native blocks and original model; incomplete GPU analysis discarded'};await closeAfterFailure(error);throw error;}
   }finally{busy=false;finish();}
  },
  snapshot(){return{gpu:gpu?.stats??last??null,gpuFallback:unavailable??null,usefulAuto:lastUseful??null,usefulAutoTotals:{...usefulTotals}};},
  dispose(){if(retired)return closing??Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=(async()=>{await pending;await closeGpu();retired=true;})();closing=task;void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
