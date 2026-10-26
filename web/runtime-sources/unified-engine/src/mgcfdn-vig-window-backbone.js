import "../../runtime-context.js?v=0.25.0";
import nativeMathFactory from'../vendor/segmentation/vig-window-math.js';
import{validateVigBackbone}from'../experiments/segmentation/vig-backbone.js';
import{createVigWindowConvolutionCpu}from'./mgcfdn-vig-window-convolution-cpu.js';
import{createVigWindowGpu}from'./mgcfdn-vig-window-gpu.js';
import{createVigWindowMath,VIG_WINDOW_MATH_HEAP}from'./mgcfdn-vig-window-math.js';
import{requireValue,checkAbort,controlCheckpoint}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const STAGING=96*1024**2;
export function planVigWindowBackboneMemory(contextCells){
 requireValue(Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&contextCells<=4096,'VIG contextual population exceeds native GPU4096 channels');const M=contextCells,F=M/256,rgb=F*3*256**2,parameterFloats=640*640*9+640;
 // Explicit conservative JS coexistence: retained inputs, common residual,
 // current/source/returned activations and async channel/element chunk copies.
 // Pool output/parameter/worker/device credits are separate, not hidden here.
 const phaseFloats={stem:rgb+640*M+2*80*128**2+parameterFloats,knn:rgb+4*640*M+2*1280*M+512*M+parameterFloats,ffn:rgb+2*640*M+8*2560*M+parameterFloats,finalLayout:rgb+3*640*M+parameterFloats};
 const phaseBytes=Object.freeze(Object.fromEntries(Object.entries(phaseFloats).map(([k,v])=>[k,v*4]))),liveUpperBytes=Math.max(...Object.values(phaseBytes)),stagingBytes=Math.max(STAGING,liveUpperBytes),outputBytes=640*M*4;
 const mathGraphPeakBytes=(640*M+1280*M+640*M+Math.min(512,M)*M+M+8*72+1280*8)*4;
 requireValue(mathGraphPeakBytes+2*1024**2<VIG_WINDOW_MATH_HEAP,'VIG native64MiB complete-row math admission');
 return Object.freeze({contextCells:M,contexts:F,mathHeapBytes:VIG_WINDOW_MATH_HEAP,nativeGpuMaximumBytes:64*1024**2,nativeStagingBaselineBytes:STAGING,phaseBytes,liveUpperBytes,stagingBytes,outputBytes,mathGraphPeakBytes,baseOwnedBytes:VIG_WINDOW_MATH_HEAP+stagingBytes+outputBytes,ownership:'JS named liveness bound; native pool parameters/output/workers/device charged separately'});
}
export function addVigWindowLocalPositions(bank,position){
 requireValue(bank instanceof Float32Array&&bank.length>=640*256&&bank.length%(640*256)===0&&position instanceof Float32Array&&position.length===640*256,'VIG native local position table');const M=bank.length/640,out=new Float32Array(bank.length);for(let c=0;c<640;c++)for(let j=0;j<M;j++)out[c*M+j]=Math.fround(bank[c*M+j]+position[c*256+j%256]);return out;
}
// The owner is published synchronously before factory/parameter awaits. Every
// context keeps its native RGB stem and local positions; all16 Grapher/FFN
// blocks then operate on one contextual bank. VIG has no class token.
export async function createVigWindowBackbone({budget,graph,read,contextCells,maxWorkers=1,backend='cpu',onOwner,mathFactory=nativeMathFactory,cpuFactory=createVigWindowConvolutionCpu,gpuFactory=createVigWindowGpu,mathAdapterFactory=createVigWindowMath}){
 requireValue(['cpu','webgpu'].includes(backend)&&budget?.reserve&&typeof read==='function'&&typeof onOwner==='function'&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=32,'VIG native bank backend/parent/Maximum required');validateVigBackbone(graph);const admission=planVigWindowBackboneMemory(contextCells),M=contextCells,F=M/256;
 const children=new Set(),activations=new Set(),outputs=new Set(),heldJobs=new Set(),controller=new AbortController();let module,freeHeap,pool,initializing,running,closing,retiring=false,closed=false,needsRetry=false;
 const current=signal=>{checkAbort(controller.signal);checkAbort(signal);requireValue(!retiring&&!closed,'VIG contextual backbone retired');};
 async function retirePools(){await retireCompositeOwners([...children].map(child=>async()=>{await(child.dispose??child.release).call(child);children.delete(child);}));if(!children.size)pool=undefined;}
 const freeHeld=()=>{if(children.size||activations.size)return;for(const job of[...heldJobs]){job.output?.release();job.staging?.();heldJobs.delete(job);}};
 async function retireActivations(){await retireCompositeOwners([...activations].map(child=>async()=>{await child.release();activations.delete(child);}));}
 async function retireResources(){await retireCompositeOwners([()=>retireActivations(),()=>retirePools(),()=>{for(const output of[...outputs])output.release();},()=>{module=undefined;freeHeap?.();freeHeap=undefined;},()=>freeHeld()]);}
 const owner={release(){if(closing)return closing;if(closed)return;retiring=true;controller.abort();closing=(async()=>{try{await initializing;}catch{}try{await running;}catch{}await retireResources();requireValue(!children.size&&!activations.size&&!heldJobs.size,'VIG native producers still await retirement ACK');closed=true;})().finally(()=>closing=undefined);return closing;}};
 onOwner(owner);current();
 const childOwner=child=>{requireValue(typeof(child?.dispose??child?.release)==='function','Native VIG child owner required');children.add(child);};
 async function createPool(){const before=children.size,value=await(backend==='webgpu'?gpuFactory:cpuFactory)({budget,contextCells:M,maxWorkers,onOwner:childOwner});requireValue(children.size>before&&typeof value?.run==='function','VIG pool must publish its owner before construction returns');pool=value;return value;}
 initializing=Promise.resolve().then(async()=>{current();await createPool();current();freeHeap=budget.reserve(VIG_WINDOW_MATH_HEAP);module=await mathFactory();requireValue(module.HEAPU8.length===VIG_WINDOW_MATH_HEAP,'VIG bounded native heap');current();});
 try{await initializing;}catch(primary){await retireCompositeOwners([()=>retireResources()],{primary});throw primary;}
 async function work(inputs,{signal,onProgress}={}){
  current(signal);if(needsRetry){await retireActivations();await retirePools();freeHeld();current(signal);await createPool();needsRetry=false;}current(signal);
  requireValue(Array.isArray(inputs)&&inputs.length===F&&inputs.every(x=>x instanceof Float32Array&&x.length===3*256**2&&x.every(Number.isFinite)),'Prepared admitted VIG literal-context RGB inputs');
  const job={staging:undefined,output:undefined};heldJobs.add(job);let complete=false,stamp=performance.now(),parameterLoadMs=0,graphDistanceMs=0,workers=0,gpuWriteBytes=0,gpuReadBytes=0,gpuPeakBufferBytes=0,gpuAllocations=0;const began=stamp;
  const checkpoint=async()=>{current(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
  const math=mathAdapterFactory({module,contextCells:M,signal,checkpoint});
  const parameter=async name=>{current(signal);const spec=graph.parameters[name],start=performance.now();let bytes;try{bytes=await read(spec,{signal});}finally{parameterLoadMs+=performance.now()-start;}current(signal);requireValue(bytes instanceof Uint8Array&&bytes.byteLength===spec.bytes&&bytes.byteOffset%4===0,'Verified VIG parameter bytes');const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);requireValue(values.every(Number.isFinite),'Finite VIG parameters');return values;};
  const retain=result=>{requireValue(result&&typeof result.release==='function','VIG useful activation owner');activations.add(result);return result;};
  const retire=async result=>{if(!result)return;await result.release();activations.delete(result);};
  const metrics=result=>{workers=Math.max(workers,result.workers??0);gpuWriteBytes+=result.timings?.gpuWriteBytes??0;gpuReadBytes+=result.timings?.gpuReadBytes??0;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu?.peakAccountedBytes??0);gpuAllocations+=result.gpu?.allocations??0;};
  const op=async(name,a)=>{
   const m=graph.modules[name],plane=a.h*a.w;let data,result;
   if(m.kind==='Conv'){
    const weight=await parameter(name+'.weight'),bias=await parameter(name+'.bias');result=retain(await pool.run({input:a.data,weight,bias,geometry:[m.ci,a.h,a.w,m.co,m.k,m.pad,m.stride,m.groups]},{signal,onProgress:p=>onProgress?.({...p,layer:name})}));current(signal);metrics(result);data=result.data;requireValue(data instanceof Float32Array,'VIG native activation');await retire(a.owner);current(signal);return{data,c:m.co,h:Math.floor((a.h+2*m.pad-m.k)/m.stride)+1,w:Math.floor((a.w+2*m.pad-m.k)/m.stride)+1,owner:result};
   }
   if(m.kind==='BN')data=await math.batchnorm(a.data,a.c,plane,await parameter(name+'.weight'),await parameter(name+'.bias'),await parameter(name+'.running_mean'),await parameter(name+'.running_var'));
   else data=await math.gelu(a.data);
   await retire(a.owner);current(signal);return{...a,data,owner:undefined};
  };
  const add=(a,b)=>{requireValue(a.data.length===b.data.length,'VIG common residual extents');const data=new Float32Array(a.data.length);for(let i=0;i<data.length;i++)data[i]=Math.fround(a.data[i]+b.data[i]);return{...a,data,owner:undefined};};
  try{
   job.staging=budget.reserve(admission.stagingBytes);let free=budget.reserve(admission.outputBytes),data;const output={get data(){return data;},shape:[1,640,1,M],contextShape:[1,640,16,16],contextCells:M,positions:'native-local-indices-repeated-per-context;no-cls',relations:'sixteen-native-common-knn-on-contextual-population',admission,release(){if(!free)return;free();free=undefined;data=undefined;outputs.delete(output);}};job.output=output;outputs.add(output);
   const bank=new Float32Array(640*M);for(let context=0;context<F;context++){
    let local={data:inputs[context],c:3,h:256,w:256};for(let i=0;i<14;i++)local=await op('stem.convs.'+i,local);requireValue(local.c===640&&local.h===16&&local.w===16,'Native VIG stem grid');for(let c=0;c<640;c++)bank.set(local.data.subarray(c*256,(c+1)*256),c*M+context*256);await retire(local.owner);current(signal);
   }
   let a={data:addVigWindowLocalPositions(bank,await parameter('pos_embed')),c:640,h:M===256?16:64,w:M===256?16:M/64};
   for(let i=0;i<16;i++){
    let shortcut=a,p='backbone.'+i+'.0';a=await op(p+'.fc1.0',a);a=await op(p+'.fc1.1',a);const{k,dilation}=graph.knn[i],start=performance.now();
    const data=await math.neighbours(a.data,k,dilation,{...(backend==='webgpu'?{distanceRows:async(inputs,copy)=>{const result=retain(await pool.distance(inputs,{signal,onProgress}));current(signal);metrics(result);copy(result.data);await retire(result);current(signal);}}:{}),onDistance:()=>{}});graphDistanceMs+=performance.now()-start;
    a={...a,c:1280,data,owner:undefined};for(let j=0;j<3;j++)a=await op(p+'.graph_conv.gconv.nn.'+j,a);a=await op(p+'.fc2.0',a);a=await op(p+'.fc2.1',a);a=add(a,shortcut);shortcut=a;p='backbone.'+i+'.1';a=await op(p+'.fc1.0',a);a=await op(p+'.fc1.1',a);a=await op(p+'.act',a);a=await op(p+'.fc2.0',a);a=await op(p+'.fc2.1',a);a=add(a,shortcut);onProgress?.({phase:'vig-window-backbone',completed:i+1,total:16,contextCells:M});await checkpoint();
   }
   data=a.data;requireValue(data.length===640*M&&data.every(Number.isFinite),'Finite VIG contextual features');current(signal);output.workers=workers;output.timings={parameterLoadMs,graphDistanceMs,executionMs:performance.now()-began-parameterLoadMs,gpuWriteBytes,gpuReadBytes};if(backend==='webgpu')output.gpu={devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeakBufferBytes,accounting:'same explicit GPU buffers; excludes driver/compiler residency',errors:[]};complete=true;job.staging();heldJobs.delete(job);return output;
  }catch(primary){needsRetry=true;await retireCompositeOwners([()=>retireActivations(),()=>retirePools()],{primary});freeHeld();throw primary;}
  finally{if(!complete)freeHeld();}
 }
 function run(inputs,hooks={}){requireValue(!running&&!retiring&&!closed,'One native VIG window at a time');const signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),task=Promise.resolve().then(()=>work(inputs,{...hooks,signal}));running=task;task.then(()=>{if(running===task)running=undefined;},()=>{if(running===task)running=undefined;});return task;}
 return Object.freeze({run,release:owner.release,dispose:owner.release,admission,backend,maximumWorkers:maxWorkers,get pendingACKs(){return children.size+activations.size+heldJobs.size;}});
}
