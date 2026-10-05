import {requestStorageDevice,storageDeviceLimits} from './gpu-limits.js';
import {closeGpuErrorScopes} from './gpu-error-scope.js';
import {copyTypedArray} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
/** GPU spatial/pointwise convolutions with the native float32 FMA reduction.
 * SLEEF activations, pooling, small GEMV and decisions stay on the CPU. */
export async function createCfaGPU(){
 const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','No CFA WebGPU adapter.');
 const device=await requestStorageDevice(adapter),pipelines=new Map();
 const buffers=new Map(),transient=new Set(),available=[],metrics={bufferAllocations:0,uploadedWeightBytes:0,readbackBytes:0,uploadedInputBytes:0,residentOperations:0},clear=()=>{for(const b of buffers.values())b.destroy();for(const b of transient)b.destroy();buffers.clear();transient.clear();available.length=0;};
 let model,modelWeights,busy=false,disposed=false,graphShape,graphOpen=false;
 function buffer(key,size,data,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,immutable=false){
  if(size>device.limits.maxBufferSize||((usage&GPUBufferUsage.STORAGE)&&size>device.limits.maxStorageBufferBindingSize))throw new EngineError('MEMORY_LIMIT','CFA GPU buffer exceeds device limits; subdivide useful tile.',{details:{admissionScope:'fixed',requestedBytes:size,maximumBytes:Math.min(device.limits.maxBufferSize,device.limits.maxStorageBufferBindingSize)}});
  let b=buffers.get(key),created=false;
  if(!b||b.size<Math.max(4,size)){b?.destroy();buffers.delete(key);b=device.createBuffer({size:Math.max(4,size),usage});buffers.set(key,b);created=true;metrics.bufferAllocations++;}
  if(data&&(!immutable||created)){device.queue.writeBuffer(b,0,data);if(immutable)metrics.uploadedWeightBytes+=data.byteLength;}
  return b;
 }
 const elements=dims=>dims.reduce((a,b)=>a*b,1);
 function tensor(dims){
  const bytes=Math.max(4,elements(dims)*4),index=available.findIndex(b=>b.size>=bytes);let b;
  if(index>=0)b=available.splice(index,1)[0];else{
   if(bytes>device.limits.maxBufferSize||bytes>device.limits.maxStorageBufferBindingSize)throw new EngineError('MEMORY_LIMIT','CFA resident tensor exceeds GPU binding limit.',{details:{admissionScope:'fixed',requestedBytes:bytes,maximumBytes:Math.min(device.limits.maxBufferSize,device.limits.maxStorageBufferBindingSize)}});
   b=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});transient.add(b);metrics.bufferAllocations++;
  }
  let released=false;return {buffer:b,dims:[...dims],release(){if(!released){released=true;available.push(b);}}};
 }
 const api={supportsResident:true,
 beginGraph(dims){if(graphOpen)throw new EngineError('BUSY','CFA graph already executing.');graphOpen=true;device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');const shape=dims.join(',');if(graphShape!==shape){for(const b of transient)b.destroy();transient.clear();available.length=0;graphShape=shape;}},
 async endGraph(){if(!graphOpen)return;graphOpen=false;const error=await closeGpuErrorScopes(device,{label:'cfa-graph',validationCode:'NEURAL_EXECUTION'});if(error){clear();throw error;}},
 upload(input){const out=tensor(input.dims);try{device.queue.writeBuffer(out.buffer,0,input.data);metrics.uploadedInputBytes+=input.data.byteLength;return out;}catch(error){out.release();throw error;}},
 async read(input){const bytes=elements(input.dims)*4,read=buffer('readback',bytes,undefined,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(input.buffer,0,read,0,bytes);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ,0,bytes);try{metrics.readbackBytes+=bytes;return copyTypedArray(new Float32Array(read.getMappedRange(0,bytes)),{label:'neural-gpu-readback'});}finally{read.unmap();}},
 async move(op,inputs,{dims,start,step,axis,indices}={}){
  const out=tensor(dims),encoder=device.createCommandEncoder();let success=false;
  try{
   if(op==='Concat'||op==='Gather'){
    const inner=elements(dims.slice(axis+1)),outer=elements(dims.slice(0,axis));
    for(let batch=0;batch<outer;batch++){
     if(op==='Concat'){let offset=batch*dims[axis]*inner;for(const t of inputs){const length=t.dims[axis]*inner;encoder.copyBufferToBuffer(t.buffer,batch*length*4,out.buffer,offset*4,length*4);offset+=length;}}
     else for(let j=0;j<indices.length;j++)encoder.copyBufferToBuffer(inputs[0].buffer,(batch*inputs[0].dims[axis]+indices[j])*inner*4,out.buffer,(batch*dims[axis]+j)*inner*4,inner*4);
    }
   }else{
    const source=inputs[0],key='movement/'+op;let pipeline=pipelines.get(key);
    if(!pipeline){
     let body;
     if(op==='LeakyRelu')body='let v=x[id];z[id]=select(v*0.01,v,v>0.);';
     else if(op==='Identity')body='z[id]=x[id];';
     else{
      requireValue(op==='Slice','Unsupported resident CFA movement.');
      body='var index=0u;var divisor=1u;var stride=1u;for(var axis=3;axis>=0;axis--){index+=(p.start[u32(axis)]+(id/divisor)%p.dims[u32(axis)]*p.step[u32(axis)])*stride;divisor*=p.dims[u32(axis)];stride*=p.source[u32(axis)];}z[id]=x[index];';
     }
     const module=device.createShaderModule({code:`@group(0) @binding(0) var<storage,read> x:array<f32>;@group(0) @binding(1) var<storage,read_write> z:array<f32>;struct Params {source:vec4<u32>,dims:vec4<u32>,start:vec4<u32>,step:vec4<u32>,extent:vec4<u32>};@group(0) @binding(2) var<uniform> p:Params;@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){let id=gid.x+gid.y*65535u*128u;if(id>=p.extent.x){return;}${body}}`});
     pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});pipelines.set(key,pipeline);
    }
    requireValue(source.dims.length===4&&dims.length===4,'CFA movement requires NCHW tensors.');
    const params=buffer('movement-params',80,Uint32Array.from([...source.dims,...dims,...(start??[0,0,0,0]),...(step??[1,1,1,1]),elements(dims),0,0,0]),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[inputs[0].buffer,out.buffer,params].map((b,binding)=>({binding,resource:{buffer:b}}))}));const groups=Math.ceil(elements(dims)/128);pass.dispatchWorkgroups(Math.min(groups,65535),Math.ceil(groups/65535));pass.end();
   }
   device.queue.submit([encoder.finish()]);metrics.residentOperations++;success=true;return out;
  }finally{if(!success)out.release();}
 },beginModel(program,weights){if(busy)throw new EngineError('BUSY','CFA GPU already executing.');if(model!==program||modelWeights!==weights){clear();model=program;modelWeights=weights;}},get residentBytes(){return [...buffers.values(),...transient].reduce((total,b)=>total+b.size,0);},get metrics(){return {...metrics,deviceLimits:storageDeviceLimits(device)};},async convolution({input,weights,bias,shape,attrs,weightKey,biasKey,resident=false}){
  if(disposed)throw new EngineError('DISPOSED','CFA GPU disposed.');if(busy)throw new EngineError('BUSY','CFA GPU already executing.');
  const [batch,ci,ih,iw]=input.dims,[co,cg,kh,kw]=shape,[dh,dw]=attrs.dilations??[1,1],groups=attrs.group??1,og=co/groups,oh=ih-(kh-1)*dh,ow=iw-(kw-1)*dw;
  requireValue(cg===ci/groups&&(attrs.pads??[]).every(x=>x===0)&&(attrs.strides??[]).every(x=>x===1),'Unexpected CFA GPU convolution.');
  const key=[ci,co,kh,kw,dh,dw,groups].join('/');
  busy=true;if(!resident){device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');}let scoped=!resident,success=false;
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
   const output=resident?tensor([batch,co,oh,ow]):null;
   const bytes=batch*co*oh*ow*4,x=input.buffer??buffer('input',input.data.byteLength,input.data),w=buffer('weight/'+(weightKey??'scratch'),weights.byteLength,weights,undefined,!!model&&weightKey!==undefined),b=buffer('bias/'+(biasKey??'scratch'),bias.byteLength,bias,undefined,!!model&&biasKey!==undefined),out=output?.buffer??buffer('output',bytes,undefined,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),params=buffer('params',16,Uint32Array.of(ih,iw,batch,0),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),read=resident?null:buffer('readback',bytes,undefined,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[x,w,b,out,params].map((buffer,binding)=>({binding,resource:{buffer}}))}));const count=Math.ceil(bytes/4/128);pass.dispatchWorkgroups(Math.min(count,65535),Math.ceil(count/65535));pass.end();if(resident){device.queue.submit([encoder.finish()]);metrics.residentOperations++;success=true;return output;}encoder.copyBufferToBuffer(out,0,read,0,bytes);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ,0,bytes);let result;try{result=copyTypedArray(new Float32Array(read.getMappedRange(0,bytes)),{label:'neural-gpu-readback'});metrics.readbackBytes+=bytes;}finally{read.unmap();}
   scoped=false;const failure=await closeGpuErrorScopes(device,{label:'cfa-gpu.js',validationCode:'NEURAL_EXECUTION'});if(failure)throw failure;success=true;return result;
  }catch(error){if(scoped){scoped=false;throw await closeGpuErrorScopes(device,{cause:error,label:'cfa-gpu.js',validationCode:'NEURAL_EXECUTION'});}throw error;}finally{if(!success)clear();try{if(scoped){await device.popErrorScope();await device.popErrorScope();}}finally{busy=false;}}
 },dispose(){if(disposed)return;disposed=true;clear();pipelines.clear();device.destroy();}};return api;
}
