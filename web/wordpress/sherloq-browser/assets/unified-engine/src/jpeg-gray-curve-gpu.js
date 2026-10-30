import "../../runtime-context.js?v=0.30.0";
import {createJpegGrayCurvePolicy} from './jpeg-gray-curve-policy.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {elaJpegQuantization} from './ela-gpu.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
import {gpuTransaction,retireGpuTransaction,drainGpuTransactions,attachGpuCleanup} from './gpu-ack-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';

const MiB=1024**2,PIPELINE_BYTES=4*MiB;
let manifest;
async function pinnedSource({signal}={}){
 const root=new URL('../vendor/jpeg-quality-gpu/',import.meta.url);
 manifest??=fetch(new URL('PINNED.json',root)).then(async response=>{if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','JPEG-curve GPU manifest unavailable.');return response.json();}).catch(error=>{manifest=null;throw error;});
 const spec=(await manifest).files?.['jpeg-gray-curve.wgsl'];requireValue(Number.isSafeInteger(spec?.bytes)&&spec.bytes>0&&/^[a-f0-9]{64}$/.test(spec.sha256),'Pinned JPEG-curve shader required.');checkAbort(signal);
 const response=await fetch(new URL('jpeg-gray-curve.wgsl',root),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','JPEG-curve GPU source unavailable.');const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');requireValue(bytes.byteLength===spec.bytes&&digest===spec.sha256,'JPEG-curve shader identity differs.');checkAbort(signal);return new TextDecoder().decode(bytes);
}

// Bands transport complete native8-row block phases. They never become new
// JPEG scientific contexts: only the true context edges replicate pixels, and
// all integer losses are summed globally before the original normalization.
export function planJpegGrayBands(width,height,count,{available,limits}={}){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=65500&&height<=65500&&Number.isSafeInteger(count)&&count>0&&count<=101,'Native JPEG dimensions and quality count required.');
 requireValue(Number.isSafeInteger(available)&&available>=0&&limits,'Funded JPEG GPU planning limits required.');
 const cols=Math.ceil(width/8),axis=limits.maxComputeWorkgroupsPerDimension,binding=limits.maxStorageBufferBindingSize,maximum=limits.maxBufferSize;
 requireValue([axis,binding,maximum].every(value=>Number.isSafeInteger(value)&&value>0),'Actual GPU limits required.');
 const candidate=blockRows=>{const bandHeight=Math.min(height,blockRows*8),pixels=width*bandHeight,blocks=cols*blockRows,sourceBytes=Math.ceil(pixels/4)*4,dctBytes=blocks*256,partialBytes=blocks*count*4,resultBytes=count*8,quantBytes=count*64*4,groups=Math.ceil(blocks/32),groupsX=Math.min(groups,axis),groupsY=Math.ceil(groups/groupsX),workspaceBytes=sourceBytes*2+dctBytes+partialBytes+resultBytes*5+quantBytes*2+2*MiB,hostBytes=pixels*4+1024**2,totalBytes=workspaceBytes+hostBytes+count*8+128;
  return{blockRows,bandHeight,cols,blocks,sourceBytes,dctBytes,partialBytes,resultBytes,quantBytes,groupsX,groupsY,workspaceBytes,hostBytes,totalBytes,fits:totalBytes<=available&&[sourceBytes,dctBytes,partialBytes,quantBytes,resultBytes].every(bytes=>bytes<=binding&&bytes<=maximum)&&groupsY<=axis&&count<=axis};};
 let low=1,high=Math.ceil(height/8),best=null;while(low<=high){const middle=Math.floor((low+high)/2),value=candidate(middle);if(value.fits){best=value;low=middle+1;}else high=middle-1;}
 return best;
}

function scalarResult(owner,raw,free,runtime){
 let closed=false,retiring=false,backingRetired=false,notified=false,active,retiredBytes;
 const backing=owner.budget.registerBacking?.('array-buffer',raw.byteLength,{owner:'jpeg-quality',label:'JPEG-loss-curve',identity:raw.buffer});
 const result={get raw(){if(closed||retiring)throw new EngineError('DISPOSED','JPEG GPU curve released.');return raw;},runtime,
  release(){if(closed)return;if(active)return active;retiring=true;owner.pendingResults.add(result);active=(async()=>{if(!backingRetired){retiredBytes=await backing?.();backingRetired=true;}if(!notified){if(retiredBytes!==0)owner.budget.notifyBackingRelease?.('array-buffer',retiredBytes??raw.byteLength);notified=true;}await free();raw=null;closed=true;owner.pendingResults.delete(result);})().finally(()=>{active=null;});return active;}
 };return result;
}

export class JpegGrayCurveGpu{
 constructor(budget,{loadShader=pinnedSource,acknowledgeReadback=true}={}){
  requireValue(budget?.reserve&&typeof loadShader==='function','Shared JPEG GPU budget and source required.');requireValue(typeof acknowledgeReadback==='boolean','Invalid JPEG readback ACK policy.');this.acknowledgeReadback=acknowledgeReadback;this.budget=budget;this.loadShader=loadShader;this.device=null;this.ready=null;this.module=null;this.pipelines=new Map();this.orphanFees=new Set();this.pending=new Set();this.pendingInputs=new Set();this.pendingResults=new Set();this.fallbackFailures=new WeakSet();this.closed=false;this.busy=false;this.deviceDestroyed=false;this.lost=false;this.unregister=null;this.disposal=null;
 }
 nativeFailure(error){if(error&&typeof error==='object')this.fallbackFailures.add(error);return error;}
 mayFallback(error){return !!error&&typeof error==='object'&&this.fallbackFailures.has(error);}
 sync(operation,signal){try{return nativeGpuSync(operation,{signal});}catch(error){throw this.nativeFailure(error);}}
 async asyncApi(operation,signal){try{return await nativeGpuAsync(operation,{signal});}catch(error){throw this.nativeFailure(error);}}
 reserve(bytes){try{return this.budget.reserve(bytes);}catch(error){throw this.nativeFailure(error);}}
 async initialize(signal){
  if(!this.ready)this.ready=(async()=>{
   if(!globalThis.navigator?.gpu)throw this.nativeFailure(new EngineError('GPU_UNAVAILABLE','JPEG-curve WebGPU unavailable.'));
   this.unregister??=this.budget.registerAsyncReclaimer?.(async()=>{if(this.busy)return 0;const before=this.budget.total();await this.retireDevice();return Math.max(0,before-this.budget.total());},{allocationKind:'gpu',owner:'jpeg-quality',label:'idle-JPEG-curve-GPU'});
   const adapter=await this.asyncApi(()=>navigator.gpu.requestAdapter({powerPreference:'high-performance'}),signal);if(!adapter)throw this.nativeFailure(new EngineError('GPU_UNAVAILABLE','JPEG-curve WebGPU adapter unavailable.'));checkAbort(signal);
   const device=await this.asyncApi(()=>adapter.requestDevice({requiredLimits:{maxBufferSize:Math.min(adapter.limits.maxBufferSize,512*MiB),maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,512*MiB)}}),signal);this.device=device;this.deviceDestroyed=false;this.lost=false;device.lost?.then(()=>{if(this.device===device)this.lost=true;});return device;
  })().catch(error=>{this.ready=null;throw error;});return this.ready;
 }
 async pipeline(name,signal){
  if(this.pipelines.has(name))return this.pipelines.get(name).pipeline;
  const free=this.reserve(PIPELINE_BYTES);this.orphanFees.add(free);
  if(!this.module){let code;try{code=await this.loadShader({signal});}catch(error){if(this.loadShader===pinnedSource&&error?.code==='CODEC_UNAVAILABLE')this.nativeFailure(error);throw error;}const module=this.sync(()=>this.device.createShaderModule({code}),signal),info=await this.asyncApi(()=>module.getCompilationInfo(),signal);if(info.messages.some(message=>message.type==='error'))throw this.nativeFailure(new EngineError('GPU_FAILED',info.messages.map(message=>message.message).join('\n')));checkAbort(signal);this.module=module;}
  const pipeline=await this.asyncApi(()=>this.device.createComputePipelineAsync({layout:'auto',compute:{module:this.module,entryPoint:name}}),signal);checkAbort(signal);this.pipelines.set(name,{pipeline,free});this.orphanFees.delete(free);return pipeline;
 }
 async retireInput(entry){
  if(!entry.acknowledged){await entry.input?.release?.();entry.acknowledged=true;entry.input=null;}
  await entry.free();this.pendingInputs.delete(entry);
 }
 async run({width,height,qualities,readGrayRows},{signal,onProgress,onSubmitted}={}){
  requireValue(Array.isArray(qualities)&&qualities.length>0&&qualities.every((quality,index)=>Number.isInteger(quality)&&quality>=0&&quality<=100&&(!index||quality>qualities[index-1]))&&typeof readGrayRows==='function','Ordered native JPEG qualities and gray row reader required.');qualities=qualities.slice();
  // Validate shape before device creation, array construction or callbacks.
  requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=65500&&height<=65500,'Native JPEG context dimensions required.');checkAbort(signal);
  if(this.closed)throw new EngineError('DISPOSED','JPEG GPU provider closed.');if(this.busy)throw new EngineError('BUSY','JPEG GPU provider already running.');this.busy=true;this.fallbackFailures=new WeakSet();let transaction,owned,published=false,failed=false,primary;
  const started=performance.now();
  try{
   if(this.pending.size||this.pendingInputs.size||this.orphanFees.size||this.lost)await this.retireDevice();
   transaction=gpuTransaction(this);transaction.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'ela',label:'native-gray-JPEG-loss-curve'});await this.initialize(signal);transaction.device=this.device;
   const compileStarted=performance.now(),pipelines=[];for(const name of ['transform','loss','reduce'])pipelines.push(await this.pipeline(name,signal));const compileMs=performance.now()-compileStarted,device=this.device,plan=planJpegGrayBands(width,height,qualities.length,{available:Math.max(0,this.budget.limit-this.budget.total()),limits:device.limits});
   if(!plan)throw this.nativeFailure(new EngineError('GPU_LIMIT','No complete native JPEG block row fits the shared GPU budget.'));
   transaction.workspace=this.reserve(plan.workspaceBytes);transaction.outputFree=this.reserve(qualities.length*8+128);
   this.sync(()=>device.pushErrorScope('validation'),signal);transaction.scopes++;this.sync(()=>device.pushErrorScope('out-of-memory'),signal);transaction.scopes++;
   const make=(size,usage,label)=>{const buffer=this.sync(()=>device.createBuffer({size,usage,label}),signal),entry={bytes:size,destroyed:false,release:null};transaction.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',size,{owner:'jpeg-quality',label});return buffer;};
   const input=make(plan.sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'JPEG-curve-gray'),dct=make(plan.dctBytes,GPUBufferUsage.STORAGE,'JPEG-shared-native-FDCT'),quant=make(plan.quantBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'JPEG-native-quantization'),partial=make(plan.partialBytes,GPUBufferUsage.STORAGE,'JPEG-native-block-losses'),output=make(plan.resultBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'JPEG-native-loss-sums'),uniform=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'JPEG-curve-context'),read=make(plan.resultBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'JPEG-curve-readback');
   this.sync(()=>device.queue.writeBuffer(quant,0,Uint32Array.from(qualities.flatMap(quality=>Array.from(elaJpegQuantization(Math.max(1,quality))).slice(0,64)))),signal);
   const resources=[input,dct,quant,partial,output,uniform],bindings=[[0,1,5],[0,1,2,3,5],[3,4,5]],groups=pipelines.map((pipeline,index)=>this.sync(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:bindings[index].map(binding=>({binding,resource:{buffer:resources[binding]}}))}),signal)),sums=new Float64Array(qualities.length);let bands=0,kernelMs=0;
   for(let y=0;y<height;y+=plan.bandHeight){
    await controlCheckpoint(signal);const count=Math.min(plan.bandHeight,height-y),loan={free:this.reserve(width*count*4+1024**2),input:null,acknowledged:false};this.pendingInputs.add(loan);
    const provided=await readGrayRows(y,count,{signal,reserve:bytes=>loan.free.split(bytes),ownInput:input=>{requireValue(!loan.input&&input&&typeof input==='object','One borrowed JPEG input owner required.');loan.input=input;}});requireValue(!loan.input||loan.input===provided,'JPEG row reader changed its registered owner.');loan.input=provided;checkAbort(signal);const bytes=loan.input?.data;requireValue(bytes instanceof Uint8Array&&bytes.length===width*count,'Complete native gray rows required.');const prefix=Math.floor(bytes.byteLength/4)*4;if(prefix)this.sync(()=>device.queue.writeBuffer(input,0,bytes,0,prefix),signal);if(prefix<bytes.length){const tail=new Uint8Array(4);tail.set(bytes.subarray(prefix));this.sync(()=>device.queue.writeBuffer(input,prefix,tail),signal);}await this.retireInput(loan);checkAbort(signal);
    const blocks=plan.cols*Math.ceil(count/8),groupCount=Math.ceil(blocks/32),groupsX=Math.min(groupCount,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groupCount/groupsX);this.sync(()=>device.queue.writeBuffer(uniform,0,new Uint32Array([width,count,plan.cols,blocks,groupsX,qualities.length,0,0])),signal);
    const kernelStarted=performance.now(),encoder=this.sync(()=>device.createCommandEncoder(),signal);for(let index=0;index<3;index++){const pass=this.sync(()=>encoder.beginComputePass(),signal);this.sync(()=>{pass.setPipeline(pipelines[index]);pass.setBindGroup(0,groups[index]);if(index===2)pass.dispatchWorkgroups(qualities.length);else pass.dispatchWorkgroups(groupsX,groupsY,index===1?qualities.length:1);pass.end();},signal);}this.sync(()=>encoder.copyBufferToBuffer(output,0,read,0,plan.resultBytes),signal);checkAbort(signal);transaction.drained=false;this.sync(()=>device.queue.submit([encoder.finish()]),signal);onSubmitted?.({band:bands,y,rows:count});if(!this.acknowledgeReadback){await this.asyncApi(()=>device.queue.onSubmittedWorkDone(),signal);transaction.drained=true;}checkAbort(signal);
    await this.asyncApi(()=>read.mapAsync(GPUMapMode.READ),signal);transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=this.sync(()=>read.getMappedRange(),signal);transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',plan.resultBytes,{owner:'jpeg-quality',label:'JPEG-loss-sums-mapping',identity:mapped});const words=new Uint32Array(mapped);for(let index=0;index<qualities.length;index++)sums[index]+=words[index*2]+words[index*2+1]*4294967296;this.sync(()=>read.unmap(),signal);transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;kernelMs+=performance.now()-kernelStarted;bands++;onProgress?.((y+count)/height);checkAbort(signal);
   }
   const oom=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;const validation=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;if(oom||validation)throw this.nativeFailure(new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));checkAbort(signal);if(this.lost)throw this.nativeFailure(new EngineError('GPU_FAILED','JPEG GPU context lost before publication.'));if(this.acknowledgeReadback)transaction.drained=true;
   const reciprocal=1/(width*height);for(let index=0;index<sums.length;index++)sums[index]*=reciprocal;const free=transaction.outputFree;owned=scalarResult(this,sums,free,{backend:'webgpu-native-gray-islow',kernel:'shared-integer-FDCT-quant-IDCT-u64-losses',qualities:qualities.length,bands,rowsPerBand:plan.bandHeight,maximumAbsoluteError:0,entropy:'lossless-identity-fused-scalar-pixel-loss-only',acknowledgement:this.acknowledgeReadback?'final-dependent-readback-and-valid-scopes':'queue-fence-and-readback',pipelineCompileMs:compileMs,kernelMs,totalMs:performance.now()-started});transaction.outputFree=null;published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   let cleanupFailed=false,cleanup;const attempt=async operation=>{try{await operation();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}};
   if(transaction)await attempt(()=>retireGpuTransaction(this,transaction));for(const entry of [...this.pendingInputs])await attempt(()=>this.retireInput(entry));if(owned&&(!published||failed||cleanupFailed))await attempt(()=>owned.release());this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async retireDevice(){
  let failed=false,primary;const attempt=async operation=>{try{await operation();}catch(error){if(!failed){failed=true;primary=error;}}},device=this.device;let acknowledged=!device;
  if(device&&!this.deviceDestroyed)await attempt(()=>{nativeGpuSync(()=>device.destroy());this.deviceDestroyed=true;});await attempt(()=>drainGpuTransactions(this));for(const input of [...this.pendingInputs])await attempt(()=>this.retireInput(input));for(const result of [...this.pendingResults])await attempt(()=>result.release());
  if(device)await attempt(async()=>{try{await nativeGpuAsync(()=>device.queue.onSubmittedWorkDone());}catch(error){if(!this.deviceDestroyed||!device.lost)throw error;await device.lost;}acknowledged=this.deviceDestroyed;});
  if(acknowledged&&!this.pending.size&&!this.pendingInputs.size){this.device=null;this.ready=null;this.module=null;this.lost=false;for(const[name,entry]of this.pipelines)await attempt(async()=>{await entry.free();this.pipelines.delete(name);});for(const free of [...this.orphanFees])await attempt(async()=>{await free();this.orphanFees.delete(free);});if(!this.pipelines.size&&!this.orphanFees.size){this.unregister?.();this.unregister=null;}}
  if(failed)throw primary;
 }
 dispose(){if(this.busy)throw new EngineError('BUSY','JPEG GPU operation must drain before disposal.');this.closed=true;return this.disposal??=(async()=>{await this.retireDevice();})().finally(()=>{this.disposal=null;});}
}

const services=new WeakMap();
export function getJpegGrayCurveService(budget){
 let service=services.get(budget);if(service)return service;
 let gpu,closed=false,unavailable=false,queue=Promise.resolve(),lastFailure=null,policy=createJpegGrayCurvePolicy(),policyKey;
 const selectProfile=profile=>{const key=JSON.stringify([budget.limit,profile?.id??'default',profile?.maxWorkers??1]);if(key!==policyKey){policy=createJpegGrayCurvePolicy();policyKey=key;}};
 service={
  run(input,hooks={}){
   const work=async()=>{
    checkAbort(hooks.signal);if(closed)throw new EngineError('DISPOSED','JPEG GPU service closed.');
    const backend=hooks.backend??'auto';
    selectProfile(hooks.profile);const choice=policy.choose(input.width*input.height,input.qualities.length);
    if(backend==='cpu'||backend==='auto'&&!choice.gpu||unavailable||!globalThis.navigator?.gpu)return null;
    try{gpu??=new JpegGrayCurveGpu(budget);const answer=await gpu.run(input,hooks);policy.observeGpu(input.width*input.height,input.qualities.length,Math.max(.001,answer.runtime.totalMs-answer.runtime.pipelineCompileMs));answer.runtime.selection={...choice,automatic:backend==='auto',observations:policy.snapshot()};return answer;}
    catch(error){checkAbort(hooks.signal);if(!gpu?.mayFallback(error))throw error;lastFailure=error.code;unavailable=['GPU_UNAVAILABLE','CODEC_UNAVAILABLE'].includes(error.code);await gpu.dispose();gpu=null;return null;}
   };
   const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;
  },
  ownsResources(){return !!gpu;},
  observeCpu(pixels,count,milliseconds,profile){selectProfile(profile);policy.observeCpu(pixels,count,milliseconds);},
  metrics(){return{gpuFallback:lastFailure};},
  async dispose(){closed=true;await queue;await gpu?.dispose();gpu=null;}
 };
 services.set(budget,service);return service;
}
export async function disposeJpegGrayCurveService(budget){const service=services.get(budget);if(service){await service.dispose();if(services.get(budget)===service)services.delete(budget);}}

export const hasJpegGrayCurveResources=budget=>services.get(budget)?.ownsResources()??false;
export function forgetJpegGrayCurvePolicy(budget){const service=services.get(budget);if(service&&!service.ownsResources())services.delete(budget);}

export function observeJpegGrayCpu(budget,pixels,count,milliseconds,profile){if(budget)getJpegGrayCurveService(budget).observeCpu(pixels,count,milliseconds,profile);}
