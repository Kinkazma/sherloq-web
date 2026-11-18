import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {copyTypedArray,allocateTypedArray} from './allocation.js';
import {requestStorageDevice,storageDeviceLimits} from './gpu-limits.js';
// WGSL permits reassociation and does not guarantee fused fma rounding:
// https://www.w3.org/TR/WGSL/#floating-point-accuracy
const shader=`
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;
@group(0) @binding(3) var<uniform> opts:vec4u;
fn reflect(p:i32,n:i32)->u32 {if(n==1){return 0u;}let period=2*(n-1);let q=((p%period)+period)%period;return u32(select(q,period-q,q>=n));}
fn sample(x:i32,y:i32)->f32 {return input[reflect(y,i32(opts.y))*opts.x+reflect(x,i32(opts.x))];}
@compute @workgroup_size(16,16) fn main(@builtin(global_invocation_id) id:vec3u) {
 let x=i32(id.x);let y=i32(id.y);if(id.x>=opts.x||id.y>=opts.y){return;}
 let index=id.y*opts.x+id.x;let radius=i32(opts.z/2u);
 if(opts.z==1u||(opts.w==0u&&opts.x==1u)||(opts.w==1u&&opts.y==1u)){output[index]=input[index];return;}
 var sum:f32;
 if(opts.w==0u){
  if(opts.z<=5u){sum=fma(sample(x,y),weights[radius],(sample(x-1,y)+sample(x+1,y))*weights[radius+1]);if(opts.z==5u){sum=fma(sample(x-2,y)+sample(x+2,y),weights[radius+2],sum);}}
  else{sum=sample(x-radius,y)*weights[0];for(var k=1;k<i32(opts.z);k++){sum=fma(sample(x+k-radius,y),weights[k],sum);}}
 }else{sum=sample(x,y)*weights[radius];for(var k=1;k<=radius;k++){let pair=sample(x,y+k)+sample(x,y-k);sum=fma(pair,weights[radius+k],sum);}}
 output[index]=sum;
}`;

// Exact binary single-run rows: identical rows share one horizontal transform.
// Bounds only omit fma(0,weight,sum); every nonzero coefficient keeps its order.
// Conservative policy allowance for row-index objects and typed staging; the
// GPU allocation itself is admitted separately after the useful plan is known.
export const frequencyMaskPlanningBytes=(width,height)=>96*Math.min(height,1+width*(width+1)/2)+4*height+12*width+Math.max(0,8*Math.min(height,1+width*(width+1)/2)+4*height+8*width-4*width*height);
export function binaryFrequencyMaskPlan(input,width,height,weights){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height)||!(input instanceof Float32Array)||input.length!==width*height||!(weights instanceof Float32Array)||!(weights.length%2)||weights.some(v=>!Number.isFinite(v)||v<0||Object.is(v,-0)||v>0&&v<1.1754943508222875e-38))return null;
 const words=new Uint32Array(input.buffer,input.byteOffset,input.length),map=new Map(),bounds=[],rowMap=allocateTypedArray(Uint32Array,height,{label:'frequency-mask-row-map'});let emptyRows=0;
 for(let y=0;y<height;y++){let first=-1,last=-1,count=0;for(let x=0,at=y*width;x<width;x++){const v=words[at+x];if(v===0)continue;if(v!==0x3f800000)return null;if(first<0)first=x;last=x;count++;}if(first>=0&&count!==last-first+1)return null;if(first<0)emptyRows++;const key=(first+1)*(width+1)+last+1;let row=map.get(key);if(row===undefined){row=bounds.length/2;map.set(key,row);bounds.push(first,last);}rowMap[y]=row;}
 const radius=weights.length>>>1,columnBounds=allocateTypedArray(Int32Array,width*2,{label:'frequency-mask-column-support'});columnBounds.fill(-1);const next=allocateTypedArray(Uint32Array,width+1,{label:'frequency-mask-support-next'}),reset=()=>{for(let x=0;x<=width;x++)next[x]=x;},find=index=>{let root=index;while(next[root]!==root)root=next[root];while(next[index]!==index){const parent=next[index];next[index]=root;index=parent;}return root;};
 for(const reverse of[false,true]){reset();for(let index=0;index<height;index++){const y=reverse?height-1-index:index,row=rowMap[y]*2,left=bounds[row],right=bounds[row+1];if(left<0)continue;const lo=Math.max(0,left-radius),hi=Math.min(width-1,right+radius);for(let x=find(lo);x<=hi;x=find(x)){columnBounds[x*2+(reverse?1:0)]=y;next[x]=find(x+1);}}}
 const storedBounds=allocateTypedArray(Int32Array,bounds.length,{label:'frequency-mask-row-bounds'});storedBounds.set(bounds);return{bounds:storedBounds,rowMap,columnBounds,uniqueRows:bounds.length/2,emptyRows,metadataBytes:bounds.length*4+rowMap.byteLength+columnBounds.byteLength};
}
const binaryShader=`
@group(0) @binding(0) var<storage,read> bounds:array<vec2i>;
@group(0) @binding(1) var<storage,read> weights:array<f32>;
@group(0) @binding(2) var<storage,read_write> horizontal:array<f32>;
@group(0) @binding(3) var<uniform> opts:vec4u;
@group(0) @binding(4) var<storage,read> rowMap:array<u32>;
@group(0) @binding(5) var<storage,read> columns:array<vec2i>;
@group(0) @binding(6) var<storage,read_write> output:array<f32>;
fn reflect(p:i32,n:i32)->u32 {if(n==1){return 0u;}let period=2*(n-1);let q=((p%period)+period)%period;return u32(select(q,period-q,q>=n));}
fn binary(p:i32,run:vec2i)->f32 {let at=i32(reflect(p,i32(opts.x)));return select(0.0,1.0,at>=run.x&&at<=run.y);}
@compute @workgroup_size(16,16) fn horizontalMain(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=opts.x||id.y>=opts.w){return;}let at=id.y*opts.x+id.x;let run=bounds[id.y];if(run.x<0){horizontal[at]=0.0;return;}let x=i32(id.x);let r=i32(opts.z/2u);
 if(opts.z==1u||opts.x==1u){horizontal[at]=binary(x,run);return;}
 if(x<run.x-r||x>run.y+r){horizontal[at]=0.0;return;}
 var sum:f32;
 if(opts.z<=5u){sum=fma(binary(x,run),weights[r],(binary(x-1,run)+binary(x+1,run))*weights[r+1]);if(opts.z==5u){sum=fma(binary(x-2,run)+binary(x+2,run),weights[r+2],sum);}}
 else{sum=binary(x-r,run)*weights[0];if(r<i32(opts.x)){
  let period=2*(i32(opts.x)-1);let shift=r-x;let intervals=array<vec2i,3>(vec2i(-run.y,-run.x),run,vec2i(period-run.y,period-run.x));var previous=0;
  for(var j=0;j<3;j++){let first=max(max(1,intervals[j].x+shift),previous+1);let last=min(i32(opts.z)-1,intervals[j].y+shift);for(var k=first;k<=last;k++){sum=fma(1.0,weights[k],sum);}previous=max(previous,last);}
 }else{for(var k=1;k<i32(opts.z);k++){sum=fma(binary(x+k-r,run),weights[k],sum);}}}
 horizontal[at]=sum;
}
fn mapped(x:u32,y:i32)->f32{return horizontal[rowMap[reflect(y,i32(opts.y))]*opts.x+x];}
@compute @workgroup_size(16,16) fn verticalMain(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=opts.x||id.y>=opts.y){return;}let at=id.y*opts.x+id.x;let support=columns[id.x];if(support.x<0){output[at]=0.0;return;}let y=i32(id.y);let r=i32(opts.z/2u);
 if(y<support.x-r||y>support.y+r){output[at]=0.0;return;}
 if(opts.z==1u||opts.y==1u){output[at]=mapped(id.x,y);return;}
 var sum=mapped(id.x,y)*weights[r];var first=1;var last=r;
 if(r<i32(opts.y)){first=r+1;last=0;let period=2*(i32(opts.y)-1);let intervals=array<vec2i,4>(vec2i(support.x-y,support.y-y),vec2i(y-support.y,y-support.x),vec2i(support.x+y,support.y+y),vec2i(period-y-support.y,period-y-support.x));for(var j=0;j<4;j++){let lo=max(1,intervals[j].x);let hi=min(r,intervals[j].y);if(lo<=hi){first=min(first,lo);last=max(last,hi);}}}
 for(var k=first;k<=last;k++){let pair=mapped(id.x,y+k)+mapped(id.x,y-k);sum=fma(pair,weights[r+k],sum);}output[at]=sum;
}`;
export async function createFrequencyGpu(){
 if(!navigator.gpu)throw new Error('WebGPU unavailable');const start=performance.now(),adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter');const device=await requestStorageDevice(adapter);
 let genericPipeline,binaryPipelines;
 const pipeline=async(binary)=>{if(binary){if(!binaryPipelines){const module=device.createShaderModule({code:binaryShader});binaryPipelines=await Promise.all(['horizontalMain','verticalMain'].map(entryPoint=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));}return binaryPipelines;}if(!genericPipeline){const module=device.createShaderModule({code:shader});genericPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});}return[genericPipeline,genericPipeline];};
 return {deviceLimits:storageDeviceLimits(device),initMs:performance.now()-start,adapter:{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,isFallbackAdapter:adapter.info?.isFallbackAdapter},async run(input,width,height,weights,{optimizeBinary=true,profilePasses=false,reserveGpuBytes}={}){
  const start=performance.now(),buffers=[];let scope=false,requestedBytes=0,admission;
  if(!(input instanceof Float32Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||input.length!==width*height||!(weights instanceof Float32Array)||weights.length<1)throw new Error('Invalid frequency mask inputs.');
  if(input.byteLength>device.limits.maxStorageBufferBindingSize||input.byteLength>device.limits.maxBufferSize||weights.byteLength>device.limits.maxStorageBufferBindingSize||Math.ceil(width/16)>device.limits.maxComputeWorkgroupsPerDimension||Math.ceil(height/16)>device.limits.maxComputeWorkgroupsPerDimension)throw new Error('Frequency mask exceeds GPU device limits.');
  const planning=performance.now(),plan=optimizeBinary?binaryFrequencyMaskPlan(input,width,height,weights):null,planningMs=performance.now()-planning,pipelineStart=performance.now(),pipelines=await pipeline(!!plan),pipelineMs=performance.now()-pipelineStart;
  const alloc=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);requestedBytes+=size;return b;},upload=(data,usage)=>{const b=alloc(data.byteLength,usage|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(b,0,data);return b;};
  const plannedGpuBytes=plan?input.byteLength*2+width*plan.uniqueRows*4+plan.metadataBytes+weights.byteLength+16:input.byteLength*4+weights.byteLength+32;
  try{admission=reserveGpuBytes?.(plannedGpuBytes);device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scope=true;
   const w=upload(weights,GPUBufferUsage.STORAGE),out=alloc(input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=alloc(input.byteLength,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);let binds,groups;
   if(plan){const b=upload(plan.bounds,GPUBufferUsage.STORAGE),map=upload(plan.rowMap,GPUBufferUsage.STORAGE),columns=upload(plan.columnBounds,GPUBufferUsage.STORAGE),h=alloc(width*plan.uniqueRows*4,GPUBufferUsage.STORAGE),opts=upload(new Uint32Array([width,height,weights.length,plan.uniqueRows]),GPUBufferUsage.UNIFORM);binds=[[[0,b],[1,w],[2,h],[3,opts]],[[1,w],[2,h],[3,opts],[4,map],[5,columns],[6,out]]];groups=[[Math.ceil(width/16),Math.ceil(plan.uniqueRows/16)],[Math.ceil(width/16),Math.ceil(height/16)]];}
   else{const a=upload(input,GPUBufferUsage.STORAGE),h=alloc(input.byteLength,GPUBufferUsage.STORAGE),opts=[0,1].map(axis=>upload(new Uint32Array([width,height,weights.length,axis]),GPUBufferUsage.UNIFORM));binds=[[a,w,h,opts[0]],[h,w,out,opts[1]]].map(list=>list.map((buffer,binding)=>[binding,buffer]));groups=[[Math.ceil(width/16),Math.ceil(height/16)],[Math.ceil(width/16),Math.ceil(height/16)]];}
   const bindings=binds.map((list,index)=>device.createBindGroup({layout:pipelines[index].getBindGroupLayout(0),entries:list.map(([binding,buffer])=>({binding,resource:{buffer}}))})),uploadMs=performance.now()-pipelineStart-pipelineMs;
   const encodePass=(encoder,index)=>{const pass=encoder.beginComputePass();pass.setPipeline(pipelines[index]);pass.setBindGroup(0,bindings[index]);pass.dispatchWorkgroups(...groups[index]);pass.end();};
   const dispatch=performance.now();let horizontalMs;
   if(profilePasses){const first=device.createCommandEncoder();encodePass(first,0);device.queue.submit([first.finish()]);await device.queue.onSubmittedWorkDone();horizontalMs=performance.now()-dispatch;}
   const verticalStart=performance.now(),encoder=device.createCommandEncoder();if(!profilePasses)encodePass(encoder,0);encodePass(encoder,1);encoder.copyBufferToBuffer(out,0,read,0,input.byteLength);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const dispatchAndReadbackMs=performance.now()-dispatch,verticalAndReadbackMs=performance.now()-verticalStart,data=(()=>{try{return copyTypedArray(new Float32Array(read.getMappedRange()),{label:'frequency-gpu-readback'});}finally{read.unmap();}})();scope=false;const error=await closeGpuErrorScopes(device,{label:'frequency-gpu',requestedBytes});if(error)throw error;
   return{data,metrics:{planningMs,pipelineMs,uploadMs,dispatchAndReadbackMs,...(profilePasses?{horizontalMs,verticalAndReadbackMs}:{}),totalMs:performance.now()-start,accountedGpuBufferBytes:requestedBytes,...(reserveGpuBytes?{policyGpuBufferReservationBytes:plannedGpuBytes}:{}),maskAlgorithm:plan?'binary-run-rows+mapped-ordered-gaussian':'generic-ordered-gaussian',...(plan?{uniqueHorizontalRows:plan.uniqueRows,emptyInputRows:plan.emptyRows,metadataBytes:plan.metadataBytes}: {})}};
  }catch(error){if(scope){scope=false;throw await closeGpuErrorScopes(device,{cause:error,label:'frequency-gpu',requestedBytes});}throw error;}finally{try{for(const b of buffers)b.destroy();}finally{admission?.();}}
 },dispose(){device.destroy();}};
}
