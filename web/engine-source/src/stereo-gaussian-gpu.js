import {stereoGaussianResident} from './stereo-gaussian-resident.js';
import {drainGpuTransactions} from './gpu-ack-retirement.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {stereoGpuOperation,retireStereoGpuOperation,drainStereoGpuOperations,attachStereoGpuCleanup} from './stereo-gpu-retirement.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {createSegmentedBytes} from './segmented-bytes.js';

export const stereoGaussianGpuShader=`
struct Shape{width:u32,height:u32,inputTop:u32,outputTop:u32,rows:u32,size:u32,axis:u32,pad:u32};
@group(0) @binding(0) var<storage,read> source:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;
@group(0) @binding(3) var<uniform> shape:Shape;
fn reflect(value:i32,extent:u32)->u32{if(extent==1u){return 0u;}let period=i32(2u*extent-2u);let v=((value%period)+period)%period;return u32(select(v,period-v,v>=i32(extent)));}
fn at(x:i32,y:i32)->f32{return source[(reflect(y,shape.height)-shape.inputTop)*shape.width+reflect(x,shape.width)];}
fn matrixAt(x:i32,y:i32,component:u32)->f32{return source[(u32(clamp(y,0,i32(shape.height)-1))-shape.inputTop)*shape.width*shape.pad+u32(clamp(x,0,i32(shape.width)-1))*shape.pad+component];}
@compute @workgroup_size(16,16) fn gaussian(@builtin(global_invocation_id) gid:vec3<u32>){
 let x=gid.x;let yy=gid.y;if(x>=shape.width*shape.pad||yy>=shape.rows){return;}let y=shape.outputTop+yy;let r=i32(shape.size/2u);var value:f32;
 if(shape.axis>=2u){
  let spatialX=i32(x/shape.pad);let component=x%shape.pad;
  value=matrixAt(spatialX,i32(y),component)*weights[0];
  for(var j=1u;j<shape.size;j++){
   var pair:f32;if(shape.axis==2u){pair=matrixAt(spatialX,i32(y)+i32(j),component)+matrixAt(spatialX,i32(y)-i32(j),component);}
   else{pair=matrixAt(spatialX+i32(j),i32(y),component)+matrixAt(spatialX-i32(j),i32(y),component);}
   value=fma(pair,weights[j],value);
  }
 }else if(shape.axis==0u){
  if(shape.size<=5u){
   let center=at(i32(x),i32(y));let pair=at(i32(x)-1,i32(y))+at(i32(x)+1,i32(y));
   if(shape.width%2u==1u&&x==shape.width-1u){value=fma(pair,weights[u32(r)+1u],center*weights[u32(r)]);}
   else{value=fma(center,weights[u32(r)],pair*weights[u32(r)+1u]);}
   if(r==2){value=fma(at(i32(x)-2,i32(y))+at(i32(x)+2,i32(y)),weights[u32(r)+2u],value);}
  }else{
   value=at(i32(x)-r,i32(y))*weights[0];
   for(var j=1u;j<shape.size;j++){value=fma(at(i32(x)-r+i32(j),i32(y)),weights[j],value);}
  }
 }else{
  value=at(i32(x),i32(y))*weights[u32(r)];
  for(var j=1;j<=r;j++){let pair=at(i32(x),i32(y)-j)+at(i32(x),i32(y)+j);value=fma(pair,weights[u32(r+j)],value);}
 }
 output[yy*shape.width*shape.pad+x]=value;
}`;

export class StereoGaussianGpu{
 constructor(budget,profile={}){this.budget=budget;this.profile=profile;this.device=null;this.pipeline=null;this.pipelineLease=null;this.active=false;this.closed=false;this.pending=new Set();this.deviceDestroyed=false;this.lost=false;this.completion=null;this.disposal=null;this.unregister=null;this.failure=null;this.hasFailure=false;this.fallbackFailures=new WeakSet();this.metrics={calls:0,tiles:0,kernelMs:0,initMs:0,uploadBytes:0,readbackBytes:0};}
 nativeFailure(error){if(error&&typeof error==='object')this.fallbackFailures.add(error);return error;}
 mayFallback(error){return !!error&&typeof error==='object'&&this.fallbackFailures.has(error)&&gpuFallbackError(error);}
 sync(operation,options){try{return nativeGpuSync(operation,options);}catch(error){throw this.nativeFailure(error);}}
 async asyncApi(operation,options){try{return await nativeGpuAsync(operation,options);}catch(error){throw this.nativeFailure(error);}}
 reserve(bytes){try{return this.budget.reserve(bytes);}catch(error){throw this.nativeFailure(error);}}
 async initialize(signal){
  if(this.device)return;if(this.hasFailure)throw this.nativeFailure(this.failure);checkAbort(signal);
  if(!globalThis.navigator?.gpu)throw this.nativeFailure(new EngineError('UNSUPPORTED_BACKEND','WebGPU Gaussian is unavailable.'));
  this.unregister??=this.budget.registerAsyncReclaimer(async()=>{if(this.active)return 0;await this.dispose();return 0;},{owner:'stereogram-gpu',label:'stereogram-gpu',allocationKind:'gpu'});this.pipelineLease=this.reserve(4*1024**2);
  try{
   const start=performance.now(),adapter=await this.asyncApi(()=>navigator.gpu.requestAdapter(),{signal});checkAbort(signal);if(!adapter)throw this.nativeFailure(new EngineError('UNSUPPORTED_BACKEND','No WebGPU Gaussian adapter.'));
   const device=this.device=await this.asyncApi(()=>adapter.requestDevice(),{signal});checkAbort(signal);this.lost=false;device.lost?.then(()=>{if(this.device===device)this.lost=true;});this.sync(()=>device.pushErrorScope('validation'),{signal});this.sync(()=>device.pushErrorScope('out-of-memory'),{signal});let primary,failed=false;
   try{this.pipeline=await this.asyncApi(()=>device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:stereoGaussianGpuShader}),entryPoint:'gaussian'}}),{signal});}catch(error){failed=true;primary=error;}
   const oom=await this.asyncApi(()=>device.popErrorScope(),{signal}),validation=await this.asyncApi(()=>device.popErrorScope(),{signal});if(failed||oom||validation)throw failed?primary:this.nativeFailure(new EngineError('UNSUPPORTED_BACKEND',(oom??validation).message));this.metrics.initMs+=performance.now()-start;
  }catch(error){this.failure=error;this.hasFailure=true;try{await this.disposeDevice();}catch(cleanup){attachStereoGpuCleanup(error,cleanup);}throw error;}
 }
 async runStore(input,output,width,height,weights,{signal,storage='auto',temporarySession,getTemporarySession,required=false,channels=1,kernelKind='image'}={}){
  requireValue(!this.closed&&!this.active,'Stereogram Gaussian GPU is closed or busy.');
  requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&weights instanceof Float32Array&&weights.length>=3&&weights.length<=79&&weights.every(v=>Number.isFinite(v)&&v>=0)&&(['image','matrix'].includes(kernelKind))&&(kernelKind==='image'?channels===1&&weights.length%2===1:channels===5)&&input.byteLength===width*height*channels*4&&output.byteLength===width*height*channels*4,'Invalid global stereogram Gaussian.');
  this.active=true;this.fallbackFailures=new WeakSet();let complete;this.completion=new Promise(resolve=>complete=resolve);const retirement=stereoGpuOperation(this);const buffers=[];let temporary,lease,device,scoped=false,primary,failed=false;
  try{
   checkAbort(signal);for(const prior of [...this.pending])if(prior!==retirement)await retireStereoGpuOperation(this,prior);if(this.residentOwner)await drainGpuTransactions(this.residentOwner);await this.initialize(signal);device=this.device;retirement.device=device;
   if(this.profile.stereoGpuTransport==='resident'&&await stereoGaussianResident(this,input,output,width,height,weights,{signal,channels,kernelKind})){retirement.drained=true;return true;}
   const radius=kernelKind==='image'?(weights.length-1)/2:weights.length-1,stride=width*channels,limit=Math.min(64*1024**2,device.limits.maxStorageBufferBindingSize),rows=Math.max(1,Math.min(height,Math.floor(limit/(stride*4))-radius*2,Math.floor(262144/stride))),inputRows=Math.min(height,rows+radius*2),inputBytes=stride*inputRows*4,outputBytes=stride*rows*4;
   if(inputBytes>limit||outputBytes>limit||Math.ceil(stride/16)>device.limits.maxComputeWorkgroupsPerDimension)throw this.nativeFailure(new EngineError('UNSUPPORTED_BACKEND','Complete Gaussian row stencils exceed the current WebGPU limits.'));
   lease=this.reserve(inputBytes*2+outputBytes*3+weights.byteLength+32);retirement.release=lease;
   temporary=await createSegmentedBytes(stride*height*4,{budget:this.budget,signal,storage,temporarySession,getTemporarySession,chunkBytes:262144});retirement.temporary=temporary;
   return await getExecutionScheduler(this.budget,{maxWorkers:this.profile.maxWorkers??1}).run({cpu:0,gpu:1,signal,resourceOwner:'stereo-gaussian',label:'stereo-gaussian-global'},async()=>{
    this.sync(()=>device.pushErrorScope('validation'),{signal});retirement.scopes++;this.sync(()=>device.pushErrorScope('out-of-memory'),{signal});retirement.scopes++;scoped=true;
    const create=(size,usage)=>{const buffer=this.sync(()=>device.createBuffer({size,usage}),{signal});buffers.push(buffer);retirement.buffers.add(buffer);return buffer;};
    const source=create(inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),kernel=create(weights.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),result=create(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=create(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),staging=create(outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    this.sync(()=>device.queue.writeBuffer(kernel,0,weights),{signal});
    const group=this.sync(()=>device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[source,kernel,result,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}),{signal});
    for(let axis=0;axis<2;axis++){
     const from=axis?temporary:input,to=axis?output:temporary;
     for(let top=0;top<height;top+=rows){
      const vertical=kernelKind==='image'?axis===1:axis===0;
      checkAbort(signal);const count=Math.min(rows,height-top),inputTop=vertical?Math.max(0,top-radius):top,inputBottom=vertical?Math.min(height,top+count+radius):top+count;
      const data=new Uint8Array((inputBottom-inputTop)*stride*4);await from.readInto(data,inputTop*stride*4);checkAbort(signal);
      this.sync(()=>{device.queue.writeBuffer(source,0,data);device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,inputTop,top,count,weights.length,kernelKind==='image'?axis:axis+2,channels]));},{signal});
      const start=performance.now(),encoder=this.sync(()=>device.createCommandEncoder(),{signal}),pass=this.sync(()=>encoder.beginComputePass(),{signal});this.sync(()=>{pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(stride/16),Math.ceil(count/16));pass.end();encoder.copyBufferToBuffer(result,0,staging,0,count*stride*4);device.queue.submit([encoder.finish()]);},{signal});
      await this.asyncApi(()=>staging.mapAsync(GPUMapMode.READ,0,count*stride*4),{signal});let bytes;
      try{checkAbort(signal);bytes=new Uint8Array(this.sync(()=>staging.getMappedRange(0,count*stride*4),{signal})).slice();}finally{this.sync(()=>staging.unmap(),{signal});}
      await to.write(bytes,top*stride*4);this.metrics.tiles++;this.metrics.kernelMs+=performance.now()-start;this.metrics.uploadBytes+=data.byteLength;this.metrics.readbackBytes+=bytes.byteLength;
     }
     await to.flush();
    }
    checkAbort(signal);this.metrics.calls++;return true;
   });
  }catch(error){failed=true;primary=error;checkAbort(signal);if(required||!this.mayFallback(error))throw error;return false;}
  finally{
   let cleanup;try{await retireStereoGpuOperation(this,retirement);}catch(error){cleanup=error;}
   this.active=false;complete();this.completion=null;
   if(cleanup){if(failed)attachStereoGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async disposeDevice(){const device=this.device;if(device&&!this.deviceDestroyed){device.destroy();this.deviceDestroyed=true;}if(this.residentOwner)await drainGpuTransactions(this.residentOwner);await drainStereoGpuOperations(this);if(device){try{await device.queue.onSubmittedWorkDone();}catch(error){if(!device.lost)throw error;await device.lost;}}this.device=null;this.pipeline=null;this.pipelineLease?.();this.pipelineLease=null;this.unregister?.();this.unregister=null;}
 async dispose(){this.closed=true;return this.disposal??=(async()=>{if(this.completion)await this.completion;await this.disposeDevice();})().catch(error=>{this.disposal=null;throw error;});}
}
