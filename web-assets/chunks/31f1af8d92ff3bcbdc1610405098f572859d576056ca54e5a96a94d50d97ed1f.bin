import "../../runtime-context.js?v=0.14.5";
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
export async function createFrequencyGpu(){
 if(!navigator.gpu)throw new Error('WebGPU unavailable');const start=performance.now(),adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter');const device=await adapter.requestDevice();
 let pipeline;try{const code=device.createShaderModule({code:shader});pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:code,entryPoint:'main'}});}catch(error){device.destroy();throw error;}
 return {initMs:performance.now()-start,adapter:{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,isFallbackAdapter:adapter.info?.isFallbackAdapter},async run(input,width,height,weights){
  const start=performance.now(),buffers=[];let scope=false;
  if(input.byteLength>device.limits.maxStorageBufferBindingSize||input.byteLength>device.limits.maxBufferSize||weights.byteLength>device.limits.maxStorageBufferBindingSize||Math.ceil(width/16)>device.limits.maxComputeWorkgroupsPerDimension||Math.ceil(height/16)>device.limits.maxComputeWorkgroupsPerDimension)throw new Error('Frequency mask exceeds GPU device limits.');
  const alloc=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;};
  const upload=(data,usage)=>{const b=alloc(data.byteLength,usage|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(b,0,data);return b;};
  try{device.pushErrorScope('validation');scope=true;
   const a=upload(input,GPUBufferUsage.STORAGE),w=upload(weights,GPUBufferUsage.STORAGE),h=alloc(input.byteLength,GPUBufferUsage.STORAGE),out=alloc(input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=alloc(input.byteLength,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
   const opts=[0,1].map(axis=>upload(new Uint32Array([width,height,weights.length,axis]),GPUBufferUsage.UNIFORM));
   const binds=[[a,w,h,opts[0]],[h,w,out,opts[1]]].map(list=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:list.map((buffer,binding)=>({binding,resource:{buffer}}))}));
   const uploadMs=performance.now()-start,dispatch=performance.now(),encoder=device.createCommandEncoder();for(const bind of binds){const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(width/16),Math.ceil(height/16));pass.end();}encoder.copyBufferToBuffer(out,0,read,0,input.byteLength);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const dispatchAndReadbackMs=performance.now()-dispatch,data=new Float32Array(read.getMappedRange()).slice();read.unmap();const error=await device.popErrorScope();scope=false;if(error)throw new Error(error.message);
   return {data,metrics:{uploadMs,dispatchAndReadbackMs,totalMs:performance.now()-start,accountedGpuBufferBytes:input.byteLength*4+weights.byteLength+32}};
  }finally{if(scope)await device.popErrorScope();for(const b of buffers)b.destroy();}
 },dispose(){device.destroy();}};
}
