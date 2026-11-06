import {requestStorageDevice,storageDeviceLimits} from './gpu-limits.js';
import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {allocateTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2,DEVICE_BYTES=16*MiB;
// Both operands are finite float32 bit patterns. Quantize by integer shifts,
// never by GPU floating point arithmetic. Every q has magnitude <= 2047.
// |a-b| >= max(|qa-qb|-2,0) * 2^(maxExponent-137). Therefore the sum
// of these integer squares is an exact real-distance lower bound. At 128
// components the u32 sum is < 2^31, including opposite signs.
const shader=`
@group(0) @binding(0) var<storage,read> a:array<u32>;
@group(0) @binding(1) var<storage,read> b:array<u32>;
@group(0) @binding(2) var<storage,read_write> out:array<u32>;
@group(0) @binding(3) var<uniform> p:vec4<u32>;
var<workgroup> values:array<u32,128>;
fn quantize(bits:u32,maximum:u32)->i32 {
 let e=(bits>>23u)&255u;let mantissa=(bits&8388607u)|select(0u,8388608u,e!=0u);
 let shift=maximum-max(e,1u)+13u;var q=0u;if(shift<32u){q=mantissa>>shift;}
 return select(i32(q),-i32(q),(bits&2147483648u)!=0u);
}
@compute @workgroup_size(128)
fn main(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let pair=group.x;if(pair>=p.x){return;}let at=pair*p.y+lane;
 var aa=0u;var bb=0u;if(lane<p.y){aa=a[at];bb=b[at];}
 values[lane]=max(1u,max((aa>>23u)&255u,(bb>>23u)&255u));workgroupBarrier();
 for(var stride=64u;stride>0u;stride>>=1u){if(lane<stride){values[lane]=max(values[lane],values[lane+stride]);}workgroupBarrier();}
 let exponent=values[0];workgroupBarrier();
 var square=0u;if(lane<p.y&&exponent<255u){let delta=u32(max(abs(quantize(aa,exponent)-quantize(bb,exponent))-2,0));square=delta*delta;}
 values[lane]=square;workgroupBarrier();
 for(var stride=64u;stride>0u;stride>>=1u){if(lane<stride){values[lane]+=values[lane+stride];}workgroupBarrier();}
 if(lane==0u){out[pair*2u]=values[0];out[pair*2u+1u]=exponent;}
}`;
/** Convert the exact integer bound to a lower bound on the reference sequence
 * of float32 subtract/multiply/add, not just on an ideal real-valued norm.
 * 4*d+16 ulps exceed the standard gamma(d+3) relative-error bound twice over.
 * The absolute allowance covers gradual-underflow rounding in all operations.
 * Nonfinite inputs always require the unchanged native path. */
export function denseDistanceLowerBound(sum,exponent,dimensions){
 if(exponent>=255)return NaN;
 return Math.max(0,sum*2**(2*(exponent-137))*(1-(4*dimensions+16)*2**-23)-dimensions*2**-140);
}
/** No preflight dispatch. The GPU rejects only mathematically proven losers;
 * NaN marks every remaining pair for the exact native evaluator. Returned
 * distances never replace a winning native float32 value. */
export async function createDenseDistanceGPU({budget,scheduler=getExecutionScheduler(budget),signal,maxPairs=4096}={}){
 requireValue(budget&&Number.isSafeInteger(maxPairs)&&maxPairs>0,'A budget and positive GPU batch bound are required.');
 checkAbort(signal);if(!globalThis.navigator?.gpu)throw new EngineError('GPU_UNAVAILABLE','Dense WebGPU unavailable.');
 let device,deviceRelease,arena,disposed=false,busy=false,lost;
 const metrics={preflightExecutions:0,batches:0,pairs:0,rejected:0,refinements:0,uploadedBytes:0,readbackBytes:0,bufferAllocations:0,milliseconds:0};
 const clear=()=>{if(arena){for(const b of arena.buffers)b.destroy();arena.release();arena=null;}};
 const abort=()=>device?.destroy();
 try{
  deviceRelease=budget.reserve(DEVICE_BYTES);
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Dense WebGPU adapter unavailable.');
  device=await requestStorageDevice(adapter,{desiredBytes:maxPairs*128*4,label:'dense-distance'});device.lost.then(info=>{lost=info.message||'Dense GPU lost';});signal?.addEventListener('abort',abort,{once:true});checkAbort(signal);
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:shader}),entryPoint:'main'}});
  const make=(size,usage)=>{const b=device.createBuffer({size:Math.max(4,size),usage});arena.buffers.push(b);metrics.bufferAllocations++;return b;};
  return {
   async batch({queryDescriptors,candidateDescriptors,dimensions,pairCount,best,distanceDimensions=dimensions,signal:jobSignal=signal}){
    requireValue(Number.isInteger(dimensions)&&dimensions>=1&&dimensions<=128&&Number.isInteger(distanceDimensions)&&distanceDimensions>=dimensions&&distanceDimensions<=128&&Number.isSafeInteger(pairCount)&&pairCount>=0&&queryDescriptors instanceof Float32Array&&candidateDescriptors instanceof Float32Array&&best instanceof Float32Array&&queryDescriptors.length===pairCount*dimensions&&candidateDescriptors.length===queryDescriptors.length&&best.length===pairCount,'Invalid dense GPU distance batch.');
    if(disposed)throw new EngineError('DISPOSED','Dense GPU disposed.');if(busy)throw new EngineError('BUSY','Dense GPU batch already executing.');if(lost)throw new EngineError('GPU_FAILED',lost);checkAbort(jobSignal);
    const result=allocateTypedArray(Float32Array,pairCount,{label:'dense-gpu-distance-result'});result.fill(NaN);if(!pairCount)return result;
    busy=true;const started=performance.now();let lease,operation,scoped=false;
    const abortJob=()=>device.destroy();jobSignal?.addEventListener('abort',abortJob,{once:true});
    try{
     operation=(scheduler.budget??budget).beginOperation?.({owner:'patchmatch',id:'dense-distance-gpu/batch'});
     if(!arena||arena.dimensions!==dimensions){
      clear();const bytesPerPair=dimensions*16+32,room=budget.limit-budget.total(),capacity=Math.min(maxPairs,pairCount,device.limits.maxComputeWorkgroupsPerDimension,Math.floor(Math.min(device.limits.maxStorageBufferBindingSize,device.limits.maxBufferSize)/Math.max(dimensions*4,8)),Math.floor((room-4096)/bytesPerPair));
      if(capacity<1)throw new EngineError('MEMORY_LIMIT','Dense GPU batch does not fit the shared memory budget.');
      const release=budget.reserve(capacity*bytesPerPair+4096);arena={dimensions,capacity,release,buffers:[]};
      device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scoped=true;const bytes=capacity*dimensions*4;{
       arena.query=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);arena.candidate=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);arena.output=make(capacity*8,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);arena.read=make(capacity*8,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);arena.params=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
      }
      arena.bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[arena.query,arena.candidate,arena.output,arena.params].map((buffer,binding)=>({binding,resource:{buffer}}))});scoped=false;const failure=await closeGpuErrorScopes(device,{label:'dense-distance-arena'});if(failure)throw failure;
     }
     for(let offset=0;offset<pairCount;offset+=arena.capacity){
      checkAbort(jobSignal);lease=await scheduler.acquire({cpu:0,gpu:1,signal:jobSignal,resourceOwner:'patchmatch',operation,label:'dense-distance-gpu'});
      device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scoped=true;
      const length=Math.min(arena.capacity,pairCount-offset),from=offset*dimensions,to=(offset+length)*dimensions;
      device.queue.writeBuffer(arena.query,0,queryDescriptors.subarray(from,to));device.queue.writeBuffer(arena.candidate,0,candidateDescriptors.subarray(from,to));device.queue.writeBuffer(arena.params,0,Uint32Array.of(length,dimensions,0,0));
      metrics.uploadedBytes+=length*dimensions*8;
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,arena.bind);pass.dispatchWorkgroups(length);pass.end();encoder.copyBufferToBuffer(arena.output,0,arena.read,0,length*8);device.queue.submit([encoder.finish()]);operation?.setState('io');await arena.read.mapAsync(GPUMapMode.READ,0,length*8);
      try{const packed=new Uint32Array(arena.read.getMappedRange(0,length*8));for(let i=0;i<length;i++){const lower=denseDistanceLowerBound(packed[i*2],packed[i*2+1],distanceDimensions);if(Number.isFinite(best[offset+i])&&lower>=best[offset+i]){result[offset+i]=Infinity;metrics.rejected++;}else metrics.refinements++;}}
      finally{arena.read.unmap();}
      metrics.readbackBytes+=length*8;metrics.pairs+=length;metrics.batches++;
      scoped=false;const failure=await closeGpuErrorScopes(device,{label:'dense-distance-batch'});if(failure)throw failure;
      operation?.commit();lease.release();lease=null;
     }
     return result;
    }catch(error){clear();checkAbort(jobSignal);if(scoped){scoped=false;throw await closeGpuErrorScopes(device,{cause:error,label:'dense-distance-batch'});}throw error;}
    finally{try{if(scoped){await device.popErrorScope();await device.popErrorScope();}}finally{lease?.release();operation?.release();jobSignal?.removeEventListener('abort',abortJob);busy=false;metrics.milliseconds+=performance.now()-started;}}
   },get metrics(){return {...metrics,deviceLimits:storageDeviceLimits(device),residentBufferBytes:arena?.buffers.reduce((sum,b)=>sum+b.size,0)??0};},dispose(){if(disposed)return;disposed=true;signal?.removeEventListener('abort',abort);clear();device.destroy();deviceRelease();}
  };
 }catch(error){signal?.removeEventListener('abort',abort);clear();device?.destroy();deviceRelease?.();throw error;}
}
