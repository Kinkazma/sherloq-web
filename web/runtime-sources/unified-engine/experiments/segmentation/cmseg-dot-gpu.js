// Hold the complete normalized feature tensor on GPU.
// One invocation owns a complete ordered float32 FMA reduction. No pair omitted.
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
function shader(c,n){return `
struct Shape {first:u32,count:u32,pitch:u32,pad:u32};
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read_write> output:array<f32>;
@group(0) @binding(2) var<uniform> shape:Shape;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let index=gid.x+gid.y*shape.pitch;if(index>=shape.count){return;}
 let i=shape.first+index/${n}u;let j=index%${n}u;var sum=0.0;
 for(var channel=0u;channel<${c}u;channel++){
   sum=fma(input[channel*${n}u+j],input[channel*${n}u+i],sum);
 }
 output[index]=sum;
}`;}
export async function createCmsegDotGpu({budget,input,c,h,w,rowsPerJob=64}){
  requireValue(budget?.reserve&&[[24,128,128],[32,64,64],[96,32,32]].some(g=>JSON.stringify(g)===JSON.stringify([c,h,w])),'Pinned global dot geometry');
  const n=h*w;requireValue(input instanceof Float32Array&&input.length===c*n&&input.every(Number.isFinite)&&Number.isInteger(rowsPerJob)&&rowsPerJob>=1&&rowsPerJob<=256,'Complete finite normalized tensor');
  const adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Global correlation GPU unavailable');
  const tileBytes=rowsPerJob*n*4,binding=Math.min(adapter.limits.maxStorageBufferBindingSize,64*1024**2),maximum=Math.min(adapter.limits.maxBufferSize,64*1024**2);
  if(Math.max(input.byteLength,tileBytes)>Math.min(binding,maximum))throw new EngineError('GPU_LIMIT','Global dot tile exceeds device limit');
  let release,device,pipeline,normalized,output,readback,shape,group,busy=false,disposed=false,lost=false,firstRun=true;
  const buffers=[];let scopes=0;
  try{
    // GPU input plus a conservative write staging copy, two GPU tile buffers,
    // uniform and pipeline allowance. Returned CPU rows are reserved per call.
    release=budget.reserve(2*input.byteLength+2*tileBytes+64+2*1024**2);
    device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:maximum}});device.lost.then(()=>{lost=true;});
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const module=device.createShaderModule({code:shader(c,n)}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED','Global dot shader compilation');
    pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
    const allocate=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;};
    normalized=allocate(input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    output=allocate(tileBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    readback=allocate(tileBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    shape=allocate(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(normalized,0,input);
    group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[normalized,output,shape].map((buffer,binding)=>({binding,resource:{buffer}}))});
    await device.queue.onSubmittedWorkDone();const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError('GPU_FAILED',(oom??validation).message);
  }catch(error){while(scopes-->0)await device.popErrorScope().catch(()=>{});for(const b of buffers)b.destroy();device?.destroy();release?.();throw error;}
  return{
    async run({first,count},{signal,onSubmitted}={}){
      requireValue(!busy&&!disposed&&!lost&&Number.isInteger(first)&&first>=0&&Number.isInteger(count)&&count>0&&count<=rowsPerJob&&first+count<=n,'Global dot row range');checkAbort(signal);
      let own,complete=false,submitted=false,scopes=0;const bytes=count*n*4;busy=true;
      try{
        own=budget.reserve(bytes);const groups=Math.ceil(count*n/64),gx=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),gy=Math.ceil(groups/gx);requireValue(gy<=device.limits.maxComputeWorkgroupsPerDimension,'Global dot dispatch limit');
        device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;device.queue.writeBuffer(shape,0,new Uint32Array([first,count*n,gx*64,0]));
        const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(gx,gy);pass.end();encoder.copyBufferToBuffer(output,0,readback,0,bytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;onSubmitted?.();await device.queue.onSubmittedWorkDone();
        const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError('GPU_FAILED',(oom??validation).message);checkAbort(signal);
        await readback.mapAsync(GPUMapMode.READ,0,bytes);let data;try{checkAbort(signal);data=new Float32Array(readback.getMappedRange(0,bytes)).slice();}finally{readback.unmap();}
        const initial=firstRun;firstRun=false;complete=true;return{data,release:own,timings:{gpuWriteBytes:16+(initial?input.byteLength:0),gpuReadBytes:bytes},gpu:{allocations:initial?4:0,peakAccountedBytes:input.byteLength+2*tileBytes+16}};
      }finally{if(submitted)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});if(!complete)own?.();busy=false;}
    },
    dispose(){requireValue(!busy,'Global dot GPU busy');if(disposed)return;disposed=true;for(const b of buffers)b.destroy();device.destroy();release();}
  };
}
