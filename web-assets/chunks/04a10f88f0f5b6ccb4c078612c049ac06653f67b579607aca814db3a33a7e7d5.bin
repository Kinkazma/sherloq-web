import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
/** GPU spatial/pointwise convolutions with the native float32 FMA reduction.
 * SLEEF activations, pooling, small GEMV and decisions stay on the CPU. */
export async function createCfaGPU(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No CFA WebGPU adapter.');
 const device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize,maxBufferSize:adapter.limits.maxBufferSize}}),pipelines=new Map();
 return {async convolution({input,weights,bias,shape,attrs}){
  const [batch,ci,ih,iw]=input.dims,[co,cg,kh,kw]=shape,[dh,dw]=attrs.dilations??[1,1],groups=attrs.group??1,og=co/groups,oh=ih-(kh-1)*dh,ow=iw-(kw-1)*dw;
  requireValue(cg===ci/groups&&(attrs.pads??[]).every(x=>x===0)&&(attrs.strides??[]).every(x=>x===1),'Unexpected CFA GPU convolution.');
  const key=[ci,co,kh,kw,dh,dw,groups].join('/'),buffers=[];
  const buffer=(size,data,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST)=>{
   if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('MEMORY_ALLOCATION','CFA GPU buffer exceeds device limits; subdivide useful tile.');
   const b=device.createBuffer({size:Math.max(4,size),usage});buffers.push(b);if(data)device.queue.writeBuffer(b,0,data);return b;
  };
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let scoped=true;
  try{
   let pipeline=pipelines.get(key);
   if(!pipeline){
    const code=`@group(0) @binding(0) var<storage,read> x:array<f32>; @group(0) @binding(1) var<storage,read> weights:array<f32>;
     @group(0) @binding(2) var<storage,read> bias:array<f32>; @group(0) @binding(3) var<storage,read_write> out:array<f32>;
     @group(0) @binding(4) var<uniform> p:vec4<u32>;
     @compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
      let id=gid.x+gid.y*65535u*128u;let ih=p.x;let iw=p.y;let oh=ih-${(kh-1)*dh}u;let ow=iw-${(kw-1)*dw}u;let n=oh*ow;
      if(id>=p.z*${co}u*n){return;}let c=(id/n)%${co}u;let batch=id/(n*${co}u);let pos=id%n;let row=pos/ow;let col=pos%ow;let group=c/${og}u;
      var core=pos<n/64u*64u;if(${og}u<=16u&&n%1024u==0u){core=pos>=16u&&pos<n-48u;}
      var acc=select(0.,bias[c],core);
      for(var ic=0u;ic<${cg}u;ic++){for(var ky=0u;ky<${kh}u;ky++){for(var kx=0u;kx<${kw}u;kx++){
       let value=x[((batch*${ci}u+group*${cg}u+ic)*ih+row+ky*${dh}u)*iw+col+kx*${dw}u];
       let weight=weights[((c*${cg}u+ic)*${kh}u+ky)*${kw}u+kx];acc=fma(value,weight,acc);
      }}}out[id]=select(acc+bias[c],acc,core);
     }`;
    pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'main'}});pipelines.set(key,pipeline);
   }
   const bytes=batch*co*oh*ow*4,x=buffer(input.data.byteLength,input.data),w=buffer(weights.byteLength,weights),b=buffer(bias.byteLength,bias),out=buffer(bytes,undefined,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),params=buffer(16,Uint32Array.of(ih,iw,batch,0),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),read=buffer(bytes,undefined,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[x,w,b,out,params].map((buffer,binding)=>({binding,resource:{buffer}}))}));const count=Math.ceil(bytes/4/128);pass.dispatchWorkgroups(Math.min(count,65535),Math.ceil(count/65535));pass.end();encoder.copyBufferToBuffer(out,0,read,0,bytes);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const result=new Float32Array(read.getMappedRange()).slice();read.unmap();
   const memory=await device.popErrorScope(),validation=await device.popErrorScope();scoped=false;if(memory)throw new EngineError('MEMORY_ALLOCATION',memory.message);if(validation)throw new EngineError('NEURAL_EXECUTION',validation.message);return result;
  }finally{for(const b of buffers)b.destroy();if(scoped){await device.popErrorScope();await device.popErrorScope();}}
 },dispose(){device.destroy();}};
}
