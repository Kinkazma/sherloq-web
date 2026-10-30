import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort} from './errors.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';

export function residentGaussianPlan(width,height,channels,weights,{budget,device}={}){
 const bytes=width*height*channels*4,workspaceBytes=bytes*8+weights.byteLength*2+1024**2;
 return Number.isSafeInteger(bytes)&&bytes>0&&bytes<=device.limits.maxStorageBufferBindingSize&&bytes<=device.limits.maxBufferSize&&Math.ceil(width*channels/16)<=device.limits.maxComputeWorkgroupsPerDimension&&Math.ceil(height/16)<=device.limits.maxComputeWorkgroupsPerDimension&&budget.total()+workspaceBytes<=budget.limit?{bytes,workspaceBytes}:null;
}

// Same two ordered separable stencils as the paged transport, now with their
// intermediate on GPU. Exactly one result mapping for this complete context.
export async function stereoGaussianResident(owner,input,output,width,height,weights,{signal,channels,kernelKind}={}){
 const device=owner.device,budget=owner.budget,mapAck=owner.profile.stereoGpuAcknowledgeReadback===true,plan=residentGaussianPlan(width,height,channels,weights,{budget,device});if(!plan)return false;
 owner.residentOwner??={budget,pending:new Set(),get deviceDestroyed(){return owner.deviceDestroyed;}};
 const registry=owner.residentOwner,record=gpuTransaction(registry);let failed=false,primary;
 const sync=operation=>owner.sync(operation,{signal}),asyncApi=operation=>owner.asyncApi(operation,{signal});
 try{
  record.lease=await getExecutionScheduler(budget,{maxWorkers:owner.profile.maxWorkers??1}).acquire({cpu:0,gpu:1,signal,resourceOwner:'stereo-gaussian',label:'stereo-GPU-resident-two-axis'});record.workspace=owner.reserve(plan.workspaceBytes);record.device=device;
  sync(()=>device.pushErrorScope('validation'));record.scopes++;sync(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
  const make=(size,usage,label)=>{const buffer=sync(()=>device.createBuffer({size,usage,label})),entry={bytes:size,destroyed:false,release:null};record.buffers.set(buffer,entry);entry.release=budget.registerBacking?.('gpu',size,{owner:'stereogram',label});return buffer;};
  const source=make(plan.bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'stereo-resident-input'),intermediate=make(plan.bytes,GPUBufferUsage.STORAGE,'stereo-resident-axis1'),result=make(plan.bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'stereo-resident-axis2'),read=make(plan.bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'stereo-resident-readback'),kernel=make(weights.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'stereo-resident-kernel'),uniforms=[0,1].map(axis=>make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'stereo-resident-shape-'+axis));
  let data=new Uint8Array(plan.bytes);await input.readInto(data,0);checkAbort(signal);sync(()=>device.queue.writeBuffer(source,0,data));data=null;sync(()=>device.queue.writeBuffer(kernel,0,weights));
  const encoder=sync(()=>device.createCommandEncoder());for(let axis=0;axis<2;axis++){sync(()=>device.queue.writeBuffer(uniforms[axis],0,new Uint32Array([width,height,0,0,height,weights.length,kernelKind==='image'?axis:axis+2,channels])));const group=sync(()=>device.createBindGroup({layout:owner.pipeline.getBindGroupLayout(0),entries:[axis?intermediate:source,kernel,axis?result:intermediate,uniforms[axis]].map((buffer,binding)=>({binding,resource:{buffer}}))})),pass=sync(()=>encoder.beginComputePass());sync(()=>{pass.setPipeline(owner.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(width*channels/16),Math.ceil(height/16));pass.end();});}
  sync(()=>encoder.copyBufferToBuffer(result,0,read,0,plan.bytes));checkAbort(signal);const start=performance.now();sync(()=>device.queue.submit([encoder.finish()]));if(!mapAck){await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;}await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=sync(()=>read.getMappedRange());record.mapping.release=budget.registerBacking?.('gpu-mapped',plan.bytes,{owner:'stereogram',label:'stereo-resident-output',identity:mapped});
  const bytes=new Uint8Array(mapped).slice();sync(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;await output.write(bytes,0);await output.flush();checkAbort(signal);
  const oom=await asyncApi(()=>device.popErrorScope());record.scopes--;const validation=await asyncApi(()=>device.popErrorScope());record.scopes--;if(oom||validation)throw owner.nativeFailure(new EngineError('GPU_FAILED',(oom??validation).message));checkAbort(signal);if(owner.lost)throw owner.nativeFailure(new EngineError('GPU_FAILED','Stereo context lost before result commit.'));if(mapAck)record.drained=true;
  owner.metrics.calls++;owner.metrics.tiles+=2;owner.metrics.residentCalls=(owner.metrics.residentCalls??0)+1;owner.metrics.kernelMs+=performance.now()-start;owner.metrics.uploadBytes+=plan.bytes;owner.metrics.readbackBytes+=plan.bytes;return true;
 }catch(error){failed=true;primary=error;throw error;}
 finally{try{await retireGpuTransaction(registry,record);}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
