import "../../runtime-context.js?v=0.30.0";
import {comparisonGpuBoundaryError} from './comparison-gpu-errors.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {requestStorageDevice} from './gpu-limits.js';

// Luminance, its products and the difference are exact integers. Each group
// contains at most 256 observations, so even sum(gray*gray) is < 2^24.
// The CPU combines those integer partials exactly in binary64. No perceptual
// floating-point reduction, SSIM convolution or metric formula is replaced.
export const comparisonGpuShader=`
@group(0) @binding(0) var<storage,read> a:array<u32>;
@group(0) @binding(1) var<storage,read> b:array<u32>;
@group(0) @binding(2) var<storage,read_write> out:array<u32>;
@group(0) @binding(3) var<storage,read_write> partial:array<u32>;
@group(0) @binding(4) var<storage,read> lut:array<u32>;
struct Params {n:u32,bytes:u32,mode:u32,flags:u32,scale:f32,shift:f32,pad0:u32,pad1:u32};
@group(0) @binding(5) var<uniform> p:Params;
var<workgroup> sums:array<u32,1536>;
fn first(at:u32)->u32{return (a[at>>2u]>>((at&3u)*8u))&255u;}
fn second(at:u32)->u32{return (b[at>>2u]>>((at&3u)*8u))&255u;}
fn gray(r:u32,g:u32,b:u32)->u32{return (r*9798u+g*19235u+b*3735u+16384u)>>15u;}
fn rounded(v:f32)->u32{let f=floor(v);let r=v-f;return u32(clamp(f+select(0.0,1.0,r>0.5||(r==0.5&&(u32(max(f,0.0))&1u)!=0u)),0.0,255.0));}
fn displayed(at:u32)->u32 {
 let pixel=at/3u;let channel=at%3u;
 if((p.flags&2u)!=0u){var r=first(pixel*3u);var g=first(pixel*3u+1u);var b=first(pixel*3u+2u);if((p.flags&1u)!=0u){r=lut[r];g=lut[256u+g];b=lut[512u+b];}return gray(r,g,b);}
 let value=first(at);if((p.flags&1u)!=0u){return lut[channel*256u+value];}return value;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid:vec3<u32>,@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3<u32>){
 let id=gid.x;let at=id*4u;
 if(p.mode==0u){
  var x=0u;var y=0u;if(id<p.n){x=gray(first(id*3u),first(id*3u+1u),first(id*3u+2u));y=gray(second(id*3u),second(id*3u+1u),second(id*3u+2u));}
  let delta=i32(x)-i32(y);sums[lane]=x;sums[256u+lane]=y;sums[512u+lane]=x*x;sums[768u+lane]=y*y;sums[1024u+lane]=x*y;sums[1280u+lane]=u32(delta*delta);
  workgroupBarrier();for(var stride=128u;stride>0u;stride>>=1u){if(lane<stride){for(var k=0u;k<6u;k++){sums[k*256u+lane]+=sums[k*256u+lane+stride];}}workgroupBarrier();}
  if(lane==0u){for(var k=0u;k<6u;k++){partial[group.x*6u+k]=sums[k*256u];}}return;
 }
 var word=0u;var low=255u;var high=0u;
 for(var j=0u;j<4u;j++){let index=at+j;if(index<p.bytes){var value=0u;
  if(p.mode==1u){value=u32(abs(i32(first(index))-i32(second(index))));low=min(low,value);high=max(high,value);}
  else if(p.mode==2u){let product=fma(f32(first(index)),p.scale,0.0);value=rounded(fma(1.0,product,p.shift));}
  else{value=displayed(index);}
  word|=value<<(j*8u);
 }}
 if(at<p.bytes){out[id]=word;}
 if(p.mode==1u){sums[lane]=low;sums[256u+lane]=high;workgroupBarrier();for(var stride=128u;stride>0u;stride>>=1u){if(lane<stride){sums[lane]=min(sums[lane],sums[lane+stride]);sums[256u+lane]=max(sums[256u+lane],sums[256u+lane+stride]);}workgroupBarrier();}if(lane==0u){partial[group.x*2u]=sums[0];partial[group.x*2u+1u]=sums[256];}}
}`;

export function comparisonGpuPlan(pixels,mode,limits){
 requireValue(Number.isSafeInteger(pixels)&&pixels>0&&pixels<=262144&&[0,1,2,3].includes(mode),'Invalid bounded comparison GPU band.');
 const bytes=pixels*3,padded=Math.ceil(bytes/4)*4,groups=Math.ceil((mode===0?pixels:padded/4)/256),partialBytes=Math.max(4,groups*(mode===0?24:mode===1?8:0)),outputBytes=mode===0?4:padded;
 const binding=Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize);
 if(Math.max(padded,partialBytes,outputBytes,3072)>binding||groups>limits.maxComputeWorkgroupsPerDimension)throw new EngineError('GPU_LIMIT','Comparison band exceeds GPU limits.');
 return {pixels,bytes,padded,groups,partialBytes,outputBytes,gpuBytes:padded*2+outputBytes+partialBytes*2+3072+32+(mode===0?0:padded),hostBytes:padded*5+6144+64+(mode===0?0:bytes)+partialBytes};
}
const fallbackCodes=new Set(['GPU_UNAVAILABLE','GPU_LIMIT','GPU_FAILED','MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY']);
export const comparisonGpuMayFallback=error=>fallbackCodes.has(error?.code);

/** A per-comparison owner. Pipelines are reused across its bands; all source,
 * upload, map and output lifetimes are admitted. The enclosing comparison owns
 * scientific stage caching, so no source identity is guessed from dimensions. */
export async function createComparisonGpu({budget,scheduler=getExecutionScheduler(budget)}={}){
 requireValue(budget?.reserve,'A comparison GPU budget is required.');
 let adapter;try{adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});}catch(error){throw comparisonGpuBoundaryError(error);}if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Comparison WebGPU unavailable.');
 let device,credit,pipeline,disposed=false,busy=false,lost=false,pending,closing,retired=false,deviceDestroyed=false;
 const life=new AbortController(),metrics={batches:0,pixels:0,uploadedBytes:0,readbackBytes:0,milliseconds:0};
 try{credit=budget.reserve(2*1024**2);device=await requestStorageDevice(adapter,{desiredBytes:262144*3,label:'comparison'});device.lost.then(()=>{lost=true;});}
 catch(error){device?.destroy();credit?.();throw comparisonGpuBoundaryError(error);}
 return {
  async run(mode,first,second,{signal,low=0,high=255,lut,grayscale=false}={}){
   if(disposed)throw new EngineError('DISPOSED','Comparison GPU is closed.');if(busy)throw new EngineError('BUSY','Comparison GPU is busy.');if(lost)throw new EngineError('GPU_FAILED','Comparison GPU device lost.');
   requireValue(first instanceof Uint8Array&&first.length%3===0&&(mode!==0&&mode!==1||second instanceof Uint8Array&&second.length===first.length),'Invalid comparison GPU RGB inputs.');
   requireValue(mode!==3||!lut||lut instanceof Uint8Array&&lut.length===768,'Invalid comparison display LUT.');
   requireValue(mode!==2||Number.isInteger(low)&&Number.isInteger(high)&&low>=0&&high<=255&&low<=high,'Invalid difference normalization range.');
   const combined=signal?AbortSignal.any([signal,life.signal]):life.signal;checkAbort(combined);const plan=comparisonGpuPlan(first.length/3,mode,device.limits);busy=true;let finish;pending=new Promise(r=>finish=r);const started=performance.now();let release,lease,operation,mapping,submitted=false,scopes=0,resultRelease,resultBacking,returned=false,read,summaryRead,failed=false,gpuBoundary=false;
   const buffers=[],backings=[];
   try{
    release=budget.reserve(plan.gpuBytes+plan.hostBytes);if(mode!==0)resultRelease=budget.reserve(plan.bytes);
    operation=budget.beginOperation?.({owner:'comparison',id:'comparison-gpu/band'});lease=await scheduler.acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'comparison',operation,label:'comparison-exact-pixels'});
    gpuBoundary=true;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    if(!pipeline){const module=device.createShaderModule({code:comparisonGpuShader}),info=await module.getCompilationInfo();if(info.messages.some(v=>v.type==='error'))throw new EngineError('GPU_FAILED',info.messages.filter(v=>v.type==='error').map(v=>v.message).join('\n'));pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});}
    checkAbort(combined);
    const make=(size,usage)=>{const buffer=device.createBuffer({size,usage});buffers.push(buffer);backings.push(budget.registerBacking?.('gpu',size,{owner:'comparison',label:'comparison-exact-band'}));return buffer;};
    const a=make(plan.padded,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),b=make(plan.padded,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=make(plan.outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),partial=make(plan.partialBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),table=make(3072,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),params=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    summaryRead=make(plan.partialBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);if(mode!==0)read=make(plan.padded,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    const packedA=new Uint8Array(plan.padded),packedB=new Uint8Array(plan.padded),tableData=new Uint32Array(768),uniform=new ArrayBuffer(32),u=new Uint32Array(uniform),f=new Float32Array(uniform);packedA.set(first);if(second)packedB.set(second);if(lut)tableData.set(lut);
    const scale=high===low?0:255/(high-low);u.set([plan.pixels,plan.bytes,mode,(lut?1:0)|(grayscale?2:0)]);f[4]=Math.fround(scale);f[5]=Math.fround(-low*scale);
    device.queue.writeBuffer(a,0,packedA);device.queue.writeBuffer(b,0,packedB);device.queue.writeBuffer(table,0,tableData);device.queue.writeBuffer(params,0,uniform);metrics.uploadedBytes+=plan.padded*2+3072+32;
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[a,b,out,partial,table,params].map((buffer,binding)=>({binding,resource:{buffer}}))}));pass.dispatchWorkgroups(plan.groups);pass.end();encoder.copyBufferToBuffer(partial,0,summaryRead,0,plan.partialBytes);if(read)encoder.copyBufferToBuffer(out,0,read,0,plan.padded);checkAbort(combined);device.queue.submit([encoder.finish()]);submitted=true;operation?.setState('waiting-child');
    mapping=Promise.allSettled([summaryRead.mapAsync(GPUMapMode.READ),...(read?[read.mapAsync(GPUMapMode.READ)]:[])]);const mapped=await mapping;mapping=null;const refused=mapped.find(v=>v.status==='rejected');if(refused)throw refused.reason;checkAbort(combined);
    const summaryBacking=budget.registerBacking?.('gpu-mapped',plan.partialBytes,{owner:'comparison',label:'comparison-summary'});backings.push(summaryBacking);const summary=new Uint32Array(summaryRead.getMappedRange());let values,min=255,max=0;
    if(mode===0){values=[0,0,0,0,0,0];for(let i=0;i<plan.groups;i++)for(let k=0;k<6;k++)values[k]+=summary[i*6+k];}
    if(mode===1)for(let i=0;i<plan.groups;i++){min=Math.min(min,summary[i*2]);max=Math.max(max,summary[i*2+1]);}
    let data;if(read){backings.push(budget.registerBacking?.('gpu-mapped',plan.padded,{owner:'comparison',label:'comparison-pixels'}));data=new Uint8Array(read.getMappedRange(),0,plan.bytes).slice();resultBacking=budget.registerBacking?.('array-buffer',plan.bytes,{owner:'comparison',label:'comparison-result'});}
    summaryRead.unmap();read?.unmap();
    const oom=await device.popErrorScope();scopes--;const invalid=await device.popErrorScope();scopes--;if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message);checkAbort(combined);if(lost)throw new EngineError('GPU_FAILED','Comparison GPU device lost.');
    operation?.commit();metrics.batches++;metrics.pixels+=plan.pixels;metrics.readbackBytes+=plan.partialBytes+(read?plan.padded:0);returned=true;let alive=true;
    return mode===0?{values}:{data,...(mode===1?{low:min,high:max}:{}),release(){if(alive){alive=false;resultBacking?.();resultRelease?.();data=null;}}};
   }catch(error){failed=true;throw gpuBoundary?comparisonGpuBoundaryError(error,{signal:combined}):error;}finally{
    let cleanupFailed=false,cleanupError;const attempt=async action=>{try{await action();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}};
    await attempt(()=>mapping);for(const r of[read,summaryRead])if(r?.mapState==='mapped')await attempt(()=>r.unmap());
    if(submitted)await attempt(async()=>{try{await device.queue.onSubmittedWorkDone();}catch(error){device.destroy();lost=true;throw error;}});
    while(scopes-->0)await attempt(()=>device.popErrorScope());for(const b of buffers)await attempt(()=>b.destroy());for(const free of backings)await attempt(()=>free?.());
    if(!returned||cleanupFailed){await attempt(()=>resultBacking?.());await attempt(()=>resultRelease?.());}await attempt(()=>release?.());await attempt(()=>lease?.release());await attempt(()=>operation?.release());busy=false;finish();metrics.milliseconds+=performance.now()-started;
    if(cleanupFailed&&!failed)throw cleanupError;
   }
  },
  get metrics(){return {...metrics};},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;disposed=true;life.abort();const task=(async()=>{await pending;await device.queue.onSubmittedWorkDone().catch(()=>{});if(!deviceDestroyed){device.destroy();deviceDestroyed=true;}pipeline=null;credit();retired=true;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
