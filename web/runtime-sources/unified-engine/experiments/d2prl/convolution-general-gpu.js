import {getExecutionScheduler} from '../../src/execution-scheduler.js';
// Experimental grouped/strided extension of the qualified ordered convolution.
import{requireValue,checkAbort,controlCheckpoint,EngineError}from'../../src/errors.js';
function shader(channels,kernel){return`
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
 for(var ic=0u;ic<${channels}u;ic++){for(var ky=0u;ky<${kernel}u;ky++){for(var kx=0u;kx<${kernel}u;kx++){
  let yy=y+i32(ky);let xx=x+i32(kx);var value=0.0;
  if(yy>=0&&xx>=0&&yy<i32(shape.ih)&&xx<i32(shape.iw)){value=input[((ic+group*${channels}u)*shape.ih+u32(yy))*shape.iw+u32(xx)];}
  if(tail&&shape.pad0==2u){if(k%1024u==0u){block=value*weights[c*${channels*kernel*kernel}u+k];}else{block=fma(value,weights[c*${channels*kernel*kernel}u+k],block);}if(k%1024u==1023u||k+1u==${channels*kernel*kernel}u){if(k<1024u&&shape.firstProduct!=0u){sum=block;}else{sum=sum+block;}}}else if(tail){let lane=k%16u;partials[lane]=fma(value,weights[c*${channels*kernel*kernel}u+k],partials[lane]);}else if(k==0u&&shape.firstProduct!=0u){sum=value*weights[c*${channels*kernel*kernel}u+k];}else{sum=fma(value,weights[c*${channels*kernel*kernel}u+k],sum);}k++;
 }}}
 if(tail&&shape.pad0!=2u){partials[0]=partials[0]+bias[c];for(var step=8u;step>0u;step=step/2u){for(var i=0u;i<step;i++){partials[i]=partials[i]+partials[i+step];}}sum=partials[0];}else if(!tail&&biasAfter){sum=sum+bias[c];}output[index]=sum;
}`;}
// A mapped range is already an ArrayBuffer view of the readback allocation.
// WebGPU detaches it at unmap/destroy, so the result owns that lifetime through
// release(). Keep this closure separate from run's input/intermediate tensors.
function ownMappedOutput(buffer,data,free,onReleased,backings){
 let live=true;const bytes=buffer.size;
 return{data,release(){if(!live)return;live=false;try{buffer.unmap();}finally{try{buffer.destroy();}finally{try{for(const backing of backings)backing?.();backings=null;free();}finally{onReleased(bytes);buffer=null;free=null;onReleased=null;}}}}};
}
export async function createConvolutionGeneralGpu({budget,operation=(_label,work)=>work()}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');if(!globalThis.navigator?.gpu)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No WebGPU adapter');
 const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,512*1024**2),maxBuffer=Math.min(adapter.limits.maxBufferSize,512*1024**2);const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer}});const pipelines=new Map();let busy=false,disposed=false,lost=false,ownedOutputs=0;device.lost.then(()=>{lost=true;});// A detached mapped view need not belong to Chromium's ArrayBuffer pool.
 const outputReleased=bytes=>{budget.notifyBackingRelease?.('gpu',bytes);ownedOutputs--;if(disposed&&!ownedOutputs)device.destroy();};
 return{
  limits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer},
  async run({input,weights,bias,channels,height,width,outChannels,kernel,padding=0,stride=1,groups=1,hasBias=true,referenceLayout,experimentalBiasBefore=false,experimentalTailStart,experimentalTailMode='lane16'},{signal,onSubmitted}={}){
   requireValue(!busy&&!disposed&&!lost,'GPU convolution unavailable');requireValue([channels,height,width,outChannels,kernel,padding,stride,groups].every(Number.isInteger)&&channels>0&&channels<=4096&&outChannels>0&&outChannels<=4096&&height>0&&height<=1024&&width>0&&width<=1024&&kernel>0&&kernel<=13&&padding>=0&&padding<=6&&stride>=1&&stride<=2&&groups>=1&&groups<=channels&&channels%groups===0&&outChannels%groups===0,'Convolution dimensions');
   const oh=Math.floor((height+2*padding-kernel)/stride)+1,ow=Math.floor((width+2*padding-kernel)/stride)+1,count=oh*ow*outChannels;requireValue(oh>0&&ow>0&&input instanceof Float32Array&&input.length===channels*height*width&&weights instanceof Float32Array&&weights.length===outChannels*(channels/groups)*kernel*kernel&&bias instanceof Float32Array&&bias.length===outChannels,'Convolution tensors');requireValue(['lane16','block1024'].includes(experimentalTailMode),'Experimental tail mode');const tailStart=experimentalTailStart??oh*ow;requireValue(Number.isInteger(tailStart)&&tailStart>=0&&tailStart<=oh*ow,'Experimental tail domain');const outputBytes=count*4;for(const bytes of[input.byteLength,weights.byteLength,bias.byteLength,outputBytes])if(bytes>binding||bytes>maxBuffer)throw new EngineError('GPU_LIMIT','Convolution buffer exceeds device limit');const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);const zeroBias=bias.every(v=>v===0);requireValue(typeof hasBias==='boolean'&&(hasBias||zeroBias),'Bias declaration');requireValue(typeof experimentalBiasBefore==='boolean'&&(!experimentalBiasBefore||!referenceLayout),'Explicit experimental layout');requireValue(zeroBias||experimentalBiasBefore||(referenceLayout&&same(referenceLayout.inputShape,[1,channels,height,width])&&same(referenceLayout.weightShape,[outChannels,channels/groups,kernel,kernel])&&referenceLayout.padding===padding&&(referenceLayout.stride??1)===stride&&(referenceLayout.groups??1)===groups),'Qualified native convolution layout required');const ranges=zeroBias||experimentalBiasBefore?[]:referenceLayout.biasAfterRanges;requireValue(Array.isArray(ranges)&&ranges.length<=64,'Invalid convolution layout');let previous=0;for(const range of ranges){requireValue(Array.isArray(range)&&range.length===2&&range.every(Number.isInteger)&&range[0]>=previous&&range[1]>range[0]&&range[1]<=oh*ow,'Invalid arithmetic range');previous=range[1];}checkAbort(signal);busy=true;let computeLease,release,outputRelease,retainedReadback,mappedBacking,scopes=0,completed=false;const buffers=[],backings=new Map();const destroyBuffer=buffer=>{buffer.destroy();backings.get(buffer)?.();backings.delete(buffer);};let submitted=false;
   try{computeLease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-convolution'});const key=(channels/groups)+'/'+kernel;let entry=pipelines.get(key);if(!entry&&pipelines.size>=8){const oldest=pipelines.keys().next().value;pipelines.get(oldest).free();pipelines.delete(oldest);}release=budget.reserve(2*(input.byteLength+weights.byteLength+bias.byteLength)+3*outputBytes+2048+(entry?0:2*1024**2));outputRelease=release.split(2*outputBytes);let stamp=performance.now();for(const a of[input,weights,bias])for(let i=0;i<a.length;i++){requireValue(Number.isFinite(a[i]),'Nonfinite convolution tensor');if((i&8191)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}}
    if(!entry){const free=release.split(2*1024**2);try{const code=device.createShaderModule({code:shader(channels/groups,kernel)}),messages=await code.getCompilationInfo();if(messages.messages.some(m=>m.type==='error'))throw Error(messages.messages.map(m=>m.message).join('\n'));const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:code,entryPoint:'main'}});entry={pipeline,free};pipelines.set(key,entry);}catch(error){free();throw error;}}
    checkAbort(signal);device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const allocate=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);backings.set(b,budget.registerBacking?.('gpu',size,{owner:'d2prl',label:'convolution-buffer'}));return b;};const inputs=[input,weights,bias].map(a=>{const b=allocate(a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(b,0,a);return b;}),out=allocate(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),shape=allocate(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readback=allocate(outputBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),layoutBuffer=allocate(Math.max(8,ranges.length*8),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(layoutBuffer,0,Uint32Array.from(ranges.length?ranges.flat():[0,0]));const totalGroups=Math.ceil(count/64),groupsX=Math.min(totalGroups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(totalGroups/groupsX);requireValue(groupsY<=device.limits.maxComputeWorkgroupsPerDimension,'Dispatch exceeds device limit');device.queue.writeBuffer(shape,0,new Uint32Array([height,width,oh,ow,outChannels,padding,count,groupsX*64,ranges.length,stride,outChannels/groups,hasBias?0:1,tailStart,experimentalTailMode==='block1024'?2:1,0,0]));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(entry.pipeline);pass.setBindGroup(0,device.createBindGroup({layout:entry.pipeline.getBindGroupLayout(0),entries:[...inputs,out,shape,layoutBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}));
    // Two-dimensional workgroup dispatch avoids the per-dimension limit while
    // each invocation still owns one complete ordered reduction.
    pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(out,0,readback,0,outputBytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;onSubmitted?.();
    await device.queue.onSubmittedWorkDone();const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??validation).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    computeLease.release();computeLease=null;
    // The copy command has completed. Only its readback is still useful: release
    // input/output GPU allocations before any mapping recovery has to reclaim.
    let gpuBytesReleased=0;for(const buffer of buffers)if(buffer!==readback){gpuBytesReleased+=buffer.size;destroyBuffer(buffer);}release();release=null;budget.notifyBackingRelease?.('gpu',gpuBytesReleased);
    checkAbort(signal);await operation('convolution:readback-map',async({resourceOperation}={})=>{resourceOperation?.setState('io');try{return await readback.mapAsync(GPUMapMode.READ);}finally{resourceOperation?.setState('waiting-child');}},{bytes:outputBytes});checkAbort(signal);
    const mapped=await operation('convolution:readback-range',()=>readback.getMappedRange(),{bytes:outputBytes});checkAbort(signal);
    mappedBacking=budget.registerBacking?.('gpu-mapped',outputBytes,{owner:'d2prl',label:'convolution-readback'});
    const output=await operation('convolution:readback-view',()=>new Float32Array(mapped),{bytes:outputBytes});checkAbort(signal);
    // Cover both staging and a separate host mapping if the implementation uses
    // one. No extra Float32Array backing/copy is allocated for the result.
    const owned=ownMappedOutput(readback,output,outputRelease,outputReleased,[backings.get(readback),mappedBacking]),result={...owned,shape:[1,outChannels,oh,ow],arithmeticQualification:experimentalBiasBefore||experimentalTailStart!==undefined?'unqualified-convolution-probe':'reference-layout'};
    ownedOutputs++;retainedReadback=readback;mappedBacking=null;completed=true;return result;
   }finally{if(submitted)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});for(const buffer of buffers)if(buffer!==retainedReadback)destroyBuffer(buffer);release?.();mappedBacking?.();if(!completed)outputRelease?.();computeLease?.release();busy=false;}
  },
  dispose(){requireValue(!busy,'GPU convolution busy');if(disposed)return;disposed=true;if(!ownedOutputs)device.destroy();for(const {free}of pipelines.values())free();pipelines.clear();}
 };
}
