// Optional Philox inner-stream fill for NativeMpsRandom. No model or PatchMatch
// activation is performed here. Host RNG state remains in random-mps.js.
import {requireValue,checkAbort,EngineError,normalizeResourceError} from '../../src/errors.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';

export const MPS_RANDOM_WGSL=String.raw`
struct Parameters { counter:vec4<u32>,key:vec2<u32>,count:u32,baseBlock:u32 };
@group(0) @binding(0) var<uniform> p:Parameters;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
fn multiplyHigh(a:u32,b:u32)->u32 {
 let a0=a&65535u;let a1=a>>16u;let b0=b&65535u;let b1=b>>16u;
 let p00=a0*b0;let p10=a1*b0;let p01=a0*b1;let p11=a1*b1;
 let carry=(p00>>16u)+(p10&65535u)+(p01&65535u);
 return p11+(p10>>16u)+(p01>>16u)+(carry>>16u);
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let first=id.x*4u;if(first>=p.count){return;}
 let index=p.baseBlock+id.x;var c=p.counter;
 let a=c.x+index;let carry0=select(0u,1u,a<c.x);
 let b=c.y+carry0;let carry1=select(0u,1u,b<c.y);
 let z=c.z+carry1;let carry2=select(0u,1u,z<c.z);
 c=vec4<u32>(a,b,z,c.w+carry2);var key=p.key;
 for(var round=0u;round<10u;round=round+1u){
  let hi0=multiplyHigh(c.x,0xd2511f53u);let hi1=multiplyHigh(c.z,0xcd9e8d57u);
  c=vec4<u32>(hi1^c.y^key.x,0xcd9e8d57u*c.z,hi0^c.w^key.y,0xd2511f53u*c.x);
  key=key+vec2<u32>(0x9e3779b9u,0xbb67ae85u);
 }
 for(var lane=0u;lane<4u;lane=lane+1u){if(first+lane<p.count){
  output[first+lane]=bitcast<u32>(f32(c[lane]&0x7fffffu)*0.00000011920928955078125);
 }}
}
`;

/** Transfers ownership to NativeMpsRandom when supplied as its `fill` option.
 * Final Float32Array storage remains caller-owned under the RNG's existing
 * account(count*4+512) contract. This backend separately funds its pipeline,
 * persistent GPU buffers, mapped readback workspace and scheduler lease.
 */
export async function createNativeMpsRandomGpu({budget,operation=(_label,work)=>work(),maximumTileValues=1048576}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(maximumTileValues)&&maximumTileValues>=4&&maximumTileValues<=2**26&&maximumTileValues%4===0,'MPS random GPU budget and aligned tile required');
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw new EngineError('GPU_UNAVAILABLE','D2PRL MPS random WebGPU adapter unavailable');
 const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,adapter.limits.maxBufferSize),dispatchValues=adapter.limits.maxComputeWorkgroupsPerDimension*64*4;
 const tileValues=Math.floor(Math.min(maximumTileValues,binding/4,dispatchValues)/4)*4;
 if(tileValues<4)throw new EngineError('GPU_LIMIT','D2PRL MPS random GPU binding is too small');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:adapter.limits.maxBufferSize}});
 let pipeline,pipelineRelease,busy=false,disposed=false,lost=false,closing;
 const buffers=new Map(),stats={calls:0,values:0,dispatches:0,readbackBytes:0,bufferAllocations:0,bufferReuses:0,residentBytes:0};
 device.lost.then(()=>{lost=true;});
 try{
  pipelineRelease=await operation('mps-random-gpu:pipeline-admission',()=>budget.reserve(2*1024**2));
  const module=device.createShaderModule({code:MPS_RANDOM_WGSL}),messages=await module.getCompilationInfo();
  if(messages.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED',messages.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n'));
  pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
 }catch(e){pipelineRelease?.();device.destroy();throw normalizeResourceError(e,{allocationKind:'gpu',allocation:'d2prl-mps-random-pipeline'});}
 const retire=entry=>{if(!entry)return;entry.buffer.destroy();entry.backing?.();entry.release();stats.residentBytes-=entry.size;budget.notifyBackingRelease?.('gpu',entry.size);};
 const buffer=(name,size,usage)=>{
  const previous=buffers.get(name);if(previous&&previous.size>=size){stats.bufferReuses++;return previous.buffer;}
  retire(previous);buffers.delete(name);const release=budget.reserve(size);let gpu;
  try{gpu=device.createBuffer({size,usage,label:'D2PRL MPS random '+name});const entry={buffer:gpu,size,release,backing:budget.registerBacking?.('gpu',size,{owner:'d2prl',label:'mps-random-'+name})};buffers.set(name,entry);stats.residentBytes+=size;stats.bufferAllocations++;return gpu;}
  catch(e){gpu?.destroy();release();throw normalizeResourceError(e,{requestedBytes:size,allocationKind:'gpu',allocation:'d2prl-mps-random-'+name});}
 };
 return{
  get stats(){return{...stats,backend:'webgpu',tileValues};},
  async fill({counter,key,output},{signal}={}){
   checkAbort(signal);requireValue(!busy&&!disposed,'MPS random GPU backend unavailable');
   if(lost)throw new EngineError('GPU_FAILED','D2PRL MPS random GPU device lost');
   const words=v=>v instanceof Uint32Array;
   requireValue(words(counter)&&counter.length===4&&words(key)&&key.length===2&&output instanceof Float32Array&&output.length<=2**28,'MPS random GPU fill extent differs');
   if(!output.length)return;
   busy=true;let lease,temporary,currentRead,currentMapping,submitted=false,complete=false,scopes=0;
   try{
    const maximumBytes=Math.min(output.length,tileValues)*4;
    temporary=await operation('mps-random-gpu:readback-admission',()=>budget.reserve(maximumBytes+32),{bytes:maximumBytes+32});
    lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-mps-random'});
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const out=buffer('output',maximumBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('readback',maximumBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),uniform=buffer('parameters',32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);currentRead=read;
    const parameters=new Uint32Array(8);parameters.set(counter);parameters.set(key,4);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:out}}]});
    for(let begin=0;begin<output.length;begin+=tileValues){
     checkAbort(signal);const count=Math.min(tileValues,output.length-begin),bytes=count*4;
     parameters[6]=count;parameters[7]=begin/4;device.queue.writeBuffer(uniform,0,parameters);
     const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/4/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,bytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;stats.dispatches++;
     await operation('mps-random-gpu:readback',()=>currentMapping=read.mapAsync(GPUMapMode.READ,0,bytes),{bytes});
     try{checkAbort(signal);output.set(new Float32Array(read.getMappedRange(0,bytes)),begin);}finally{read.unmap();currentMapping=null;}
     stats.readbackBytes+=bytes;checkAbort(signal);
    }
    const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;
    if(oom||validation)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??validation).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    checkAbort(signal);if(lost)throw new EngineError('GPU_FAILED','D2PRL MPS random GPU device lost during generation');
    stats.calls++;stats.values+=output.length;complete=true;
   }catch(e){checkAbort(signal);throw normalizeResourceError(e,{allocationKind:'gpu',allocation:'d2prl-mps-random-fill'});}
   finally{if(currentMapping)await currentMapping.catch(()=>{});if(currentRead?.mapState==='mapped')currentRead.unmap();if(submitted&&!complete)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});temporary?.();lease?.release();busy=false;}
  },
  dispose(){if(disposed)return closing;requireValue(!busy,'MPS random GPU backend busy');disposed=true;return closing=(async()=>{await device.queue.onSubmittedWorkDone().catch(()=>{});for(const entry of buffers.values())retire(entry);buffers.clear();pipelineRelease();pipelineRelease=null;device.destroy();})();}
 };
}
