import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {initializeGpuOwner,gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,openOwnedGpuDevice,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {energyLogData} from './energy-log-data.js';
import {energyScoresShader} from './energy-score-gpu-shader.js';
import {createEnergyScorePolicy} from './energy-score-policy.js';
import {nativeEnergyScores} from './energy-score-native.js';

const MiB=1024**2,MINIMUM_LOG_BITS=973078528,MAXIMUM_LOG_BITS=1157627904;
const f=Math.fround;
export function energyScoreGpuPlan(count,centerBytes,tableBytes,{available,limits}={}){
 requireValue(Number.isSafeInteger(count)&&count>0&&count<2**31&&Number.isSafeInteger(centerBytes)&&centerBytes>0&&Number.isSafeInteger(tableBytes)&&tableBytes>=0,'Valid native energy score dimensions required.');
 const overhead=2*MiB+centerBytes*2+tableBytes*2;
 const band=Math.min(count,Math.floor((available-overhead)/96),Math.floor(Math.min(limits.maxStorageBufferBindingSize,limits.maxBufferSize)/16),limits.maxComputeWorkgroupsPerDimension**2*128);
 if(!Number.isSafeInteger(band)||band<1||centerBytes>limits.maxStorageBufferBindingSize||tableBytes>limits.maxStorageBufferBindingSize)return null;
 return{band,workspaceBytes:band*96+overhead};
}

export class EnergyScoreGpu{
 constructor(budget){initializeGpuOwner(this,budget,'ela-energy-score');this.program=null;this.policy=null;this.policyFree=null;}
 selectBackend(count,requested='webgpu'){
  requireValue(['cpu','webgpu','auto'].includes(requested),'Unknown native energy score backend.');
  if(this.closed)throw new EngineError('DISPOSED','Energy score GPU closed.');
  if(requested==='cpu'||requested==='auto'&&!globalThis.navigator?.gpu)return'cpu';if(requested==='webgpu')return'webgpu';
  if(!this.policy){let free;try{free=this.budget.reserve(2048);}catch(error){if(error?.code==='MEMORY_LIMIT')return'cpu';throw error;}this.policyFree=free;this.policy=createEnergyScorePolicy();}
  return this.policy.choose(count);
 }
 observeScore(count,backend,milliseconds){this.policy?.observe(count,backend,milliseconds);}
 async runScores(planes,scope,summaries,{backend='webgpu',...options}={}){
  const started=performance.now();
  try{return await this.run(planes,scope,summaries,options);}
  catch(error){
   if(backend!=='auto'||options.signal?.aborted||!this.mayFallback(error))throw error;
   this.policy?.refuse(scope.length);
   try{await this.retire();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}
   const start=performance.now();await nativeEnergyScores(planes,scope,summaries,options);
   return{backend:'cpu-native-energy-score-recovery',gpuRefusal:error.code,nativeRecoveryMs:performance.now()-start,totalMs:performance.now()-started};
  }
 }
 mayFallback(error){return gpuOwnerMayFallback(this,error);}
 failure(error){return gpuOwnerFailure(this,error);}
 sync(action,signal){return gpuOwnerSync(this,action,signal);}
 asyncApi(action,signal){return gpuOwnerAsync(this,action,signal);}
 reserve(bytes){return gpuOwnerReserve(this,bytes);}
 async initialize(signal){
  if(!this.ready)this.ready=(async()=>{
   const free=this.reserve(4*MiB);this.orphanPipelineFees.add(free);
   const device=await openOwnedGpuDevice(this,signal);checkAbort(signal);
   const module=this.sync(()=>device.createShaderModule({code:energyScoresShader}),signal),info=await this.asyncApi(()=>module.getCompilationInfo(),signal);
   if(info.messages.some(value=>value.type==='error'))throw this.failure(new EngineError('GPU_FAILED',info.messages.map(value=>value.message).join('\n')));
   const pipeline=await this.asyncApi(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),signal);checkAbort(signal);
   this.program={pipeline,free};this.orphanPipelineFees.delete(free);return device;
  })().catch(error=>{this.retirementNeeded=true;this.ready=null;throw error;});
  return this.ready;
 }
 async retirePipelines(){if(this.program){await this.program.free();this.program=null;}}
 async run(planes,scope,summaries,{low,high,log,signal,onSubmitted}={}){
  const count=scope?.length;
  requireValue(scope instanceof Int32Array&&Number.isSafeInteger(count)&&count>0&&count<2**31&&planes instanceof Float32Array&&planes.length===count*3&&low instanceof Float32Array&&high instanceof Float32Array&&low.length===count&&high.length===count&&Array.isArray(summaries)&&typeof log==='function','Owned native energy arrays and logarithm required.');
  requireValue(summaries.every(value=>Number.isInteger(value.id)&&value.id>0&&value.id<2**31&&Array.isArray(value.probes)&&value.probes.length===3&&value.probes.every(probe=>Number.isFinite(probe.central_mean)&&probe.central_mean>=0&&probe.central_mean<=255))&&new Set(summaries.map(value=>value.id)).size===summaries.length,'Native energy panel means and identities required.');
  checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Energy score GPU closed.');if(this.busy)throw new EngineError('BUSY','Energy score GPU active.');
  if(!summaries.length){low.fill(0);high.fill(0);return{backend:'cpu-empty-native-energy',bands:0,refinedPixels:0};}
  this.busy=true;this.fallbackFailures=new WeakSet();const started=performance.now(),cooperate=createCooperator(signal);let record,result,failed=false,primary;
  try{
   if(this.retirementNeeded||this.pending.size)await retireOwnedGpuDevice(this);
   record=gpuTransaction(this);record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'ela',label:'energy-score-native-rounds'});
   await this.initialize(signal);const device=this.device;record.device=device;
   // Host lookup metadata is funded before it is constructed, independently
   // of the caller's scientific arrays and the GPU band workspace.
   record.outputFree=this.reserve(summaries.length*128+256*1024);
   const centers=new Uint32Array(summaries.length*4),centerFloats=new Float32Array(centers.buffer),ordered=[...summaries].sort((a,b)=>a.id-b.id),numerators=new Map();
   for(let i=0;i<ordered.length;i++){
    centers[i*4]=ordered[i].id;const values=ordered[i].probes.map(probe=>f(probe.central_mean+.25));numerators.set(ordered[i].id,values);
    for(let q=0;q<3;q++)centerFloats[i*4+q+1]=values[q];
   }
   const data=energyLogData(),words=new Uint32Array(data.buffer,data.byteOffset,data.byteLength/4),buckets=new Uint32Array(((MAXIMUM_LOG_BITS-MINIMUM_LOG_BITS)>>>16)+2);let at=0;
   requireValue(words.byteLength+buckets.byteLength<=256*1024,'Qualified energy logarithm metadata exceeds its funded bound.');
   for(let i=0;i<buckets.length;i++){const key=MINIMUM_LOG_BITS+i*65536;while(at<words.length&&words[at]<key)at+=2;buckets[i]=at;}
   const plan=energyScoreGpuPlan(count,centers.byteLength,words.byteLength+buckets.byteLength,{available:this.budget.limit-this.budget.total(),limits:device.limits});
   if(!plan)throw this.failure(new EngineError('GPU_LIMIT','No energy score band fits the shared GPU budget.'));record.workspace=this.reserve(plan.workspaceBytes);
   this.sync(()=>device.pushErrorScope('validation'),signal);record.scopes++;this.sync(()=>device.pushErrorScope('out-of-memory'),signal);record.scopes++;
   const make=(size,usage,label)=>{const buffer=this.sync(()=>device.createBuffer({size:Math.max(4,size),usage,label}),signal),entry={bytes:Math.max(4,size),destroyed:false,release:null};record.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',entry.bytes,{owner:'ela-energy',label});return buffer;};
   const input=make(plan.band*12,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'energy-native-planes'),scopeBuffer=make(plan.band*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'energy-native-scope'),centerBuffer=make(centers.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'energy-native-centers'),exceptionBuffer=make(words.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'energy-native-log-exceptions'),bucketBuffer=make(buckets.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'energy-native-log-buckets'),output=make(plan.band*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'energy-low-high-rounding'),read=make(plan.band*16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'energy-readback'),uniform=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'energy-shape');
   this.sync(()=>{device.queue.writeBuffer(centerBuffer,0,centers);device.queue.writeBuffer(exceptionBuffer,0,words);device.queue.writeBuffer(bucketBuffer,0,buckets);},signal);
   const group=this.sync(()=>device.createBindGroup({layout:this.program.pipeline.getBindGroupLayout(0),entries:[input,scopeBuffer,centerBuffer,exceptionBuffer,bucketBuffer,output,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}),signal);
   let bands=0,refinedPixels=0;
   for(let offset=0;offset<count;offset+=plan.band){
    await cooperate();checkAbort(signal);const length=Math.min(plan.band,count-offset),groups=Math.ceil(length/128),groupsX=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);
    this.sync(()=>{for(let q=0;q<3;q++)device.queue.writeBuffer(input,q*length*4,planes.subarray(q*count+offset,q*count+offset+length));device.queue.writeBuffer(scopeBuffer,0,scope.subarray(offset,offset+length));device.queue.writeBuffer(uniform,0,new Uint32Array([length,groupsX,MINIMUM_LOG_BITS,MAXIMUM_LOG_BITS,ordered.length,0,0,0]));},signal);
    const encoder=this.sync(()=>device.createCommandEncoder(),signal),pass=this.sync(()=>encoder.beginComputePass(),signal);this.sync(()=>{pass.setPipeline(this.program.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(output,0,read,0,length*16);},signal);
    record.drained=false;this.sync(()=>device.queue.submit([encoder.finish()]),signal);onSubmitted?.({band:bands,offset,pixels:length});await this.asyncApi(()=>read.mapAsync(GPUMapMode.READ,0,length*16),signal);record.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);
    const mapped=this.sync(()=>read.getMappedRange(0,length*16),signal);record.mapping.release=this.budget.registerBacking?.('gpu-mapped',length*16,{owner:'ela-energy',label:'energy-score-map',identity:mapped});
    const copied=new Uint32Array(mapped).slice(),values=new Float32Array(copied.buffer);this.sync(()=>read.unmap(),signal);record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;
    for(let i=0;i<length;i++){
     if((i&8191)===0)await cooperate();const index=offset+i;
     if(!copied[i*4+2]){low[index]=values[i*4];high[index]=values[i*4+1];continue;}
     const center=numerators.get(scope[index]);requireValue(center,'Energy GPU scope identity differs from native panel means.');
     const scores=[0,1,2].map(q=>f(log(f(center[q]/f(planes[q*count+index]+.25)))/f(.2))),[x,y,z]=scores,median=x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));low[index]=Math.max(median,0);high[index]=Math.max(-median,0);refinedPixels++;
    }
    bands++;
   }
   const oom=await this.asyncApi(()=>device.popErrorScope(),signal);record.scopes--;const validation=await this.asyncApi(()=>device.popErrorScope(),signal);record.scopes--;if(oom||validation)throw this.failure(new EngineError('GPU_FAILED',(oom??validation).message));checkAbort(signal);if(this.lost)throw this.failure(new EngineError('GPU_FAILED','Energy GPU context lost before result publication.'));record.drained=true;
   result={backend:'webgpu-native-energy-scores',bands,refinedPixels,pixelsPerBand:plan.band,rounding:'native-f32-with-CPU-boundary-replay'};return result;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   let cleanupFailed=false,cleanup;try{if(record)await retireGpuTransaction(this,record);}catch(error){cleanupFailed=true;cleanup=error;}this.busy=false;
   if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
   if(!failed)checkAbort(signal);if(result)result.totalMs=performance.now()-started;
  }
 }
 retire(){requireValue(!this.busy,'Energy score GPU is active.');return retireOwnedGpuDevice(this);}
 dispose(){return disposeGpuOwner(this,async()=>{if(this.policyFree){await this.policyFree();this.policyFree=null;this.policy=null;}});}
}
