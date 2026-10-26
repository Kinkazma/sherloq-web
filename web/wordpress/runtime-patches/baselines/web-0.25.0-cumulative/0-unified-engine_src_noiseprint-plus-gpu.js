import {requestStorageDevice,storageDeviceLimits} from './gpu-limits.js';
import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {copyTypedArray} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
const DISPATCHES_PER_SUBMISSION=8;
/** Explicit IEEE fma sequence; affine multiply and add retain separate passes.
 * Program/weights are immutable for the lifetime of a loaded model. */
export async function createNoiseprintPlusGPU(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No WebGPU adapter.');
 const device=await requestStorageDevice(adapter),pipelines=new Map();
 let resident,arena,busy=false,disposed=false,lost;
 const metrics={bufferAllocations:0,uploadedWeightBytes:0,arenaReuses:0,submissions:0,hostFences:0};
 device.lost.then(info=>{lost=info.message||'Noiseprint++ GPU device lost.';});
 const clearArena=()=>{if(arena){for(const buffer of Object.values(arena.buffers))buffer.destroy();arena=null;}};
 const clearWeights=()=>{clearArena();if(resident){for(const buffer of resident.initializers.values())buffer.destroy();resident=null;}};
 const createBuffer=(size,data,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)=>{
  if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('MEMORY_LIMIT','Noiseprint++ GPU binding exceeds the device limit.',{details:{admissionScope:'fixed',requestedBytes:size,maximumBytes:Math.min(device.limits.maxBufferSize,device.limits.maxStorageBufferBindingSize)}});
  const buffer=device.createBuffer({size:Math.max(4,size),usage});metrics.bufferAllocations++;
  try{if(data)device.queue.writeBuffer(buffer,0,data);return buffer;}catch(error){buffer.destroy();throw error;}
 };
 const declarations=`@group(0) @binding(0) var<storage,read> x:array<f32>; @group(0) @binding(1) var<storage,read> w:array<f32>; @group(0) @binding(2) var<storage,read> b:array<f32>; @group(0) @binding(3) var<storage,read_write> z:array<f32>; struct Params {x:u32,y:u32,z:u32,w:u32,fullWidth:u32,offsetX:u32,pad1:u32,pad2:u32}; @group(0) @binding(4) var<uniform> p:Params;`;
 async function pipeline(op,ci,co){
  const key=[op,ci,co].join('/');if(pipelines.has(key))return pipelines.get(key);
  const body=op==='Conv'?`let n=p.x*p.y;let c=id/n;let pos=id%n;let row=i32(pos/p.x);let col=i32(pos%p.x);let global_n=p.fullWidth*p.z;let global_pos=(pos/p.x+p.w)*p.fullWidth+pos%p.x+p.offsetX;
   var core=global_pos<global_n/64u*64u;if(${co}u<=16u&&global_n%1024u==0u){core=global_pos>=16u&&global_pos<global_n-48u;}
   var acc=select(0.,b[c],core);
   for(var ch=0u;ch<${ci}u;ch++){for(var ky=0;ky<3;ky++){for(var kx=0;kx<3;kx++){
    let yy=row+ky-1;let xx=col+kx-1;var value=0.;if(yy>=0&&yy<i32(p.y)&&xx>=0&&xx<i32(p.x)){value=x[ch*n+u32(yy)*p.x+u32(xx)];}
    acc=fma(value,w[((c*${ci}u+ch)*3u+u32(ky))*3u+u32(kx)],acc);
   }}}z[id]=select(acc+b[c],acc,core);`:
   op==='Relu'?'z[id]=max(x[id],0.);':op==='Mul'?'z[id]=x[id]*w[id/(p.x*p.y)];':'z[id]=x[id]+w[id/(p.x*p.y)];';
  const module=device.createShaderModule({code:declarations+`@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let id=gid.x+gid.y*65535u*128u;if(id>=p.x*p.y*${co}u){return;}`+body+'}'});
  const value=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});pipelines.set(key,value);return value;
 }
 return {
  async run(program,weights,input,{globalHeight=input.dims[2],offsetY=0,globalWidth=input.dims[3],offsetX=0}={}){
   if(disposed)throw new EngineError('DISPOSED','Noiseprint++ GPU disposed.');
   if(lost)throw new EngineError('NEURAL_EXECUTION',lost);
   if(busy)throw new EngineError('BUSY','Noiseprint++ GPU already executing.');
   const count=d=>d.reduce((a,b)=>a*b,1),[batch,,h,w]=input.dims;
   requireValue(batch===1,'Noiseprint++ requires a single image.');
   busy=true;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let scoped=true,success=false;
   try{
    if(resident?.program!==program||resident.weights!==weights){
     clearWeights();resident={program,weights,initializers:new Map()};
     for(const [name,t]of Object.entries(program.initializers)){resident.initializers.set(name,createBuffer(count(t.dims)*4,weights.subarray(t.offset,t.offset+count(t.dims))));metrics.uploadedWeightBytes+=count(t.dims)*4;}
    }
    const initializers=resident.initializers,plan=[],capacities=[input.data.byteLength,4];let ci=input.dims[1];
    for(const [index,node]of program.nodes.entries()){
     const co=node.op==='Conv'?program.initializers[node.inputs[1]].dims[0]:ci,size=co*h*w*4;
     plan.push({node,ci,co});capacities[(index+1)%2]=Math.max(capacities[(index+1)%2],size);ci=co;
    }
    requireValue(ci===1&&plan.length>0,'Noiseprint++ must produce one output channel.');
    // Two alternating arenas bound activation memory independent of graph
    // depth. Ordered compute passes preserve every operator's rounding point.
    const bytes=h*w*4;
    if(!arena||arena.capacities.some((size,i)=>size<capacities[i])||arena.readBytes<bytes){
     // Previous useful jobs completed readback. Retire before growth so old
     // and new activation arenas never coexist at an unaccounted memory peak.
     clearArena();arena={capacities,readBytes:bytes,buffers:{}};
     for(let i=0;i<2;i++)arena.buffers['activation'+i]=createBuffer(capacities[i],undefined,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC);
     arena.buffers.params=createBuffer(32,undefined,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
     arena.buffers.zero=createBuffer(256,new Float32Array(64));
     arena.buffers.read=createBuffer(bytes,undefined,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
    }else metrics.arenaReuses++;
    const activations=[arena.buffers.activation0,arena.buffers.activation1],{params,zero,read}=arena.buffers;
    device.queue.writeBuffer(activations[0],0,input.data);
    device.queue.writeBuffer(params,0,Uint32Array.of(w,h,globalHeight,offsetY,globalWidth,offsetX,0,0));
    let encoder=device.createCommandEncoder();
    for(const [index,{node,ci,co}]of plan.entries()){
     const current=activations[index%2],output=activations[(index+1)%2],kernel=await pipeline(node.op,ci,co);
     const entries=[current,initializers.get(node.inputs[1])??zero,initializers.get(node.inputs[2])??zero,output,params].map((b,binding)=>({binding,resource:{buffer:b}}));
     // Only declare resources actually read by a shader in its inferred layout.
     const bindings=node.op==='Conv'?[0,1,2,3,4]:node.op==='Relu'?[0,3,4]:[0,1,3,4];
     const bind=device.createBindGroup({layout:kernel.getBindGroupLayout(0),entries:entries.filter(e=>bindings.includes(e.binding))}),pass=encoder.beginComputePass();pass.setPipeline(kernel);pass.setBindGroup(0,bind);const groups=Math.ceil(co*h*w/128);pass.dispatchWorkgroups(Math.min(groups,65535),Math.ceil(groups/65535));pass.end();
     if((index+1)%DISPATCHES_PER_SUBMISSION===0&&index+1<plan.length){
      // Queue order supplies dependencies; only the final CPU consumer waits.
      // One bounded model job is in flight, with no synthetic warm-up.
      device.queue.submit([encoder.finish()]);metrics.submissions++;encoder=device.createCommandEncoder();
     }
    }
    encoder.copyBufferToBuffer(activations[plan.length%2],0,read,0,bytes);device.queue.submit([encoder.finish()]);metrics.submissions++;await read.mapAsync(GPUMapMode.READ,0,bytes);let data;try{data=copyTypedArray(new Float32Array(read.getMappedRange(0,bytes)),{label:'neural-gpu-readback'});}finally{read.unmap();}
    scoped=false;const failure=await closeGpuErrorScopes(device,{label:'noiseprint-plus-gpu.js',validationCode:'NEURAL_EXECUTION'});if(failure)throw failure;
    success=true;return {data,dims:[1,1,h,w],metrics:{...metrics}};
   }catch(error){if(scoped){scoped=false;throw await closeGpuErrorScopes(device,{cause:error,label:'noiseprint-plus-gpu.js',validationCode:'NEURAL_EXECUTION'});}throw error;}finally{if(!success)clearWeights();try{if(scoped){await device.popErrorScope();await device.popErrorScope();}}finally{busy=false;}}
  },get residentBytes(){return [...(resident?.initializers?.values()??[]),...Object.values(arena?.buffers??{})].reduce((total,b)=>total+b.size,0);},get metrics(){return {...metrics,deviceLimits:storageDeviceLimits(device)};},dispose(){if(disposed)return;disposed=true;clearWeights();pipelines.clear();device.destroy();}
 };
}
