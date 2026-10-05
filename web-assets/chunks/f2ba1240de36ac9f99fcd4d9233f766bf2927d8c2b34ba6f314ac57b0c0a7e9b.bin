// Same ordered float32 FMAs as the qualified native row/symmetric-column filter.
// One support window; global octave bases and candidate dependencies stay outside.
const code=`struct Shape { width:u32,height:u32,length:u32,pad:u32 };
@group(0) @binding(0) var<storage,read> source:array<f32>;
@group(0) @binding(1) var<storage,read> kernel:array<f32>;
@group(0) @binding(2) var<storage,read_write> destination:array<f32>;
@group(0) @binding(3) var<uniform> shape:Shape;
fn reflect(p:i32,n:i32)->u32 { if(n==1){return 0u;}let period=2*(n-1);let a=((p%period)+period)%period;return u32(select(a,period-a,a>=n)); }
@compute @workgroup_size(256) fn horizontal(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.width*shape.height){return;}let x=i%shape.width;let y=i/shape.width;let r=i32(shape.length/2u);var sum=source[y*shape.width+reflect(i32(x)-r,i32(shape.width))]*kernel[0];for(var k=1u;k<shape.length;k++){sum=fma(source[y*shape.width+reflect(i32(x)+i32(k)-r,i32(shape.width))],kernel[k],sum);}destination[i]=sum;}
@compute @workgroup_size(256) fn vertical(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=shape.width*shape.height){return;}let x=i%shape.width;let y=i/shape.width;let r=shape.length/2u;var sum=source[i]*kernel[r];for(var k=1u;k<=r;k++){let pair=source[reflect(i32(y)-i32(k),i32(shape.height))*shape.width+x]+source[reflect(i32(y)+i32(k),i32(shape.height))*shape.width+x];sum=fma(pair,kernel[r+k],sum);}destination[i]=sum;}`;
export async function createSiftGaussianGpu(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WebGPU unavailable');const device=await adapter.requestDevice(),module=device.createShaderModule({code});
 const hp=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'horizontal'}}),vp=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'vertical'}});let lost;
 device.lost.then(info=>{lost=info.message;});
 return {async pyramid(base,width,height,kernels){
  if(lost)throw Error('WebGPU device lost: '+lost);const n=width*height,size=n*4,buffers=[],make=(bytes,usage)=>{const b=device.createBuffer({size:Math.max(4,bytes),usage});buffers.push(b);return b;},storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');let scopes=2;
  try{
   let source=make(size,storage);const temp=make(size,storage),read=make(size*(kernels.length+1),GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);device.queue.writeBuffer(source,0,base);let encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(source,0,read,0,size);
   for(let i=0;i<kernels.length;i++){
    const k=kernels[i],kernel=make(k.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),shape=make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),destination=make(size,storage);device.queue.writeBuffer(kernel,0,k);device.queue.writeBuffer(shape,0,Uint32Array.of(width,height,k.length,0));
    for(const [pipeline,a,b] of [[hp,source,temp],[vp,temp,destination]]){const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:kernel}},{binding:2,resource:{buffer:b}},{binding:3,resource:{buffer:shape}}]}));pass.dispatchWorkgroups(Math.ceil(n/256));pass.end();}
    encoder.copyBufferToBuffer(destination,0,read,(i+1)*size,size);source=destination;
   }
   device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const result=new Float32Array(read.getMappedRange().slice(0));read.unmap();scopes--;const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();if(oom||validation)throw Error((oom??validation).message);return result;
  }finally{while(scopes>0){scopes--;await device.popErrorScope().catch(()=>{});}for(const b of buffers)b.destroy();}
 },dispose(){device.destroy();}};
}
