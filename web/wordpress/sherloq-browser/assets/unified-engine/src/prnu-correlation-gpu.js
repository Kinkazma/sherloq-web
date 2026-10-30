import "../../runtime-context.js?v=0.30.0";
import {prnuGpuBandPlan,PRNU_CORRELATION_BUFFER_BYTES} from './prnu-gpu-band-plan.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {GPU_POSITIVE_F64_WGSL} from './gpu-f64-positive.js';
import {comparisonGpuBoundaryError} from './comparison-gpu-errors.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {requestStorageDevice} from './gpu-limits.js';
// Same zero-padded3x3 all-ones correlation used by the native Wiener filter.
// This spatial GPU implementation deliberately avoids a full-image FFT. Its
// result is binary64-exact to the native direct sums; the native adaptive FFT
// implementation differs by roundoff and is qualified separately, not relabelled.
export const prnuCorrelationGpuShader=GPU_POSITIVE_F64_WGSL+`
@group(0)@binding(0)var<storage,read> input:array<vec2<u32>>;
@group(0)@binding(1)var<storage,read_write> output:array<vec2<u32>>;
@group(0)@binding(2)var<storage,read_write> error:array<atomic<u32>>;
struct Shape{width:u32,height:u32,origin:u32,rows:u32,sourceTop:u32,sourceRows:u32,count:u32,pad:u32};
@group(0)@binding(3)var<uniform> p:Shape;
fn muladd(a:vec2<u32>,b:vec2<u32>,c:vec2<u32>)->vec2<u32>{let result=positiveFma64(a,b,c);if(result.z!=0u){atomicOr(&error[0],1u);}return result.xy;}
@compute@workgroup_size(128)fn main(@builtin(global_invocation_id)gid:vec3<u32>){let id=gid.x;if(id>=p.count){return;}let x=id%p.width;let y=p.origin+id/p.width;let one=vec2<u32>(0u,1072693248u);var mean=vec2<u32>(0u);var squares=vec2<u32>(0u);
 for(var dy=-1;dy<=1;dy++){for(var dx=-1;dx<=1;dx++){let xx=i32(x)+dx;let yy=i32(y)+dy;var value=vec2<u32>(0u);if(xx>=0&&yy>=0&&xx<i32(p.width)&&yy<i32(p.height)){value=input[(u32(yy)-p.sourceTop)*p.width+u32(xx)];}mean=muladd(value,one,mean);let square=muladd(value,value,vec2<u32>(0u));squares=muladd(square,one,squares);}}
 output[id]=mean;output[p.count+id]=squares;
}`;
export function prnuCorrelationGpuPlan(shape,limits){
 const {width,height,origin,rows,sourceTop,sourceRows}=shape;
 requireValue([width,height,rows,sourceRows].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isInteger(origin)&&origin>=0&&origin+rows<=height&&sourceTop===Math.max(0,origin-1)&&sourceTop+sourceRows===Math.min(height,origin+rows+1)&&width*rows<=0xffffffff&&[width,height].every(v=>v<=0x7fffffff),'Invalid complete PRNU3x3 halo.');
 const inputBytes=width*sourceRows*8,outputBytes=width*rows*16,groups=Math.ceil(width*rows/128),binding=Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize,PRNU_CORRELATION_BUFFER_BYTES);
 if(Math.max(inputBytes,outputBytes)>binding||groups>limits.maxComputeWorkgroupsPerDimension)throw new EngineError('GPU_LIMIT','PRNU correlation exceeds bounded GPU geometry.');return{inputBytes,outputBytes,groups,temporaryBytes:inputBytes*2+outputBytes*3+128};
}
export async function createPrnuCorrelationGpu({budget,scheduler=getExecutionScheduler(budget),signal,pool}={}){
 requireValue(budget?.reserve,'PRNU correlation requires its shared budget.');checkAbort(signal);let adapter;
 try{adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});}catch(error){throw comparisonGpuBoundaryError(error,{signal});}if(!adapter)throw new EngineError('GPU_UNAVAILABLE','PRNU WebGPU unavailable.');
 let device,credit,pipeline,disposed=false,busy=false,lost=false,pending,closing,retired=false,deviceDestroyed=false,deviceSafe=false,contextLost=false,needsRetirement=false;const life=new AbortController(),metrics={calls:0,pixels:0,milliseconds:0},bandRetirements=new Set(),registry=pool??new WaveletStripPool(budget,{resourceOwner:'prnu',workerFactory:null});
 const cleanup=registry.ownCleanup(async()=>{
  await pending;let failed=false,primary;const attempt=async fn=>{try{await fn();}catch(error){if(!failed){failed=true;primary=error;}else appendWaveletCleanup(primary,error);}};
  if(device&&!deviceDestroyed)await attempt(()=>{device.destroy();deviceDestroyed=true;});
  if(device&&!deviceSafe)await attempt(async()=>{try{await device.queue.onSubmittedWorkDone();}catch(error){if(!deviceDestroyed||!device.lost)throw error;await device.lost;contextLost=true;}deviceSafe=true;});
  for(const retire of [...bandRetirements])await attempt(retire);
  if((!device||deviceDestroyed&&deviceSafe)&&!bandRetirements.size&&credit)await attempt(async()=>{pipeline=null;await credit();credit=null;});
  if(failed)throw primary;if(credit||bandRetirements.size||device&&!deviceDestroyed)throw new EngineError('GPU_FAILED','PRNU GPU retirement remains pending');retired=true;
 });
 try{credit=budget.reserve(2*1024**2);}catch(primary){try{await cleanup.retire();}catch(error){appendWaveletCleanup(primary,error);}throw primary;}
 try{device=await requestStorageDevice(adapter,{desiredBytes:PRNU_CORRELATION_BUFFER_BYTES,label:'prnu-exact-correlation'});device.lost.then(()=>lost=true);checkAbort(signal);}catch(error){const primary=comparisonGpuBoundaryError(error,{signal});try{await cleanup.retire();}catch(error){appendWaveletCleanup(primary,error);}throw primary;}
 return{
  bandPlan({width,height,origin,availableBytes}){if(disposed)throw new EngineError('DISPOSED','PRNU GPU correlation closed.');return prnuGpuBandPlan({width,height,origin},device.limits,availableBytes);},
  async run(input,shape,{signal}={}){
   if(disposed)throw new EngineError('DISPOSED','PRNU GPU correlation closed.');if(busy)throw new EngineError('BUSY','PRNU GPU correlation busy.');if(lost||needsRetirement||bandRetirements.size)throw new EngineError('GPU_FAILED','PRNU GPU device needs acknowledged retirement.');
   const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);const plan=prnuCorrelationGpuPlan(shape,device.limits),count=shape.width*shape.rows;requireValue(input instanceof Float64Array&&input.byteLength===plan.inputBytes,'Invalid PRNU normalized binary64 band.');busy=true;let finish;pending=new Promise(r=>finish=r);const started=performance.now(),buffers=[],backings=[];let release,resultRelease,resultBacking,lease,operation,scopes=0,submitted=false,queueUsed=false,mapping,read,errorRead,returned=false,failed=false,gpuBoundary=false,primary,queueAck=false,outputOwner;const destroyedBuffers=new Set();
   const retireBand=async()=>{
    let cleanupFailed=false,cleanupPrimary;const note=error=>{if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else appendWaveletCleanup(cleanupPrimary,error);},attempt=async fn=>{try{await fn();}catch(error){note(error);}};
    if(mapping)await attempt(async()=>{await mapping;mapping=null;});
    for(const r of[read,errorRead])if(r?.mapState==='mapped')await attempt(()=>r.unmap());
    if(!queueAck){if(!queueUsed||deviceSafe)queueAck=true;else{try{await device.queue.onSubmittedWorkDone();queueAck=true;}catch(error){note(error);lost=true;needsRetirement=true;if(!deviceDestroyed)await attempt(()=>{device.destroy();deviceDestroyed=true;});if(deviceDestroyed&&device.lost)await attempt(async()=>{await device.lost;contextLost=true;deviceSafe=true;queueAck=true;});}}}
    if(contextLost)scopes=0;else while(scopes){let accepted=false;await attempt(async()=>{let error;try{error=await device.popErrorScope();}catch(error){if(!deviceDestroyed||!device.lost)throw error;await device.lost;contextLost=true;deviceSafe=true;scopes=0;accepted=true;return;}scopes--;accepted=true;if(error)throw new EngineError('GPU_FAILED',error.message);});if(!accepted)break;}
    for(const b of buffers)if(!destroyedBuffers.has(b)){if(contextLost)destroyedBuffers.add(b);else await attempt(()=>{b.destroy();destroyedBuffers.add(b);});}
    if(queueAck&&!mapping&&!scopes&&destroyedBuffers.size===buffers.length&&![read,errorRead].some(r=>r?.mapState==='mapped')){
     for(let i=0;i<backings.length;i++)if(backings[i])await attempt(async()=>{await backings[i]();backings[i]=null;});
     if(!backings.some(Boolean)){
      if(!returned){if(outputOwner)await attempt(()=>outputOwner.retire());else{if(resultBacking)await attempt(async()=>{await resultBacking();resultBacking=null;});if(resultRelease)await attempt(async()=>{await resultRelease();resultRelease=null;});}}
      if((returned||!resultBacking&&!resultRelease)&&release)await attempt(async()=>{await release();release=null;});
      if(!release&&(returned||!resultBacking&&!resultRelease)&&lease)await attempt(async()=>{await lease.release();lease=null;});
      if(!lease&&!release&&(returned||!resultBacking&&!resultRelease)&&operation)await attempt(async()=>{await operation.release();operation=null;});
      if(!lease&&!operation&&!release&&(returned||!resultBacking&&!resultRelease))bandRetirements.delete(retireBand);
     }
    }
    if(cleanupFailed){needsRetirement=true;throw cleanupPrimary;}
   };bandRetirements.add(retireBand);
   try{
    let stamp=performance.now();for(let i=0;i<input.length;i++){const v=input[i];requireValue(Number.isFinite(v)&&v>=0&&!Object.is(v,-0)&&v<=1,'PRNU GPU expects normalized grayscale samples.');if((i&8191)===0&&performance.now()-stamp>8){await controlCheckpoint(combined);stamp=performance.now();}}
    release=budget.reserve(plan.temporaryBytes);resultRelease=budget.reserve(plan.outputBytes);operation=budget.beginOperation?.({owner:'prnu',id:'prnu-correlation-gpu/band'});lease=await scheduler.acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'prnu',operation,label:'prnu-exact-spatial-correlation'});gpuBoundary=true;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    if(!pipeline){const module=device.createShaderModule({code:prnuCorrelationGpuShader}),info=await module.getCompilationInfo();if(info.messages.some(v=>v.type==='error'))throw new EngineError('GPU_FAILED',info.messages.filter(v=>v.type==='error').map(v=>v.message).join('\n'));pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});}
    const make=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);backings.push(budget.registerBacking?.('gpu',size,{owner:'prnu',label:'prnu-exact-correlation'}));return b;};
    const source=make(plan.inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=make(plan.outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),error=make(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);read=make(plan.outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);errorRead=make(4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);queueUsed=true;device.queue.writeBuffer(source,0,input);device.queue.writeBuffer(uniform,0,Uint32Array.of(shape.width,shape.height,shape.origin,shape.rows,shape.sourceTop,shape.sourceRows,count,0));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[source,out,error,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}));pass.dispatchWorkgroups(plan.groups);pass.end();encoder.copyBufferToBuffer(out,0,read,0,plan.outputBytes);encoder.copyBufferToBuffer(error,0,errorRead,0,4);checkAbort(combined);device.queue.submit([encoder.finish()]);submitted=true;operation?.setState('waiting-child');mapping=Promise.allSettled([read,errorRead].map(buffer=>Promise.resolve().then(()=>buffer.mapAsync(GPUMapMode.READ))));const mapped=await mapping;mapping=null;const refused=mapped.find(v=>v.status==='rejected');if(refused)throw refused.reason;checkAbort(combined);
    backings.push(budget.registerBacking?.('gpu-mapped',plan.outputBytes+4,{owner:'prnu',label:'prnu-correlation-map'}));if(new Uint32Array(errorRead.getMappedRange())[0])throw new EngineError('GPU_LIMIT','PRNU positive binary64 requested CPU fallback.');let data=new Float64Array(read.getMappedRange()).slice();resultBacking=budget.registerBacking?.('array-buffer',plan.outputBytes,{owner:'prnu',label:'prnu-correlation-result'});read.unmap();errorRead.unmap();const oom=await device.popErrorScope();scopes--;const invalid=await device.popErrorScope();scopes--;if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);checkAbort(combined);if(lost)throw new EngineError('GPU_FAILED','PRNU GPU device lost.');operation?.commit();metrics.calls++;metrics.pixels+=count;let alive=true;outputOwner=registry.ownCleanup(async()=>{if(resultBacking){await resultBacking();resultBacking=null;}if(resultRelease){await resultRelease();resultRelease=null;}data=null;alive=false;});const answer={get mean(){requireValue(alive,'PRNU GPU result released');return data.subarray(0,count);},get squares(){requireValue(alive,'PRNU GPU result released');return data.subarray(count);},release(){return outputOwner.retire();}};returned=true;return answer;
   }catch(error){failed=true;primary=gpuBoundary?comparisonGpuBoundaryError(error,{signal:combined}):error;throw primary;}finally{
    try{await retireBand();}catch(error){returned=false;if(outputOwner)try{await outputOwner.retire();}catch(cleanupError){appendWaveletCleanup(error,cleanupError);}if(failed)appendWaveletCleanup(primary,error);else throw gpuBoundary?comparisonGpuBoundaryError(error,{signal:combined}):error;}finally{busy=false;finish();metrics.milliseconds+=performance.now()-started;}

   }
  },get metrics(){return{...metrics};},dispose(){if(retired)return Promise.resolve();if(closing)return closing;disposed=true;life.abort();const task=cleanup.retire();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
