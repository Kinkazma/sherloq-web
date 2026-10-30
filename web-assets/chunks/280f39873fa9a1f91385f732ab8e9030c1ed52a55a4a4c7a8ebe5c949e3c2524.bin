import {mpsCnn3WinogradShader} from './convolution-mps-cnn3-wgsl.js';
import {createConvolutionSyncRetirement,createConvolutionIndependentRetirement,preserveConvolutionPrimary} from './convolution-retirement.js';
import {sharedConvolutionShader} from './convolution-shared-gpu.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {runD2prlSpatialConvolution,createD2prlSpatialOutputRegistry,createD2prlSpatialLifetime} from './convolution-spatial-tiles.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
// Experimental grouped/strided extension of the qualified ordered convolution.
import{requireValue,checkAbort,controlCheckpoint,EngineError}from'../../src/errors.js';
import {validateD2prlFloat32} from './parameter-ownership.js';
function shader(channels,kernel,arithmetic='cpu',useTiled=false,useWinograd=false){
 if(useWinograd)return mpsCnn3WinogradShader();
 if(useTiled)return sharedConvolutionShader(channels,kernel);
 const loops=arithmetic==='mps'?`for(var ky=0u;ky<${kernel}u;ky++){for(var kx=0u;kx<${kernel}u;kx++){for(var ic=0u;ic<${channels}u;ic++){`:`for(var ic=0u;ic<${channels}u;ic++){for(var ky=0u;ky<${kernel}u;ky++){for(var kx=0u;kx<${kernel}u;kx++){`;
 const weight=arithmetic==='mps'?`ic*${kernel*kernel}u+ky*${kernel}u+kx`:'k';
 return`
struct Shape{ih:u32,iw:u32,oh:u32,ow:u32,oc:u32,pad:u32,count:u32,reserved:u32,ranges:u32,stride:u32,groupOc:u32,firstProduct:u32,tailStart:u32,pad0:u32,pad1:u32,pad2:u32};
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> bias:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@group(0) @binding(5) var<storage,read> bias_domains:array<vec2<u32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let index=gid.x+gid.y*shape.reserved;if(index>=shape.count){return;}let plane=shape.oh*shape.ow;let c=index/plane;let p=index%plane;let y=i32(p/shape.ow)*i32(shape.stride)-i32(shape.pad);let x=i32(p%shape.ow)*i32(shape.stride)-i32(shape.pad);let group=c/shape.groupOc;
 var biasAfter=false;for(var r=0u;r<shape.ranges;r++){if(p>=bias_domains[r].x&&p<bias_domains[r].y){biasAfter=true;}}
 let tail=p>=shape.tailStart;var partials:array<f32,16>;var sum=select(bias[c],0.0,biasAfter);var block=0.0;var k=0u;
 ${loops}
  let yy=y+i32(ky);let xx=x+i32(kx);var value=0.0;
  if(yy>=0&&xx>=0&&yy<i32(shape.ih)&&xx<i32(shape.iw)){value=input[((ic+group*${channels}u)*shape.ih+u32(yy))*shape.iw+u32(xx)];}
  if(tail&&shape.pad0==2u){if(k%1024u==0u){block=value*weights[c*${channels*kernel*kernel}u+${weight}];}else{block=fma(value,weights[c*${channels*kernel*kernel}u+${weight}],block);}if(k%1024u==1023u||k+1u==${channels*kernel*kernel}u){if(k<1024u&&shape.firstProduct!=0u){sum=block;}else{sum=sum+block;}}}else if(tail){let lane=k%16u;partials[lane]=fma(value,weights[c*${channels*kernel*kernel}u+${weight}],partials[lane]);}else if(k==0u&&shape.firstProduct!=0u){sum=value*weights[c*${channels*kernel*kernel}u+${weight}];}else{sum=fma(value,weights[c*${channels*kernel*kernel}u+${weight}],sum);}k++;
 }}}
 if(tail&&shape.pad0!=2u){partials[0]=partials[0]+bias[c];for(var step=8u;step>0u;step=step/2u){for(var i=0u;i<step;i++){partials[i]=partials[i]+partials[i+step];}}sum=partials[0];}else if(!tail&&biasAfter){sum=sum+bias[c];}output[index]=sum;
}`;}
// A mapped range is already an ArrayBuffer view of the readback allocation.
// WebGPU detaches it at unmap/destroy, so the result owns that lifetime through
// release(). Keep this closure separate from run's input/intermediate tensors.
function ownMappedOutput(buffer,data,free,onReleased,backings){
 const bytes=buffer.size,retirement=createConvolutionSyncRetirement([
  ()=>buffer.unmap(),()=>buffer.destroy(),...backings.filter(Boolean),()=>free(),()=>onReleased(bytes)
 ]);
 return{data,get retiring(){return retirement.started&&!retirement.retired;},release(){retirement.release();if(retirement.retired){buffer=null;free=null;onReleased=null;backings=null;}}};
}
function ownMappedOutputLegacy(buffer,data,free,onReleased,backings){
 let live=true;const bytes=buffer.size;
 return{data,release(){if(!live)return;live=false;try{buffer.unmap();}finally{try{buffer.destroy();}finally{try{for(const backing of backings)backing?.();backings=null;free();}finally{onReleased(bytes);buffer=null;free=null;onReleased=null;}}}}};
}
export async function createConvolutionGeneralGpu({budget,arena,operation=(_label,work)=>work(),inputSide=448,arithmetic='cpu',retirementPolicy='legacy'}={}){
 requireValue([448,896,1344,1792].includes(inputSide)&&['cpu','mps'].includes(arithmetic),'Explicit D2PRL spatial side and arithmetic required');
 requireValue(['legacy','ack'].includes(retirementPolicy),'Explicit convolution retirement policy');const ackPolicy=retirementPolicy==='ack';
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');if(!globalThis.navigator?.gpu)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No WebGPU adapter');
 const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,512*1024**2),maxBuffer=Math.min(adapter.limits.maxBufferSize,512*1024**2);const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer}});const pipelines=new Map();let busy=false,disposed=false,lost=false,ownedOutputs=0,closing,deviceDestroyed=false;const mappedOutputs=new Set(),retirements=new Set();device.lost.then(()=>{lost=true;});// A detached mapped view need not belong to Chromium's ArrayBuffer pool.
 const destroyDevice=()=>{if(!deviceDestroyed){device.destroy();deviceDestroyed=true;}};
 const outputReleased=(bytes,owner)=>{if(ackPolicy){if(mappedOutputs.has(owner)){budget.notifyBackingRelease?.('gpu',bytes);mappedOutputs.delete(owner);ownedOutputs--;}if(disposed&&!ownedOutputs&&!retirements.size)destroyDevice();}else{budget.notifyBackingRelease?.('gpu',bytes);ownedOutputs--;if(disposed&&!ownedOutputs)destroyDevice();}};
 async function drainRetirements(){let failed=false,primary;for(const record of [...retirements])try{await record.release();retirements.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 function drainRetirementsSync(){let failed=false,primary;for(const record of [...retirements])try{record.releaseSync();retirements.delete(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 function retireKnownResources(){let failed=false,primary;for(const output of [...mappedOutputs])if(output.retiring)try{output.release();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(!ownedOutputs)destroyDevice();for(const [key,{free}]of [...pipelines])try{free();pipelines.delete(key);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}

 const engine={
  limits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer},
  async run({input,weights,bias,channels,height,width,outChannels,kernel,padding=0,stride=1,groups=1,hasBias=true,referenceLayout,experimentalBiasBefore=false,experimentalTailStart,experimentalTailMode='lane16'},{signal,onSubmitted}={}){
   requireValue(!busy&&!disposed&&!lost,'GPU convolution unavailable');requireValue([channels,height,width,outChannels,kernel,padding,stride,groups].every(Number.isInteger)&&channels>0&&channels<=4096&&outChannels>0&&outChannels<=4096&&height>0&&height<=1024&&width>0&&width<=1024&&kernel>0&&kernel<=13&&padding>=0&&padding<=6&&stride>=1&&stride<=2&&groups>=1&&groups<=channels&&channels%groups===0&&outChannels%groups===0,'Convolution dimensions');
   const useWinograd=[448,896,1344,1792].includes(inputSide)&&arithmetic==='mps'&&groups===1&&channels===64&&outChannels===128&&kernel===3&&padding===0&&stride===1&&hasBias&&/^(597|448|298)-cnn-3$/.test(referenceLayout?.name??'');const useTiled=!useWinograd&&arithmetic==='mps'&&groups===1&&channels%32===0&&outChannels!==1&&outChannels!==3;const oh=Math.floor((height+2*padding-kernel)/stride)+1,ow=Math.floor((width+2*padding-kernel)/stride)+1,count=oh*ow*outChannels;requireValue(oh>0&&ow>0&&input instanceof Float32Array&&input.length===channels*height*width&&weights instanceof Float32Array&&weights.length===outChannels*(channels/groups)*kernel*kernel&&bias instanceof Float32Array&&bias.length===outChannels,'Convolution tensors');requireValue(['lane16','block1024'].includes(experimentalTailMode),'Experimental tail mode');const tailStart=arithmetic==='mps'?oh*ow:experimentalTailStart??oh*ow;requireValue(Number.isInteger(tailStart)&&tailStart>=0&&tailStart<=oh*ow,'Experimental tail domain');const outputBytes=count*4;for(const bytes of[input.byteLength,weights.byteLength,bias.byteLength,outputBytes])if(bytes>binding||bytes>maxBuffer)throw new EngineError('GPU_LIMIT','Convolution buffer exceeds device limit');const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);const zeroBias=bias.every(v=>v===0);requireValue(typeof hasBias==='boolean'&&(hasBias||zeroBias),'Bias declaration');requireValue(typeof experimentalBiasBefore==='boolean'&&(!experimentalBiasBefore||!referenceLayout),'Explicit experimental layout');requireValue(zeroBias||experimentalBiasBefore||(referenceLayout&&same(referenceLayout.inputShape,[1,channels,height,width])&&same(referenceLayout.weightShape,[outChannels,channels/groups,kernel,kernel])&&referenceLayout.padding===padding&&(referenceLayout.stride??1)===stride&&(referenceLayout.groups??1)===groups),'Qualified native convolution layout required');const ranges=arithmetic==='mps'?[[0,oh*ow]]:zeroBias||experimentalBiasBefore?[]:referenceLayout.biasAfterRanges;requireValue(Array.isArray(ranges)&&ranges.length<=64,'Invalid convolution layout');let previous=0;for(const range of ranges){requireValue(Array.isArray(range)&&range.length===2&&range.every(Number.isInteger)&&range[0]>=previous&&range[1]>range[0]&&range[1]<=oh*ow,'Invalid arithmetic range');previous=range[1];}checkAbort(signal);busy=true;let computeLease,release,outputRelease,retainedReadback,mappedBacking,scopes=0,completed=false;const buffers=[],backings=new Map();const destroyBuffer=buffer=>{buffer.destroy();backings.get(buffer)?.();backings.delete(buffer);};let submitted=false,queueUsed=false,hasPrimary=false,primary,gpuCompleted=false;
   // Uploads are queue work too. Set this before the API call so even a
   // synchronous refusal after partial enqueue retains all credits until ACK.
   const writeBuffer=(...args)=>{queueUsed=true;gpuCompleted=false;return device.queue.writeBuffer(...args);};
   try{if(ackPolicy)await drainRetirements();computeLease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-convolution'});const key=(channels/groups)+'/'+kernel+(useWinograd?'/native-cnn3-winograd':useTiled?'/shared':'/scalar');let entry=pipelines.get(key);if(!entry&&pipelines.size>=8){const oldest=pipelines.keys().next().value;pipelines.get(oldest).free();pipelines.delete(oldest);}release=budget.reserve(2*(input.byteLength+weights.byteLength+bias.byteLength)+3*outputBytes+2048+(entry?0:2*1024**2));outputRelease=release.split(2*outputBytes+(ackPolicy?2048:0));let stamp=performance.now();const validationCheckpoint=()=>{if(performance.now()-stamp>=8)return controlCheckpoint(signal).then(()=>{stamp=performance.now();});};for(const a of[input,weights,bias])await validateD2prlFloat32(a,{signal,message:'Nonfinite convolution tensor',checkpoint:validationCheckpoint});
    if(!entry){const free=release.split(2*1024**2);try{const code=device.createShaderModule({code:shader(channels/groups,kernel,arithmetic,useTiled,useWinograd)}),messages=await code.getCompilationInfo();if(messages.messages.some(m=>m.type==='error'))throw Error(messages.messages.map(m=>m.message).join('\n'));const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:code,entryPoint:'main'}});entry={pipeline,free};pipelines.set(key,entry);}catch(error){free();throw error;}}
    checkAbort(signal);device.pushErrorScope('validation');if(ackPolicy)scopes=1;device.pushErrorScope('out-of-memory');scopes=2;
    const allocate=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);backings.set(b,budget.registerBacking?.('gpu',size,{owner:'d2prl',label:'convolution-buffer'}));return b;};const inputs=[input,weights,bias].map(a=>{const b=allocate(a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);writeBuffer(b,0,a);return b;}),out=allocate(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),shape=allocate(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readback=allocate(outputBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),layoutBuffer=allocate(Math.max(8,ranges.length*8),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);writeBuffer(layoutBuffer,0,Uint32Array.from(ranges.length?ranges.flat():[0,0]));const dispatchCount=useWinograd?outChannels*Math.ceil(oh/2)*Math.ceil(ow/2):count,totalGroups=Math.ceil(dispatchCount/64),groupsX=useTiled?Math.ceil(oh*ow/32):Math.min(totalGroups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=useTiled?Math.ceil(outChannels/32):Math.ceil(totalGroups/groupsX);requireValue(groupsX<=device.limits.maxComputeWorkgroupsPerDimension,'Shared convolution pixel dispatch exceeds device limit');requireValue(groupsY<=device.limits.maxComputeWorkgroupsPerDimension,'Dispatch exceeds device limit');writeBuffer(shape,0,new Uint32Array([height,width,oh,ow,outChannels,padding,count,groupsX*64,ranges.length,stride,outChannels/groups,arithmetic==='mps'?0:hasBias?0:1,tailStart,experimentalTailMode==='block1024'?2:1,0,0]));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(entry.pipeline);pass.setBindGroup(0,device.createBindGroup({layout:entry.pipeline.getBindGroupLayout(0),entries:[...inputs,out,shape,layoutBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}));
    // Two-dimensional workgroup dispatch avoids the per-dimension limit while
    // each invocation still owns one complete ordered reduction.
    pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(out,0,readback,0,outputBytes);checkAbort(signal);queueUsed=true;gpuCompleted=false;device.queue.submit([encoder.finish()]);submitted=true;onSubmitted?.();
    const validateScopes=async()=>{if(scopes===0)return;const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??validation).message,oom?{details:{allocationKind:'gpu'}}:undefined);};
    const retireTransient=()=>{if(!release)return;computeLease.release();computeLease=null;let gpuBytesReleased=0;for(const buffer of buffers)if(buffer!==readback){gpuBytesReleased+=buffer.size;destroyBuffer(buffer);}release();release=null;budget.notifyBackingRelease?.('gpu',gpuBytesReleased);};
    // Legacy consumers retain their historical fence-first lifetime. In ACK mode
    // this private queue submits no other work while busy, and the final copy
    // depends on every buffer used by this convolution. A successful MAP_READ
    // acknowledges that copy; both scopes must still validate before publication.
    if(!ackPolicy){await device.queue.onSubmittedWorkDone();gpuCompleted=true;await validateScopes();retireTransient();}
    let blockedMap,blockedPrimary;
    const mapReadback=async({resourceOperation}={})=>{if(blockedMap)throw blockedMap;resourceOperation?.setState('io');try{await readback.mapAsync(GPUMapMode.READ);if(ackPolicy)gpuCompleted=true;}catch(error){
     if(ackPolicy)try{
      // A refused map is not an ACK. Preserve the historical recovery opportunity:
      // wait completion, validate scopes and retire transient buffers before the
      // operation wrapper can retry this same readback (never the convolution).
      await device.queue.onSubmittedWorkDone();gpuCompleted=true;await validateScopes();retireTransient();
     }catch(cleanup){preserveConvolutionPrimary(error,cleanup);blockedPrimary=error;blockedMap=new EngineError('GPU_RETIREMENT_PENDING','Readback retry requires convolution retirement acknowledgement');throw blockedMap;}
     throw error;
    }finally{resourceOperation?.setState('waiting-child');}};
    checkAbort(signal);try{await operation('convolution:readback-map',mapReadback,{bytes:outputBytes});}catch(error){if(error===blockedMap)throw blockedPrimary;throw error;}checkAbort(signal);
    if(ackPolicy){await validateScopes();retireTransient();}checkAbort(signal);
    const mapped=await operation('convolution:readback-range',()=>readback.getMappedRange(),{bytes:outputBytes});checkAbort(signal);
    mappedBacking=budget.registerBacking?.('gpu-mapped',outputBytes,{owner:'d2prl',label:'convolution-readback'});
    const output=await operation('convolution:readback-view',()=>new Float32Array(mapped),{bytes:outputBytes});checkAbort(signal);
    // Cover both staging and a separate host mapping if the implementation uses
    // one. No extra Float32Array backing/copy is allocated for the result.
    const owned=(ackPolicy?ownMappedOutput:ownMappedOutputLegacy)(readback,output,outputRelease,bytes=>outputReleased(bytes,owned),[backings.get(readback),mappedBacking]),result={...owned,shape:[1,outChannels,oh,ow],arithmeticQualification:useWinograd?'mps-native-cnn3-winograd-f32':useTiled?'mps-shared32-ordered-convolution-candidate':arithmetic==='mps'?'mps-ordered-convolution-candidate':experimentalBiasBefore||experimentalTailStart!==undefined?'unqualified-convolution-probe':'reference-layout'};
    if(ackPolicy)mappedOutputs.add(owned);ownedOutputs++;retainedReadback=readback;mappedBacking=null;completed=true;return result;
   }catch(error){hasPrimary=true;primary=error;throw error;}finally{
    if(!ackPolicy){if(queueUsed)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});for(const buffer of buffers)if(buffer!==retainedReadback)destroyBuffer(buffer);release?.();mappedBacking?.();if(!completed)outputRelease?.();computeLease?.release();busy=false;}else{
    const bufferOwners=createConvolutionIndependentRetirement(buffers.filter(buffer=>buffer!==retainedReadback).map(buffer=>createConvolutionSyncRetirement([()=>destroyBuffer(buffer)])));
    const local=createConvolutionSyncRetirement([()=>bufferOwners.release(),()=>release?.(),()=>mappedBacking?.(),()=>{if(!completed)outputRelease?.();},()=>computeLease?.release()]);
    const record={releaseSync(){if((queueUsed&&!gpuCompleted)||scopes>0)throw new EngineError('GPU_RETIREMENT_PENDING','Convolution completion is not acknowledged; await disposeAsync()');local.release();},async release(){
     if(queueUsed&&!completed&&!gpuCompleted){try{await device.queue.onSubmittedWorkDone();gpuCompleted=true;}catch(error){if(!lost)throw error;gpuCompleted=true;}}
     // On failure retain the historical drain attempt, even if the first fence
     // already completed. A failed redundant drain cannot undo that known ACK.
     else if(queueUsed&&!completed)await device.queue.onSubmittedWorkDone().catch(()=>{});
     while(scopes>0){try{await device.popErrorScope();scopes--;}catch(error){if(!lost)throw error;scopes--;}}
     local.release();
    }};retirements.add(record);
    try{await record.release();retirements.delete(record);}catch(cleanup){if(hasPrimary)preserveConvolutionPrimary(primary,cleanup);else throw cleanup;}finally{busy=false;}
    }
   }
  },
  // Normal disposal remains synchronous. Unknown GPU/scopes debt is never
  // refunded by this entry point; its explicit async counterpart waits the ACK.
  dispose(){requireValue(!busy&&!closing,'GPU convolution busy');if(!ackPolicy){if(disposed)return;disposed=true;if(!ownedOutputs)destroyDevice();for(const {free}of pipelines.values())free();pipelines.clear();return;}disposed=true;drainRetirementsSync();retireKnownResources();},
  disposeAsync(){requireValue(!busy,'GPU convolution busy');if(!ackPolicy){engine.dispose();return Promise.resolve();}if(closing)return closing;disposed=true;return closing=(async()=>{await drainRetirements();retireKnownResources();})().finally(()=>{closing=null;});}
 };
 if(inputSide===448)return engine;
 let spatialArena=arena,ownsSpatialArena=false;const spatialRetirements=createD2prlSpatialOutputRegistry(),spatialLifetime=createD2prlSpatialLifetime();
 return{...engine,async run(input,options){spatialLifetime.enter();try{requireValue(!input.pagedOutputFactory||ackPolicy,'Paged convolution requires the explicit ACK retirement contract');await spatialRetirements.drain();if(inputSide===1792&&!spatialArena){spatialArena=createWasmTensorArena({budget,maximumTensorBytes:2**32});ownsSpatialArena=true;}const handoff=spatialRetirements.createHandoff(options?.onRetirementOwner);const output=await runD2prlSpatialConvolution(input,{budget,arena:spatialArena,run:(value,hooks)=>engine.run(value,hooks),limits:engine.limits,inputSide,arithmetic},{...options,onRetirementOwner:handoff.adopt});handoff.publish(output);return output;}finally{spatialLifetime.leave();}},dispose(){return spatialLifetime.closeSync(()=>{if(!ackPolicy){try{return engine.dispose();}finally{if(ownsSpatialArena)spatialArena.dispose();}}let failed=false,primary;for(const close of[()=>spatialRetirements.drainSync(),()=>engine.dispose()])try{close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(ownsSpatialArena)spatialArena.dispose();});},disposeAsync(){return spatialLifetime.closeAsync(async()=>{let failed=false,primary;for(const close of[()=>spatialRetirements.drain(),()=>engine.disposeAsync()])try{await close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(ownsSpatialArena)spatialArena.dispose();});}};
}
