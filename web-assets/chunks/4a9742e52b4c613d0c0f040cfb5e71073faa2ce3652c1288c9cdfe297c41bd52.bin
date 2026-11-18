import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {initializeGpuOwner,gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,openOwnedGpuDevice,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,gpuRetirementFailure} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const PIPELINE_BYTES=2*1024**2;
// Each invocation owns one packed word, including the partial final word.
// The lookup is constructed by the qualified CPU kernel: GPU uses integers only.
const shader=`struct Shape { words:u32, components:u32, groupsX:u32, pad:u32 }
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read> lut:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:array<u32>;
@group(0) @binding(3) var<uniform> shape:Shape;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let index=id.x+id.y*shape.groupsX*256u;if(index>=shape.words){return;}
 let value=source[index];var result=0u;for(var channel=0u;channel<4u;channel++){
  if(index*4u+channel<shape.components){let code=(value>>(channel*8u))&255u;result=result|(lut[code]<<(channel*8u));}
 }output[index]=result;
}`;
export class ByteLutGpu{
 constructor(budget){initializeGpuOwner(this,budget,'byte-lut');this.pipeline=null;this.fee=null;}
 failure(error){return gpuOwnerFailure(this,error);}mayFallback(error){return gpuOwnerMayFallback(this,error);}sync(fn,signal){return gpuOwnerSync(this,fn,signal);}asyncApi(fn,signal){return gpuOwnerAsync(this,fn,signal);}reserve(bytes){return gpuOwnerReserve(this,bytes);}
 async initialize(signal){if(!this.ready)this.ready=(async()=>{const fee=this.reserve(PIPELINE_BYTES);this.orphanPipelineFees.add(fee);const device=await openOwnedGpuDevice(this,signal),module=this.sync(()=>device.createShaderModule({code:shader}),signal),info=await this.asyncApi(()=>module.getCompilationInfo(),signal);if(info.messages.some(m=>m.type==='error'))throw this.failure(new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n')));this.pipeline=await this.asyncApi(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),signal);this.fee=fee;this.orphanPipelineFees.delete(fee);return device;})().catch(error=>{this.ready=null;this.retirementNeeded=true;throw error;});return this.ready;}
 async retirePipelines(){this.pipeline=null;if(this.fee){await this.fee();this.fee=null;}}
 async lookup(bytes,lut,{signal}={}){
  requireValue(bytes instanceof Uint8Array&&bytes.length>0&&lut instanceof Uint8Array&&lut.length===256,'Funded RGB8 bytes and byte lookup required.');checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Byte lookup GPU closed.');if(this.busy)throw new EngineError('BUSY','Byte lookup GPU already active.');this.busy=true;this.fallbackFailures=new WeakSet();const started=performance.now(),cooperate=createCooperator(signal);let transaction,result,published=false,failed=false,primary;
  try{
   if(this.retirementNeeded||this.lost)await retireOwnedGpuDevice(this);transaction=gpuTransaction(this);const cold=!this.pipeline,setup=performance.now();await this.initialize(signal);const setupMs=cold?performance.now()-setup:0,device=this.device;transaction.device=device;transaction.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'ela.bitrate',label:'RGB8-byte-LUT'});
   const size=Math.ceil(bytes.length/4)*4,words=size/4,groups=Math.ceil(words/256),groupsX=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);
   if(size>device.limits.maxBufferSize||size>device.limits.maxStorageBufferBindingSize||groupsY>device.limits.maxComputeWorkgroupsPerDimension)throw this.failure(new EngineError('GPU_LIMIT','Byte lookup band exceeds the actual GPU limits.'));
   transaction.workspace=this.reserve(size*7+65536);transaction.outputFree=transaction.workspace.split(bytes.length);
   this.sync(()=>device.pushErrorScope('validation'),signal);transaction.scopes++;this.sync(()=>device.pushErrorScope('out-of-memory'),signal);transaction.scopes++;
   const make=(length,usage,label)=>{const buffer=this.sync(()=>device.createBuffer({size:length,usage,label}),signal),entry={bytes:length,destroyed:false,release:this.budget.registerBacking?.('gpu',length,{owner:'ela.bitrate',label})};transaction.buffers.set(buffer,entry);return buffer;};
   const source=make(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'byte-LUT-source'),table=make(1024,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'byte-LUT-table'),output=make(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'byte-LUT-output'),shape=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'byte-LUT-shape'),read=make(size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'byte-LUT-readback');
   const prefix=bytes.length-bytes.length%4;if(prefix)this.sync(()=>device.queue.writeBuffer(source,0,bytes,0,prefix),signal);if(prefix<bytes.length){const tail=new Uint8Array(4);tail.set(bytes.subarray(prefix));this.sync(()=>device.queue.writeBuffer(source,prefix,tail),signal);}
   this.sync(()=>device.queue.writeBuffer(table,0,Uint32Array.from(lut)),signal);this.sync(()=>device.queue.writeBuffer(shape,0,Uint32Array.of(words,bytes.length,groupsX,0)),signal);
   const group=this.sync(()=>device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[source,table,output,shape].map((buffer,binding)=>({binding,resource:{buffer}}))}),signal),encoder=this.sync(()=>device.createCommandEncoder(),signal),pass=this.sync(()=>encoder.beginComputePass(),signal),kernel=performance.now();this.sync(()=>{pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);},signal);
   await this.asyncApi(()=>device.queue.onSubmittedWorkDone(),signal);transaction.drained=true;const kernelMs=performance.now()-kernel,oom=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;const validation=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;if(oom||validation)throw this.failure(new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));
   await this.asyncApi(()=>read.mapAsync(GPUMapMode.READ),signal);transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=this.sync(()=>read.getMappedRange(),signal);transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',size,{owner:'ela.bitrate',label:'byte-LUT-map',identity:mapped});const view=new Uint8Array(mapped,0,bytes.length),data=new Uint8Array(bytes.length);
   for(let start=0;start<data.length;start+=65536){await cooperate();data.set(view.subarray(start,Math.min(view.length,start+65536)),start);}this.sync(()=>read.unmap(),signal);transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;checkAbort(signal);
   const owners=[{bytes:data.length,release:this.budget.registerBacking?.('array-buffer',data.length,{owner:'ela.bitrate',label:'byte-LUT-RGB8',identity:data.buffer})}],free=transaction.outputFree;result=ownGpuArrays({data},free,owners,this.budget,{runtime:{backend:'webgpu',kernel:'integer-RGB8-byte-LUT',setupMs,kernelMs,totalMs:performance.now()-started,uploadedBytes:size+1040,readbackBytes:size}},this.pendingResults);transaction.outputFree=null;published=true;return result;
  }catch(error){failed=true;primary=error;throw error;}
  finally{let cleanup;try{if(transaction)await retireGpuTransaction(this,transaction);}catch(error){cleanup=error;}if(result&&(!published||failed||cleanup))try{await result.release();}catch(error){cleanup??=error;}this.busy=false;if(cleanup)throw gpuRetirementFailure(primary??cleanup,{dispose:()=>this.dispose()},cleanup);}
 }
 dispose(){return disposeGpuOwner(this);}
}
