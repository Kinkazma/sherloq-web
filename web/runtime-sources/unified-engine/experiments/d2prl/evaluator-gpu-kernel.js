import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
import {getD2prlDescriptorLease} from './descriptor-ownership.js';
import {D2PRL_HALF_WGSL} from './half-conversion-gpu.js';

// D2PRL's existing evaluator arithmetic, with independent pixels dispatched on
// WebGPU. Half rounding, interpolation order, candidate order and CPU-reference
// scalar tails are retained. The CPU implementation remains its own backend.
// referenceExp below adapts reference-exp.h / SLEEF xexpf, Boost-1.0, pinned in
// SLEEF-PINNED.json. This module neither changes the RNG nor supplies model data.
export const D2PRL_EVALUATOR_WGSL=String.raw`
struct Shape { side:u32, channels:u32, candidates:u32, begin:u32,
 count:u32, threads:u32, strict:u32, cornerBits:u32,
 minX:f32,minY:f32,maxX:f32,maxY:f32,
 foreignCount:u32,validPresent:u32,pad0:u32,pad1:u32 };
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read> targets:array<u32>;
@group(0) @binding(2) var<storage,read> input:array<f32>;
@group(0) @binding(3) var<storage,read> metadata:array<i32>;
@group(0) @binding(4) var<storage,read_write> output:array<f32>;
@group(0) @binding(5) var<uniform> shape:Shape;
@group(0) @binding(6) var<storage,read> foreign:array<u32>;
${D2PRL_HALF_WGSL}fn fromSource(index:u32)->f32 {let bits=source[index>>1u];return decode((bits>>((index&1u)*16u))&65535u);}
fn fromTarget(index:u32)->f32 {let bits=targets[index>>1u];return decode((bits>>((index&1u)*16u))&65535u);}
fn fromForeign(index:u32)->f32 {let bits=foreign[index>>1u];return decode((bits>>((index&1u)*16u))&65535u);}
// WGSL division may use an approximate reciprocal. The residual restores the
// rounded quotient before the native half conversion, including midpoint cases.
fn divide(a:f32,b:f32)->f32 {let q=a/b;let remainder=fma(-q,b,a);return q+remainder/b;}
fn referenceExp(d:f32)->f32 {
 if(d< -104.0){return 0.0;}
 let q=i32(round(d*1.4426950408889634));
 var s=fma(f32(q),-0.693145751953125,d);s=fma(f32(q),-0.000001428606765330187,s);
 var u=0.00019852761761285365;
 u=fma(u,s,0.0013930435525253415);u=fma(u,s,0.008333360776305199);
 u=fma(u,s,0.041666485369205475);u=fma(u,s,0.1666666716337204);u=fma(u,s,0.5);
 u=1.0+fma(s*s,u,s);let first=q>>1;let a=bitcast<f32>(u32(first+127)<<23u);let b=bitcast<f32>(u32(q-first+127)<<23u);
 return (u*a)*b;
}
// Keep the low argument product outside the rounded full-range exp2 input.
// Explicit FMA preserves its contribution through Metal relaxed arithmetic.
fn mpsExpResidual(d:f32)->f32 {
 if(d< -104.0){return 0.0;}
 let hi=1.4426950216293335;let t=d*hi;
 let err=fma(1.0,fma(d,hi,-t),d*1.9259629911266175e-8);
 let e=exp2(t);return fma(e,err*0.6931471824645996,e);
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
 let at=gid.x;if(at>=shape.count){return;}let index=shape.begin+at;let n=shape.side*shape.side;let group=shape.channels/3u;let positions=shape.count*shape.candidates;
 let sx=f32(index%shape.side);let sy=f32(index/shape.side);let extent=f32(shape.side-1u)*0.5;
 var values:array<f32,96>;var scores:array<f32,13>;var slots:array<u32,13>;var kept=0u;
 for(var k=0u;k<shape.candidates;k=k+1u){
  let p=k*shape.count+at;if(shape.validPresent!=0u&&metadata[positions+p]==0){continue;}
  var x=clamp(sx+input[p],0.0,f32(shape.side-1u));var y=clamp(sy+input[positions+p],0.0,f32(shape.side-1u));
  if(shape.strict!=0u){x=input[2u*positions+p];y=input[3u*positions+p];}
  let gx=half(divide(x-extent,extent));let gy=half(divide(y-extent,extent));
  var px=((gx+1.0)*0.5)*f32(shape.side-1u);var py=((gy+1.0)*0.5)*f32(shape.side-1u);
  if(shape.pad1!=0u){px=fma(gx,extent,extent);py=fma(gy,extent,extent);}
  let x0=i32(floor(px));let y0=i32(floor(py));let x1=x0+1;let y1=y0+1;
  let ix=vec4<i32>(x0,x1,x0,x1);let iy=vec4<i32>(y0,y0,y1,y1);
  let weight=vec4<f32>((f32(x1)-px)*(f32(y1)-py),(px-f32(x0))*(f32(y1)-py),(f32(x1)-px)*(py-f32(y0)),(px-f32(x0))*(py-f32(y0)));
  var location=-1;if(shape.strict!=0u){location=metadata[p];}
  for(var c=0u;c<shape.channels;c=c+1u){var sum=0.0;var samples=vec4<f32>(0.0);
   for(var corner=0u;corner<4u;corner=corner+1u){if(ix[corner]>=0&&iy[corner]>=0&&ix[corner]<i32(shape.side)&&iy[corner]<i32(shape.side)){
    let offset=c*n+u32(iy[corner])*shape.side+u32(ix[corner]);var sample=0.0;
    if(location==-1){sample=fromSource(offset);}else if(location< -1){let bank=u32(-location-2);sample=fromForeign(bank*shape.channels*n+offset);}else{sample=fromTarget(u32(location)+c*4u+corner);}
    if(shape.pad1!=0u){samples[corner]=sample;}else{let product=sample*weight[corner];sum=sum+product;}
   }}if(shape.pad1!=0u){let dx=px-f32(x0);let dy=py-f32(y0);let mx=f32(x1)-px;let my=f32(y1)-py;
    let top=fma(samples.y,dx,samples.x*mx);let bottom=fma(samples.w,dx,samples.z*mx);sum=fma(bottom,dy,top*my);
   }values[c]=half(sum);
  }
  var best=0.0;
  for(var shift=0u;shift<3u;shift=shift+1u){for(var block=0u;block<3u;block=block+1u){var sum=0.0;var meanSums:array<f32,8>;let meanLanes=select(4u,8u,group==32u);
   for(var j=0u;j<group;j=j+1u){let c=block*group+j;let other=(c+shape.channels-shift*group)%shape.channels;let magnitude=abs(half(fromSource(c*n+index)-values[other]));
    if(shape.pad1!=0u){let lane=j%meanLanes;meanSums[lane]=fma(1.0,meanSums[lane],-magnitude);}else{sum=sum-magnitude;}
   }
   if(shape.pad1!=0u){
    if(meanLanes==8u){for(var lane=0u;lane<4u;lane=lane+1u){meanSums[lane]=fma(1.0,meanSums[lane],meanSums[lane+4u]);}}
    sum=fma(1.0,fma(1.0,meanSums[0],meanSums[2]),fma(1.0,meanSums[1],meanSums[3]));
   }
   let mean=half(divide(sum,f32(group)));if(shift==0u&&block==0u){best=mean;}else{best=max(best,mean);}
  }}slots[kept]=k;scores[kept]=half(best*1000.0);if(shape.pad0!=0u){output[(2u+kept)*shape.count+at]=scores[kept];}kept=kept+1u;
 }
 if(kept==0u){output[at]=0.0;output[shape.count+at]=0.0;return;}
 var maximum=scores[0];for(var k=1u;k<kept;k=k+1u){maximum=max(maximum,scores[k]);}
 let chunk=(n+shape.threads-1u)/shape.threads;let start=(index/chunk)*chunk;let length=min(chunk,n-start);let tail=shape.pad1==0u&&index-start>=(length/8u)*8u;
 var exponential:array<f32,13>;var denominator=0.0;
 let denominatorLanes=select(select(1u,2u,kept>4u),4u,kept>8u);var denominatorSums:array<f32,4>;
 for(var k=0u;k<kept;k=k+1u){var e=0.0;
  if(shape.pad1!=0u){e=mpsExpResidual(scores[k]-maximum);let lane=k%denominatorLanes;denominatorSums[lane]=fma(1.0,denominatorSums[lane],e);}
  else{e=referenceExp(scores[k]-maximum);denominator=denominator+e;}
  exponential[k]=select(e,half(e),tail);if(shape.pad0!=0u){output[(2u+shape.candidates+k)*shape.count+at]=exponential[k];}
 }
 if(shape.pad1!=0u){
  if(denominatorLanes==4u){denominator=fma(1.0,fma(1.0,denominatorSums[0],denominatorSums[2]),fma(1.0,denominatorSums[1],denominatorSums[3]));}
  else if(denominatorLanes==2u){denominator=fma(1.0,denominatorSums[0],denominatorSums[1]);}else{denominator=denominatorSums[0];}
 }
 var wx:array<f32,13>;var wy:array<f32,13>;
 let divisor=select(denominator,half(denominator),shape.pad1!=0u);
 for(var k=0u;k<kept;k=k+1u){let weight=half(divide(exponential[k],divisor));let p=slots[k]*shape.count+at;wx[k]=input[p]*weight;wy[k]=input[positions+p]*weight;if(shape.pad0!=0u){output[(2u+2u*shape.candidates+k)*shape.count+at]=weight;}}
 var x=0.0;var y=0.0;
 if(shape.pad1!=0u){if(kept==1u){x=wx[0];y=wy[0];}else{
  let lanes=select(select(1u,2u,kept>4u),4u,kept>8u);var ax:array<f32,4>;var ay:array<f32,4>;
  // Explicit FMA with an exact factor1 keeps each native f32 addition boundary.
  // Ordinary + was reassociated on Metal despite the apparent reduction tree.
  for(var k=0u;k<kept;k=k+1u){let lane=k%lanes;ax[lane]=fma(1.0,ax[lane],wx[k]);ay[lane]=fma(1.0,ay[lane],wy[k]);}
  if(lanes==4u){x=fma(1.0,fma(1.0,ax[0],ax[2]),fma(1.0,ax[1],ax[3]));y=fma(1.0,fma(1.0,ay[0],ay[2]),fma(1.0,ay[1],ay[3]));}else if(lanes==2u){x=fma(1.0,ax[0],ax[1]);y=fma(1.0,ay[0],ay[1]);}else{x=ax[0];y=ay[0];}
 }
 }else if(index>=(n/16u)*16u){var ax:array<f32,4>;var ay:array<f32,4>;let grouped=(kept/4u)*4u;
  for(var k=0u;k<grouped;k=k+1u){ax[k%4u]=ax[k%4u]+wx[k];ay[k%4u]=ay[k%4u]+wy[k];}
  for(var k=grouped;k<kept;k=k+1u){ax[0]=ax[0]+wx[k];ay[0]=ay[0]+wy[k];}x=((ax[0]+ax[1])+ax[2])+ax[3];y=((ay[0]+ay[1])+ay[2])+ay[3];
 }else{for(var k=0u;k<kept;k=k+1u){x=x+wx[k];y=y+wy[k];}}
 var originX=sx;var originY=sy;if(shape.strict!=0u){originX=input[4u*positions+at];originY=input[4u*positions+shape.count+at];}
 output[at]=clamp(x+originX,shape.minX,shape.maxX)-originX;output[shape.count+at]=clamp(y+originY,shape.minY,shape.maxY)-originY;
}
`;

// Compile-time constants only. No change to expressions, reductions, sampling,
// candidate order, strict/foreign ownership, validity or trace layout.
export function specializeEvaluatorShader(source,{channels,arithmetic}){
 if(![36,96].includes(channels)||!['cpu','mps'].includes(arithmetic))throw new TypeError('Explicit evaluator channels and arithmetic required');
 return source.replaceAll('shape.channels',channels+'u').replaceAll('shape.pad1',arithmetic==='mps'?'1u':'0u').replace('var values:array<f32,96>;','var values:array<f32,'+channels+'>;');
}

export async function createD2prlGpuKernel({budget,operation=(_name,work)=>work(),arithmetic='cpu',halfConversion='auto',signal}={}){
 requireValue(budget?.reserve,'D2PRL GPU requires its shared memory budget.');
 requireValue(['cpu','mps'].includes(arithmetic),'Explicit D2PRL arithmetic required.');
 requireValue(['auto','manual'].includes(halfConversion),'Explicit half-conversion mode required.');
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw new EngineError('GPU_UNAVAILABLE','D2PRL WebGPU adapter unavailable.');
 const binding=Math.min(adapter.limits.maxStorageBufferBindingSize,adapter.limits.maxBufferSize);
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:adapter.limits.maxBufferSize}});
 const pipelines=new Map();let pipelineRelease,halfQualification;
 try{halfQualification=halfConversion==='manual'?{decode:false,round:false,mode:'manual',reason:'requested-manual',probed:false,qualified:false,cases:{decode:0,round:0}}:{decode:true,round:true,mode:'builtin-unprobed',reason:'runtime-probes-disabled',probed:false,qualified:false,cases:{decode:0,round:0}};checkAbort(signal);pipelineRelease=budget.reserve(4*1024**2);for(const channels of[36,96]){const module=device.createShaderModule({code:specializeEvaluatorShader(D2PRL_EVALUATOR_WGSL,{channels,arithmetic})}),messages=await module.getCompilationInfo();
  if(messages.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED',messages.messages.map(m=>m.message).join('\n'));
  pipelines.set(channels,await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main',constants:{d2prlBuiltinDecode:Number(halfQualification.decode),d2prlBuiltinHalf:Number(halfQualification.round)}}}));}
 }catch(error){pipelineRelease?.();device.destroy();throw error;}
 const buffers=new Map(),sources=new Map(),foreignCaches=new Map();let busy=false,disposed=false,lost=false,closing;device.lost.then(()=>{lost=true;});
 const stats={calls:0,sourceUploads:0,sourceUploadBytes:0,foreignUploads:0,foreignUploadBytes:0,transportBytes:0,readbackBytes:0,dispatches:0,bufferAllocations:0,bufferReuses:0,residentBytes:0};
 function retire(entry){if(!entry)return;entry.buffer.destroy();entry.backing?.();entry.release();stats.residentBytes-=entry.size;budget.notifyBackingRelease?.('gpu',entry.size);}
 function buffer(key,bytes,usage){const size=Math.max(4,Math.ceil(bytes/4)*4);if(size>binding)throw new EngineError('GPU_LIMIT','D2PRL evaluator binding exceeds device limit.',{details:{requestedBytes:size,bindingBytes:binding}});
  const previous=buffers.get(key);if(previous&&previous.size>=size){stats.bufferReuses++;return previous.buffer;}
  retire(previous);buffers.delete(key);const release=budget.reserve(size);let gpu;
  try{gpu=device.createBuffer({size,usage,label:'D2PRL '+key});const entry={buffer:gpu,size,release,backing:budget.registerBacking?.('gpu',size,{owner:'d2prl',label:'evaluator-'+key})};buffers.set(key,entry);stats.bufferAllocations++;stats.residentBytes+=size;return gpu;}catch(error){gpu?.destroy();release();throw error;}}
 function upload(key,view,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST){const out=buffer(key,view.byteLength,usage);if(view.byteLength)device.queue.writeBuffer(out,0,view.buffer,view.byteOffset,view.byteLength);return out;}
 // A refused replacement can already have retired the former allocation.
 // Cached identities may reuse only the buffer still owned by this key.
 function sourceBuffer(source,channels,cacheSource=true){const token=getD2prlDescriptorLease(source);const old=sources.get(channels);if(cacheSource&&token&&old?.token===token&&buffers.get('source-'+channels)?.buffer===old.buffer&&old.sourceRef.deref()===source)return old.buffer;
  const padded=source.byteLength%4?new Uint16Array(source.length+1):source;if(padded!==source)padded.set(source);const out=upload('source-'+channels,padded);sources.set(channels,{sourceRef:new WeakRef(source),token,buffer:out});stats.sourceUploads++;stats.sourceUploadBytes+=source.byteLength;return out;}
 function foreignBuffer(values,identities,channels){
  const key=values.length?channels:0,foreignCache=foreignCaches.get(key);
  const tokens=values.map((v,i)=>getD2prlDescriptorLease(v)??identities?.[i]);
  if(foreignCache&&buffers.get('foreign-'+key)?.buffer===foreignCache.buffer&&values.length===foreignCache.refs.length&&values.every((v,i)=>v===foreignCache.refs[i].deref()&&tokens[i]&&tokens[i]===foreignCache.tokens[i]))return foreignCache.buffer;
  const length=values.reduce((n,v)=>n+v.length,0),release=budget.reserve(Math.max(4,length*2));
  try{const data=new Uint16Array(Math.max(2,length));let offset=0;for(const v of values){data.set(v,offset);offset+=v.length;}const out=upload('foreign-'+key,data);foreignCaches.set(key,{refs:values.map(value=>new WeakRef(value)),tokens,buffer:out});stats.foreignUploads++;stats.foreignUploadBytes+=length*2;return out;}finally{release();}
 }
 return{
  get residentBytes(){return stats.residentBytes;},
  limits:{maxStorageBufferBindingSize:binding,maxBufferSize:adapter.limits.maxBufferSize},
  get stats(){return{...stats,backend:'webgpu',arithmetic:arithmetic==='mps'?'D2PRL-MPS-compatible-candidate':'D2PRL-half-ordered-CPU-reference',specializedPipelines:2,pipelineReservationBytes:4*1024**2,maxStorageBufferBindingSize:binding,halfConversion:{...halfQualification}};},
  async evaluate(p,{signal}={}){
   checkAbort(signal);requireValue(!busy&&!disposed&&!lost,'D2PRL GPU evaluator unavailable.');
   const{source,side,channels,candidates,begin=0,end=side*side,offsetX,offsetY,referenceThreads=8}=p,n=side*side,count=end-begin,positions=candidates*count,strict=p.targetX!==undefined;
   requireValue(source instanceof Uint16Array&&source.length===channels*n&&[36,96].includes(channels)&&Number.isInteger(side)&&side>=2&&side<=1792&&Number.isInteger(candidates)&&candidates>=1&&candidates<=13&&begin>=0&&end<=n&&count>0&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===positions&&offsetY.length===positions&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'D2PRL GPU evaluator extents differ.');
   if(strict)requireValue(p.targetX instanceof Float32Array&&p.targetY instanceof Float32Array&&p.targetX.length===positions&&p.targetY.length===positions&&p.originalX instanceof Float32Array&&p.originalY instanceof Float32Array&&p.originalX.length===count&&p.originalY.length===count,'Strict GPU evaluator coordinate extent differs.');
   if(p.valid)requireValue(p.valid instanceof Uint8Array&&p.valid.length===positions,'D2PRL GPU valid-candidate extent differs.');
   const foreign=p.foreignSources??[],corners=p.corners??new Uint16Array(0),cornerBits=Math.ceil(corners.length/2)*2;
   requireValue(corners instanceof Uint16Array&&foreign.every(a=>a instanceof Uint16Array&&a.length===source.length),'Strict GPU descriptor bank extent differs.');
   if(p.cornerOffsets)requireValue(p.cornerOffsets instanceof Int32Array&&p.cornerOffsets.length===positions,'Strict GPU corner offsets differ.');
   const outputBytes=count*4*(p.trace?2+3*candidates:2);let temporary,resultRelease,lease,complete=false,submitted=false,scopes=0;
   busy=true;try{
    temporary=budget.reserve((strict?4*positions+2*count:2*positions)*4+positions*8+cornerBits*2+64);resultRelease=budget.reserve(outputBytes);
    lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-patchmatch'});
    device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
    const floats=new Float32Array(strict?4*positions+2*count:2*positions);floats.set(offsetX);floats.set(offsetY,positions);if(strict){floats.set(p.targetX,2*positions);floats.set(p.targetY,3*positions);floats.set(p.originalX,4*positions);floats.set(p.originalY,4*positions+count);}
    // Normal, unmasked matching never reads metadata in the unchanged shader.
    // Keep one legal bound word; strict locations and candidate masks retain
    // their complete native two-plane metadata, including all tie decisions.
    const needsMetadata=strict||!!p.valid,meta=new Int32Array(needsMetadata?positions*2:1);if(needsMetadata){meta.fill(-1,0,positions);if(p.cornerOffsets)meta.set(p.cornerOffsets);else if(strict&&corners.length)for(let i=0;i<positions;i++)meta[i]=i*channels*4;if(p.valid)meta.set(p.valid,positions);}
    const target=new Uint16Array(Math.max(2,cornerBits));target.set(corners);
    const bounds=p.bounds??[0,0,side-1,side-1];requireValue(bounds.length===4&&bounds.every(Number.isFinite)&&bounds[2]>=bounds[0]&&bounds[3]>=bounds[1],'D2PRL GPU output bounds differ.');
    const shape=new ArrayBuffer(64),u=new Uint32Array(shape),f=new Float32Array(shape);u.set([side,channels,candidates,begin,count,referenceThreads,Number(strict),cornerBits]);f.set(bounds,8);u.set([foreign.length,Number(!!p.valid),Number(!!p.trace),Number(arithmetic==='mps')],12);
    const sourceGpu=sourceBuffer(source,channels,p.cacheSource!==false),targetGpu=upload('targets',target),inputGpu=upload('input',floats),metaGpu=upload('metadata',meta),out=buffer('output',outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('readback',outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),uniform=upload('shape',new Uint8Array(shape),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),foreignGpu=foreignBuffer(foreign,p.foreignSourceIdentities,channels);
    const pipeline=pipelines.get(channels),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[sourceGpu,targetGpu,inputGpu,metaGpu,out,uniform,foreignGpu].map((b,binding)=>({binding,resource:{buffer:b}}))}));pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,outputBytes);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;stats.dispatches++;
    await operation('d2prl-gpu-evaluator:readback',()=>read.mapAsync(GPUMapMode.READ,0,outputBytes),{bytes:outputBytes});let data;try{checkAbort(signal);data=new Float32Array(read.getMappedRange(0,outputBytes)).slice();}finally{read.unmap();}
    const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;
    if(oom||validation)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??validation).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    stats.calls++;stats.transportBytes+=floats.byteLength+meta.byteLength+target.byteLength+64;stats.readbackBytes+=data.byteLength;complete=true;
    let live=true;return{data:data.subarray(0,2*count),trace:p.trace?data.subarray(2*count):undefined,x:data.subarray(0,count),y:data.subarray(count,2*count),release(){if(!live)return;live=false;resultRelease();},metrics:{backend:'webgpu'}};
   }finally{if(submitted&&!complete)await device.queue.onSubmittedWorkDone().catch(()=>{});while(scopes-->0)await device.popErrorScope().catch(()=>{});if(!complete)resultRelease?.();temporary?.();lease?.release();busy=false;}
  },
  dispose(){if(disposed)return closing;requireValue(!busy,'D2PRL GPU evaluator is busy.');disposed=true;return closing=(async()=>{await device.queue.onSubmittedWorkDone().catch(()=>{});for(const value of buffers.values())retire(value);buffers.clear();sources.clear();foreignCaches.clear();pipelines.clear();pipelineRelease();pipelineRelease=null;device.destroy();})();}
 };
}
