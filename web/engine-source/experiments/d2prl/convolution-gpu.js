import {getExecutionScheduler} from '../../src/execution-scheduler.js';
// Experimental ordered float32 convolution. No ONNX/OS-dependent dispatch.
import{requireValue,checkAbort,controlCheckpoint,EngineError}from'../../src/errors.js';
function shader(channels,kernel){return`
struct Shape{ih:u32,iw:u32,oh:u32,ow:u32,oc:u32,pad:u32,count:u32,reserved:u32,ranges:u32};
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> bias:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@group(0) @binding(5) var<storage,read> bias_domains:array<vec2<u32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let index=gid.x+gid.y*shape.reserved;if(index>=shape.count){return;}let plane=shape.oh*shape.ow;let c=index/plane;let p=index%plane;let y=i32(p/shape.ow)-i32(shape.pad);let x=i32(p%shape.ow)-i32(shape.pad);
 var biasAfter=false;for(var r=0u;r<shape.ranges;r++){if(p>=bias_domains[r].x&&p<bias_domains[r].y){biasAfter=true;}}
 var sum=select(bias[c],0.0,biasAfter);var k=0u;
 for(var ic=0u;ic<${channels}u;ic++){for(var ky=0u;ky<${kernel}u;ky++){for(var kx=0u;kx<${kernel}u;kx++){
  let yy=y+i32(ky);let xx=x+i32(kx);var value=0.0;
  if(yy>=0&&xx>=0&&yy<i32(shape.ih)&&xx<i32(shape.iw)){value=input[(ic*shape.ih+u32(yy))*shape.iw+u32(xx)];}
  sum=fma(value,weights[c*${channels*kernel*kernel}u+k],sum);k++;
 }}}
 if(biasAfter){sum=sum+bias[c];}output[index]=sum;
}`;}
export async function createConvolutionGpu({budget}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared budget required');if(!globalThis.navigator?.gpu)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No WebGPU adapter');
 const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,512*1024**2),maxBuffer=Math.min(adapter.limits.maxBufferSize,512*1024**2);const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer}});const pipelines=new Map();let busy=false,disposed=false,lost=false;device.lost.then(()=>{lost=true;});
 return{
  limits:{maxStorageBufferBindingSize:binding,maxBufferSize:maxBuffer},
  async run({input,weights,bias,channels,height,width,outChannels,kernel,padding=0,referenceLayout},{signal,onSubmitted}={}){
   requireValue(!busy&&!disposed&&!lost,'GPU convolution unavailable');requireValue([channels,height,width,outChannels,kernel,padding].every(Number.isInteger)&&channels>0&&channels<=512&&outChannels>0&&outChannels<=512&&height>0&&height<=1024&&width>0&&width<=1024&&kernel>0&&kernel<=13&&padding>=0&&padding<=6,'Convolution dimensions');
   const oh=height+2*padding-kernel+1,ow=width+2*padding-kernel+1,count=oh*ow*outChannels;requireValue(oh>0&&ow>0&&input instanceof Float32Array&&input.length===channels*height*width&&weights instanceof Float32Array&&weights.length===outChannels*channels*kernel*kernel&&bias instanceof Float32Array&&bias.length===outChannels,'Convolution tensors');const outputBytes=count*4;for(const bytes of[input.byteLength,weights.byteLength,bias.byteLength,outputBytes])if(bytes>binding||bytes>maxBuffer)throw new EngineError('GPU_LIMIT','Convolution buffer exceeds device limit');const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);const zeroBias=bias.every(v=>v===0);requireValue(zeroBias||(referenceLayout&&same(referenceLayout.inputShape,[1,channels,height,width])&&same(referenceLayout.weightShape,[outChannels,channels,kernel,kernel])&&referenceLayout.padding===padding),'Qualified native convolution layout required');const ranges=zeroBias?[]:referenceLayout.biasAfterRanges;requireValue(Array.isArray(ranges)&&ranges.length<=64,'Invalid convolution layout');let previous=0;for(const range of ranges){requireValue(Array.isArray(range)&&range.length===2&&range.every(Number.isInteger)&&range[0]>=previous&&range[1]>range[0]&&range[1]<=oh*ow,'Invalid arithmetic range');previous=range[1];}checkAbort(signal);busy=true;let computeLease,release,outputRelease,scopes=0,completed=false;const buffers=[];let submitted=false;
   try{computeLease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-convolution'});const key=channels+'/'+kernel;let entry=pipelines.get(key);if(!entry&&pipelines.size>=8){const oldest=pipelines.keys().next().value;pipelines.get(oldest).free();pipelines.delete(oldest);}release=budget.reserve(2*(input.byteLength+weights.byteLength+bias.byteLength)+3*outputBytes+2048+(entry?0:2*1024**2));outputRelease=release.split(outputBytes);let stamp=performance.now();for(const a of[input,weights,bias])for(let i=0;i<a.length;i++){requireValue(Number.isFinite(a[i]),'Nonfinite convolution tensor');if((i&8191)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}}
    if(!entry){const free=release.split(2*1024**2);try{const code=device.createShaderModule({code:shader(channels,kernel)}),messages=await code.getCompilationInfo();if(messages.messages.some(m=>m.type==='error'))throw Error(messages.messages.map(m=>m.message).join('\n'));const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:code,entryPoint:'main'}});entry={pipeline,free};pipelines.set(key,entry);}catch(error){free();throw error;}}
    checkAbort(signal);device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const allocate=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;};const inputs=[input,weights,bias].map(a=>{const b=allocate(a.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(b,0,a);return b;}),out=allocate(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),shape=allocate(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readback=allocate(outputBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),layoutBuffer=allocate(Math.max(8,ranges.length*8),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(layoutBuffer,0,Uint32Array.from(ranges.length?ranges.flat():[0,0]));const groups=Math.ceil(count/64),groupsX=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);requireValue(groupsY<=device.limits.maxComputeWorkgroupsPerDimension,'Dispatch exceeds device limit');device.queue.writeBuffer(shape,0,new Uint32Array([height,width,oh,ow,outChannels,padding,count,groupsX*64,ranges.length,0,0,0]));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(entry.pipeline);pass.setBindGroup(0,device.createBindGroup({layout:entry.pipeline.getBindGroupLayout(0),entries:[...inputs,out,shape,layoutBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}));
    // Two-dimensional workgroup dispatch avoids the per-dimension limit while
    // each invocation still owns one complete ordered reduction.
    pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(out,0,readback,0,outputBytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;onSubmitted?.();
    await device.queue.onSubmittedWorkDone();const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError('GPU_FAILED',(oom??validation).message);checkAbort(signal);await readback.mapAsync(GPUMapMode.READ);let output;try{checkAbort(signal);output=new Float32Array(readback.getMappedRange()).slice();}finally{readback.unmap();}completed=true;return{data:output,shape:[1,outChannels,oh,ow],release:outputRelease};
   }finally{if(submitted)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});for(const buffer of buffers)buffer.destroy();release?.();if(!completed)outputRelease?.();computeLease?.release();busy=false;}
  },
  dispose(){requireValue(!busy,'GPU convolution busy');if(disposed)return;disposed=true;device.destroy();for(const {free}of pipelines.values())free();pipelines.clear();}
 };
}
