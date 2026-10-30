import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {waveletGpuBanks} from './wavelet-gpu-banks.js';
import {waveletReconstructionGpuShader} from './wavelet-axis-gpu-shader.js';
import {validateWaveletGpuOperation,waveletGpuOperation,retireWaveletGpuOperation,drainWaveletGpuOperations,attachWaveletGpuCleanup} from './wavelet-gpu-retirement.js';

// Owned native-stencil wavelet transports, with complete transformed axes.
// Default decomposition and threshold decisions remain native binary64.
// Optional qualified forward transports serve continuous modes separately;
// their cache keeps a native variant for CPU or discontinuous thresholds.
export class WaveletReconstructionGpu{
 constructor(budget,profile={}){
  this.budget=budget;this.profile=profile;this.device=null;this.pipeline=null;
  this.pipelineLease=null;this.forwardLease=null;this.forwardPipeline=null;this.diagonalPipeline=null;this.residentLease=null;this.residentUpPipeline=null;this.residentRgbPipeline=null;this.unregister=null;this.failure=null;
  this.active=false;this.closed=false;this.deviceDestroyed=false;
  this.pending=new Set();this.completion=null;this.disposal=null;
  this.metrics={calls:0,fallbacks:0,initMs:0,computeAndReadbackMs:0,uploadBytes:0,readbackBytes:0};
 }
 async initialize(signal){
  if(this.device)return;if(this.failure)throw this.failure;checkAbort(signal);
  if(!globalThis.navigator?.gpu)throw new EngineError('UNSUPPORTED_BACKEND','WebGPU wavelet reconstruction is unavailable.');
  this.unregister??=this.budget.registerAsyncReclaimer(async()=>{if(this.active)return 0;const bytes=(this.pipelineLease?.bytes??0)+(this.residentLease?.bytes??0)+(this.forwardLease?.bytes??0);await this.dispose();return bytes;},{owner:'wavelet-reconstruction-gpu',label:'idle-wavelet-reconstruction-gpu',allocationKind:'gpu'});
  this.pipelineLease=this.budget.reserve(4*1024**2);
  try{
   const start=performance.now(),adapter=await nativeGpuAsync(()=>navigator.gpu.requestAdapter(),{signal});checkAbort(signal);
   if(!adapter)throw new EngineError('UNSUPPORTED_BACKEND','No WebGPU wavelet reconstruction adapter.');
   const device=this.device=await nativeGpuAsync(()=>adapter.requestDevice(),{signal});checkAbort(signal);
   device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let primary,hasPrimary=false;
   try{this.pipeline=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:waveletReconstructionGpuShader}),entryPoint:'up'}}),{signal});}catch(error){primary=error;hasPrimary=true;}
   let failure,hasFailure=false;
   for(let i=0;i<2;i++)try{const error=await device.popErrorScope();if(error&&!hasFailure){hasFailure=true;failure=new EngineError(error.name==='GPUOutOfMemoryError'?'GPU_OUT_OF_MEMORY':'GPU_FAILED',error.message);}}catch(error){if(!hasFailure){hasFailure=true;failure=error;}}
   if(hasPrimary||hasFailure)throw hasPrimary?primary:failure;this.metrics.initMs+=performance.now()-start;
  }catch(error){this.failure=error;try{await this.retireDevice();}catch(cleanup){attachWaveletGpuCleanup(error,cleanup);}throw error;}
 }
 async up(a,d,width,height,name,axis,{signal,required=false,consume}={}){
  const bank=waveletGpuBanks[name],filter=bank?.[0]?.length,n=width*height;
  requireValue(!this.closed&&!this.active,'Wavelet reconstruction GPU is closed or busy.');
  if(this.pending.size){await this.dispose();if(required)throw new EngineError('GPU_FAILED','A preceding wavelet GPU transaction required acknowledged retirement.');return false;}
  requireValue(a instanceof Float64Array&&d instanceof Float64Array&&a.length===n&&d.length===n&&Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&bank&&[0,1].includes(axis)&&typeof consume==='function','Invalid native wavelet reconstruction strip.');
  const span=axis===0?height:width,ow=axis===1?2*width-filter+2:width,oh=axis===0?2*height-filter+2:height,count=ow*oh;
  requireValue(filter%2===0&&span>=filter/2&&count>0,'Invalid native wavelet reconstruction shape.');
  this.active=true;let complete;this.completion=new Promise(resolve=>complete=resolve);
  const record=waveletGpuOperation(this);let device,primary,hasPrimary=false,publishing=false,fallback=false;
  try{
   checkAbort(signal);await this.initialize(signal);device=this.device;record.device=device;
   const limit=Math.min(64*1024**2,device.limits.maxStorageBufferBindingSize),inputBytes=n*16,outputBytes=count*8;
   if(n>262144||inputBytes>limit||outputBytes>limit)throw new EngineError('GPU_LIMIT','A complete native wavelet strip exceeds this GPU workspace.');
   const groups=Math.ceil(count/128);if(groups>device.limits.maxComputeWorkgroupsPerDimension)throw new EngineError('GPU_LIMIT','Wavelet dispatch exceeds device limits.');
   record.release=this.budget.reserve(inputBytes*2+outputBytes*4+filter*4*8*3+128);
   const result=await getExecutionScheduler(this.budget,{maxWorkers:this.profile.maxWorkers??1}).run({cpu:0,gpu:1,signal,resourceOwner:'wavelet-reconstruction-gpu',label:'native-wavelet-idwt'},async()=>{
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');record.scopes=2;
    const create=(size,usage)=>{const value=nativeGpuSync(()=>device.createBuffer({size,usage}),{signal});record.buffers.add(value);return value;};
    const source=create(inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),weights=create(filter*4*8,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),output=create(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=create(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),invalid=create(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),staging=create(outputBytes+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    const packed=new Float32Array(filter*4*2);let at=0;for(const values of bank)for(const value of values){const hi=Math.fround(value);packed[at++]=hi;packed[at++]=Math.fround(value-hi);}
    nativeGpuSync(()=>{device.queue.writeBuffer(source,0,a);device.queue.writeBuffer(source,a.byteLength,d);device.queue.writeBuffer(weights,0,packed);device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,ow,oh,filter,axis,groups,0]));device.queue.writeBuffer(invalid,0,Uint32Array.of(0));},{signal});
    const group=nativeGpuSync(()=>device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[source,weights,output,uniform,invalid].map((buffer,binding)=>({binding,resource:{buffer}}))}),{signal}),started=performance.now();
    nativeGpuSync(()=>{const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(groups);pass.end();encoder.copyBufferToBuffer(output,0,staging,0,outputBytes);encoder.copyBufferToBuffer(invalid,0,staging,outputBytes,4);device.queue.submit([encoder.finish()]);},{signal});
    await nativeGpuAsync(()=>staging.mapAsync(GPUMapMode.READ),{signal});let values;
    try{
     checkAbort(signal);const mapped=staging.getMappedRange();
     if(new Uint32Array(mapped,outputBytes,1)[0]){this.metrics.fallbacks++;if(required)throw new EngineError('UNSUPPORTED_BACKEND','Wavelet IDWT coefficients exceed the qualified high/low input range.');return false;}
     const pairs=new Float32Array(mapped,0,count*2);values=new Float64Array(count);for(let i=0;i<count;i++)values[i]=pairs[i*2]+pairs[i*2+1];
    }finally{staging.unmap();}
    checkAbort(signal);await validateWaveletGpuOperation(record,{signal});publishing=true;await consume({values,width:ow,height:oh});publishing=false;
    this.metrics.calls++;this.metrics.computeAndReadbackMs+=performance.now()-started;this.metrics.uploadBytes+=inputBytes+packed.byteLength;this.metrics.readbackBytes+=outputBytes+4;return true;
   });
   if(result===false){fallback=true;await retireWaveletGpuOperation(this,record);await this.retireDevice();this.closed=true;}
   return result;
  }catch(error){
   primary=error;hasPrimary=true;checkAbort(signal);if(publishing||required||!gpuFallbackError(error))throw error;
   // An idle pipeline must not take away the memory needed by the original
   // CPU worker after an optional GPU admission refusal.
   fallback=true;this.metrics.fallbacks++;
   try{await retireWaveletGpuOperation(this,record);await this.retireDevice();this.closed=true;}
   catch(cleanup){attachWaveletGpuCleanup(error,cleanup);throw error;}
   return false;
  }
  finally{
   let cleanup;try{await retireWaveletGpuOperation(this,record);}catch(error){cleanup=error;}
   this.active=false;complete();this.completion=null;
   if(cleanup){if(hasPrimary&&!fallback)attachWaveletGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async retireDevice(){
  const device=this.device;if(device&&!this.deviceDestroyed){device.destroy();this.deviceDestroyed=true;}
  await drainWaveletGpuOperations(this);
  if(device){try{await device.queue.onSubmittedWorkDone();}catch(error){if(!device.lost)throw error;await device.lost;}}
  this.device=null;this.pipeline=null;this.forwardPipeline=null;this.diagonalPipeline=null;this.forwardLease?.();this.forwardLease=null;this.residentUpPipeline=null;this.residentRgbPipeline=null;this.residentLease?.();this.residentLease=null;this.pipelineLease?.();this.pipelineLease=null;this.unregister?.();this.unregister=null;
 }
 async dispose(){this.closed=true;return this.disposal??=(async()=>{if(this.completion)await this.completion;await this.retireDevice();})().catch(error=>{this.disposal=null;throw error;});}
}
