import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {initializeGpuOwner,openOwnedGpuDevice,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,gpuOwnerMayFallback,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {allocateTypedArray,copyTypedArray} from './allocation.js';

// The positive byte box means use a FIXED binary64 coefficient. A 96-bit
// unsigned fixed-point accumulator represents every exact coefficient*byte +
// previous-rounded-sum. Rounding that integer to 53 significant bits after
// EVERY tap reproduces the original binary64 FMA; no float32 approximation.
export const NOISESNIFFER_GPU_WGSL=String.raw`
struct Params { width:u32,height:u32,block:u32,count:u32,mlo:u32,mhi:u32,baseExponent:i32,extremaMode:u32 };
@group(0) @binding(0) var<storage,read> rgb:array<u32>;
@group(0) @binding(1) var<storage,read_write> ext:array<atomic<u32>>;
@group(0) @binding(2) var<storage,read_write> means:array<u32>;
@group(0) @binding(3) var<storage,read_write> flags:array<u32>;
@group(0) @binding(4) var<uniform> p:Params;
var<workgroup> low:array<vec3<u32>,64>;
var<workgroup> high:array<vec3<u32>,64>;
fn byte(at:u32)->u32{return (rgb[at/4u]>>((at%4u)*8u))&255u;}
@compute @workgroup_size(64) fn extrema(@builtin(global_invocation_id) id:vec3<u32>,@builtin(local_invocation_id) lid:vec3<u32>){
 let at=id.x;var v=vec3<u32>(255u);var h=vec3<u32>(0u);
 if(at<p.width*p.height){v=vec3<u32>(byte(at*3u),byte(at*3u+1u),byte(at*3u+2u));h=v;}
 low[lid.x]=v;high[lid.x]=h;workgroupBarrier();var step=32u;
 loop{if(step==0u){break;}if(lid.x<step){low[lid.x]=min(low[lid.x],low[lid.x+step]);high[lid.x]=max(high[lid.x],high[lid.x+step]);}workgroupBarrier();step/=2u;}
 if(lid.x==0u){for(var c=0u;c<3u;c++){atomicMin(&ext[c],low[0][c]);atomicMax(&ext[c+3u],high[0][c]);}}
}
fn addTap(a:vec3<u32>,v:u32)->vec3<u32>{
 let t0=(p.mlo&65535u)*v;let t1=(p.mlo>>16u)*v+(t0>>16u);
 let pl=(t0&65535u)|(t1<<16u);let ph=p.mhi*v+(t1>>16u);
 let lo=a.x+pl;let carry=select(0u,1u,lo<a.x);let middle=a.y+ph;let overflow=select(0u,1u,middle<a.y);let mid=middle+carry;
 var r=vec3<u32>(lo,mid,a.z+overflow+select(0u,1u,mid<middle));
 var top=0u;if(r.z!=0u){top=95u-countLeadingZeros(r.z);}else if(r.y!=0u){top=63u-countLeadingZeros(r.y);}else if(r.x!=0u){top=31u-countLeadingZeros(r.x);}
 if(top>52u){let drop=top-52u;let mask=(1u<<drop)-1u;let tail=r.x&mask;let half=1u<<(drop-1u);let round=tail>half||(tail==half&&((r.x>>drop)&1u)==1u);r.x&=~mask;
  if(round){let before=r.x;r.x+=1u<<drop;if(r.x<before){let beforeMid=r.y;r.y+=1u;if(r.y<beforeMid){r.z+=1u;}}}
 }
 return r;
}
fn encode(a:vec3<u32>)->vec2<u32>{
 if(all(a==vec3<u32>(0u))){return vec2<u32>(0u);}
 var top=0u;if(a.z!=0u){top=95u-countLeadingZeros(a.z);}else if(a.y!=0u){top=63u-countLeadingZeros(a.y);}else{top=31u-countLeadingZeros(a.x);}
 let drop=top-52u;var lo=a.x;var hi=a.y;
 if(drop>0u){lo=(a.x>>drop)|(a.y<<(32u-drop));hi=(a.y>>drop)|(a.z<<(32u-drop));}
 return vec2<u32>(lo,(u32(i32(top)+p.baseExponent+1023)<<20u)|(hi&1048575u));
}
@compute @workgroup_size(64) fn base(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count){return;}let cols=p.width-p.block+1u;let y=i/cols;let x=i%cols;
 var sums=array<vec3<u32>,3>(vec3<u32>(0u),vec3<u32>(0u),vec3<u32>(0u));var valid=true;
 for(var dy=0u;dy<p.block;dy++){for(var dx=0u;dx<p.block;dx++){let at=((y+dy)*p.width+x+dx)*3u;for(var c=0u;c<3u;c++){let v=byte(at+c);sums[c]=addTap(sums[c],v);valid=valid&&v>atomicLoad(&ext[c])&&v<atomicLoad(&ext[c+3u]);}}}
 flags[i]=select(0u,1u,valid);for(var c=0u;c<3u;c++){let bits=encode(sums[c]);means[(i*3u+c)*2u]=bits.x;means[(i*3u+c)*2u+1u]=bits.y;}
}
`;

export function noisesnifferCoefficient(block){
 requireValue([3,5,7].includes(block),'Exact GPU box means require block3/5/7.');
 const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,1/(block*block),true);
 const lo=view.getUint32(0,true),hi=view.getUint32(4,true);
 return {lo,hi:(hi&0xfffff)|0x100000,baseExponent:((hi>>>20)&2047)-1023-52};
}

export class NoisesnifferGpu{
 constructor(budget){requireValue(budget?.reserve,'Noisesniffer GPU budget required.');initializeGpuOwner(this,budget,'noisesniffer-means');this.pipelineFree=null;this.metrics={calls:0,blocks:0,uploadBytes:0,readbackBytes:0};}
 mayFallback(error){return gpuOwnerMayFallback(this,error);}
 async retirePipelines(){if(this.pipelineFree){await this.pipelineFree();this.pipelineFree=null;}this.extremaPipeline=this.basePipeline=null;}
 async initialize(signal){
  checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Noisesniffer GPU closed.');
  if(!this.ready)this.ready=(async()=>{
   const device=await openOwnedGpuDevice(this,signal);this.pipelineFree=gpuOwnerReserve(this,4*1024**2);
   const module=gpuOwnerSync(this,()=>device.createShaderModule({code:NOISESNIFFER_GPU_WGSL}),signal),messages=await gpuOwnerAsync(this,()=>module.getCompilationInfo(),signal);if(messages.messages.some(m=>m.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',messages.messages.map(m=>m.message).join('\n')));
   const layout='auto',results=await Promise.allSettled(['extrema','base'].map(entryPoint=>gpuOwnerAsync(this,()=>device.createComputePipelineAsync({layout,compute:{module,entryPoint}}),signal))),failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;checkAbort(signal);this.extremaPipeline=results[0].value;this.basePipeline=results[1].value;return this;
  })().catch(error=>{this.ready=null;throw error;});return this.ready;
 }
 async base(rgb,width,height,block,{signal,extrema,onSubmitted}={}){
  requireValue(rgb instanceof Uint8Array&&rgb.length===width*height*3&&Number.isInteger(width)&&Number.isInteger(height)&&width>=block&&height>=block&&[3,5,7].includes(block),'Invalid exact Noisesniffer GPU base.');
  requireValue(extrema===undefined||Array.isArray(extrema)&&extrema.length===6&&extrema.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'Invalid complete-source extrema.');
  checkAbort(signal);requireValue(!this.busy&&!this.closed,'Noisesniffer GPU unavailable.');this.busy=true;this.fallbackFailures=new WeakSet();
  const scheduler=getExecutionScheduler(this.budget),transaction=gpuTransaction(this);let outputFree,owned,published=false,failed=false,primary;const api=fn=>gpuOwnerSync(this,fn,signal),asyncApi=fn=>gpuOwnerAsync(this,fn,signal);
  try{
   if(this.pending.size>1||this.lost||this.retirementNeeded||this.pipelineFree&&!this.basePipeline){this.pending.delete(transaction);await retireOwnedGpuDevice(this);this.pending.add(transaction);}
   transaction.lease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'noisesniffer',label:'noisesniffer-exact-box-mean'});await this.initialize(signal);transaction.device=this.device;checkAbort(signal);
   const device=this.device,cols=width-block+1,rows=height-block+1,count=cols*rows,upload=Math.ceil(rgb.byteLength/4)*4,meanBytes=count*24,flagBytes=count*4,totalOutput=meanBytes+flagBytes;
   if(!Number.isSafeInteger(count)||count<=0||[upload,meanBytes,flagBytes].some(v=>v>device.limits.maxStorageBufferBindingSize||v>device.limits.maxBufferSize)||Math.ceil(Math.max(width*height,count)/64)>device.limits.maxComputeWorkgroupsPerDimension)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Noisesniffer GPU base exceeds one bounded strip.'));
   // GPU output/readback, a potentially separate host mapping, the copied
   // staging bytes, final binary64 means/IDs/flags and padded upload coexist.
   const release=gpuOwnerReserve(this,2*upload+6*totalOutput+65536);transaction.workspace=release;outputFree=release.split(count*29);transaction.outputFree=outputFree;
   api(()=>device.pushErrorScope('validation'));transaction.scopes++;api(()=>device.pushErrorScope('out-of-memory'));transaction.scopes++;
   const allocate=(bytes,usage,label)=>{const buffer=api(()=>device.createBuffer({size:bytes,usage})),entry={bytes,destroyed:false,release:null};transaction.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',bytes,{owner:'noisesniffer',label});return buffer;};
   const packed=rgb.byteLength===upload?rgb:allocateTypedArray(Uint8Array,upload,{label:'noisesniffer-upload'});if(packed!==rgb)packed.set(rgb);
   const source=allocate(upload,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'box-mean-rgb'),range=allocate(24,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'box-mean-extrema'),means=allocate(meanBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'box-mean-f64-bits'),flags=allocate(flagBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'box-mean-valid'),params=allocate(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'box-mean-params'),read=allocate(totalOutput,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'box-mean-readback');
   api(()=>{device.queue.writeBuffer(source,0,packed);device.queue.writeBuffer(range,0,Uint32Array.from(extrema??[255,255,255,0,0,0]));});
   const coefficient=noisesnifferCoefficient(block),parameters=new Uint32Array([width,height,block,count,coefficient.lo,coefficient.hi,coefficient.baseExponent,Number(!!extrema)]);api(()=>device.queue.writeBuffer(params,0,parameters));
   const encoder=api(()=>device.createCommandEncoder());
   const dispatch=(pipeline,size,entries)=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries}));pass.dispatchWorkgroups(Math.ceil(size/64));pass.end();};
   const bind=(binding,buffer)=>({binding,resource:{buffer}});
   api(()=>{if(!extrema)dispatch(this.extremaPipeline,width*height,[bind(0,source),bind(1,range),bind(4,params)]);
   dispatch(this.basePipeline,count,[source,range,means,flags,params].map((b,i)=>bind(i,b)));
   encoder.copyBufferToBuffer(means,0,read,0,meanBytes);encoder.copyBufferToBuffer(flags,0,read,meanBytes,flagBytes);});checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();
   await asyncApi(()=>device.queue.onSubmittedWorkDone());transaction.drained=true;const oom=await asyncApi(()=>device.popErrorScope());transaction.scopes--;const validation=await asyncApi(()=>device.popErrorScope());transaction.scopes--;if(oom||validation)throw gpuOwnerFailure(this,new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));
   checkAbort(signal);await asyncApi(()=>read.mapAsync(GPUMapMode.READ));transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=api(()=>read.getMappedRange());transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',totalOutput,{owner:'noisesniffer',label:'box-mean-mapping',identity:mapped});const bytes=copyTypedArray(new Uint8Array(mapped),{label:'noisesniffer-mean-copy'}),allMeans=new Float64Array(bytes.buffer,0,count*3),validFlags=new Uint32Array(bytes.buffer,meanBytes,count);let validCount=0;for(const v of validFlags)validCount+=v;
   const valid=allocateTypedArray(Uint32Array,validCount,{label:'noisesniffer-valid-ids'});let at=0,stamp=performance.now();for(let i=0;i<count;i++){if((i&16383)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}if(validFlags[i])valid[at++]=i;}
   const retainedMeans=copyTypedArray(allMeans,{label:'noisesniffer-means'}),retainedValid=valid,retainedFlags=allocateTypedArray(Uint8Array,count,{label:'noisesniffer-valid-flags'});retainedFlags.set(validFlags);api(()=>read.unmap());transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;this.metrics.calls++;this.metrics.blocks+=count;this.metrics.uploadBytes+=upload;this.metrics.readbackBytes+=totalOutput;
   const owners=[];owned=ownGpuArrays({means:retainedMeans,valid:retainedValid,validFlags:retainedFlags},outputFree,owners,this.budget,{width:cols,height:rows,runtime:{backend:'webgpu-integer-binary64-fma',numeric:'exact-positive-byte-box-FMA64',...this.metrics}},this.pendingResults);outputFree=null;transaction.outputFree=null;this.pendingResults.add(owned);
   for(const a of[retainedMeans,retainedValid,retainedFlags])owners.push({bytes:a.byteLength,release:this.budget.registerBacking?.('array-buffer',a.byteLength,{owner:'noisesniffer',label:'box-mean-result',identity:a.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   transaction.device??=this.device;let cleanupFailed=false,cleanup;try{await retireGpuTransaction(this,transaction);}catch(error){cleanupFailed=true;cleanup=error;}
   try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   if(failed&&!this.basePipeline)try{await retireOwnedGpuDevice(this);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}
   this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}
  }
 }
 async dispose(){return disposeGpuOwner(this);}

}

// One device and one shared-budget queue per statistics construction. Each
// caller owns its returned means until consume/retirement releases them.
export function noisesnifferGpuBaseService(budget,{backend='auto',createProvider=()=>new NoisesnifferGpu(budget)}={}){
 let gpu,queue=Promise.resolve(),closed=false,rejected=null,calls=0;
 return{
  base(rgb,width,height,block,hooks={}){
   const work=async()=>{
    checkAbort(hooks.signal);if(closed)throw new EngineError('DISPOSED','Noisesniffer GPU service closed.');if(gpu?.closed){await gpu.dispose();gpu=null;}
    if(backend==='cpu'||![3,5,7].includes(block)||!globalThis.navigator?.gpu||rejected||(backend!=='webgpu'&&(width-block+1)*(height-block+1)<4096))return null;
    try{gpu??=createProvider();const result=await gpu.base(rgb,width,height,block,hooks);calls++;return result;}
    catch(error){if(hooks.signal?.aborted||!(gpu?.mayFallback?.(error)??['GPU_UNAVAILABLE','GPU_FAILED','GPU_OUT_OF_MEMORY','GPU_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)))throw error;rejected=error.code;try{await gpu?.dispose();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}gpu=null;return null;}
   };
   const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;
  },
  metrics(){return{backend:calls?'webgpu-integer-binary64-fma':'cpu',gpuBaseCalls:calls,...(rejected?{gpuFallback:rejected}:{})};},
  async dispose(){closed=true;await queue;await gpu?.dispose();gpu=null;}
 };
}
