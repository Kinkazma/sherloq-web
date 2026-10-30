import "../../runtime-context.js?v=0.30.0";
import {createElaUsefulBackendPolicy} from './ela-useful-backend.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {validateParams} from './ela.js';
import {allocateTypedArray} from './allocation.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {elaGpuTransaction,retireElaGpuTransaction,drainElaGpuTransactions,attachElaGpuCleanup} from './ela-gpu-retirement.js';
const MiB=1024**2,PIPELINE_BYTES=4*MiB;
let manifest;
async function shaderSource({signal}={}){
 const root=new URL('../vendor/ela-gpu/',import.meta.url);manifest??=fetch(new URL('PINNED.json',root)).then(async r=>{if(!r.ok)throw new EngineError('CODEC_UNAVAILABLE','ELA GPU manifest unavailable.');return r.json();}).catch(e=>{manifest=null;throw e;});const spec=(await manifest).files?.['ela-jpeg.wgsl'];
 requireValue(Number.isInteger(spec?.bytes)&&spec.bytes>0&&/^[a-f0-9]{64}$/.test(spec.sha256),'Pinned ELA shader required.');checkAbort(signal);const response=await fetch(new URL('ela-jpeg.wgsl',root),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','ELA GPU source unavailable.');const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');requireValue(bytes.byteLength===spec.bytes&&hash===spec.sha256,'ELA GPU source identity differs.');checkAbort(signal);return new TextDecoder().decode(bytes);
}
// The standard native IJG quality scaling and baseline quantization tables.
// These are algorithm constants, never image-derived outputs.
export function elaJpegQuantization(quality){
 requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100,'Native JPEG quality1–100 required.');
 const y=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99],c=[17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99,...Array(32).fill(99)],scale=quality<50?Math.floor(5000/quality):200-quality*2;
 return Uint32Array.from([...y,...c],v=>Math.max(1,Math.min(255,Math.floor((v*scale+50)/100))));
}
function ownedResult(data,recompressed,free,owners,budget,width,height,runtime,pendingRegistry){
 let closed=false,retiring=false,cursor=0,active;
 const done=()=>{closed=true;pendingRegistry?.delete(result);};
 const advance=()=>{while(cursor<owners.length){const owner=owners[cursor],ack=owner.release?.(),accept=bytes=>{cursor++;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes??owner.bytes);};if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(accept).then(advance);accept(ack);}const ack=free();if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(done);done();};
 const result={width,height,get data(){if(closed||retiring)throw new EngineError('DISPOSED','ELA GPU result released.');return data;},get recompressed(){if(closed||retiring)throw new EngineError('DISPOSED','ELA GPU result released.');return recompressed;},runtime,
  release(){if(closed)return;if(active)return active;retiring=true;pendingRegistry?.add(result);data=null;recompressed=null;const ack=advance();if(ack&&typeof ack.then==='function'){active=Promise.resolve(ack).finally(()=>{active=null;});return active;}}
 };return result;
}
// Pixel-only composition of the unchanged native ISLOW420 operators. The
// lossless entropy encode/decode identity is fused, never a codec approximation.
// Callers requiring encoded bytes, lengths or archives keep native entropy;
// residual() accepts their real native decoded RGB without changing that path.
export class ElaGpu{
 constructor(budget,{loadShader=shaderSource}={}){requireValue(budget?.reserve&&typeof loadShader==='function','ELA GPU budget and source required.');this.budget=budget;this.loadShader=loadShader;this.device=null;this.ready=null;this.module=null;this.pipelines=new Map();this.pendingResults=new Set();this.busy=false;this.closed=false;this.lost=false;this.deviceDestroyed=false;this.pending=new Set();this.orphanPipelineFees=new Set();this.fallbackFailures=new WeakSet();this.unregister=null;this.disposal=null;this.disposalComplete=false;}
 nativeFailure(error){if(error&&typeof error==='object'&&(['CODEC_UNAVAILABLE'].includes(error.code)||gpuFallbackError(error)))this.fallbackFailures.add(error);return error;}
 mayFallback(error){return !!error&&typeof error==='object'&&this.fallbackFailures.has(error);}
 reserveGpu(bytes){try{return this.budget.reserve(bytes);}catch(error){throw this.nativeFailure(error);}}
 gpuSync(operation,signal){try{return nativeGpuSync(operation,{signal});}catch(error){throw this.nativeFailure(error);}}
 async gpuAsync(operation,signal){try{return await nativeGpuAsync(operation,{signal});}catch(error){throw this.nativeFailure(error);}}
 async initialize(signal){
  if(!this.ready)this.ready=(async()=>{
   if(!globalThis.navigator?.gpu)throw this.nativeFailure(new EngineError('GPU_UNAVAILABLE','ELA WebGPU unavailable.'));
   this.unregister??=this.budget.registerAsyncReclaimer?.(async()=>{if(this.busy)return 0;const before=this.budget.total();await this.retireDevice();return Math.max(0,before-this.budget.total());},{allocationKind:'gpu',owner:'ela-gpu',label:'idle-ELA-GPU-pipelines'});
   const adapter=await this.gpuAsync(()=>navigator.gpu.requestAdapter({powerPreference:'high-performance'}),signal);if(!adapter)throw this.nativeFailure(new EngineError('GPU_UNAVAILABLE','ELA WebGPU adapter unavailable.'));checkAbort(signal);
   const maximum=Math.min(adapter.limits.maxBufferSize,512*MiB),binding=Math.min(adapter.limits.maxStorageBufferBindingSize,512*MiB),device=await this.gpuAsync(()=>adapter.requestDevice({requiredLimits:{maxBufferSize:maximum,maxStorageBufferBindingSize:binding}}),signal);this.device=device;this.deviceDestroyed=false;this.lost=false;device.lost?.then(()=>{if(this.device===device)this.lost=true;});return device;
  })().catch(e=>{this.ready=null;throw e;});return this.ready;
 }
 async pipeline(name,signal){
  if(this.pipelines.has(name))return this.pipelines.get(name).pipeline;const free=this.reserveGpu(PIPELINE_BYTES);this.orphanPipelineFees.add(free);
  try{
   if(!this.module){let code;try{code=await this.loadShader({signal});}catch(error){if(this.loadShader===shaderSource&&error?.code==='CODEC_UNAVAILABLE')this.nativeFailure(error);throw error;}const module=this.gpuSync(()=>this.device.createShaderModule({code}),signal);this.module=module;const info=await this.gpuAsync(()=>module.getCompilationInfo(),signal);if(info.messages.some(m=>m.type==='error'))throw this.nativeFailure(new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n')));}
   const pipeline=await this.gpuAsync(()=>this.device.createComputePipelineAsync({layout:'auto',compute:{module:this.module,entryPoint:name}}),signal);checkAbort(signal);this.pipelines.set(name,{pipeline,free});this.orphanPipelineFees.delete(free);return pipeline;
  }catch(error){if(!this.module)try{await free();this.orphanPipelineFees.delete(free);}catch(cleanup){attachElaGpuCleanup(error,cleanup);}throw error;}
 }
 compose(original,width,height,params,table,hooks={}){return this.run(original,null,width,height,params,table,hooks);}
 residual(original,recompressed,width,height,params,table,hooks={}){return this.run(original,recompressed,width,height,params,table,hooks);}
 async run(original,recompressed,width,height,params,table,{signal,onSubmitted,onProgress}={}){
  const p=validateParams(params),pair=recompressed!==null;
  requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=65500&&height<=65500&&original instanceof Uint8Array&&original.length===width*height*3&&(!pair||recompressed instanceof Uint8Array&&recompressed.length===original.length)&&table instanceof Uint8Array&&table.length===65536,'Complete native ELA RGB inputs and table required.');checkAbort(signal);if(this.busy)throw new EngineError('BUSY','ELA GPU already running.');if(this.closed)throw new EngineError('DISPOSED','ELA GPU closed.');this.busy=true;this.fallbackFailures=new WeakSet();
  const started=performance.now(),scheduler=getExecutionScheduler(this.budget),transaction=elaGpuTransaction(this);let workspace,outputFree,owned,published=false,failed=false,primary;
  const api=operation=>{try{return nativeGpuSync(operation,{signal});}catch(error){throw this.nativeFailure(error);}},asyncApi=async operation=>{try{return await nativeGpuAsync(operation,{signal});}catch(error){throw this.nativeFailure(error);}};
  try{
   if(this.pending.size>1||this.lost||this.orphanPipelineFees.size){this.pending.delete(transaction);await this.retireDevice();this.pending.add(transaction);}
   transaction.lease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'ela',label:pair?'ela-native-residual-GPU':'ela-native-ISLOW420-GPU'});await this.initialize(signal);transaction.device=this.device;checkAbort(signal);const compileStarted=performance.now(),codec=pair?null:await this.pipeline('codec',signal),render=await this.pipeline(pair?'residual':'render',signal),compileMs=performance.now()-compileStarted,device=this.device,pixels=width*height,yCols=Math.ceil(width/8),yRows=Math.ceil(height/8),cCols=Math.ceil(width/16),cRows=Math.ceil(height/16),blocks=yCols*yRows+2*cCols*cRows,sourceBytes=Math.ceil(original.byteLength/4)*4,outBytes=sourceBytes,outputs=pair?1:2,planeBytes=pair?0:blocks*64*4,readBytes=outBytes*outputs;
   const maximum=device.limits.maxBufferSize,binding=device.limits.maxStorageBufferBindingSize,axis=device.limits.maxComputeWorkgroupsPerDimension,codecGroups=Math.ceil(blocks/32),codecX=Math.min(codecGroups,axis),codecY=Math.ceil(codecGroups/codecX),renderGroups=Math.ceil(pixels/256),renderX=renderGroups<=axis?renderGroups:Math.min(axis,Math.ceil(Math.sqrt(renderGroups))),renderY=Math.ceil(renderGroups/renderX);
   if(!Number.isSafeInteger(pixels)||pixels<=0||[sourceBytes,outBytes,planeBytes].some(n=>!Number.isSafeInteger(n)||n>maximum||n>binding)||readBytes>maximum||codecY>axis||renderY>axis)throw this.nativeFailure(new EngineError('GPU_LIMIT','One complete native ELA context exceeds GPU transport.'));
   // Upload, outputs, readback, mapping and final RGB arrays coexist. Fees
   // include conservative staging; published RGB retains its own split grant.
   workspace=this.reserveGpu(sourceBytes*(pair?4:2)+planeBytes+readBytes*6+2*MiB);transaction.workspace=workspace;outputFree=workspace.split(original.byteLength*outputs);transaction.outputFree=outputFree;api(()=>device.pushErrorScope('validation'));transaction.scopes++;api(()=>device.pushErrorScope('out-of-memory'));transaction.scopes++;
   const make=(size,usage,label)=>{const buffer=api(()=>device.createBuffer({size,usage})),entry={bytes:size,destroyed:false,release:null};transaction.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',size,{owner:'ela',label});return buffer;},source=make(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'ELA-source'),output=make(outBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'ELA-result'),tone=make(65536,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'ELA-native-LUT'),uniform=make(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'ELA-parameters'),read=make(readBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'ELA-readback'),upload=(buffer,bytes)=>{const prefix=Math.floor(bytes.byteLength/4)*4;if(prefix)api(()=>device.queue.writeBuffer(buffer,0,bytes,0,prefix));if(prefix<bytes.byteLength){const tail=new Uint8Array(4);tail.set(bytes.subarray(prefix));api(()=>device.queue.writeBuffer(buffer,prefix,tail));}};
   upload(source,original);api(()=>device.queue.writeBuffer(tone,0,table));api(()=>device.queue.writeBuffer(uniform,0,Uint32Array.of(width,height,yCols,yRows,cCols,cRows,blocks,codecX,Number(p.grayscale),renderX,Number(!pair),0)));
   let pairSource,planes,q,raw;if(pair){pairSource=make(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'ELA-native-recompressed');upload(pairSource,recompressed);}else{planes=make(planeBytes,GPUBufferUsage.STORAGE,'ELA-native-components');q=make(512,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'ELA-native-quantization');raw=make(outBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'ELA-recompressed-RGB');api(()=>device.queue.writeBuffer(q,0,elaJpegQuantization(p.quality)));}
   const encoder=api(()=>device.createCommandEncoder()),bind=(pipeline,entries)=>api(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:entries.map(([binding,buffer])=>({binding,resource:{buffer}}))})),kernelStarted=performance.now();let pass;
   api(()=>{if(!pair){pass=encoder.beginComputePass();pass.setPipeline(codec);pass.setBindGroup(0,bind(codec,[[0,source],[1,q],[2,planes],[5,uniform]]));pass.dispatchWorkgroups(codecX,codecY);pass.end();}
   pass=encoder.beginComputePass();pass.setPipeline(render);pass.setBindGroup(0,bind(render,pair?[[0,source],[3,output],[4,tone],[5,uniform],[6,pairSource]]:[[0,source],[2,planes],[3,output],[4,tone],[5,uniform],[7,raw]]));pass.dispatchWorkgroups(renderX,renderY);pass.end();encoder.copyBufferToBuffer(output,0,read,0,outBytes);if(raw)encoder.copyBufferToBuffer(raw,0,read,outBytes,outBytes);});checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();await asyncApi(()=>device.queue.onSubmittedWorkDone());transaction.drained=true;const kernelMs=performance.now()-kernelStarted;
   const oom=await asyncApi(()=>device.popErrorScope());transaction.scopes--;const validation=await asyncApi(()=>device.popErrorScope());transaction.scopes--;if(oom||validation)throw this.nativeFailure(new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));checkAbort(signal);await asyncApi(()=>read.mapAsync(GPUMapMode.READ));transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=api(()=>read.getMappedRange());transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',readBytes,{owner:'ela',label:'ELA-result-mapping',identity:mapped});const views=[new Uint8Array(mapped,0,original.length),...(pair?[]:[new Uint8Array(mapped,outBytes,original.length)])],arrays=views.map(()=>allocateTypedArray(Uint8Array,original.length,{label:'ELA-GPU-RGB'})),owners=[];let stamp=performance.now();
   for(let start=0;start<original.length;start+=1048576){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}const end=Math.min(original.length,start+1048576);for(let k=0;k<views.length;k++)arrays[k].set(views[k].subarray(start,end),start);onProgress?.(end/original.length);}
   api(()=>read.unmap());transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;checkAbort(signal);const free=outputFree;owned=ownedResult(arrays[0],arrays[1]??null,free,owners,this.budget,width,height,{backend:'webgpu-native-islow420',kernel:pair?'native-ELA-residual-LUT':'native-ISLOW420-pixel-composition-and-ELA-LUT',codec:pair?'native-recompressed-RGB-input':'libjpeg-turbo-3.0.3-integer-ISLOW420-composition',entropy:pair?'native-preserved':'lossless-identity-fused-pixel-only',pipelineCompileMs:compileMs,kernelMs,totalMs:performance.now()-started,maximumAbsoluteError:0},this.pendingResults);outputFree=null;transaction.outputFree=null;this.pendingResults.add(owned);
   for(const a of arrays)owners.push({bytes:a.byteLength,release:this.budget.registerBacking?.('array-buffer',a.byteLength,{owner:'ela',label:'ELA-native-RGB-result',identity:a.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   let cleanupFailed=false,cleanup;try{await retireElaGpuTransaction(this,transaction);}catch(error){cleanupFailed=true;cleanup=error;}
   try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   this.busy=false;if(cleanupFailed){if(failed)attachElaGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async retireDevice(){
  const device=this.device;let failed=false,primary;const attempt=async operation=>{try{await operation();}catch(error){if(!failed){failed=true;primary=error;}}};let acknowledged=!device;
  if(device&&!this.deviceDestroyed)await attempt(()=>{nativeGpuSync(()=>device.destroy());this.deviceDestroyed=true;});
  await attempt(()=>drainElaGpuTransactions(this));
  // Live published RGB is not in this set; retry only failed retirements.
  for(const result of [...this.pendingResults])await attempt(()=>result.release());
  if(device)await attempt(async()=>{try{await nativeGpuAsync(()=>device.queue.onSubmittedWorkDone());}catch(error){if(!this.deviceDestroyed||!device.lost)throw error;await device.lost;}acknowledged=this.deviceDestroyed;});
  if(acknowledged&&!this.pending.size){
   this.device=null;this.ready=null;this.module=null;this.lost=false;
   for(const[name,entry]of this.pipelines)await attempt(async()=>{await entry.free();this.pipelines.delete(name);});for(const free of this.orphanPipelineFees)await attempt(async()=>{await free();this.orphanPipelineFees.delete(free);});
   if(!this.pipelines.size&&!this.orphanPipelineFees.size){this.unregister?.();this.unregister=null;}
  }
  if(failed)throw primary;
 }
 async dispose(){if(this.busy)throw new EngineError('BUSY','ELA GPU must drain before disposal.');this.closed=true;if(this.disposalComplete&&this.pendingResults.size){this.disposal=null;this.disposalComplete=false;}return this.disposal??=(async()=>{let failed=false,primary;try{await this.retireDevice();}catch(error){failed=true;primary=error;}if(failed)throw primary;this.disposalComplete=true;})().catch(error=>{this.disposal=null;this.disposalComplete=false;throw error;});}

}

export function createElaGpuService(budget,{backend='auto',createProvider=()=>new ElaGpu(budget)}={}){
 let gpu,queue=Promise.resolve(),closed=false,unavailable=false,lastFallback=null;const policy=createElaUsefulBackendPolicy(),context=(method,original,width,height,params,hooks={})=>({source:original,method,width,height,profileKey:hooks.profileKey??'',budgetBytes:budget.limit,linear:params?.linear??false,grayscale:params?.grayscale??false}),wantsGpu=(method,original,width,height,params,hooks={})=>policy.choose(context(method,original,width,height,params,hooks),{requested:hooks.backend??backend,gpuAvailable:!!globalThis.navigator?.gpu&&!unavailable})==='webgpu';
 const schedule=(method,args,hooks)=>{const work=async()=>{checkAbort(hooks.signal);if(closed)throw new EngineError('DISPOSED','ELA GPU service closed.');if(gpu?.closed){await gpu.dispose();gpu=null;}const width=args[method==='compose'?1:2],height=args[method==='compose'?2:3];const parameters=args[method==='compose'?3:4],observation=context(method,args[0],width,height,parameters,hooks);if(!wantsGpu(method,args[0],width,height,parameters,hooks))return null;
  try{gpu??=createProvider();return await gpu[method](...args,hooks);}catch(error){if(hooks.signal?.aborted||!gpu?.mayFallback?.(error))throw error;lastFallback=error.code;policy.refuse(observation);unavailable=['GPU_UNAVAILABLE','CODEC_UNAVAILABLE'].includes(error.code);try{await gpu.dispose();}catch(cleanup){attachElaGpuCleanup(error,cleanup);throw error;}gpu=null;return null;}};const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;};
 return{wantsGpu,observeCompleted(original,width,height,params,{method,backend,milliseconds,compileMs=0,...hooks}){policy.observe(context(method,original,width,height,params,hooks),{backend,milliseconds,compileMs});},policySnapshot(method,original,width,height,params,hooks={}){return policy.snapshot(context(method,original,width,height,params,hooks));},compose(original,width,height,params,table,hooks={}){return schedule('compose',[original,width,height,params,table],hooks);},residual(original,recompressed,width,height,params,table,hooks={}){return schedule('residual',[original,recompressed,width,height,params,table],hooks);},metrics(){return{gpuFallback:lastFallback};},async dispose(){closed=true;await queue;await gpu?.dispose();gpu=null;}};
}

// One reclaimable provider queue belongs to each engine budget. No image or
// published host view is kept in this registry; rejected ACKs retain this owner.
const elaBudgetServices=new WeakMap();
export function getElaGpuService(budget){let service=elaBudgetServices.get(budget);if(!service){service=createElaGpuService(budget);elaBudgetServices.set(budget,service);}return service;}
export async function disposeElaGpuService(budget){const service=elaBudgetServices.get(budget);if(service){await service.dispose();if(elaBudgetServices.get(budget)===service)elaBudgetServices.delete(budget);}}
