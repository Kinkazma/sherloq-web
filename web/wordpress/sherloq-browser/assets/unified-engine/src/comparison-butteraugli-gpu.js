import "../../runtime-context.js?v=0.30.0";
import {comparisonGpuBoundaryError} from './comparison-gpu-errors.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {requestStorageDevice} from './gpu-limits.js';
export const butteraugliConvolutionShader=`
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read> factors:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
struct Shape{width:u32,rows:u32,sourceTop:u32,origin:u32,length:u32,kernel:u32,vertical:u32,pad:u32};
@group(0) @binding(4) var<uniform> p:Shape;
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let id=gid.x;if(id>=p.width*p.rows){return;}let x=id%p.width;let y=id/p.width;
 let at=select(x,p.origin+y,p.vertical!=0u);let radius=p.kernel/2u;let lo=u32(max(0,i32(at)-i32(radius)));let hi=min(p.length-1u,at+radius);let count=hi-lo+1u;let border=at<radius||at>=p.length-radius;let stop=count/4u*4u;
 var sum=0.0;for(var j=0u;j<count;j++){
  var index=y*p.width+lo+j;if(p.vertical!=0u){index=(lo+j-p.sourceTop)*p.width+x;}
  var k=p.kernel+j;if(border){k=lo+j+radius-at;}
  let value=input[index];let weight=weights[k];if(j<stop){let product=fma(value,weight,0.0);sum=fma(1.0,product,sum);}else{sum=fma(value,weight,sum);}
 }output[id]=fma(sum,factors[at],0.0);
}`;
export function butteraugliGpuPlan({width,rows,sourceRows,sourceTop=0,origin=0,length,kernel,vertical},limits){
 requireValue([width,rows,sourceRows,length,kernel].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isInteger(sourceTop)&&Number.isInteger(origin)&&sourceTop>=0&&origin>=0&&kernel%2===1&&kernel<=257&&width*rows<=1048576,'Invalid bounded Butteraugli convolution.');
 const radius=kernel>>1;
 requireValue(vertical?origin+rows<=length&&sourceTop===Math.max(0,origin-radius)&&sourceTop+sourceRows===Math.min(length,origin+rows+radius):length===width&&sourceRows===rows,'Butteraugli physical halo is incomplete.');
 const inputBytes=width*sourceRows*4,outputBytes=width*rows*4,weightBytes=kernel*8,factorBytes=length*4,groups=Math.ceil(width*rows/128),binding=Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize);
 if(Math.max(inputBytes,outputBytes,weightBytes,factorBytes)>binding||groups>limits.maxComputeWorkgroupsPerDimension)throw new EngineError('GPU_LIMIT','Butteraugli convolution exceeds device limits.');
 return{inputBytes,outputBytes,weightBytes,factorBytes,groups,credit:inputBytes*2+outputBytes*3+weightBytes*2+factorBytes*2+96};
}
export async function createButteraugliConvolutionGpu({budget,scheduler=getExecutionScheduler(budget)}={}){
 requireValue(budget?.reserve,'Butteraugli GPU requires its shared budget.');let adapter;try{adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});}catch(error){throw comparisonGpuBoundaryError(error);}if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Butteraugli WebGPU unavailable.');
 let credit,device,pipeline,disposed=false,busy=false,lost=false,pending,closing,retired=false,deviceDestroyed=false;const life=new AbortController(),metrics={calls:0,pixels:0,milliseconds:0};
 try{credit=budget.reserve(2*1024**2);device=await requestStorageDevice(adapter,{desiredBytes:32*1024**2,label:'butteraugli-convolution'});device.lost.then(()=>lost=true);}catch(error){device?.destroy();credit?.();throw comparisonGpuBoundaryError(error);}
 return{
  async run(input,weights,factors,shape,{signal}={}){
   if(disposed)throw new EngineError('DISPOSED','Butteraugli GPU is closed.');if(busy)throw new EngineError('BUSY','Butteraugli GPU is busy.');if(lost)throw new EngineError('GPU_FAILED','Butteraugli GPU device lost.');
   const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);const plan=butteraugliGpuPlan(shape,device.limits);
   requireValue(input instanceof Float32Array&&input.byteLength===plan.inputBytes&&weights instanceof Float32Array&&weights.byteLength===plan.weightBytes&&factors instanceof Float32Array&&factors.byteLength===plan.factorBytes,'Invalid Butteraugli GPU tensors.');
   busy=true;let finish;pending=new Promise(r=>finish=r);const started=performance.now();const buffers=[],backings=[];let release,resultRelease,resultBacking,lease,operation,scopes=0,submitted=false,mapping,read,returned=false,failed=false,gpuBoundary=false;
   try{
    release=budget.reserve(plan.credit);resultRelease=budget.reserve(plan.outputBytes);operation=budget.beginOperation?.({owner:'comparison',id:'butteraugli-gpu/axis'});lease=await scheduler.acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'comparison',operation,label:'butteraugli-native-f32-convolution'});
    gpuBoundary=true;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    if(!pipeline){const module=device.createShaderModule({code:butteraugliConvolutionShader}),info=await module.getCompilationInfo();if(info.messages.some(v=>v.type==='error'))throw new EngineError('GPU_FAILED',info.messages.filter(v=>v.type==='error').map(v=>v.message).join('\n'));pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});}
    const make=(size,usage)=>{const buffer=device.createBuffer({size,usage});buffers.push(buffer);backings.push(budget.registerBacking?.('gpu',size,{owner:'comparison',label:'butteraugli-axis'}));return buffer;};
    const src=make(plan.inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),w=make(plan.weightBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),factor=make(plan.factorBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=make(plan.outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);read=make(plan.outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(src,0,input);device.queue.writeBuffer(w,0,weights);device.queue.writeBuffer(factor,0,factors);device.queue.writeBuffer(uniform,0,Uint32Array.of(shape.width,shape.rows,shape.sourceTop,shape.origin,shape.length,shape.kernel,+shape.vertical,0));
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[src,w,factor,out,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}));pass.dispatchWorkgroups(plan.groups);pass.end();encoder.copyBufferToBuffer(out,0,read,0,plan.outputBytes);checkAbort(combined);device.queue.submit([encoder.finish()]);submitted=true;operation?.setState('waiting-child');mapping=read.mapAsync(GPUMapMode.READ);await mapping;mapping=null;checkAbort(combined);
    backings.push(budget.registerBacking?.('gpu-mapped',plan.outputBytes,{owner:'comparison',label:'butteraugli-axis-map'}));let data=new Float32Array(read.getMappedRange()).slice();resultBacking=budget.registerBacking?.('array-buffer',plan.outputBytes,{owner:'comparison',label:'butteraugli-axis-result'});read.unmap();
    const oom=await device.popErrorScope();scopes--;const invalid=await device.popErrorScope();scopes--;if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);checkAbort(combined);if(lost)throw new EngineError('GPU_FAILED','Butteraugli GPU device lost.');
    operation?.commit();metrics.calls++;metrics.pixels+=shape.width*shape.rows;returned=true;let alive=true;return{data,release(){if(alive){alive=false;resultBacking?.();resultRelease();data=null;}}};
   }catch(error){failed=true;throw gpuBoundary?comparisonGpuBoundaryError(error,{signal:combined}):error;}finally{
    let cleanupFailed=false,cleanupError;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}};
    if(mapping)await attempt(()=>mapping.catch(()=>{}));if(read?.mapState==='mapped')await attempt(()=>read.unmap());if(submitted)await attempt(async()=>{try{await device.queue.onSubmittedWorkDone();}catch(error){device.destroy();lost=true;throw error;}});
    while(scopes-->0)await attempt(()=>device.popErrorScope());for(const b of buffers)await attempt(()=>b.destroy());for(const free of backings)await attempt(()=>free?.());if(!returned||cleanupFailed){await attempt(()=>resultBacking?.());await attempt(()=>resultRelease?.());}await attempt(()=>release?.());await attempt(()=>lease?.release());await attempt(()=>operation?.release());busy=false;finish();metrics.milliseconds+=performance.now()-started;if(cleanupFailed&&!failed)throw cleanupError;
   }
  },get metrics(){return{...metrics};},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;disposed=true;life.abort();const task=(async()=>{await pending;await device.queue.onSubmittedWorkDone().catch(()=>{});if(!deviceDestroyed){device.destroy();deviceDestroyed=true;}pipeline=null;credit();retired=true;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
