/* Splicebuster: Cozzolino, Poggi and Verdoliva, IEEE WIFS2015.
 * Original feature method: Copyright (c)2018 GRIP-UNINA, nonprofit use only.
 * See the retained original LICENSE.txt. Private experimental GPU port.
 * Arithmetic follows SciPy1.17 _firfilter.cc's groups of four products.
 */
const align4=n=>Math.ceil(n/4)*4;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const checkAbort=signal=>{if(signal?.aborted)throw fail('CANCELLED','Splicebuster GPU pooling cancelled');};
function integer(v,name,min=1){if(!Number.isSafeInteger(v)||v<min)throw fail('INVALID_INPUT',`${name} must be an integer >=${min}`);}

export const POOL_SHADER = `
struct Params { inCols:u32, features:u32, ky:u32, kx:u32,
  outCols:u32, outRows:u32, count:u32, pad:u32,
  coeff:f32, p0:f32, p1:f32, p2:f32 }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> spam:array<f32>;
@group(0) @binding(2) var<storage,read> weights:array<f32>;
@group(0) @binding(3) var<storage,read_write> output:array<f32>;
fn value(cell:u32, feature:u32)->f32 {
  if(feature==p.features){return weights[cell];}
  return spam[cell*p.features+feature];
}
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id:vec3<u32>) {
  let i=id.x;
  if(i>=p.count){return;}
  let channels=p.features+1u;
  let feature=i%channels;
  let cell=i/channels;
  let y=cell/p.outCols;
  let x=cell%p.outCols;
  var acc=0.0f;
  for(var dy=0u;dy<p.ky;dy++){
    var dx=0u;
    loop {
      if(dx+4u>p.kx){break;}
      let j=(y+dy)*p.inCols+x+dx;
      var group=value(j,feature)*p.coeff;
      group=fma(value(j+1u,feature),p.coeff,group);
      group=fma(value(j+2u,feature),p.coeff,group);
      group=fma(value(j+3u,feature),p.coeff,group);
      acc=acc+group;
      dx=dx+4u;
    }
    for(;dx<p.kx;dx++){
      let j=(y+dy)*p.inCols+x+dx;
      acc=fma(value(j,feature),p.coeff,acc);
    }
  }
  output[i]=acc;
}`;

/** Plan one contiguous raw-feature rectangle before any GPU allocations.
 * The caller owns inputs and returned sums. The GPU owns no persistent buffers.
 */
export function planPoolRectangle({rows,cols,features=50,ky=16,kx=16},limits={},maximumGpuBytes=Infinity){
  for(const [name,v]of Object.entries({rows,cols,features,ky,kx}))integer(v,name);
  const outRows=rows-ky+1,outCols=cols-kx+1;
  if(outRows<1||outCols<1)throw fail('INVALID_INPUT','Raw rectangle is smaller than pooling support');
  const count=outRows*outCols*(features+1);
  if(!Number.isSafeInteger(count)||count>0xffffffff||!Number.isSafeInteger(rows*cols*features)||rows*cols*features>0xffffffff)throw fail('GPU_LIMIT','Pool indexing exceeds u32');
  const inputBytes=rows*cols*features*4,weightBytes=rows*cols*4,outputBytes=count*4,uniformBytes=48;
  const gpuBytes=inputBytes+weightBytes+outputBytes*2+uniformBytes;
  const largest=Math.max(inputBytes,weightBytes,outputBytes,uniformBytes);
  const maxBufferBytes=Math.min(limits.maxBufferSize??Infinity,limits.maxStorageBufferBindingSize??Infinity);
  const workgroups=Math.ceil(count/128);
  if(largest>maxBufferBytes||workgroups>(limits.maxComputeWorkgroupsPerDimension??65535)||gpuBytes>maximumGpuBytes)
    throw fail('GPU_LIMIT','Pooling rectangle exceeds admitted GPU limits',{largestBufferBytes:largest,gpuBytes,maximumGpuBytes,maxBufferBytes,workgroups});
  return {rows,cols,features,ky,kx,outRows,outCols,count,inputBytes,weightBytes,outputBytes,uniformBytes,gpuBytes,
    // Readback copy is ordinary JS memory, distinct from GPU staging.
    hostOutputBytes:outputBytes,hostParameterBytes:uniformBytes,largestBufferBytes:largest,workgroups};
}

/** Scalar final division deliberately remains CPU, preserving JS/native f32.
 * GPU sums are interleaved [50 feature sums, pooled weight].
 */
export function normalizePoolSums(interleaved,{outRows,outCols,features=50},output={}){
  const cells=outRows*outCols;
  if(!(interleaved instanceof Float32Array)||interleaved.length!==cells*(features+1))throw fail('INVALID_INPUT','Invalid pool sums');
  const spam=output.spam??new Float32Array(cells*features),weights=output.weights??new Float32Array(cells);
  if(spam.length!==cells*features||weights.length!==cells)throw fail('INVALID_INPUT','Invalid normalization destination');
  for(let cell=0;cell<cells;cell++){
    const src=cell*(features+1),dst=cell*features,w=interleaved[src+features];weights[cell]=w;
    const den=Math.max(w,1e-20);
    for(let f=0;f<features;f++)spam[dst+f]=Math.fround(interleaved[src+f]/den);
  }
  return {spam,weights,shape:[outRows,outCols,features]};
}

export class SplicebusterPoolGpu {
  static async create({device,gpu=globalThis.navigator?.gpu}={}){
    let owned=false,adapter;
    if(!device){
      if(!gpu)throw fail('UNSUPPORTED_BACKEND','WebGPU is unavailable in this worker');
      adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw fail('UNSUPPORTED_BACKEND','No WebGPU adapter');
      device=await adapter.requestDevice({requiredLimits:{maxBufferSize:adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize}});owned=true;
    }
    const result=new SplicebusterPoolGpu(device,owned);
    try{
      const shader=device.createShaderModule({label:'Splicebuster exact pooling',code:POOL_SHADER});
      const compilation=await shader.getCompilationInfo();
      const errors=compilation.messages.filter(x=>x.type==='error');
      if(errors.length)throw fail('GPU_VALIDATION',errors.map(x=>x.message).join('\n'));
      result.pipeline=await device.createComputePipelineAsync({label:'Splicebuster pool groups4',layout:'auto',compute:{module:shader,entryPoint:'main'}});
      result.adapterInfo=adapter?.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description}:null;
      return result;
    }catch(error){result.dispose();throw error;}
  }
  constructor(device,owned=false){
    this.device=device;this.owned=owned;this.buffers=new Set();this.disposed=false;this.busy=false;this.loss=null;
    // WebGPU interface objects are not structured-cloneable. Keep only plain
    // diagnostic fields because loss details cross the worker RPC boundary.
    device.lost.then(info=>{this.loss={reason:String(info.reason??'unknown'),message:String(info.message??'')};});
    this.metrics={submissions:0,gpuPeakBytes:0,writtenBytes:0,readBytes:0};
  }
  plan(geometry,maximumGpuBytes=Infinity){return planPoolRectangle(geometry,this.device.limits,maximumGpuBytes);}
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const b of this.buffers)b.destroy();this.buffers.clear();
    if(this.owned)this.device.destroy();
  }
  /** Caller must admit plan.gpuBytes and plan.hostOutputBytes before calling.
   * onSubmit occurs after queue submission, allowing meaningful overlap proof.
   * One device lane per instance; CPU normalization may run during the next job.
   */
  async poolSums(raw,{ky=16,kx=16,signal,onSubmit,beforeReadback,afterReadback,maximumGpuBytes=Infinity}={}){
    checkAbort(signal);
    if(this.disposed)throw fail('DISPOSED','GPU pool disposed');
    if(this.loss)throw fail('GPU_DEVICE_LOST','GPU device lost',this.loss);
    if(this.busy)throw fail('BUSY','One GPU pooling job may be active');
    const [rows,cols,features]=raw.shape??[];
    const plan=this.plan({rows,cols,features,ky,kx},maximumGpuBytes);
    if(!(raw.spam instanceof Float32Array)||raw.spam.byteLength!==plan.inputBytes||!(raw.weights instanceof Float32Array)||raw.weights.byteLength!==plan.weightBytes)
      throw fail('INVALID_INPUT','Raw features do not match their geometry');
    const device=this.device,buffers=[];
    let mapped=false,readback,scoped=false,cause,scopeFailure,submitted=false;
    const create=(label,size,usage)=>{const b=device.createBuffer({label,size:align4(size),usage});buffers.push(b);this.buffers.add(b);return b;};
    const abort=()=>{for(const b of buffers)b.destroy();};
    this.busy=true;signal?.addEventListener('abort',abort,{once:true});
    const started=performance.now();
    try{
      device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scoped=true;
      const input=create('SB raw histograms',plan.inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
      const weights=create('SB raw validity',plan.weightBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
      const output=create('SB pooled sums',plan.outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
      readback=create('SB bounded readback',plan.outputBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
      const uniform=create('SB pooling geometry',48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
      const values=new ArrayBuffer(48),u32=new Uint32Array(values),f32=new Float32Array(values);
      u32.set([cols,features,ky,kx,plan.outCols,plan.outRows,plan.count,0]);f32[8]=Math.fround(1/(ky*kx));
      device.queue.writeBuffer(input,0,raw.spam.buffer,raw.spam.byteOffset,raw.spam.byteLength);
      device.queue.writeBuffer(weights,0,raw.weights.buffer,raw.weights.byteOffset,raw.weights.byteLength);
      device.queue.writeBuffer(uniform,0,values);
      const binding=device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[uniform,input,weights,output].map((buffer,binding)=>({binding,resource:{buffer}}))});
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
      pass.setPipeline(this.pipeline);pass.setBindGroup(0,binding);pass.dispatchWorkgroups(plan.workgroups);pass.end();
      encoder.copyBufferToBuffer(output,0,readback,0,plan.outputBytes);
      device.queue.submit([encoder.finish()]);submitted=true;this.metrics.submissions++;this.metrics.gpuPeakBytes=Math.max(this.metrics.gpuPeakBytes,plan.gpuBytes);
      this.metrics.writtenBytes+=plan.inputBytes+plan.weightBytes+48;this.metrics.readBytes+=plan.outputBytes;
      onSubmit?.({plan,submittedAt:performance.now()});
      await readback.mapAsync(GPUMapMode.READ);mapped=true;checkAbort(signal);
      // GPU compute is complete; mapped backing remains owned while the host
      // admits the CPU copy. Only the GPU execution lease can be released now.
      await beforeReadback?.({plan,readyAt:performance.now()});checkAbort(signal);
      let result;
      try{
        const view=new Float32Array(readback.getMappedRange());
        try{result=new Float32Array(view.length);}catch(cause){throw fail('MEMORY_ALLOCATION','Unable to allocate GPU readback output',{allocationKind:'array-buffer',requestedBytes:view.byteLength,cause:String(cause)});}
        result.set(view);readback.unmap();mapped=false;
      }
      finally{await afterReadback?.({plan,completedAt:performance.now()});}
      return {sums:result,plan,wallTimeMs:performance.now()-started,metrics:{...this.metrics}};
    }catch(error){cause=error;throw error;}
    finally{
      if(mapped)try{readback.unmap();}catch{}
      // A failed submitted job settles only after its GPU work retires. The
      // caller can then retire the admitted backing without a hidden live job.
      if(cause&&submitted)try{await device.queue.onSubmittedWorkDone();}catch{}
      let memoryError,validationError;
      if(scoped){try{memoryError=await device.popErrorScope();validationError=await device.popErrorScope();}catch(error){scopeFailure=error;}}
      const retiredGpuBytes=buffers.reduce((n,b)=>n+b.size,0);
      for(const b of buffers){b.destroy();this.buffers.delete(b);}
      this.busy=false;signal?.removeEventListener('abort',abort);
      if(signal?.aborted)throw fail('CANCELLED','Splicebuster GPU pooling cancelled');
      if(this.disposed)throw fail('DISPOSED','GPU pool disposed');
      if(memoryError)throw fail('MEMORY_ALLOCATION',memoryError.message,{allocationKind:'gpu',requestedBytes:plan.gpuBytes,retiredGpuBytes,cause:String(cause??'')});
      if(this.loss&&!this.disposed)throw fail('GPU_DEVICE_LOST','GPU device lost',this.loss);
      if(validationError)throw fail('GPU_VALIDATION',validationError.message,{cause:String(cause??'')});
      if(scopeFailure&&!cause)throw scopeFailure;
    }
  }
}
