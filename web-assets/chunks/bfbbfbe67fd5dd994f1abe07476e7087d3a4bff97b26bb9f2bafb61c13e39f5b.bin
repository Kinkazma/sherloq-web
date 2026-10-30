import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync,gpuFallbackError} from './gpu-native-boundary.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {waveletGpuBanks} from './wavelet-gpu-banks.js';
import {waveletForwardGpuShader} from './wavelet-forward-gpu-shader.js';
import {validateWaveletGpuOperation,waveletGpuOperation,retireWaveletGpuOperation,attachWaveletGpuCleanup} from './wavelet-gpu-retirement.js';

export async function waveletForwardLevel(gpu,input,width,height,name,{signal,mode=0,diagonalOnly=false,required=false,consume}={}){
 requireValue(!gpu.closed&&!gpu.active,'Wavelet GPU is closed or busy.');
 if(gpu.pending.size){await gpu.dispose();if(required)throw new EngineError('GPU_FAILED','Previous GPU work requires retirement.');return false;}
 const bank=waveletGpuBanks[name],n=width*height;
 requireValue(bank&&[width,height].every(Number.isSafeInteger)&&Number.isSafeInteger(n)&&width>0&&height>0&&[0,8,16,32].includes(mode)&&typeof diagonalOnly==='boolean'&&typeof consume==='function'&&(mode===0?input instanceof Float64Array&&input.length===n:input instanceof Uint8Array&&input.length===n*(mode===16?1:3)),'Invalid whole wavelet forward level.');
 if(width<bank[0].length||height<bank[0].length){if(required)throw new EngineError('GPU_LIMIT','Wavelet axis is outside the qualified forward domain.');return false;}
 gpu.active=true;let complete;gpu.completion=new Promise(resolve=>complete=resolve);
 const record=waveletGpuOperation(gpu);let primary,hasPrimary=false,publishing=false,fallback=false;
 try{
  if(mode===0)for(let i=0;i<input.length;i++)if(!Number.isFinite(input[i])||Math.abs(input[i])>2**24)throw new EngineError('GPU_LIMIT','Forward wavelet input exceeds the qualified numerical range.');
  await gpu.initialize(signal);record.device=gpu.device;
  const pipelineField=diagonalOnly?'diagonalPipeline':'forwardPipeline';
  if(!gpu[pipelineField]){
   const started=performance.now();gpu.forwardLease??=gpu.budget.reserve(4*1024**2);record.device.pushErrorScope('validation');record.device.pushErrorScope('out-of-memory');record.scopes=2;
   const pipeline=await nativeGpuAsync(()=>record.device.createComputePipelineAsync({layout:'auto',compute:{module:record.device.createShaderModule({code:waveletForwardGpuShader}),entryPoint:'down',constants:{diagonalOnly}}}),{signal});
   await validateWaveletGpuOperation(record,{signal});checkAbort(signal);gpu[pipelineField]=pipeline;record.drained=false;gpu.metrics.forwardInitMs=(gpu.metrics.forwardInitMs??0)+performance.now()-started;
  }
  return await getExecutionScheduler(gpu.budget,{maxWorkers:gpu.profile.maxWorkers??1}).run({cpu:0,gpu:1,signal,resourceOwner:'wavelet-forward-gpu',label:'complete-native-symmetric-dwt'},async()=>{
   record.device.pushErrorScope('validation');record.device.pushErrorScope('out-of-memory');record.scopes=2;
   const result=await dispatchForward(gpu,record,input,width,height,name,{mode,diagonalOnly,signal});
   await validateWaveletGpuOperation(record,{signal});checkAbort(signal);publishing=true;await consume(result);publishing=false;
   gpu.metrics.forwardLevels=(gpu.metrics.forwardLevels??0)+1;gpu.metrics.forwardMs=(gpu.metrics.forwardMs??0)+result.elapsedMs;return true;
  });
 }catch(error){
  primary=error;hasPrimary=true;checkAbort(signal);if(publishing||required||!gpuFallbackError(error))throw error;
  fallback=true;gpu.metrics.fallbacks++;
  try{await retireWaveletGpuOperation(gpu,record);await gpu.retireDevice();gpu.closed=true;}catch(cleanup){attachWaveletGpuCleanup(error,cleanup);throw error;}return false;
 }finally{
  let cleanup;try{await retireWaveletGpuOperation(gpu,record);}catch(error){cleanup=error;}
  gpu.active=false;complete();gpu.completion=null;if(cleanup){if(hasPrimary&&!fallback)attachWaveletGpuCleanup(primary,cleanup);else throw cleanup;}
 }
}

// Owned forward transport; consumer completes before its staging lease retires.
async function dispatchForward(gpu,record,input,width,height,name,{mode,diagonalOnly,signal}){
 const device=gpu.device,pipeline=diagonalOnly?gpu.diagonalPipeline:gpu.forwardPipeline,banks=waveletGpuBanks;
 const start=performance.now(),filter=banks[name][0].length,vh=Math.floor((height+filter-1)/2),cw=Math.floor((width+filter-1)/2),n=width*height,verticalCount=width*vh,count=cw*vh,buffers=[];
 if(width<filter||height<filter)throw Error('Private forward path requires native maximum-level axes');
 const create=(size,usage)=>{if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('GPU_LIMIT','Complete forward stencils exceed device storage');const value=nativeGpuSync(()=>device.createBuffer({size,usage}),{signal});buffers.push(value);record.buffers.add(value);return value;};
 record.release=gpu.budget.reserve(Math.ceil(input.byteLength/8)*16+verticalCount*(diagonalOnly?8:16)+count*(diagonalOnly?24:96)+filter*64+192);
 let mapped;
 try{
  const padded=Math.ceil(input.byteLength/8)*8,source=create(padded,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),vertical=create(verticalCount*(diagonalOnly?8:16),GPUBufferUsage.STORAGE),output=create(count*(diagonalOnly?8:32),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),weights=create(filter*32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),read=create(count*(diagonalOnly?8:32),GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),bytes=new Uint8Array(padded);bytes.set(new Uint8Array(input.buffer,input.byteOffset,input.byteLength));nativeGpuSync(()=>device.queue.writeBuffer(source,0,bytes),{signal});
  const packed=new Float32Array(filter*8);let at=0;for(const bank of banks[name])for(const value of bank){const hi=Math.fround(value);packed[at++]=hi;packed[at++]=Math.fround(value-hi);}nativeGpuSync(()=>device.queue.writeBuffer(weights,0,packed),{signal});
  const groups=count=>{const x=Math.min(65535,Math.ceil(count/128));return [x,Math.ceil(count/(x*128))];},[vx,vy]=groups(verticalCount),[gx,gy]=groups(count),uniform=values=>{const value=create(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);nativeGpuSync(()=>device.queue.writeBuffer(value,0,new Uint32Array(values)),{signal});return value;};
  const up0=uniform([width,height,width,vh,filter,0,vx,mode]),up1=uniform([width,vh,cw,vh,filter,1,gx,1]),up2=uniform([width,vh,cw,vh,filter,1,gx,7]),bind=values=>nativeGpuSync(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:values.map((buffer,binding)=>({binding,resource:{buffer}}))}),{signal}),g0=bind([source,weights,vertical,up0]),g1=bind([vertical,weights,output,up1]),g2=bind([vertical,weights,output,up2]),encoder=nativeGpuSync(()=>device.createCommandEncoder(),{signal});
  nativeGpuSync(()=>{for(const[group,x,y]of(diagonalOnly?[[g0,vx,vy],[g1,gx,gy]]:[[g0,vx,vy],[g1,gx,gy],[g2,gx,gy]])){const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(x,y);pass.end();}encoder.copyBufferToBuffer(output,0,read,0,count*(diagonalOnly?8:32));device.queue.submit([encoder.finish()]);},{signal});await nativeGpuAsync(()=>read.mapAsync(GPUMapMode.READ),{signal});mapped=read;checkAbort(signal);const pairs=new Float32Array(read.getMappedRange()),values=new Float64Array(count*(diagonalOnly?1:4));for(let i=0;i<values.length;i++)values[i]=pairs[i*2]+pairs[i*2+1];read.unmap();mapped=null;
  if(!values.every(Number.isFinite))throw new EngineError('GPU_FAILED','Nonfinite forward wavelet output');
  return {width:cw,height:vh,...(diagonalOnly?{d:values}:{a:values.subarray(0,count),v:values.subarray(count,count*2),h:values.subarray(count*2,count*3),d:values.subarray(count*3)}),elapsedMs:performance.now()-start};
 }finally{if(mapped?.mapState==='mapped')mapped.unmap();}
}
