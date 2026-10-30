import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {noisesnifferStreamMath} from './noisesniffer-stream-math.js';
import {initializeGpuOwner,openOwnedGpuDevice,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,gpuOwnerMayFallback,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {allocateTypedArray,copyTypedArray} from './allocation.js';

let pins;
async function shaderSource(block,{signal}={}){
 const root=new URL('../vendor/noisesniffer-gpu/',import.meta.url);
 pins??=fetch(new URL('PINNED.json',root)).then(async r=>{if(!r.ok)throw new EngineError('CODEC_UNAVAILABLE','Noisesniffer shader manifest unavailable.');return r.json();}).catch(error=>{pins=null;throw error;});
 const manifest=await pins,spec=manifest.files?.['dct-'+block+'.wgsl'];requireValue(spec&&Number.isInteger(spec.bytes)&&spec.bytes>0&&/^[0-9a-f]{64}$/.test(spec.sha256),'Pinned native DCT shader required.');checkAbort(signal);
 const response=await fetch(new URL('dct-'+block+'.wgsl',root),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Native DCT shader unavailable.');const bytes=await response.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');requireValue(bytes.byteLength===spec.bytes&&hash===spec.sha256,'Native DCT shader identity differs.');checkAbort(signal);return new TextDecoder().decode(bytes);
}
const defaultSparse=async(rgb,width,height,block,ids,hooks)=>(await noisesnifferStreamMath()).sparseDctAsync(rgb,width,height,block,ids,hooks);
// Same pocketfft operation graph, axes, constants and frequency mask as native.
// A hi/lo f32 pair approximates each native f64 operation. Conservative bounds
// enclose the final variance. Only a single certified native Float32 result
// is accepted; ambiguous intervals use the unchanged native DCT so the
// unstable native sort also preserves equalities and near-zero ordering.
export class NoisesnifferDctGpu{
 constructor(budget,{loadShader=shaderSource,sparseNative=defaultSparse,fallbackHeapBytes=128*1024**2}={}){
  requireValue(budget?.reserve&&typeof loadShader==='function'&&typeof sparseNative==='function'&&Number.isSafeInteger(fallbackHeapBytes)&&fallbackHeapBytes>=0,'Noisesniffer DCT owners required.');initializeGpuOwner(this,budget,'noisesniffer-DCT');this.loadShader=loadShader;this.sparseNative=sparseNative;this.fallbackHeapBytes=fallbackHeapBytes;this.pipelines=new Map();this.constants=new Map();
 }
 mayFallback(error){return gpuOwnerMayFallback(this,error);}
 async retirePipelines(){let failed=false,primary;for(const[block,entry]of this.pipelines)try{await entry.release();this.pipelines.delete(block);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 async initialize(signal){
  if(!this.ready)this.ready=openOwnedGpuDevice(this,signal,adapter=>({maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,512*1024**2),maxBufferSize:Math.min(adapter.limits.maxBufferSize,512*1024**2)})).catch(error=>{this.ready=null;throw error;});return this.ready;
 }
 async pipeline(block,signal){
  if(this.pipelines.has(block)){const entry=this.pipelines.get(block);this.pipelines.delete(block);this.pipelines.set(block,entry);return entry.pipeline;}
  if(this.pipelines.size>=2){const first=this.pipelines.keys().next().value;await this.pipelines.get(first).release();this.pipelines.delete(first);}
  const release=gpuOwnerReserve(this,8*1024**2);this.orphanPipelineFees.add(release);let module;
  try{
   let code;try{code=await this.loadShader(block,{signal});}catch(error){if(this.loadShader===shaderSource&&error?.code==='CODEC_UNAVAILABLE')gpuOwnerFailure(this,error);throw error;}
   module=gpuOwnerSync(this,()=>this.device.createShaderModule({code}),signal);const messages=await gpuOwnerAsync(this,()=>module.getCompilationInfo(),signal);if(messages.messages.some(m=>m.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',messages.messages.map(m=>m.message).join('\n')));
   const pipeline=await gpuOwnerAsync(this,()=>this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),signal);checkAbort(signal);this.pipelines.set(block,{pipeline,release});this.orphanPipelineFees.delete(release);return pipeline;
  }catch(error){if(!module)try{await release();this.orphanPipelineFees.delete(release);}catch(cleanup){attachGpuCleanup(error,cleanup);}throw error;}
 }
 async run(rgb,width,height,block,{signal,onSubmitted,onProgress}={}){
  requireValue(rgb instanceof Uint8Array&&Number.isInteger(width)&&Number.isInteger(height)&&width>=block&&height>=block&&rgb.length===width*height*3&&[3,5,7,8].includes(block),'Invalid complete native DCT RGB grid.');checkAbort(signal);requireValue(!this.busy&&!this.closed,'Noisesniffer DCT GPU unavailable.');this.busy=true;this.fallbackFailures=new WeakSet();
  const scheduler=getExecutionScheduler(this.budget),transaction=gpuTransaction(this);let hostTransaction,outputFree,owned,published=false,failed=false,primary;const started=performance.now(),api=fn=>gpuOwnerSync(this,fn,signal),asyncApi=fn=>gpuOwnerAsync(this,fn,signal);
  try{
   if(this.pending.size>1||this.lost||this.retirementNeeded||this.orphanPipelineFees.size){this.pending.delete(transaction);await retireOwnedGpuDevice(this);this.pending.add(transaction);}
   transaction.lease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'noisesniffer',label:'noisesniffer-native-DCT-GPU'});await this.initialize(signal);transaction.device=this.device;checkAbort(signal);const pipeline=await this.pipeline(block,signal),device=this.device,cols=width-block+1,rows=height-block+1,plane=cols*rows,count=plane*3,bytes=count*4,sourceBytes=Math.ceil(rgb.byteLength/4)*4;
   if(!Number.isSafeInteger(count)||count<=0||count>0xffffffff||[bytes,sourceBytes].some(v=>v>device.limits.maxStorageBufferBindingSize||v>device.limits.maxBufferSize)||bytes*2>device.limits.maxBufferSize)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','One native DCT strip exceeds a GPU binding.'));
   const groups=Math.ceil(count/32),groupsX=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);if(groupsY>device.limits.maxComputeWorkgroupsPerDimension)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Native DCT dispatch extent differs.'));
   // GPU variance/flags/readback, potentially separate host mapping, copied
   // staging, returned variance and gathered native-fallback IDs/results coexist.
   const release=gpuOwnerReserve(this,sourceBytes*2+bytes*12+65536);transaction.workspace=release;hostTransaction=gpuTransaction(this);outputFree=release.split(bytes);hostTransaction.outputFree=outputFree;hostTransaction.workspace=release.split(bytes*3+65536);api(()=>device.pushErrorScope('validation'));transaction.scopes++;api(()=>device.pushErrorScope('out-of-memory'));transaction.scopes++;
   const allocate=(size,usage,label)=>{const buffer=api(()=>device.createBuffer({size,usage})),entry={bytes:size,destroyed:false,release:null};transaction.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',size,{owner:'noisesniffer',label});return buffer;},source=allocate(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'DCT-rgb'),output=allocate(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'DCT-variance'),flags=allocate(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'DCT-cast-guard'),params=allocate(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'DCT-params'),read=allocate(bytes*2,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'DCT-readback');
   const prefix=Math.floor(rgb.byteLength/4)*4;if(prefix)api(()=>device.queue.writeBuffer(source,0,rgb,0,prefix));if(prefix<rgb.byteLength){const tail=new Uint8Array(4);tail.set(rgb.subarray(prefix));api(()=>device.queue.writeBuffer(source,prefix,tail));}api(()=>device.queue.writeBuffer(params,0,Uint32Array.of(width,height,plane,groupsX)));const encoder=api(()=>device.createCommandEncoder());api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[source,output,flags,params].map((buffer,binding)=>({binding,resource:{buffer}}))}));pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(output,0,read,0,bytes);encoder.copyBufferToBuffer(flags,0,read,bytes,bytes);});checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();
   await asyncApi(()=>device.queue.onSubmittedWorkDone());transaction.drained=true;const oom=await asyncApi(()=>device.popErrorScope());transaction.scopes--;const validation=await asyncApi(()=>device.popErrorScope());transaction.scopes--;if(oom||validation)throw gpuOwnerFailure(this,new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));checkAbort(signal);await asyncApi(()=>read.mapAsync(GPUMapMode.READ));transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=api(()=>read.getMappedRange());transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',bytes*2,{owner:'noisesniffer',label:'DCT-host-mapping',identity:mapped});const variance=copyTypedArray(new Float32Array(mapped,0,count),{label:'noisesniffer-DCT-variance'}),status=copyTypedArray(new Uint32Array(mapped,bytes,count),{label:'noisesniffer-DCT-guard'});api(()=>read.unmap());transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;let fallbackCount=0,stamp=performance.now();
   let constantCount=0;const constantJobs=new Map(),constantCache=this.constants.get(block)??new Map();this.constants.set(block,constantCache);
   for(let i=0;i<count;i++){if((i&16383)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}requireValue(status[i]<=257,'Native DCT guard response differs.');if(status[i]>=2){const value=status[i]-2;constantCount++;if(constantCache.has(value))variance[i]=constantCache.get(value);else if(!constantJobs.has(value)){constantJobs.set(value,i);fallbackCount++;}}else if(status[i]||!Number.isFinite(variance[i])){status[i]=1;fallbackCount++;}}
   // The queue and host copy are complete. Native fallback has no dependency on
   // a live GPU buffer, so return those allocations before CPU admission.
   await retireGpuTransaction(this,transaction);const gpuCompletedMs=performance.now()-started;
   if(fallbackCount){const ids=allocateTypedArray(Uint32Array,fallbackCount,{label:'noisesniffer-DCT-fallback-ids'});let at=0;for(let i=0;i<count;i++)if(status[i]===1)ids[at++]=i;for(const id of constantJobs.values())ids[at++]=id;
    try{hostTransaction.lease=await scheduler.acquire({cpu:1,gpu:0,bytes:this.fallbackHeapBytes,signal,resourceOwner:'noisesniffer',label:'noisesniffer-native-DCT-ambiguous-blocks'});}catch(error){if(error?.code==='MEMORY_LIMIT')gpuOwnerFailure(this,error);throw error;}const corrected=await this.sparseNative(rgb,width,height,block,ids,{signal,onProgress});requireValue(corrected instanceof Float32Array&&corrected.length===ids.length&&corrected.every(Number.isFinite),'Native DCT fallback output differs.');for(let i=0;i<ids.length;i++){const id=ids[i];variance[id]=corrected[i];if(status[id]>=2)constantCache.set(status[id]-2,corrected[i]);}await hostTransaction.lease.release();hostTransaction.lease=null;
   }
   if(constantCount)for(let i=0;i<count;i++)if(status[i]>=2){requireValue(constantCache.has(status[i]-2),'Native constant DCT cache is incomplete.');variance[i]=constantCache.get(status[i]-2);}
   checkAbort(signal);const owners=[];owned=ownGpuArrays({variance},outputFree,owners,this.budget,{width:cols,height:rows,runtime:{backend:'webgpu-native-DCT-hi-lo-guarded',blockSize:block,blocks:count,nativeFallbackBlocks:fallbackCount,nativeFallbackFraction:fallbackCount/count,constantBlocks:constantCount,constantMemoizedBlocks:constantCount-constantJobs.size,gpuAndTransportMs:gpuCompletedMs,totalMs:performance.now()-started,graph:'pinned-native-pocketfft-axes1-then2',maximumAbsoluteVarianceError:1e-4,scientificPrecision:'certified-native-f32-variance-or-original-native-recomputation'}},this.pendingResults);outputFree=null;hostTransaction.outputFree=null;this.pendingResults.add(owned);owners.push({bytes:variance.byteLength,release:this.budget.registerBacking?.('array-buffer',variance.byteLength,{owner:'noisesniffer',label:'native-DCT-variance',identity:variance.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   transaction.device??=this.device;let cleanupFailed=false,cleanup;for(const record of[transaction,hostTransaction].filter(Boolean))try{await retireGpuTransaction(this,record);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   if(failed&&!this.pipelines.size)try{await retireOwnedGpuDevice(this);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async dispose(){return disposeGpuOwner(this,()=>this.constants.clear());}

}

// Serialize one statistics construction without retaining any caller's input.
// Small automatic jobs stay native; explicit WebGPU still exercises the real
// bounded path. Large strict domains amortize the pipeline across their cores.
export function noisesnifferGpuDctService(budget,{backend='auto',expectedPixels=0,createProvider=()=>new NoisesnifferDctGpu(budget)}={}){
 let gpu,queue=Promise.resolve(),closed=false,rejected=null,calls=0,blocks=0,fallback=0;
 return{
  run(rgb,width,height,block,hooks={}){
   const work=async()=>{
    checkAbort(hooks.signal);if(closed)throw new EngineError('DISPOSED','Noisesniffer DCT service closed.');if(gpu?.closed){await gpu.dispose();gpu=null;}const selected=hooks.backend??backend;
    if(selected==='cpu'||!globalThis.navigator?.gpu||rejected||(selected!=='webgpu'&&Math.max(expectedPixels,width*height)<262144))return null;
    try{gpu??=createProvider();const result=await gpu.run(rgb,width,height,block,hooks);calls++;blocks+=result.runtime.blocks;fallback+=result.runtime.nativeFallbackBlocks;return result;}
    catch(error){if(hooks.signal?.aborted||!(gpu?.mayFallback?.(error)??['GPU_UNAVAILABLE','GPU_FAILED','GPU_OUT_OF_MEMORY','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION','CODEC_UNAVAILABLE'].includes(error?.code)))throw error;rejected=error.code;try{await gpu?.dispose();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}gpu=null;return null;}
   };
   const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;
  },
  metrics(){return{gpuDctCalls:calls,gpuDctBlocks:blocks,gpuDctNativeFallbackBlocks:fallback,gpuDctBackend:calls?'webgpu-native-DCT-hi-lo-guarded':'cpu',...(rejected?{gpuDctFallback:rejected}:{})};},
  async dispose(){closed=true;await queue;await gpu?.dispose();gpu=null;}
 };
}
