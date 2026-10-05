export {toneTable,fusedCpu} from '../src/ela-lut.js';
const shader=`
@group(0) @binding(0) var<storage,read> a:array<u32>;
@group(0) @binding(1) var<storage,read> b:array<u32>;
@group(0) @binding(2) var<storage,read> lut:array<u32>;
@group(0) @binding(3) var<storage,read_write> out:array<u32>;
@group(0) @binding(4) var<uniform> opts:vec4u;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u) {
 let i=id.x;if(i>=opts.x){return;}
 var r=lut[((a[i]&255u)<<8u)|(b[i]&255u)];
 var g=lut[(((a[i]>>8u)&255u)<<8u)|((b[i]>>8u)&255u)];
 var bl=lut[(((a[i]>>16u)&255u)<<8u)|((b[i]>>16u)&255u)];
 if(opts.y!=0u){let y=(r*9798u+g*19235u+bl*3735u+16384u)>>15u;r=y;g=y;bl=y;}
 out[i]=r|(g<<8u)|(bl<<16u);
}`;
export async function createGpuExperiment() {
 if(!navigator.gpu)throw new Error('WebGPU unavailable');
 const start=performance.now(),adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw new Error('No WebGPU adapter');
 const device=await adapter.requestDevice(),code=device.createShaderModule({code:shader});
 const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:code,entryPoint:'main'}});
 return {initMs:performance.now()-start,adapter:{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,isFallbackAdapter:adapter.info?.isFallbackAdapter},async run(a,b,p,table) {
  const total=performance.now(),n=a.length/3,packedA=new Uint32Array(n),packedB=new Uint32Array(n),lut=new Uint32Array(table);
  for(let i=0,j=0;i<n;i++,j+=3){packedA[i]=a[j]|a[j+1]<<8|a[j+2]<<16;packedB[i]=b[j]|b[j+1]<<8|b[j+2]<<16;}
  const preparationMs=performance.now()-total,buffers=[];
  const buffer=(data,usage)=>{const b=device.createBuffer({size:data.byteLength,usage,mappedAtCreation:true});new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));b.unmap();buffers.push(b);return b;};
  try {
   device.pushErrorScope('validation');const upload=performance.now();
   const ba=buffer(packedA,GPUBufferUsage.STORAGE),bb=buffer(packedB,GPUBufferUsage.STORAGE),lt=buffer(lut,GPUBufferUsage.STORAGE);
   const options=buffer(new Uint32Array([n,+p.grayscale,0,0]),GPUBufferUsage.UNIFORM);
   const out=device.createBuffer({size:n*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});buffers.push(out);
   const read=device.createBuffer({size:n*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});buffers.push(read);
   const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[ba,bb,lt,out,options].map((buffer,binding)=>({binding,resource:{buffer}}))});
   const transferPreparationMs=performance.now()-upload,t=performance.now(),commands=device.createCommandEncoder(),pass=commands.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(n/256));pass.end();commands.copyBufferToBuffer(out,0,read,0,n*4);device.queue.submit([commands.finish()]);
   await read.mapAsync(GPUMapMode.READ);const dispatchAndReadbackMs=performance.now()-t;
   const unpack=performance.now(),words=new Uint32Array(read.getMappedRange()),data=new Uint8Array(a.length);
   for(let i=0,j=0;i<n;i++,j+=3){data[j]=words[i]&255;data[j+1]=(words[i]>>8)&255;data[j+2]=(words[i]>>16)&255;}
   read.unmap();const error=await device.popErrorScope();if(error)throw new Error(error.message);
   return {data,metrics:{preparationMs,transferPreparationMs,dispatchAndReadbackMs,unpackMs:performance.now()-unpack,totalMs:performance.now()-total,accountedGpuBufferBytes:n*16+262144+16}};
  }finally{for(const b of buffers)b.destroy();}
 },dispose(){device.destroy();}};
}
