import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
import {markMedianGpuFailure,attachMedianCleanup,keepMedianGpuRetirement,forgetMedianGpuRetirement,retireMedianBuffer} from './median-gpu-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {requestStorageDevice} from './gpu-limits.js';
import {MEDIAN_FORMATS} from './median-features.js';
import {medianStackShader,medianGaussianShader,MEDIAN_GAUSSIAN_BITS} from './median-features-gpu-shaders.js';

// One bounded owner for native64x64 blocks. The GPU computes integer median
// chains and exact software-binary64 Gaussian maps. Native binary64 finishing
// and the existing tree classifier preserve the scientific feature contract.
export async function createMedianFeaturesGpu({budget,signal}={}){
 requireValue(budget?.reserve,'Median GPU requires shared budget');checkAbort(signal);
 const ownNative=e=>markMedianGpuFailure(e instanceof Error&&!e.code?new EngineError('GPU_FAILED',e.message,{cause:e}):e);
 const api=fn=>{try{return nativeGpuSync(fn,{signal});}catch(e){throw ownNative(e);}},asyncApi=async fn=>{try{return await nativeGpuAsync(fn,{signal});}catch(e){throw ownNative(e);}},reserve=n=>{try{return budget.reserve(n);}catch(e){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e?.code))markMedianGpuFailure(e);throw e;}},failure=(code,message)=>markMedianGpuFailure(new EngineError(code,message));
 const adapter=await asyncApi(()=>globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'}));
 if(!adapter)throw failure('GPU_UNAVAILABLE','Median WebGPU unavailable');
 let device,module,heap,layout,pipelineLayout;
 try{
  device=await asyncApi(()=>requestStorageDevice(adapter,{desiredBytes:128*1024**2,label:'median-features-binary64'}));
  heap=reserve(16*1024**2);
  const {default:create}=await import('../vendor/median-gpu-finish/finish.js');module=await create();checkAbort(signal);
  layout=api(()=>device.createBindGroupLayout({entries:[0,1,2,3,4,5].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:binding===5?{type:'uniform',hasDynamicOffset:true,minBindingSize:16}:{type:binding===3?'read-only-storage':'storage'}}))}));
  pipelineLayout=api(()=>device.createPipelineLayout({bindGroupLayouts:[layout]}));
 }catch(error){
  let destroyed=false,safe=!device,unregisterConstructor;
  const retire=async()=>{let failed=false,primary;const attempt=async fn=>{try{await fn();}catch(e){if(!failed){failed=true;primary=e;}}};if(device&&!destroyed)await attempt(()=>{api(()=>device.destroy());destroyed=true;});if(device&&!safe)await attempt(async()=>{try{await asyncApi(()=>device.queue.onSubmittedWorkDone());}catch(e){if(!destroyed||!device.lost)throw e;await device.lost;}safe=true;});if((!device||destroyed&&safe)&&heap){module=null;await attempt(async()=>{await heap();heap=null;});}if(failed)throw primary;if(device&&!destroyed||heap)throw failure('GPU_FAILED','Median constructor retirement is incomplete');await unregisterConstructor?.();unregisterConstructor=null;};
  keepMedianGpuRetirement(budget,retire);try{await retire();forgetMedianGpuRetirement(budget,retire);}catch(cleanup){attachMedianCleanup(error,cleanup);try{unregisterConstructor??=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await retire();forgetMedianGpuRetirement(budget,retire);return Math.max(0,before-budget.total());},{owner:'median',label:'failed-feature-constructor',allocationKind:'gpu'});}catch(secondary){attachMedianCleanup(error,secondary);}}throw error;
 }
 const scheduler=getExecutionScheduler(budget),buffers=new Map(),pipelines=new Map(),life=new AbortController();
 let disposed=false,lost=false,busy=false,pending,closing,retired=false,deviceDestroyed=false,deviceSafe=false,contextLost=false,needsRetirement=false,unregister;const jobRetirements=new Set(),failedResults=new Set(),orphanFees=new Set();
 const stats={calls:0,blocks:0,featureMs:0,gpuMs:0,finishMs:0,compileMs:0,uploadedBytes:0,readbackBytes:0,residentGpuBytes:0,bufferAllocations:0,bufferReuses:0};
 device.lost.then(()=>lost=true);
 const releaseBuffer=async entry=>{await retireMedianBuffer(entry,budget);if(!entry.countedRetired){stats.residentGpuBytes-=entry.size;entry.countedRetired=true;}};
 async function buffer(key,bytes,usage){
  const size=Math.max(4,Math.ceil(bytes/4)*4),old=buffers.get(key);
  if(size>device.limits.maxBufferSize||size>device.limits.maxStorageBufferBindingSize)throw failure('GPU_LIMIT','Median batch buffer exceeds device limit');
  if(old?.size>=size&&!old.destroyed){stats.bufferReuses++;return old.buffer;}
  if(old){buffers.delete(key);buffers.set('retiring/'+key,old);await releaseBuffer(old);buffers.delete('retiring/'+key);}
  const free=reserve(size);orphanFees.add(free);let value,entry;
  try{value=api(()=>device.createBuffer({size,usage}));entry={buffer:value,size,free};buffers.set(key,entry);orphanFees.delete(free);stats.residentGpuBytes+=size;entry.backing=budget.registerBacking?.('gpu',size,{owner:'median',label:key});stats.bufferAllocations++;return value;}
  catch(error){needsRetirement=true;if(!value)try{await free();orphanFees.delete(free);}catch(cleanup){attachMedianCleanup(error,cleanup);}throw error;}
 }
 async function pipeline(key,code,entryPoint='main'){
  if(pipelines.has(key))return pipelines.get(key).value;
  const free=reserve(2*1024**2),start=performance.now();orphanFees.add(free);
  try{const shader=api(()=>device.createShaderModule({code})),info=await asyncApi(()=>shader.getCompilationInfo());if(info.messages.some(v=>v.type==='error'))throw failure('GPU_FAILED',info.messages.filter(v=>v.type==='error').map(v=>v.message).join('\n'));const value=await asyncApi(()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module:shader,entryPoint}}));pipelines.set(key,{value,free});orphanFees.delete(free);stats.compileMs+=performance.now()-start;return value;}
  catch(error){try{await free();orphanFees.delete(free);}catch(cleanup){attachMedianCleanup(error,cleanup);}throw error;}
 }
 let service;const cleanup=()=>service.dispose();
 service={
  get stats(){return{...stats,heapBytes:heap?16*1024**2:0,pipelineBytes:pipelines.size*2*1024**2,backend:'webgpu-exact-binary64-median-features-native-finish'};},
  async extractBatch(blocks,featureCount,{signal}={}){
   if(disposed)throw new EngineError('DISPOSED','Median GPU is closed');if(busy)throw new EngineError('BUSY','Median GPU is busy');if(lost||needsRetirement)throw failure('GPU_FAILED','Median device requires retirement');
   requireValue(blocks instanceof Uint8Array&&blocks.length>0&&blocks.length%4096===0&&blocks.length<=32*4096&&Object.hasOwn(MEDIAN_FORMATS,featureCount),'Median GPU needs1..32 native gray64 blocks and a supported feature format');
   const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);busy=true;let finish;pending=new Promise(r=>finish=r);
   const start=performance.now(),count=blocks.length/4096,n=blocks.length,[windows,levels]=MEDIAN_FORMATS[featureCount],layers=1+windows*levels,fields=2*layers+windows*levels,stackBytes=layers*n*4,mapBytes=fields*n*8;
   const ptrs=[],mapped=[],backings=[];let uploadCredit,resultCredit,lease,mapping,submitted=false,complete=false,scopes=0,queueAck=false,failed=false,primary;
   const malloc=bytes=>{const ptr=module._malloc(bytes);if(!ptr)throw failure('MEMORY_ALLOCATION','Median native finishing workspace refused');ptrs.push(ptr);return ptr;};
   const retireJob=async()=>{
    let cleanupFailed=false,cleanupPrimary;const attempt=async fn=>{try{await fn();}catch(e){if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=e;}}};
    if(mapping)await attempt(async()=>{await mapping;mapping=null;});
    for(const value of [...mapped])await attempt(()=>{if(value.mapState==='mapped')api(()=>value.unmap());mapped.splice(mapped.indexOf(value),1);});
    if(!queueAck)await attempt(async()=>{if(!deviceSafe)await asyncApi(()=>device.queue.onSubmittedWorkDone());queueAck=true;});
    if(contextLost)scopes=0;else while(scopes){let accepted=false;await attempt(async()=>{let error;try{error=await asyncApi(()=>device.popErrorScope());}catch(e){if(!deviceDestroyed||!device.lost)throw e;await device.lost;contextLost=true;scopes=0;accepted=true;return;}scopes--;accepted=true;if(error)throw failure('GPU_FAILED',error.message);});if(!accepted)break;}
    if(queueAck&&!mapping&&!mapped.length&&!scopes){
     for(const free of [...backings])await attempt(async()=>{await free?.();backings.splice(backings.indexOf(free),1);});
     for(const ptr of [...ptrs])await attempt(()=>{module._free(ptr);ptrs.splice(ptrs.indexOf(ptr),1);});
     if(!backings.length&&!ptrs.length){if(uploadCredit)await attempt(async()=>{await uploadCredit();uploadCredit=null;});if(!complete&&resultCredit)await attempt(async()=>{await resultCredit();resultCredit=null;});if(!uploadCredit&&(!resultCredit||complete)&&lease)await attempt(async()=>{await lease.release();lease=null;});}
    }
    if(!cleanupFailed&&queueAck&&!mapping&&!mapped.length&&!scopes&&!backings.length&&!ptrs.length&&!uploadCredit&&(!resultCredit||complete)&&!lease)jobRetirements.delete(retireJob);
    if(cleanupFailed)throw cleanupPrimary;
   };jobRetirements.add(retireJob);
   try{
    resultCredit=reserve(count*(featureCount+1)*8);uploadCredit=reserve(n*4);
    const stack=await buffer('stack',stackBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC),horizontal=await buffer('horizontal',mapBytes,GPUBufferUsage.STORAGE),out=await buffer('maps',mapBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),weights=await buffer('weights',88,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),error=await buffer('error',4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),shape=await buffer('shape',(layers+1)*256,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readMaps=await buffer('read-maps',mapBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),readStack=await buffer('read-stack',stackBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),readError=await buffer('read-error',4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    lease=await scheduler.acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'median',label:'median-batched-native-features'});
    api(()=>device.pushErrorScope('validation'));scopes++;api(()=>device.pushErrorScope('out-of-memory'));scopes++;
    const medians=[];for(let w=0;w<windows;w++)medians.push(await pipeline('median/'+(w+1),medianStackShader(w+1)));
    const code=medianGaussianShader(windows,levels),hpipe=await pipeline('h/'+featureCount,code,'gaussianHorizontal'),vpipe=await pipeline('v/'+featureCount,code,'gaussianVertical');
    const uniform=new Uint32Array((layers+1)*64);let step=0;
    for(let w=0;w<windows;w++)for(let level=0;level<levels;level++){const target=1+w*levels+level;uniform.set([count,level?target-1:0,target,0],step++*64);}uniform.set([count,0,0,0],step*64);
    api(()=>device.queue.writeBuffer(stack,0,Uint32Array.from(blocks)));api(()=>device.queue.writeBuffer(weights,0,MEDIAN_GAUSSIAN_BITS));api(()=>device.queue.writeBuffer(shape,0,uniform));api(()=>device.queue.writeBuffer(error,0,new Uint32Array(1)));stats.uploadedBytes+=n*4+uniform.byteLength+92;await uploadCredit();uploadCredit=null;
    const group=api(()=>device.createBindGroup({layout,entries:[stack,horizontal,out,weights,error,shape].map((buffer,binding)=>({binding,resource:{buffer,...(binding===5?{offset:0,size:16}:{})}}))}));
    const encoder=api(()=>device.createCommandEncoder()),dispatch=(pipeline,groups,fieldCount,offset)=>{api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group,[offset]);pass.dispatchWorkgroups(groups,fieldCount);pass.end();});};step=0;
    for(let w=0;w<windows;w++)for(let level=0;level<levels;level++)dispatch(medians[w],Math.ceil(n/64),1,step++*256);
    dispatch(hpipe,Math.ceil(n/128),fields,step*256);dispatch(vpipe,Math.ceil(n/128),fields,step*256);
    api(()=>{encoder.copyBufferToBuffer(out,0,readMaps,0,mapBytes);encoder.copyBufferToBuffer(stack,0,readStack,0,stackBytes);encoder.copyBufferToBuffer(error,0,readError,0,4);});checkAbort(combined);
    const gpuStart=performance.now();api(()=>device.queue.submit([encoder.finish()]));submitted=true;
    mapping=Promise.allSettled([[readMaps,mapBytes],[readStack,stackBytes],[readError,4]].map(async([buffer,size])=>{await asyncApi(()=>buffer.mapAsync(GPUMapMode.READ,0,size));mapped.push(buffer);}));const states=await mapping;mapping=null;const rejected=states.find(v=>v.status==='rejected');if(rejected)throw rejected.reason;checkAbort(combined);
    for(const size of[mapBytes,stackBytes,4])backings.push(budget.registerBacking?.('gpu-mapped',size,{owner:'median',label:'median-feature-maps'}));
    if(new Uint32Array(api(()=>readError.getMappedRange(0,4)))[0])throw failure('GPU_LIMIT','Median Gaussian requested unchanged native arithmetic');
    const oom=await asyncApi(()=>device.popErrorScope());scopes--;const invalid=await asyncApi(()=>device.popErrorScope());scopes--;if(oom||invalid)throw failure(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);if(lost||needsRetirement)throw failure('GPU_FAILED','Median device requires retirement');
    stats.gpuMs+=performance.now()-gpuStart;stats.readbackBytes+=mapBytes+stackBytes+4;await lease.release();lease=null;
    lease=await scheduler.acquire({cpu:1,gpu:0,signal:combined,resourceOwner:'median',label:'median-native-binary64-feature-finish'});
    const finishStart=performance.now(),stackView=new Uint32Array(api(()=>readStack.getMappedRange(0,stackBytes))),mapView=new Float64Array(api(()=>readMaps.getMappedRange(0,mapBytes))),stackPtr=malloc(layers*4096*4),mapsPtr=malloc(fields*4096*8),outPtr=malloc(featureCount*8),variancePtr=malloc(8),features=new Float64Array(count*featureCount),variances=new Float64Array(count);
    for(let b=0;b<count;b++){
     checkAbort(combined);for(let field=0;field<layers;field++)module.HEAPU32.set(stackView.subarray(field*n+b*4096,field*n+(b+1)*4096),stackPtr/4+field*4096);
     for(let field=0;field<fields;field++)module.HEAPF64.set(mapView.subarray(field*n+b*4096,field*n+(b+1)*4096),mapsPtr/8+field*4096);
     const status=module._median_gpu_finish(stackPtr,mapsPtr,windows,levels,outPtr,variancePtr);if(status!==1)throw failure(status===-1?'MEMORY_ALLOCATION':'GPU_FAILED','Median native feature finish failed');
     features.set(module.HEAPF64.subarray(outPtr/8,outPtr/8+featureCount),b*featureCount);variances[b]=module.HEAPF64[variancePtr/8];
    }
    stats.finishMs+=performance.now()-finishStart;checkAbort(combined);stats.calls++;stats.blocks+=count;complete=true;let live=true,releasing;const result={features,variances,release(){if(!live)return releasing;if(releasing)return releasing;const task=(async()=>{await resultCredit();resultCredit=null;live=false;failedResults.delete(result);})();releasing=task;void task.catch(()=>{failedResults.add(result);retired=false;closing=null;}).catch(()=>{});void task.finally(()=>{if(live)releasing=null;}).catch(()=>{});return task;}};return result;
   }catch(error){failed=true;primary=error;needsRetirement=true;throw error;}
   finally{
    try{await retireJob();}catch(cleanup){needsRetirement=true;if(complete)complete=false;if(failed)attachMedianCleanup(primary,cleanup);else throw cleanup;}
    finally{stats.featureMs+=performance.now()-start;busy=false;finish();}
   }
  },
  dispose(){
   if(retired&&!failedResults.size)return closing??Promise.resolve();if(closing)return closing;disposed=true;life.abort();
   const task=(async()=>{await pending;let failed=false,primary;const attempt=async fn=>{try{await fn();}catch(e){if(!failed){failed=true;primary=e;}}};
    if(!deviceDestroyed)await attempt(()=>{api(()=>device.destroy());deviceDestroyed=true;});
    if(!deviceSafe)await attempt(async()=>{try{await asyncApi(()=>device.queue.onSubmittedWorkDone());}catch(e){if(!deviceDestroyed||!device.lost)throw e;await device.lost;contextLost=true;}deviceSafe=true;});
    for(const retire of [...jobRetirements])await attempt(retire);
    if(deviceSafe)for(const[key,value]of [...buffers])await attempt(async()=>{await releaseBuffer(value);buffers.delete(key);});
    if(deviceSafe&&deviceDestroyed)for(const[key,value]of [...pipelines])await attempt(async()=>{await value.free();pipelines.delete(key);});
    if(deviceSafe&&deviceDestroyed)for(const free of [...orphanFees])await attempt(async()=>{await free();orphanFees.delete(free);});
    for(const result of [...failedResults])await attempt(()=>result.release());
    if(!jobRetirements.size){module=null;if(heap)await attempt(async()=>{await heap();heap=null;});}
    if(!failed&&!buffers.size&&!pipelines.size&&!jobRetirements.size&&!failedResults.size&&!orphanFees.size&&!heap&&deviceDestroyed&&deviceSafe){await unregister?.();unregister=null;retired=true;forgetMedianGpuRetirement(budget,cleanup);}
    if(failed)throw primary;
   })();closing=task;void task.catch(()=>{keepMedianGpuRetirement(budget,cleanup);unregister??=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await cleanup();return Math.max(0,before-budget.total());},{owner:'median',label:'feature-retirement',allocationKind:'gpu'});}).catch(()=>{});void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;
  }
 };return service;
}
