import {EngineError,requireValue,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {requestStorageDevice} from './gpu-limits.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {sparseBinaryGpuTransaction,retireSparseBinaryGpuTransaction,drainSparseBinaryGpuTransactions,attachSparseBinaryGpuCleanup} from './sparse-binary-gpu-retirement.js';
// ACK-owned normalized SIFT/RootSIFT distance transport.
// Float squared sums preserve the existing NumPy8-lane reduction order;
// Float64 square root and all decisions must remain on the caller CPU.
// Physical descriptor transport only. Geometry, native pair order, memberships,
// normalization and decisions remain on the CPU. Zero padding is per descriptor.
const fallbackFailures=new WeakSet(),failedRetirements=new WeakMap(),failedBudgetOwners=new WeakMap();
export async function retireSparseFloatGpuFailure(error,budget){const cleanup=error&&typeof error==='object'?failedRetirements.get(error):null,owners=new Set([...(failedBudgetOwners.get(budget)??[]),...(cleanup?[cleanup]:[])]);let failed=false,primary;for(const close of owners)try{await close();failedBudgetOwners.get(budget)?.delete(close);if(close===cleanup)failedRetirements.delete(error);}catch(e){if(!failed){failed=true;primary=e;}}if(failed)throw primary;}
export const mayFallbackSparseFloatSquaredGpu=error=>!!error&&typeof error==='object'&&fallbackFailures.has(error)&&!failedRetirements.has(error);
const eligible=error=>{if(error&&typeof error==='object'&&gpuFallbackError(error))fallbackFailures.add(error);return error;};
export async function createSparseFloatSquaredDistanceGpu(descriptors,stride,{budget,signal,descriptorDomain='nonnegative-unit'}={}){
 requireValue(budget?.reserve&&descriptors instanceof Float32Array&&(descriptorDomain==='nonnegative-unit'&&stride===128||descriptorDomain==='signed-unit'&&[64,128].includes(stride))&&descriptors.length%stride===0&&descriptors.every(v=>Number.isFinite(v)&&v>=(descriptorDomain==='signed-unit'?-1:0)&&v<=1),'Invalid sparse float GPU source');checkAbort(signal);await retireSparseFloatGpuFailure(null,budget);checkAbort(signal);
 const count=descriptors.length/stride,words=stride/4,bytes=Math.max(4,descriptors.byteLength),scheduler=getExecutionScheduler(budget),owner={budget,pending:new Set(),deviceDestroyed:false},record=sparseBinaryGpuTransaction(owner),buffers=new Map(),fees=new Set(),failedResults=new Set(),life=new AbortController();
 let device,pipeline,pipelineFree,packedFree,source,uniform,lost=false,closed=false,busy=false,pending,closing,retired=false,needsRetirement=false,unregister;
 const stats={calls:0,pairs:0,uploadedBytes:0,readbackBytes:0,computeWaitMs:0,initializationMs:0,residentGpuBytes:0,allocations:0,reuses:0};
 const api=(operation,activeSignal)=>{try{return nativeGpuSync(operation,{signal:activeSignal});}catch(error){throw eligible(error);}},asyncApi=async(operation,activeSignal)=>{try{return await nativeGpuAsync(operation,{signal:activeSignal});}catch(error){throw eligible(error);}},failure=(code,message)=>eligible(new EngineError(code,message));
 const reserve=n=>{try{return budget.reserve(n);}catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))eligible(error);throw error;}};
 const fee=n=>{const free=reserve(n);fees.add(free);return free;};
 record.workspace=async()=>{for(const free of [...fees]){await free();fees.delete(free);if(free===pipelineFree)pipelineFree=null;if(free===packedFree)packedFree=null;}};
 async function buffer(key,requested,usage){
  const size=Math.max(4,Math.ceil(requested/4)*4),old=buffers.get(key);if(size>Math.min(device.limits.maxBufferSize,device.limits.maxStorageBufferBindingSize))throw failure('GPU_LIMIT','Sparse float buffer exceeds device limits');if(old?.size>=size){stats.reuses++;return old.buffer;}
  const free=fee(size);let value;
  try{
   value=api(()=>device.createBuffer({size,usage}));const entry={buffer:value,size,bytes:size,destroyed:false,backing:null,backingRetired:false,creditRetired:false,counted:true};record.buffers.set(value,entry);fees.delete(free);stats.residentGpuBytes+=size;stats.allocations++;
   entry.release=async()=>{if(!entry.backingRetired){await entry.backing?.();entry.backingRetired=true;}if(!entry.creditRetired){await free();entry.creditRetired=true;}if(entry.counted){stats.residentGpuBytes-=size;entry.counted=false;}return size;};
   entry.backing=budget.registerBacking?.('gpu',size,{owner:'sparse-float-distance',label:key});
   if(old){
    // Remove the reusable alias before retiring any old owner. A callback may
    // reject after physical destruction; its transaction must stay retryable.
    buffers.delete(key);const stale=sparseBinaryGpuTransaction(owner);stale.device=device;stale.drained=record.drained;stale.buffers.set(old.buffer,record.buffers.get(old.buffer));record.buffers.delete(old.buffer);await retireSparseBinaryGpuTransaction(owner,stale);
   }
   buffers.set(key,entry);return value;
  }catch(error){needsRetirement=true;throw error;}
 }
 async function retireDevice(){
  closed=true;life.abort();await pending;let failed=false,primary;const attempt=async operation=>{try{await operation();}catch(error){if(!failed){failed=true;primary=error;}}};
  if(device&&!owner.deviceDestroyed)await attempt(()=>{api(()=>device.destroy());owner.deviceDestroyed=true;});
  if(device&&!owner.deviceDestroyed)throw primary;
  await attempt(()=>drainSparseBinaryGpuTransactions(owner));
  for(const result of [...failedResults])await attempt(()=>result.release());
  if(!owner.pending.size&&!failedResults.size){failedBudgetOwners.get(budget)?.delete(cleanup);buffers.clear();pipeline=null;await unregister?.();unregister=null;retired=true;}
  if(failed)throw primary;
 }
 const cleanup=()=>{if(retired&&!failedResults.size)return closing??Promise.resolve();if(closing)return closing;closed=true;life.abort();const task=retireDevice();closing=task;void task.catch(()=>{let failedOwners=failedBudgetOwners.get(budget);if(!failedOwners){failedOwners=new Set();failedBudgetOwners.set(budget,failedOwners);}failedOwners.add(cleanup);unregister??=budget.registerAsyncReclaimer?.(async()=>{if(busy)return 0;const before=budget.total();await cleanup();return Math.max(0,before-budget.total());},{owner:'sparse-float-distance',label:'failed-device-retirement',allocationKind:'gpu'});}).catch(()=>{});void task.finally(()=>{if(!retired&&closing===task)closing=null;}).catch(()=>{});return task;};
 try{
  const start=performance.now(),adapter=await asyncApi(()=>globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'}),signal);if(!adapter)throw failure('GPU_UNAVAILABLE','Sparse float WebGPU unavailable');
  device=await asyncApi(()=>requestStorageDevice(adapter,{desiredBytes:Math.max(bytes,2*262144*4),minimumBytes:bytes,label:'sparse-float-descriptors'}),signal);record.device=device;device.lost.then(()=>lost=true);pipelineFree=fee(2*1024**2);packedFree=fee(bytes);
  api(()=>device.pushErrorScope('validation'),signal);record.scopes++;api(()=>device.pushErrorScope('out-of-memory'),signal);record.scopes++;
  const packed=descriptors.slice();
  source=await buffer('source',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);uniform=await buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  record.lease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'sparse-float-distance',label:'sparse-float-pipeline'});
  const shader=api(()=>device.createShaderModule({code:`
@group(0)@binding(0)var<storage,read> descriptors:array<vec4<f32>>;
@group(0)@binding(1)var<storage,read> pairs:array<vec2<u32>>;
@group(0)@binding(2)var<storage,read_write> distances:array<f32>;
@group(0)@binding(3)var<uniform> shape:vec4<u32>;
fn add(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn square(a:vec4<f32>,b:vec4<f32>)->vec4<f32>{let d=a-b;return d*d;}
@compute@workgroup_size(128)fn main(@builtin(global_invocation_id)gid:vec3<u32>){
 let i=gid.x;if(i>=shape.x){return;}let pair=pairs[i];let a=pair.x*${words}u;let b=pair.y*${words}u;
 var lo=square(descriptors[a],descriptors[b]);var hi=square(descriptors[a+1u],descriptors[b+1u]);
 for(var k=2u;k<${words}u;k+=2u){lo=fma(vec4<f32>(1.0),lo,square(descriptors[a+k],descriptors[b+k]));hi=fma(vec4<f32>(1.0),hi,square(descriptors[a+k+1u],descriptors[b+k+1u]));}
 let left=add(add(lo.x,lo.y),add(lo.z,lo.w));let right=add(add(hi.x,hi.y),add(hi.z,hi.w));distances[i]=add(left,right);
}`}),signal),info=await asyncApi(()=>shader.getCompilationInfo(),signal);if(info.messages.some(m=>m.type==='error'))throw failure('GPU_FAILED',info.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n'));
  pipeline=await asyncApi(()=>device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}}),signal);api(()=>device.queue.writeBuffer(source,0,packed),signal);stats.uploadedBytes+=bytes;
  const oom=await asyncApi(()=>device.popErrorScope(),signal);record.scopes--;const invalid=await asyncApi(()=>device.popErrorScope(),signal);record.scopes--;if(oom||invalid)throw failure(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);
  await asyncApi(()=>device.queue.onSubmittedWorkDone(),signal);record.drained=true;checkAbort(signal);await record.lease.release();record.lease=null;await packedFree();fees.delete(packedFree);packedFree=null;stats.initializationMs=performance.now()-start;
 }catch(error){
  try{await cleanup();}catch(retirement){let owners=failedBudgetOwners.get(budget);if(!owners){owners=new Set();failedBudgetOwners.set(budget,owners);}owners.add(cleanup);attachSparseBinaryGpuCleanup(error,retirement);if(error&&typeof error==='object')failedRetirements.set(error,cleanup);unregister??=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await cleanup();return Math.max(0,before-budget.total());},{owner:'sparse-float-distance',label:'failed-GPU-constructor',allocationKind:'gpu'});}
  throw error;
 }
 const capacity=Math.min(262144,Math.floor(device.limits.maxStorageBufferBindingSize/8),device.limits.maxComputeWorkgroupsPerDimension*128);
 return{
  capacity,get stats(){return{...stats,pipelineBytes:pipelineFree?2*1024**2:0,backend:'webgpu-f32-sift-squared-distance-native-sqrt64-on-cpu'};},
  async distances(pairs,{signal,onSubmitted}={}){
   requireValue(onSubmitted===undefined||typeof onSubmitted==='function','Invalid GPU submission callback');
   if(closed)throw new EngineError('DISPOSED','Sparse float GPU is closed');if(busy)throw new EngineError('BUSY','Sparse float GPU is busy');if(needsRetirement||lost)throw failure('GPU_FAILED','Sparse float GPU requires retirement');
   requireValue(pairs instanceof Uint32Array&&pairs.length>0&&pairs.length%2===0&&pairs.length/2<=capacity&&pairs.every(x=>x<count),'Invalid sparse float candidate indices');const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);busy=true;let finish;pending=new Promise(r=>finish=r);const n=pairs.length/2;let mapping,read,mappedFree,published=false,failed=false,primary;
   try{
    record.outputFree=reserve(n*4);mappedFree=fee(n*4);const indices=await buffer('indices',pairs.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=await buffer('counts',n*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);read=await buffer('readback',n*4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    record.lease=await scheduler.acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'sparse-float-distance',label:'sparse-float-eligible-pairs'});api(()=>device.pushErrorScope('validation'),combined);record.scopes++;api(()=>device.pushErrorScope('out-of-memory'),combined);record.scopes++;record.drained=false;
    api(()=>device.queue.writeBuffer(indices,0,pairs),combined);api(()=>device.queue.writeBuffer(uniform,0,Uint32Array.of(n,0,0,0)),combined);
    const group=api(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[source,indices,out,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}),combined),encoder=api(()=>device.createCommandEncoder(),combined);
    api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(n/128));pass.end();encoder.copyBufferToBuffer(out,0,read,0,n*4);},combined);checkAbort(combined);const start=performance.now();api(()=>device.queue.submit([encoder.finish()]),combined);onSubmitted?.({pairs:n});
    mapping=asyncApi(()=>read.mapAsync(GPUMapMode.READ,0,n*4),combined);await mapping;mapping=null;record.drained=true;record.mapping={buffer:read,mapped:true,release:null};checkAbort(combined);
    const mapped=api(()=>read.getMappedRange(0,n*4),combined);let mappingBacking,mappingBackingDone=false;record.mapping.release=async()=>{if(!mappingBackingDone){await mappingBacking?.();mappingBackingDone=true;}if(mappedFree){await mappedFree();fees.delete(mappedFree);mappedFree=null;}};mappingBacking=budget.registerBacking?.('gpu-mapped',n*4,{owner:'sparse-float-distance',label:'sparse-float-map',identity:mapped});const values=new Float32Array(mapped).slice();api(()=>read.unmap(),combined);record.mapping.mapped=false;await record.mapping.release();record.mapping=null;
    const oom=await asyncApi(()=>device.popErrorScope(),combined);record.scopes--;const invalid=await asyncApi(()=>device.popErrorScope(),combined);record.scopes--;if(oom||invalid)throw failure(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);if(lost)throw failure('GPU_FAILED','Sparse float device lost');checkAbort(combined);
    await record.lease.release();record.lease=null;const backing=budget.registerBacking?.('array-buffer',n*4,{owner:'sparse-float-distance',label:'sparse-float-counts'}),free=record.outputFree;record.outputFree=null;
    stats.calls++;stats.pairs+=n;stats.uploadedBytes+=pairs.byteLength;stats.readbackBytes+=n*4;stats.computeWaitMs+=performance.now()-start;let live=true,backingDone=false,notified=false,retiredBytes,active;
    const done=()=>{live=false;failedResults.delete(result);},advance=()=>{
     if(!backingDone){const ack=backing?.();if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(bytes=>{backingDone=true;retiredBytes=bytes;}).then(advance);backingDone=true;retiredBytes=ack;}
     if(!notified){if(retiredBytes!==0)budget.notifyBackingRelease?.('array-buffer',retiredBytes??n*4);notified=true;}
     const ack=free();if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(done);done();
    },retainFailure=error=>{failedResults.add(result);if(retired)closing=null;retired=false;unregister??=budget.registerAsyncReclaimer?.(async()=>{if(busy)return 0;const before=budget.total();await cleanup();return Math.max(0,before-budget.total());},{owner:'sparse-float-distance',label:'failed-result-retirement',allocationKind:'gpu'});throw error;};
    const result={get values(){if(!live)throw new EngineError('DISPOSED','Squared-distance result released');return values;},release(){if(!live)return;if(active)return active;try{const ack=advance();if(ack&&typeof ack.then==='function'){active=Promise.resolve(ack).catch(retainFailure).finally(()=>active=null);return active;}}catch(error){return retainFailure(error);}}};published=true;return result;
   }catch(error){failed=true;primary=error;throw error;}
   finally{
    let cleanupFailed=false,retirement;const attempt=async operation=>{try{await operation();}catch(error){if(!cleanupFailed){cleanupFailed=true;retirement=error;}}};
    if(mapping)await attempt(()=>mapping);
    if(read?.mapState==='mapped')await attempt(()=>{api(()=>read.unmap());if(record.mapping)record.mapping.mapped=false;});
    if(!record.drained)await attempt(async()=>{await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;});
    while(record.scopes){let accepted=false;await attempt(async()=>{await asyncApi(()=>device.popErrorScope());record.scopes--;accepted=true;});if(!accepted)break;}
    if(record.drained&&record.mapping&&!record.mapping.mapped)await attempt(async()=>{await record.mapping.release?.();record.mapping=null;});
    if(record.drained&&!record.mapping&&mappedFree)await attempt(async()=>{await mappedFree();fees.delete(mappedFree);mappedFree=null;});
    if(record.drained&&!record.scopes&&!record.mapping){if(!published)await attempt(async()=>{await record.outputFree?.();record.outputFree=null;});await attempt(async()=>{await record.lease?.release();record.lease=null;});}
    if(cleanupFailed||!record.drained||record.scopes)needsRetirement=true;busy=false;finish();pending=null;
    if(cleanupFailed){if(failed)attachSparseBinaryGpuCleanup(primary,retirement);else throw retirement;}
   }
  },dispose:cleanup
 };
}
