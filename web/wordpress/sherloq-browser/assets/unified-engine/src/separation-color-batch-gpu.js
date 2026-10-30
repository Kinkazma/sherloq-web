import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {separationFilterShader} from './separation-filter-gpu-shaders.js';
import {planSeparationColorBatch} from './separation-color-batch-plan.js';
const HEAP=64*1024**2,PIPELINE=2*1024**2;
const ack=async f=>{const r=await f?.();if(r===0||r===false)throw new EngineError('BUSY','Colour owner retirement has not acknowledged');};
export async function createSeparationColorBatchGpu({budget,signal,operation=(_label,work)=>work(),moduleFactory}={}){
 requireValue(budget?.reserve,'Colour batching requires the shared budget');checkAbort(signal);
 const scheduler=getExecutionScheduler(budget),pool=new WaveletStripPool(budget,{resourceOwner:'separation',workerFactory:null}),life=new AbortController();
 let device,module,heap,pipelineFee,layout,pipelineLayout,pipeline,closing,closed=false,retired=false,destroyed=false,lost=false,lostAck=false,queueSafe=false,pending;
 const buffers=new Map(),jobs=new Set(),results=new Set();
 const stats={calls:0,batchCalls:0,dispatches:0,maps:0,uploadedBytes:0,readbackBytes:0,nativePreparationMs:0,gpuWallMs:0,pipelineCompilationMs:0,bufferAllocations:0,bufferReuses:0,residentGpuBytes:0,precisionRepairs:0,precisionFallbacks:0};
 const reserve=n=>{if(n>budget.limit-budget.total())throw new EngineError('MEMORY_LIMIT','Colour transport headroom is unavailable');return budget.reserve(n);};
 const api=f=>nativeGpuSync(f),asyncApi=f=>nativeGpuAsync(f);
 const attempts=async actions=>{let failed=false,primary;for(const f of actions)try{await f();}catch(e){if(!failed){failed=true;primary=e;}else appendWaveletCleanup(primary,e);}if(failed)throw primary;};
 let initialized;const constructionDone=new Promise(resolve=>initialized=resolve);
 const owner=pool.ownCleanup(close);
 async function retireBuffer(e){
  if(!e.destroyed){api(()=>e.buffer.destroy());e.destroyed=true;}
  if(!e.backingAck){const bytes=await e.backing?.();if(e.backing&&e.size>0&&(bytes===0||bytes===false))throw new EngineError('BUSY','Colour GPU backing remains pinned');e.backingAck=true;if(bytes)budget.notifyBackingRelease?.('gpu',bytes);}
  if(e.free){await ack(e.free);e.free=null;}
 }
 async function buffer(key,size,usage){
  size=Math.max(4,Math.ceil(size/4)*4);const old=buffers.get(key);if(old&&!old.destroyed&&old.size>=size){stats.bufferReuses++;return old.buffer;}
  if(old){await retireBuffer(old);buffers.delete(key);stats.residentGpuBytes-=old.size;}
  // Record precedes reserve/create/backing. Every partial state remains owned.
  const e={size,buffer:null,free:null,backing:null,destroyed:false,backingAck:false};buffers.set(key,e);
  e.free=reserve(size);try{e.buffer=api(()=>device.createBuffer({size,usage}));e.backing=budget.registerBacking?.('gpu',size,{owner:'separation',label:'colour-batch/'+key});stats.bufferAllocations++;stats.residentGpuBytes+=size;return e.buffer;}
  catch(error){if(!e.buffer)e.destroyed=true;throw error;}
 }
 async function getPipeline(p){
  const key=[p.radius,+p.grayscale].join('/');if(pipeline?.key===key)return pipeline.value;
  if(pipeline)throw new EngineError('INVALID_PARAMETER','Colour batch parameters changed within their owner');
  pipelineFee=reserve(PIPELINE);const at=performance.now(),shader=api(()=>device.createShaderModule({code:separationFilterShader({...p,pass:'main'})})),info=await asyncApi(()=>shader.getCompilationInfo());
  if(info.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED',info.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n'));
  pipeline={key,value:await asyncApi(()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module:shader,entryPoint:'main'}}))};stats.pipelineCompilationMs+=performance.now()-at;return pipeline.value;
 }
 async function close(){
  if(retired)return;if(closing)return closing;closed=true;life.abort();
  const task=(async()=>{await constructionDone;await pending;let failed=false,primary;const attempt=async f=>{try{await f();}catch(e){if(!failed){failed=true;primary=e;}else appendWaveletCleanup(primary,e);}};
   if(device&&!destroyed)await attempt(()=>{api(()=>device.destroy());destroyed=true;});
   if(device&&!queueSafe)await attempt(async()=>{try{await asyncApi(()=>device.queue.onSubmittedWorkDone());}catch(e){if(!destroyed||!device.lost)throw e;await device.lost;lostAck=true;}queueSafe=true;});
   if(device&&destroyed&&!lostAck)await attempt(async()=>{await device.lost;lostAck=true;});
   for(const retire of [...jobs])await attempt(retire);
   if(!device||queueSafe&&destroyed&&lostAck){for(const [key,e]of [...buffers])await attempt(async()=>{if(!e.buffer)e.destroyed=true;await retireBuffer(e);buffers.delete(key);stats.residentGpuBytes=Math.max(0,stats.residentGpuBytes-e.size);});}
   for(const result of [...results])await attempt(()=>result.release());
   if(!jobs.size&&!buffers.size&&(!device||queueSafe&&destroyed&&lostAck)){if(pipelineFee)await attempt(async()=>{await ack(pipelineFee);pipelineFee=null;pipeline=null;});if(heap)await attempt(async()=>{await ack(heap);heap=null;module=null;});}
   if(failed)throw primary;retired=!jobs.size&&!buffers.size&&!results.size&&!pipelineFee&&!heap;
  })();closing=task;void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;
 }
 const service={get stats(){return{...stats,backend:'webgpu-native-color-coefficients',nativeHeapBytes:heap?HEAP:0,pipelineBytes:pipelineFee?PIPELINE:0,tableBytes:0};},
  dispose:()=>owner.retire(),
  async run(image,p,start,rows,hooks={}){
   const result=await service.runWindows([{width:image.width,height:image.height,start,rows,membership:!!hooks.membership}],p,{...hooks,prepare:()=>[{image,start,rows,hooks}]});if(!result)return null;return result.entries[0];
  },
  async runWindows(shapes,p,{signal:callSignal,prepare}={}){
   requireValue(!closed&&!pending,'Colour GPU owner is unavailable');requireValue(p.mode===0&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=10&&typeof p.grayscale==='boolean'&&typeof prepare==='function','Native median colour transport required');
   const selected=AbortSignal.any([life.signal,...(signal?[signal]:[]),...(callSignal?[callSignal]:[])]);checkAbort(selected);if(lost)throw new EngineError('GPU_FAILED','Colour GPU device lost');
   const plan=planSeparationColorBatch(shapes,{limits:device.limits,availableBytes:budget.limit-budget.total()-(pipelineFee?0:PIPELINE)});if(!plan)return null;
   let finish;pending=new Promise(resolve=>finish=resolve);let lease,mapping,read,mapped=false,queueAck=true,scopes=0,mappedFee,backing,backingAck=false,outputFee,metadataFee,complete=false,failed=false,primary;const pointers=new Set();
   const malloc=n=>{const record={ptr:0};pointers.add(record);record.ptr=module._malloc(Math.max(8,n));if(!record.ptr)throw new EngineError('MEMORY_ALLOCATION','Native colour batch allocation refused');return record.ptr;};
   const releasePointer=ptr=>{const record=[...pointers].find(record=>record.ptr===ptr);if(ptr)module._free(ptr);pointers.delete(record);};
   const retireJob=async()=>{
    const actions=[];
    if(mapping)actions.push(async()=>{try{await mapping;}catch{}mapping=null;});
    actions.push(async()=>{if(read?.mapState==='mapped'){api(()=>read.unmap());mapped=false;}});
    actions.push(async()=>{if(!queueAck){if(!queueSafe)await asyncApi(()=>device.queue.onSubmittedWorkDone());queueAck=true;}});
    actions.push(async()=>{if(lostAck){scopes=0;return;}while(scopes){const error=await asyncApi(()=>device.popErrorScope());scopes--;if(error)throw new EngineError('GPU_FAILED',error.message);}});
    await attempts(actions);
    if(!queueAck||mapping||read?.mapState==='mapped'||scopes)return;
    await attempts([async()=>{if(!backingAck){const n=await backing?.();if(backing&&n===0)throw new EngineError('BUSY','Colour map backing remains pinned');backingAck=true;}},async()=>{if(backingAck&&mappedFee){await ack(mappedFee);mappedFee=null;}},...([...pointers].map(record=>()=>releasePointer(record.ptr))),async()=>{if(metadataFee){await ack(metadataFee);metadataFee=null;}},async()=>{if(!complete&&outputFee){await ack(outputFee);outputFee=null;}},async()=>{if(lease){await ack(()=>lease.release());lease=null;}}]);
    if(!pointers.size&&!mappedFee&&!metadataFee&&(!outputFee||complete)&&!lease)jobs.delete(retireJob);
   };jobs.add(retireJob);
   let entryResults;
   try{
    // All optional GPU/host allocations precede the source preparation callback.
    outputFee=reserve(plan.outputBytes);metadataFee=reserve(plan.metadataBytes);mappedFee=reserve(plan.mappedBytes);
    lease=await scheduler.acquire({cpu:0,gpu:1,signal:selected,resourceOwner:'separation',label:'colour-batch-admission'});
    api(()=>device.pushErrorScope('validation'));scopes++;api(()=>device.pushErrorScope('out-of-memory'));scopes++;
    const src=await buffer('source',plan.buffers.source,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=await buffer('output',plan.buffers.output,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=await buffer('shape',plan.buffers.shape,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),mask=await buffer('mask',plan.buffers.mask,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),tab=await buffer('table',4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),scratch=await buffer('scratch',4,GPUBufferUsage.STORAGE);read=await buffer('read',plan.buffers.read,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);const main=await getPipeline(p);
    await ack(()=>lease.release());lease=null;checkAbort(selected);const values=await prepare(plan);checkAbort(selected);requireValue(Array.isArray(values)&&values.length===plan.entries.length,'Colour preparation must retain every independent window');
    lease=await scheduler.acquire({cpu:1,gpu:0,signal:selected,resourceOwner:'separation',label:'colour-batch-native-pack'});const prepared=[],at=performance.now();
    for(const e of plan.entries){const job=values[e.index],im=job.image,hooks=job.hooks??{},n=e.width*e.height;
     requireValue(im.width===e.width&&im.height===e.height&&job.start===e.start&&job.rows===e.rows&&im.data instanceof Uint8Array&&im.data.length===n*3&&!!hooks.membership===e.membership&&(!e.membership||hooks.membership instanceof Uint8Array&&hooks.membership.length===n),'Colour prepared shape differs');
     const source=malloc(n*4),rgb=malloc(n*3),output=malloc(e.outputBytes),rgbOut=malloc(e.rgbBytes);module.HEAPU8.set(im.data,rgb);const status=module._separation_gpu_pack(rgb,e.width,e.height,+p.grayscale,0,source);if(status!==1)throw new EngineError(status===-1?'MEMORY_ALLOCATION':'GPU_FAILED','Native colour pack refused');releasePointer(rgb);prepared.push({e,job,source,output,rgbOut});
    }
    stats.nativePreparationMs+=performance.now()-at;await ack(()=>lease.release());lease=null;
    lease=await scheduler.acquire({cpu:0,gpu:1,signal:selected,resourceOwner:'separation',label:'colour-batch-filter'});const encoder=api(()=>device.createCommandEncoder());
    queueAck=false;api(()=>device.queue.writeBuffer(tab,0,new Uint32Array(1)));
    for(const item of prepared){const {e,job,source}=item,hooks=job.hooks??{},members=new Uint8Array(e.maskBytes);if(hooks.membership)members.set(hooks.membership);
     api(()=>device.queue.writeBuffer(src,e.sourceOffset,module.HEAPU8.buffer,source,e.sourceBytes));api(()=>device.queue.writeBuffer(mask,e.maskOffset,members));api(()=>device.queue.writeBuffer(uniform,e.shapeOffset,new Uint32Array([e.width,e.height,e.start,e.rows,+e.membership,hooks.nativeOriginX??0,hooks.nativeWidth??e.width,0])));
     const bindings=[{buffer:src,offset:e.sourceOffset,size:e.sourceBytes},{buffer:out,offset:e.outputOffset,size:e.outputBytes},{buffer:uniform,offset:e.shapeOffset,size:32},{buffer:tab,size:4},{buffer:mask,offset:e.maskOffset,size:e.maskBytes},{buffer:scratch,size:4}],group=api(()=>device.createBindGroup({layout,entries:bindings.map((resource,binding)=>({binding,resource}))}));
     api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(main);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(e.width*e.rows/64));pass.end();encoder.copyBufferToBuffer(out,e.outputOffset,read,e.readOffset,e.outputBytes);});stats.dispatches++;stats.uploadedBytes+=e.sourceBytes+e.maskBytes+32;
    }
    checkAbort(selected);const gpuAt=performance.now();api(()=>device.queue.submit([encoder.finish()]));
    await operation('separation-color-batch:readback',()=>mapping??=asyncApi(()=>read.mapAsync(GPUMapMode.READ,0,plan.mappedBytes)).then(value=>{queueAck=true;return value;}),{bytes:plan.mappedBytes,windows:prepared.length});requireValue(mapping&&typeof mapping.then==='function','Colour readback must start its physical map');await mapping;checkAbort(selected);mapped=true;const range=api(()=>read.getMappedRange(0,plan.mappedBytes));backing=budget.registerBacking?.('gpu-mapped',plan.mappedBytes,{owner:'separation',label:'colour-batch-map',identity:range});const bytes=new Uint8Array(range);
    for(const item of prepared)module.HEAPU8.set(bytes.subarray(item.e.readOffset,item.e.readOffset+item.e.outputBytes),item.output);api(()=>read.unmap());mapped=false;mapping=null;stats.maps++;stats.readbackBytes+=plan.mappedBytes;stats.gpuWallMs+=performance.now()-gpuAt;
    while(scopes){const error=await asyncApi(()=>device.popErrorScope());scopes--;if(error)throw new EngineError('GPU_FAILED',error.message);}if(lost)throw new EngineError('GPU_FAILED','Colour GPU device lost');await ack(()=>lease.release());lease=null;
    lease=await scheduler.acquire({cpu:1,gpu:0,signal:selected,resourceOwner:'separation',label:'colour-batch-native-finish'});const finishAt=performance.now();entryResults=[];
    for(const item of prepared){const {e,output,rgbOut}=item,status=module._separation_gpu_unpack(output,e.width,e.rows,+p.grayscale,0,rgbOut);if(status!==1)throw new EngineError(status===-1?'MEMORY_ALLOCATION':'GPU_FAILED','Native colour finish refused');let live=true,returning,free=null;
     const result={bytes:null,precisionRepairs:0,release(){if(!live)return returning;if(returning)return returning;const task=(async()=>{await ack(free);free=null;live=false;results.delete(result);})();returning=task;void task.finally(()=>{if(live)returning=null;}).catch(()=>{});return task;}};results.add(result);entryResults.push(result);free=outputFee.split(e.rgbBytes);result.bytes=module.HEAPU8.slice(rgbOut,rgbOut+e.rgbBytes);
    }
    stats.nativePreparationMs+=performance.now()-finishAt;checkAbort(selected);await ack(()=>lease.release());lease=null;complete=true;
    await retireJob();checkAbort(selected);stats.calls+=prepared.length;stats.batchCalls++;return{entries:entryResults};
   }catch(error){failed=true;primary=error;closed=true;life.abort();throw error;}
   finally{try{if(failed&&entryResults)await attempts(entryResults.map(r=>()=>r.release()));await retireJob();}catch(error){if(failed)appendWaveletCleanup(primary,error);else throw error;}finally{finish();pending=null;}}
  }
 };
 try{
  const adapter=await asyncApi(()=>globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'}));if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Colour WebGPU unavailable');const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,adapter.limits.maxBufferSize);
  checkAbort(life.signal);device=await asyncApi(()=>adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:adapter.limits.maxBufferSize}}));device.lost.then(()=>lost=true);checkAbort(life.signal);heap=reserve(HEAP);const create=moduleFactory??(await import('../vendor/separation-gpu-prepare/prepare.js')).default;module=await create();checkAbort(signal);checkAbort(life.signal);
  layout=api(()=>device.createBindGroupLayout({entries:[0,1,2,3,4,5].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===2?'uniform':binding===1||binding===5?'storage':'read-only-storage'}}))}));pipelineLayout=api(()=>device.createPipelineLayout({bindGroupLayouts:[layout]}));initialized();return service;
 }catch(error){initialized();try{await owner.retire();}catch(cleanup){appendWaveletCleanup(error,cleanup);}throw error;}
}
