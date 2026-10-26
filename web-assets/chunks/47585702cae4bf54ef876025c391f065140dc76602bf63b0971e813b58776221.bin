// Additive context-bank geometry around the original GPU dot implementation.
// The unchanged native cmsegDotShader performs every ordered FP32 FMA.
// No native grid, channel, comparison, API limit or backend is substituted.
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {cmsegDotShader} from './cmseg-dot-gpu.js';
import {createCmsegWindowGpuOwner} from './cmseg-window-gpu-owner.js';
import {retireCompositeOwners} from '../../src/composite-owner-release.js';
export async function createCmsegWindowDotGpu({budget,input,c,side,contexts,rowsPerJob=64,scientificMask,onOwner}){
  requireValue(budget?.reserve&&[[24,128],[32,64],[96,32]].some(g=>JSON.stringify(g)===JSON.stringify([c,side]))&&Number.isSafeInteger(contexts)&&contexts>0&&contexts<=8192,'Pinned CMSeg bank grid/channels and exact context count required');
  const n=contexts*side*side;requireValue(Number.isSafeInteger(n)&&n<=0x3ffffff,'CMSeg exact bank indices exceed their native addressable bound');requireValue(input instanceof Float32Array&&input.length===c*n&&input.every(Number.isFinite)&&Number.isInteger(rowsPerJob)&&rowsPerJob>=1&&rowsPerJob<=256,'Complete finite normalized tensor');
  requireValue(scientificMask===undefined||scientificMask instanceof Uint8Array&&scientificMask.length===n&&scientificMask.every(v=>v===0||v===1),'Binary scientific GPU domain');if(scientificMask?.every(Boolean))scientificMask=undefined;
  let release,device,pipeline,normalized,output,readback,shape,group,busy=false,disposed=false,lost=false,firstRun=true;
  const owner=createCmsegWindowGpuOwner({isBusy:()=>busy,onOwner});let scopes=0;
  const tileBytes=rowsPerJob*n*4;
  try{
    const adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Global correlation GPU unavailable');
    const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,64*1024**2),maximum=Math.min(adapter.limits.maxBufferSize,64*1024**2);
    if(Math.max(input.byteLength,tileBytes)>Math.min(binding,maximum))throw new EngineError('GPU_LIMIT','Global dot tile exceeds device limit');
    // GPU input plus a conservative write staging copy, two GPU tile buffers,
    // uniform and pipeline allowance. Returned CPU rows are reserved per call.
    release=budget.reserve(2*input.byteLength+2*tileBytes+64+2*1024**2+(scientificMask?12*n:0));
    owner.credit(release);
    device=owner.device(await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:maximum}}));device.lost.then(()=>{lost=true;});
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const module=device.createShaderModule({code:cmsegDotShader(c,n,!!scientificMask)}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED','Global dot shader compilation');
    pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
    const allocate=(size,usage)=>owner.buffer(device.createBuffer({size,usage}));
    normalized=allocate(input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    output=allocate(tileBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    readback=allocate(tileBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    shape=allocate(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(normalized,0,input);
    const groupBuffers=[normalized,output,shape];if(scientificMask){const mask=allocate(4*n,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(mask,0,Uint32Array.from(scientificMask));groupBuffers.push(mask);}
    group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:groupBuffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
    await device.queue.onSubmittedWorkDone();const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError('GPU_FAILED',(oom??validation).message);
  }catch(error){while(scopes-->0)await device.popErrorScope().catch(()=>{});await retireCompositeOwners([()=>owner.dispose()],{primary:error});throw error;}
  return{
    rowsPerJob,
    async run({first,count},{signal,onSubmitted}={}){
      requireValue(!busy&&!disposed&&!lost&&Number.isInteger(first)&&first>=0&&Number.isInteger(count)&&count>0&&count<=rowsPerJob&&first+count<=n,'Global dot row range');checkAbort(signal);
      let own,complete=false,submitted=false,scopes=0;const bytes=count*n*4;busy=true;
      try{
        own=budget.reserve(bytes);const groups=Math.ceil(count*n/64),gx=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),gy=Math.ceil(groups/gx);requireValue(gy<=device.limits.maxComputeWorkgroupsPerDimension,'Global dot dispatch limit');
        device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;device.queue.writeBuffer(shape,0,new Uint32Array([first,count*n,gx*64,0]));
        const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(gx,gy);pass.end();encoder.copyBufferToBuffer(output,0,readback,0,bytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;onSubmitted?.();await device.queue.onSubmittedWorkDone();
        const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;if(oom||validation)throw new EngineError('GPU_FAILED',(oom??validation).message);checkAbort(signal);
        await readback.mapAsync(GPUMapMode.READ,0,bytes);let data;try{checkAbort(signal);data=new Float32Array(readback.getMappedRange(0,bytes)).slice();}finally{readback.unmap();}
        const initial=firstRun;firstRun=false;complete=true;return{data,release:own,timings:{gpuWriteBytes:16+(initial?input.byteLength+(scientificMask?4*n:0):0),gpuReadBytes:bytes},gpu:{allocations:initial?4+(scientificMask?1:0):0,peakAccountedBytes:input.byteLength+2*tileBytes+16+(scientificMask?4*n:0)}};
      }finally{if(submitted)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});if(!complete)own?.();busy=false;}
    },
    async dispose(){requireValue(!busy,'Global dot GPU busy');disposed=true;return owner.dispose();}
  };
}
