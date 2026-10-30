import "../../runtime-context.js?v=0.30.0";
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {stereoGpuOperation,retireStereoGpuOperation,drainStereoGpuOperations,attachStereoGpuCleanup} from './stereo-gpu-retirement.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';

// OpenCV 4.11 RGB2Gray<uchar>, then its exact half-height byte resize.
// Every reduction is an integer below 2^32. The CPU accumulates the partials
// into the same binary64 strip sums consumed by the original period heuristic.
export const stereoSearchGpuShader=`
struct Shape {width:u32,height:u32,rows:u32,offsets:u32};
@group(0) @binding(0) var<storage,read> rgb:array<u32>;
@group(0) @binding(1) var<storage,read_write> gray:array<u32>;
@group(0) @binding(2) var<storage,read_write> sums:array<u32>;
@group(0) @binding(3) var<uniform> shape:Shape;
@group(0) @binding(4) var<storage,read_write> result:array<u32>;
fn byteAt(i:u32)->u32{return (rgb[i/4u]>>((i%4u)*8u))&255u;}
fn luminance(i:u32)->u32{return (byteAt(i)*9798u+byteAt(i+1u)*19235u+byteAt(i+2u)*3735u+16384u)>>15u;}
@compute @workgroup_size(256) fn prepare(@builtin(global_invocation_id) gid:vec3<u32>){
 let i=gid.x;if(i>=shape.width*shape.rows){return;}
 let x=i%shape.width;let y=i/shape.width;
 let a=luminance((y*2u*shape.width+x)*3u);
 let b=luminance((min(y*2u+1u,shape.height-1u)*shape.width+x)*3u);
 gray[i]=(a+b+1u)/2u;
}
var<workgroup> partial:array<u32,256>;
@compute @workgroup_size(256) fn search(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3<u32>){
 let i=group.x*256u+lane;let offset=group.y+10u;var value=0u;
 if(i<shape.width*shape.rows&&i%shape.width<shape.width-offset){let a=gray[i];let b=gray[i+offset];value=max(a,b)-min(a,b);}
 partial[lane]=value;workgroupBarrier();
 for(var distance=128u;distance>0u;distance/=2u){if(lane<distance){partial[lane]+=partial[lane+distance];}workgroupBarrier();}
 if(lane==0u){let tiles=(shape.width*shape.rows+255u)/256u;sums[group.y*tiles+group.x]=partial[0];}
}
@compute @workgroup_size(256) fn reduce(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3<u32>){
 let tiles=(shape.width*shape.rows+255u)/256u;var value=0u;
 for(var i=lane;i<tiles;i+=256u){value+=sums[group.x*tiles+i];}
 partial[lane]=value;workgroupBarrier();
 for(var distance=128u;distance>0u;distance/=2u){if(lane<distance){partial[lane]+=partial[lane+distance];}workgroupBarrier();}
 if(lane==0u){result[group.x]=partial[0];}
}`;

export class StereoSearchGpu {
 constructor(budget,profile={}){this.budget=budget;this.profile=profile;this.device=null;this.preparePipeline=null;this.searchPipeline=null;this.reducePipeline=null;this.releasePipelines=null;this.failure=null;this.active=false;this.closed=false;this.pending=new Set();this.deviceDestroyed=false;this.completion=null;this.disposal=null;this.unregister=null;this.retirement=null;this.metrics={calls:0,gpuMs:0,uploadBytes:0,readbackBytes:0,initMs:0};}
 async initialize(signal){
  if(this.device)return;if(this.failure)throw this.failure;
  checkAbort(signal);if(!globalThis.navigator?.gpu)throw new EngineError('UNSUPPORTED_BACKEND','WebGPU is unavailable for stereogram search.');
  this.unregister??=this.budget.registerAsyncReclaimer(async()=>{if(this.active)return 0;await this.dispose();return 0;},{owner:'stereogram-gpu',label:'stereogram-gpu',allocationKind:'gpu'});this.releasePipelines=this.budget.reserve(4*1024**2);
  try{
   const start=performance.now(),adapter=await nativeGpuAsync(()=>navigator.gpu.requestAdapter(),{signal});checkAbort(signal);
   if(!adapter)throw new EngineError('UNSUPPORTED_BACKEND','No WebGPU stereogram adapter.');
   const device=this.device=await nativeGpuAsync(()=>adapter.requestDevice(),{signal});checkAbort(signal);
   device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
   let primary;
   try{const module=nativeGpuSync(()=>device.createShaderModule({code:stereoSearchGpuShader}),{signal});this.preparePipeline=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'prepare'}}),{signal});this.searchPipeline=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'search'}}),{signal});this.reducePipeline=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'reduce'}}),{signal});}
   catch(error){primary=error;}
   const oom=await device.popErrorScope(),validation=await device.popErrorScope();if(primary||oom||validation)throw primary??new EngineError('UNSUPPORTED_BACKEND',(oom??validation).message);
   this.metrics.initMs+=performance.now()-start;
  }catch(error){this.failure=error;try{await this.retireDevice();}catch(cleanup){attachStereoGpuCleanup(error,cleanup);}throw error;}
 }
 async search(rgb,width,height,outputRows,{signal,required=false}={}){
  requireValue(!this.closed&&!this.active,'Stereogram GPU search is closed or busy.');
  requireValue(rgb instanceof Uint8Array&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(outputRows)&&outputRows>0&&height<=outputRows*2&&height>=outputRows*2-1&&rgb.length===width*height*3,'Invalid stereogram RGB search strip.');
  const offsets=Math.max(0,Math.floor(width/3)-10),n=width*outputRows,tiles=Math.ceil(n/256),inputBytes=Math.ceil(rgb.byteLength/4)*4,grayBytes=n*4,partialBytes=offsets*tiles*4;
  if(!offsets)return {sums:new Float64Array(0),metrics:{backend:'integer-empty'}};
  if(n>262144||offsets>65535){if(required)throw new EngineError('UNSUPPORTED_BACKEND','Stereogram GPU search strip exceeds its exact integer or dispatch bounds.');return null;}
  this.active=true;let complete;this.completion=new Promise(resolve=>complete=resolve);const retirement=stereoGpuOperation(this);let release;const buffers=[];let device,scoped=false,primary;
  try{
   checkAbort(signal);release=this.budget.reserve(inputBytes+grayBytes+partialBytes+16+offsets*16+inputBytes);retirement.release=release;
   return await getExecutionScheduler(this.budget,{maxWorkers:this.profile.maxWorkers??1}).run({cpu:0,gpu:1,signal,resourceOwner:'stereo-search',label:'stereo-search-integer'},async()=>{
    await this.initialize(signal);device=this.device;retirement.device=device;
    if(Math.max(inputBytes,grayBytes,partialBytes)>device.limits.maxStorageBufferBindingSize||tiles>device.limits.maxComputeWorkgroupsPerDimension||offsets>device.limits.maxComputeWorkgroupsPerDimension)throw new EngineError('UNSUPPORTED_BACKEND','Stereogram search exceeds the current WebGPU device limits.');
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scoped=true;retirement.scopes=2;
    const buffer=(size,usage)=>{const value=nativeGpuSync(()=>device.createBuffer({size,usage}),{signal});buffers.push(value);retirement.buffers.add(value);return value;};
    const source=buffer(inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),gray=buffer(grayBytes,GPUBufferUsage.STORAGE),partials=buffer(partialBytes,GPUBufferUsage.STORAGE),uniform=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),final=buffer(offsets*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),staging=buffer(offsets*4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    const input=new Uint8Array(inputBytes);input.set(rgb);nativeGpuSync(()=>{device.queue.writeBuffer(source,0,input);device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,outputRows,offsets]));},{signal});
    const entry=(binding,b)=>({binding,resource:{buffer:b}}),start=performance.now(),encoder=device.createCommandEncoder();
    const prepare=device.createBindGroup({layout:this.preparePipeline.getBindGroupLayout(0),entries:[entry(0,source),entry(1,gray),entry(3,uniform)]}),search=device.createBindGroup({layout:this.searchPipeline.getBindGroupLayout(0),entries:[entry(1,gray),entry(2,partials),entry(3,uniform)]}),reduce=device.createBindGroup({layout:this.reducePipeline.getBindGroupLayout(0),entries:[entry(2,partials),entry(3,uniform),entry(4,final)]});
    let pass=encoder.beginComputePass();pass.setPipeline(this.preparePipeline);pass.setBindGroup(0,prepare);pass.dispatchWorkgroups(tiles);pass.end();
    pass=encoder.beginComputePass();pass.setPipeline(this.searchPipeline);pass.setBindGroup(0,search);pass.dispatchWorkgroups(tiles,offsets);pass.end();pass=encoder.beginComputePass();pass.setPipeline(this.reducePipeline);pass.setBindGroup(0,reduce);pass.dispatchWorkgroups(offsets);pass.end();encoder.copyBufferToBuffer(final,0,staging,0,offsets*4);nativeGpuSync(()=>device.queue.submit([encoder.finish()]),{signal});
    await nativeGpuAsync(()=>staging.mapAsync(GPUMapMode.READ),{signal});let sums;
    try{checkAbort(signal);sums=Float64Array.from(new Uint32Array(staging.getMappedRange()));}finally{staging.unmap();}
    this.metrics.calls++;this.metrics.gpuMs+=performance.now()-start;this.metrics.uploadBytes+=inputBytes;this.metrics.readbackBytes+=offsets*4;return {sums,metrics:{backend:'webgpu-integer-search',...this.metrics}};
   });
  }catch(error){primary=error;checkAbort(signal);if(required||!gpuFallbackError(error))throw error;return null;}
  finally{
   let cleanup;try{await retireStereoGpuOperation(this,retirement);}catch(error){cleanup=error;}
   this.active=false;complete();this.completion=null;
   if(cleanup){if(primary)attachStereoGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async retireDevice(){const device=this.device;if(device&&!this.deviceDestroyed){device.destroy();this.deviceDestroyed=true;}await drainStereoGpuOperations(this);if(device){try{await device.queue.onSubmittedWorkDone();}catch(error){if(!device.lost)throw error;await device.lost;}}this.device=null;this.preparePipeline=this.searchPipeline=this.reducePipeline=null;this.releasePipelines?.();this.releasePipelines=null;this.unregister?.();this.unregister=null;}
 async dispose(){this.closed=true;return this.disposal??=(async()=>{if(this.completion)await this.completion;await this.retireDevice();})().catch(error=>{this.disposal=null;throw error;});}
}
