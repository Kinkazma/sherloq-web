import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
/** Explicit IEEE fma sequence; affine multiply and add have separate dispatches. */
export async function createNoiseprintPlusGPU(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No WebGPU adapter.');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize,maxBufferSize:adapter.limits.maxBufferSize}}),pipelines=new Map();
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
   const buffers=new Set(),initializers=new Map(),count=d=>d.reduce((a,b)=>a*b,1),[batch,,h,w]=input.dims;
   requireValue(batch===1,'Noiseprint++ requires a single image.');
   const buffer=(size,data,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)=>{
    if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('MEMORY_LIMIT','Noiseprint++ GPU binding exceeds the device limit.');
    const b=device.createBuffer({size:Math.max(4,size),usage});buffers.add(b);if(data)device.queue.writeBuffer(b,0,data);return b;
   };
   device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let scoped=true;
   try{
    for(const [name,t]of Object.entries(program.initializers))initializers.set(name,buffer(count(t.dims)*4,weights.subarray(t.offset,t.offset+count(t.dims))));
    let current=buffer(input.data.byteLength,input.data),ci=input.dims[1];
    const params=buffer(32,Uint32Array.of(w,h,globalHeight,offsetY,globalWidth,offsetX,0,0),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),zero=buffer(256,new Float32Array(64));
    for(const node of program.nodes){
     const co=node.op==='Conv'?program.initializers[node.inputs[1]].dims[0]:ci,output=buffer(co*h*w*4,undefined,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),kernel=await pipeline(node.op,ci,co);
     const entries=[current,initializers.get(node.inputs[1])??zero,initializers.get(node.inputs[2])??zero,output,params].map((b,binding)=>({binding,resource:{buffer:b}}));
     // Only declare resources actually read by a shader in its inferred layout.
     const bindings=node.op==='Conv'?[0,1,2,3,4]:node.op==='Relu'?[0,3,4]:[0,1,3,4];
     const bind=device.createBindGroup({layout:kernel.getBindGroupLayout(0),entries:entries.filter(e=>bindings.includes(e.binding))}),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(kernel);pass.setBindGroup(0,bind);const groups=Math.ceil(co*h*w/128);pass.dispatchWorkgroups(Math.min(groups,65535),Math.ceil(groups/65535));pass.end();device.queue.submit([encoder.finish()]);
     await device.queue.onSubmittedWorkDone();current.destroy();buffers.delete(current);current=output;ci=co;
    }
    const bytes=h*w*4,read=buffer(bytes,undefined,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(current,0,read,0,bytes);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const data=new Float32Array(read.getMappedRange()).slice();read.unmap();
    const memory=await device.popErrorScope(),validation=await device.popErrorScope();scoped=false;if(memory)throw new EngineError('MEMORY_ALLOCATION',memory.message);if(validation)throw new EngineError('NEURAL_EXECUTION',validation.message);
    return {data,dims:[1,1,h,w]};
   }finally{for(const b of buffers)b.destroy();if(scoped){await device.popErrorScope();await device.popErrorScope();}}
  },dispose(){device.destroy();}
 };
}
