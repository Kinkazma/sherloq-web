import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {waveletGpuBanks} from './wavelet-gpu-banks.js';
import {waveletResidentUpShader,waveletResidentRgbShader} from './wavelet-resident-gpu-shaders.js';
import {validateWaveletGpuOperation,waveletGpuOperation,retireWaveletGpuOperation,attachWaveletGpuCleanup} from './wavelet-gpu-retirement.js';

async function initializeResident(gpu,signal){
 if(gpu.residentUpPipeline&&gpu.residentRgbPipeline){checkAbort(signal);return;}const started=performance.now();await gpu.initialize(signal);
 gpu.residentLease??=gpu.budget.reserve(4*1024**2);const device=gpu.device;
 device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let primary,hasPrimary=false,compiled;
 try{
  const pipelines=await Promise.allSettled([[waveletResidentUpShader,'up'],[waveletResidentRgbShader,'rgb']].map(([code,entryPoint])=>nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint}}),{signal})));
  const failed=pipelines.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  compiled=[pipelines[0].value,pipelines[1].value];
 }catch(error){primary=error;hasPrimary=true;}
 for(let i=0;i<2;i++)try{const error=await nativeGpuAsync(()=>device.popErrorScope(),{signal});if(error&&!hasPrimary){hasPrimary=true;primary=new EngineError(error.name==='GPUOutOfMemoryError'?'GPU_OUT_OF_MEMORY':'GPU_FAILED',error.message);}}catch(error){if(!hasPrimary){hasPrimary=true;primary=error;}}
 if(hasPrimary)throw primary;checkAbort(signal);[gpu.residentUpPipeline,gpu.residentRgbPipeline]=compiled;gpu.metrics.residentInitMs=(gpu.metrics.residentInitMs??0)+performance.now()-started;checkAbort(signal);
}

// Complete final IDWT level, then the original crop and uint8 conversion.
// Native coefficients and threshold decisions are inputs. Intermediate planes
// stay on the device; only the final RGB bytes cross back to their owned store.
export async function waveletResidentReconstruction(gpu,a,h,v,d,width,height,name,{targetWidth,targetHeight,signal,required=false,consume}={}){
 requireValue(!gpu.closed&&!gpu.active,'Wavelet GPU is closed or busy.');
 if(gpu.pending.size){await gpu.dispose();if(required)throw new EngineError('GPU_FAILED','A preceding wavelet GPU transaction required acknowledged retirement.');return false;}
 const n=width*height,bank=waveletGpuBanks[name];
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&bank&&[a,h,v,d].every(values=>values instanceof Float64Array&&values.length===n)&&typeof consume==='function','Invalid complete native wavelet level.');
 const filter=bank[0].length,ow=2*width-filter+2,oh=2*height-filter+2;
 requireValue(width>=filter/2&&height>=filter/2&&Number.isSafeInteger(targetWidth)&&targetWidth>0&&targetWidth<=ow&&Number.isSafeInteger(targetHeight)&&targetHeight>0&&targetHeight<=oh,'Invalid native wavelet reconstruction crop.');
 gpu.active=true;let complete;gpu.completion=new Promise(resolve=>complete=resolve);
 const record=waveletGpuOperation(gpu);let primary,hasPrimary=false,publishing=false,fallback=false;
 try{
  checkAbort(signal);await initializeResident(gpu,signal);record.device=gpu.device;
  return await getExecutionScheduler(gpu.budget,{maxWorkers:gpu.profile.maxWorkers??1}).run({cpu:0,gpu:1,signal,resourceOwner:'wavelet-resident-idwt',label:'native-wavelet-final-level'},async()=>{
   record.device.pushErrorScope('validation');record.device.pushErrorScope('out-of-memory');record.scopes=2;
   const result=await dispatchResident(gpu,record,a,h,v,d,width,height,name,{targetWidth,targetHeight,signal});
   checkAbort(signal);await validateWaveletGpuOperation(record,{signal});publishing=true;await consume(result.pixels);publishing=false;
   gpu.metrics.residentLevels=(gpu.metrics.residentLevels??0)+1;gpu.metrics.residentComputeAndReadbackMs=(gpu.metrics.residentComputeAndReadbackMs??0)+result.elapsedMs;return true;
  });
 }catch(error){
  primary=error;hasPrimary=true;checkAbort(signal);if(publishing||required||!gpuFallbackError(error))throw error;
  fallback=true;gpu.metrics.fallbacks++;
  try{await retireWaveletGpuOperation(gpu,record);await gpu.retireDevice();gpu.closed=true;}catch(cleanup){attachWaveletGpuCleanup(error,cleanup);throw error;}
  return false;
 }finally{
  let cleanup;try{await retireWaveletGpuOperation(gpu,record);}catch(error){cleanup=error;}
  gpu.active=false;complete();gpu.completion=null;
  if(cleanup){if(hasPrimary&&!fallback)attachWaveletGpuCleanup(primary,cleanup);else throw cleanup;}
 }
}

// Owned device dispatch for complete native reconstruction and final RGB.
async function dispatchResident(gpu,record,a,h,v,d,width,height,name,{targetWidth,targetHeight,signal}){
 const device=gpu.device,pipelines={up:gpu.residentUpPipeline,rgb:gpu.residentRgbPipeline},banks=waveletGpuBanks;
 const started=performance.now(),filter=banks[name][0].length,ow=2*width-filter+2,oh=2*height-filter+2,n=width*height,middle=ow*height,count=ow*oh,byteLength=targetWidth*targetHeight*3,padded=Math.ceil(byteLength/4)*4,buffers=[];
 const create=(size,usage)=>{if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)!==0&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('GPU_LIMIT','The complete native wavelet level exceeds GPU buffer limits.');const value=nativeGpuSync(()=>device.createBuffer({size,usage}),{signal});buffers.push(value);record.buffers.add(value);return value;};
 const storage=(bytes,usage=0)=>create(bytes,GPUBufferUsage.STORAGE|usage),groups=n=>{const x=Math.min(65535,Math.ceil(n/128));return [x,Math.ceil(n/(128*x))];};
 record.release=gpu.budget.reserve(n*32+middle*16+count*8+padded*3+filter*64+144);
 let mapped;
 try{
  const low=storage(n*16,GPUBufferUsage.COPY_DST),high=storage(n*16,GPUBufferUsage.COPY_DST),intermediate=storage(middle*16),final=storage(count*8,GPUBufferUsage.COPY_SRC),rgb=storage(padded,GPUBufferUsage.COPY_SRC),invalid=storage(4,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),weights=storage(filter*4*8,GPUBufferUsage.COPY_DST),readback=create(padded+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const packed=new Float32Array(filter*8);let at=0;for(const values of banks[name])for(const value of values){const hi=Math.fround(value);packed[at++]=hi;packed[at++]=Math.fround(value-hi);}
  nativeGpuSync(()=>{device.queue.writeBuffer(low,0,a);device.queue.writeBuffer(low,a.byteLength,v);device.queue.writeBuffer(high,0,h);device.queue.writeBuffer(high,h.byteLength,d);device.queue.writeBuffer(weights,0,packed);device.queue.writeBuffer(invalid,0,Uint32Array.of(0));},{signal});
  const uniform=values=>{const buffer=create(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);nativeGpuSync(()=>device.queue.writeBuffer(buffer,0,new Uint32Array(values)),{signal});return buffer;};
  const [gx,gy]=groups(middle),[fx,fy]=groups(count),[rx,ry]=groups(padded/4),u0=uniform([width,height,ow,height,filter,1,gx,0]),u1=uniform([width,height,ow,height,filter,1,gx,middle*2]),u2=uniform([ow,height,ow,oh,filter,0,fx,1]),u3=uniform([ow,oh,targetWidth,targetHeight,rx,0,0,0]);
  const bind=(pipeline,values)=>nativeGpuSync(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:values.map((buffer,binding)=>({binding,resource:{buffer}}))}),{signal});
  const lowGroup=bind(pipelines.up,[low,weights,intermediate,u0]),highGroup=bind(pipelines.up,[high,weights,intermediate,u1]),verticalGroup=bind(pipelines.up,[intermediate,weights,final,u2]),rgbGroup=bind(pipelines.rgb,[final,rgb,invalid,u3]),encoder=device.createCommandEncoder();
  const dispatch=(pipeline,group,x,y)=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(x,y);pass.end();};
  dispatch(pipelines.up,lowGroup,gx,gy);dispatch(pipelines.up,highGroup,gx,gy);dispatch(pipelines.up,verticalGroup,fx,fy);dispatch(pipelines.rgb,rgbGroup,rx,ry);encoder.copyBufferToBuffer(rgb,0,readback,0,padded);encoder.copyBufferToBuffer(invalid,0,readback,padded,4);nativeGpuSync(()=>device.queue.submit([encoder.finish()]),{signal});
  await nativeGpuAsync(()=>readback.mapAsync(GPUMapMode.READ),{signal});mapped=readback;checkAbort(signal);const view=readback.getMappedRange(),status=new Uint32Array(view,padded,1)[0],pixels=new Uint8Array(view,0,byteLength).slice();readback.unmap();mapped=null;
  if(status)throw new EngineError('GPU_LIMIT','Wavelet RGB conversion exceeds the qualified numerical range.');
  gpu.metrics.uploadBytes+=n*32+packed.byteLength;gpu.metrics.readbackBytes+=padded+4;
  return {pixels,elapsedMs:performance.now()-started};
 }finally{if(mapped?.mapState==='mapped')mapped.unmap();}
}
