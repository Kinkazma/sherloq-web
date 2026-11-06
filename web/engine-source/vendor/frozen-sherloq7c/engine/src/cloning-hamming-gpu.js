import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {allocateTypedArray,copyTypedArray} from './allocation.js';
import {requestStorageDevice,storageDeviceLimits} from './gpu-limits.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
const shader=`
struct Params {count:u32,words:u32,start:u32,rows:u32};
@group(0) @binding(0) var<storage,read> descriptors:array<u32>;
@group(0) @binding(1) var<storage,read_write> distances:array<u32>;
@group(0) @binding(2) var<uniform> p:Params;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count*p.rows){return;}let q=p.start+i/p.count;let t=i%p.count;var d=0u;
 for(var k=0u;k<p.words;k++){let a=descriptors[q*p.words+k];let b=descriptors[t*p.words+k];if(SIFT){for(var shift=0u;shift<32u;shift+=8u){let delta=i32((a>>shift)&255u)-i32((b>>shift)&255u);d+=u32(delta*delta);}}else{d+=countOneBits(a^b);}}distances[i]=d;
}`;
export async function createHammingGpu(descriptors,stride,{signal,account,mode='hamming'}){
 if(!globalThis.navigator?.gpu)throw new EngineError('UNSUPPORTED_BACKEND','WebGPU unavailable.');
 const count=descriptors.length/stride,words=Math.ceil(stride/4);let device,free,batchRows,size,scoped=false;const buffers=[];const abort=()=>device?.destroy();
 try{
  checkAbort(signal);const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('UNSUPPORTED_BACKEND','WebGPU adapter unavailable.');device=await requestStorageDevice(adapter,{desiredBytes:Math.max(count*words*4,count*64*4),minimumBytes:count*words*4,label:'cloning-descriptors'});
  requireValue(count*words*4<=device.limits.maxStorageBufferBindingSize,'Descriptor buffer exceeds this GPU binding capacity.');
  batchRows=Math.max(1,Math.min(64,Math.floor(Math.min(device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize)/Math.max(4,count*4)),Math.floor(device.limits.maxComputeWorkgroupsPerDimension*256/Math.max(1,count))));
  for(;;){size=Math.max(4,count*batchRows*4);try{free=account(size*4+count*words*12+65536);break;}catch(error){if(error.code!=='MEMORY_LIMIT'||batchRows===1)throw error;batchRows=Math.max(1,Math.floor(batchRows/2));}}
  signal?.addEventListener('abort',abort,{once:true});checkAbort(signal);
  const packed=allocateTypedArray(Uint32Array,count*words,{label:'cloning-packed-descriptors'}),bytes=new Uint8Array(packed.buffer);for(let i=0;i<count;i++)bytes.set(descriptors.subarray(i*stride,(i+1)*stride),i*words*4);
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scoped=true;
  const make=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;},source=make(Math.max(4,packed.byteLength),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),output=make(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=make(size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),uniform=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(source,0,packed);const module=device.createShaderModule({code:'const SIFT:bool='+String(mode==='sift')+';\n'+shader}),pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[source,output,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))});
  scoped=false;const initializationError=await closeGpuErrorScopes(device,{label:'cloning-gpu-buffers',requestedBytes:packed.byteLength+size*2+16});if(initializationError)throw initializationError;
  let disposed=false;return {batchRows,deviceLimits:storageDeviceLimits(device),
   async batch(start,rows){
    requireValue(Number.isInteger(start)&&Number.isInteger(rows)&&start>=0&&rows>=0&&rows<=batchRows&&start+rows<=count,'Invalid GPU distance batch.');checkAbort(signal);if(!count||!rows)return new Uint32Array();
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let pendingScopes=true;
    try{
     device.queue.writeBuffer(uniform,0,new Uint32Array([count,words,start,rows]));const commands=device.createCommandEncoder(),pass=commands.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count*rows/256));pass.end();commands.copyBufferToBuffer(output,0,read,0,count*rows*4);device.queue.submit([commands.finish()]);await read.mapAsync(GPUMapMode.READ,0,count*rows*4);
     let result;try{result=copyTypedArray(new Uint32Array(read.getMappedRange(0,count*rows*4)),{label:'cloning-gpu-readback'});}finally{read.unmap();}
     pendingScopes=false;const error=await closeGpuErrorScopes(device,{label:'cloning-gpu-batch',requestedBytes:count*rows*4});if(error)throw error;checkAbort(signal);return result;
    }catch(error){if(pendingScopes)throw await closeGpuErrorScopes(device,{cause:error,label:'cloning-gpu-batch',requestedBytes:count*rows*4});throw error;}
   },
   dispose(){if(disposed)return;disposed=true;signal?.removeEventListener('abort',abort);buffers.forEach(b=>b.destroy());device.destroy();free?.();}
  };
 }catch(error){if(scoped){scoped=false;error=await closeGpuErrorScopes(device,{cause:error,label:'cloning-gpu-initialize'});}signal?.removeEventListener('abort',abort);buffers.forEach(b=>b.destroy());device?.destroy();free?.();checkAbort(signal);throw error;}
}
