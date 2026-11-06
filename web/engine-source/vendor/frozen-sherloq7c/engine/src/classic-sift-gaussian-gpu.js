import {byteView} from './memory-range.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';
import {gpuTransaction,retireGpuTransaction,drainGpuTransactions} from './gpu-ack-retirement.js';
import {attachClassicSiftCleanup} from './classic-sift-retirement.js';
// The WGSL below is byte-identical to the original paged Gaussian. Only the
// transport/retirement protocol changes, and the parent owns scheduler credits.
const code=`struct Shape { width:u32,height:u32,length:u32,pad:u32 };
@group(0) @binding(0) var<storage,read> source:array<f32>;
@group(0) @binding(1) var<storage,read> kernel:array<f32>;
@group(0) @binding(2) var<storage,read_write> destination:array<f32>;
@group(0) @binding(3) var<uniform> shape:Shape;
fn reflect(p:i32,n:i32)->u32 { if(n==1){return 0u;}let period=2*(n-1);let a=((p%period)+period)%period;return u32(select(a,period-a,a>=n)); }
@compute @workgroup_size(256) fn horizontal(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.width*shape.height){return;}let x=i%shape.width;let y=i/shape.width;let r=i32(shape.length/2u);var sum=source[y*shape.width+reflect(i32(x)-r,i32(shape.width))]*kernel[0];for(var k=1u;k<shape.length;k++){sum=fma(source[y*shape.width+reflect(i32(x)+i32(k)-r,i32(shape.width))],kernel[k],sum);}destination[i]=sum;}
@compute @workgroup_size(256) fn vertical(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.width*shape.height){return;}let x=i%shape.width;let y=i/shape.width;let r=shape.length/2u;var sum=source[i]*kernel[r];for(var k=1u;k<=r;k++){let pair=source[reflect(i32(y)-i32(k),i32(shape.height))*shape.width+x]+source[reflect(i32(y)+i32(k),i32(shape.height))*shape.width+x];sum=fma(pair,kernel[r+k],sum);}destination[i]=sum;}`;

export function classicSiftGaussianWorkspace(width,height,kernels){const size=width*height*4,readbackBytes=size*(kernels.length+1);return{planeBytes:size,readbackBytes,gpuBytes:size*(kernels.length+2)+readbackBytes+kernels.reduce((sum,k)=>sum+k.byteLength+16,0)};}
const failedConstructors=new Set();
export async function drainClassicSiftGaussianFailures(){for(const cleanup of [...failedConstructors]){await cleanup();failedConstructors.delete(cleanup);}}
export async function createClassicSiftGaussianGpu({phase,backing,recover=async(_label,work)=>work(),signal,onSubmitted}={}){
 const owner={budget:{},pending:new Set(),deviceDestroyed:false};let device,hp,vp,lost=false,closed=false,busy=false,pending,closing;
 async function close(){closed=true;await pending;let failed=false,primary;const attempt=async fn=>{try{await fn();}catch(e){if(!failed){failed=true;primary=e;}}};if(device&&!owner.deviceDestroyed)await attempt(()=>{nativeGpuSync(()=>device.destroy());owner.deviceDestroyed=true;});if(!device||owner.deviceDestroyed)await attempt(()=>drainGpuTransactions(owner));if(!owner.pending.size){hp=null;vp=null;}if(failed)throw primary;}
 const dispose=()=>{if(closing)return closing;const task=close();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;};
 try{
  await phase('gpu');checkAbort(signal);const adapter=await nativeGpuAsync(()=>globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'}),{signal});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','WebGPU unavailable');device=await nativeGpuAsync(()=>adapter.requestDevice(),{signal});device.lost.then(()=>lost=true);
  const record=gpuTransaction(owner);record.device=device;record.drained=true;
  nativeGpuSync(()=>device.pushErrorScope('validation'),{signal});record.scopes++;nativeGpuSync(()=>device.pushErrorScope('out-of-memory'),{signal});record.scopes++;
  const module=nativeGpuSync(()=>device.createShaderModule({code}),{signal});hp=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'horizontal'}}),{signal});vp=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'vertical'}}),{signal});await retireGpuTransaction(owner,record);await phase('cpu');checkAbort(signal);
 }catch(error){try{await dispose();}catch(cleanup){failedConstructors.add(dispose);attachClassicSiftCleanup(error,cleanup);}throw error;}
 return{async pyramidInto(base,width,height,kernels,destination,{signal:activeSignal}={}){
  if(closed)throw new EngineError('DISPOSED','SIFT Gaussian GPU closed');if(busy)throw new EngineError('BUSY','SIFT Gaussian GPU busy');if(lost)throw new EngineError('GPU_DEVICE_LOST','WebGPU SIFT device lost');requireValue(!owner.pending.size,'SIFT Gaussian retirement must complete before reuse');checkAbort(activeSignal);busy=true;let finish;pending=new Promise(r=>finish=r);const record=gpuTransaction(owner);record.device=device;record.drained=true;let failed=false,primary;
  const{planeBytes:size,readbackBytes,gpuBytes}=classicSiftGaussianWorkspace(width,height,kernels),n=width*height,make=(bytes,usage)=>{const b=nativeGpuSync(()=>device.createBuffer({size:Math.max(4,bytes),usage}),{signal:activeSignal});record.buffers.set(b,{bytes:Math.max(4,bytes),destroyed:false});return b;},storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;
  try{
   await phase('gpu',{domains:{gpu:gpuBytes},bytes:gpuBytes});record.workspace=await backing('gpu',gpuBytes,'sift-gaussian');checkAbort(activeSignal);
   nativeGpuSync(()=>device.pushErrorScope('validation'),{signal:activeSignal});record.scopes++;nativeGpuSync(()=>device.pushErrorScope('out-of-memory'),{signal:activeSignal});record.scopes++;
   let source=make(size,storage);const temp=make(size,storage),read=make(readbackBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);const sourceData=typeof base==='function'?base():base;record.drained=false;nativeGpuSync(()=>device.queue.writeBuffer(source,0,sourceData),{signal:activeSignal});const encoder=nativeGpuSync(()=>device.createCommandEncoder(),{signal:activeSignal});nativeGpuSync(()=>encoder.copyBufferToBuffer(source,0,read,0,size),{signal:activeSignal});
   for(let i=0;i<kernels.length;i++){checkAbort(activeSignal);const k=kernels[i],kernel=make(k.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),shape=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),out=make(size,storage);nativeGpuSync(()=>{device.queue.writeBuffer(kernel,0,k);device.queue.writeBuffer(shape,0,Uint32Array.of(width,height,k.length,0));},{signal:activeSignal});
    for(const[pipeline,a,b]of[[hp,source,temp],[vp,temp,out]])nativeGpuSync(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:kernel}},{binding:2,resource:{buffer:b}},{binding:3,resource:{buffer:shape}}]}));pass.dispatchWorkgroups(Math.ceil(n/256));pass.end();},{signal:activeSignal});nativeGpuSync(()=>encoder.copyBufferToBuffer(out,0,read,(i+1)*size,size),{signal:activeSignal});source=out;
   }
   nativeGpuSync(()=>device.queue.submit([encoder.finish()]),{signal:activeSignal});onSubmitted?.();await recover('sift-gaussian-map',()=>nativeGpuAsync(()=>read.mapAsync(GPUMapMode.READ),{signal:activeSignal}),{bytes:readbackBytes,kind:'gpu'});record.drained=true;record.mapping={buffer:read,mapped:true,release:null};checkAbort(activeSignal);
   record.mapping.release=await backing('gpu-mapped',readbackBytes,'sift-gaussian-readback');let mappedRange;await phase('cpu');await recover('sift-gaussian-mapped-range',()=>{mappedRange??=nativeGpuSync(()=>read.getMappedRange(),{signal:activeSignal});});checkAbort(activeSignal);const target=byteView(destination);requireValue(target.byteLength===readbackBytes,'SIFT pyramid destination extent changed');target.set(new Uint8Array(mappedRange));
  }catch(error){failed=true;primary=error;throw error;}
  finally{try{await retireGpuTransaction(owner,record);}catch(cleanup){if(failed)attachClassicSiftCleanup(primary,cleanup);else throw cleanup;}finally{busy=false;finish();pending=null;}}
 },async drain(){await drainGpuTransactions(owner);},dispose,get closed(){return closed;},get pendingRetirements(){return owner.pending.size;}};
}
