import {nativeGradientField} from './gradient-field-parameters.js';
import {EngineError,checkAbort} from './errors.js';
import {initializeGpuOwner,gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,openOwnedGpuDevice,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
const shader=`
struct P { width:u32,height:u32,start:u32,rows:u32,step:u32,kind:u32,taps:u32,groupsX:u32,border:u32,pad0:u32,pad1:u32,pad2:u32 }
@group(0) @binding(0) var<storage,read> source:array<vec2<f32>>;
@group(0) @binding(1) var<storage,read> taps:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> result:array<vec2<f32>>;
@group(0) @binding(3) var<uniform> p:P;
fn bound(i:i32,n:i32)->i32 {if(i>=0&&i<n){return i;}if(p.border==2u){return -1;}if(p.border==1u){return clamp(i,0,n-1);}var j=i%(2*n);if(j<0){j+=2*n;}return select(2*n-1-j,j,j<n);}
fn difference(x:i32,y:i32,c:f32)->f32 {let xx=bound(x,i32(p.width));let yy=bound(y,i32(p.height));if(xx<0||yy<0){return 0.;}let v=source[u32(yy)*p.width+u32(xx)];return select(0.,v.x-c,v.y>.5);}
fn reflect101(i:i32,n:i32)->i32 {if(n==1){return 0;}let period=2*n-2;var j=i%period;if(j<0){j+=period;}return select(period-j,j,j<n);}
fn sobelSample(x:i32,y:i32,dx:i32,dy:i32)->f32 {var xx=reflect101(x+dx,i32(p.width));var yy=reflect101(y+dy,i32(p.height));if(source[u32(yy)*p.width+u32(xx)].y<.5){xx=reflect101(x-dx,i32(p.width));yy=reflect101(y-dy,i32(p.height));if(source[u32(yy)*p.width+u32(xx)].y<.5){xx=x;yy=y;}}return source[u32(yy)*p.width+u32(xx)].x;}
@compute @workgroup_size(256) fn calculate(@builtin(global_invocation_id) id:vec3<u32>) {
 let i=id.x+id.y*p.groupsX*256u;if(i>=p.width*p.rows){return;}let x=i%p.width;let y=i/p.width+p.start;let c=source[y*p.width+x];if(c.y<.5){result[i]=vec2<f32>(0.);return;}var value=vec2<f32>(0.);
 if(p.kind==2u){for(var dy=-1;dy<=1;dy++){for(var dx=-1;dx<=1;dx++){let v=sobelSample(i32(x),i32(y),dx,dy);value.x+=f32(dx)*select(1.,2.,dy==0)*v;value.y+=f32(dy)*select(1.,2.,dx==0)*v;}}value/=2040.;
 }else if(p.kind==1u){let ring=array<vec2<i32>,8>(vec2<i32>(1,0),vec2<i32>(1,1),vec2<i32>(0,1),vec2<i32>(-1,1),vec2<i32>(-1,0),vec2<i32>(-1,-1),vec2<i32>(0,-1),vec2<i32>(1,-1));var v:array<f32,8>;for(var j=0u;j<8u;j++){v[j]=difference(i32(x)+ring[j].x*i32(p.step),i32(y)+ring[j].y*i32(p.step),c.x);}var best=0.;var which=0u;for(var j=0u;j<8u;j++){var s=0.;for(var a=0u;a<8u;a++){s+=v[a]*select(-3.,5.,a==(j+7u)%8u||a==j||a==(j+1u)%8u);}if(s>best){best=s;which=j;}}let direction=vec2<f32>(ring[which])*select(1.,.7071067811865476,which%2u==1u);value=direction*best/(24.*f32(p.step));
 }else{for(var j=0u;j<p.taps;j++){let t=taps[j];if(t.x>0.){value.x+=t.z*(difference(i32(x)+i32(t.x),i32(y)+i32(t.y),c.x)-difference(i32(x)-i32(t.x),i32(y)+i32(t.y),c.x));}if(t.y>0.){value.y+=t.w*(difference(i32(x)+i32(t.x),i32(y)+i32(t.y),c.x)-difference(i32(x)+i32(t.x),i32(y)-i32(t.y),c.x));}}if(p.kind==3u){value/=7650.;}}
 result[i]=value;
}`;
class FieldGpu {
 constructor(budget){initializeGpuOwner(this,budget,'detail-gradient-field');this.program=null;}
 failure(error){return gpuOwnerFailure(this,error);}mayFallback(error){return gpuOwnerMayFallback(this,error);}sync(fn,signal){return gpuOwnerSync(this,fn,signal);}asyncApi(fn,signal){return gpuOwnerAsync(this,fn,signal);}reserve(bytes){return gpuOwnerReserve(this,bytes);}
 async initialize(signal){if(!this.ready)this.ready=(async()=>{const fee=this.reserve(4*MiB);this.orphanPipelineFees.add(fee);const device=await openOwnedGpuDevice(this,signal,adapter=>({maxBufferSize:Math.min(adapter.limits.maxBufferSize,512*MiB),maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,512*MiB)})),module=this.sync(()=>device.createShaderModule({code:shader}),signal),info=await this.asyncApi(()=>module.getCompilationInfo(),signal);if(info.messages.some(m=>m.type==='error'))throw this.failure(new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n')));const pipeline=await this.asyncApi(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'calculate'}}),signal);this.program={pipeline,fee};this.orphanPipelineFees.delete(fee);return device;})().catch(error=>{this.ready=null;this.retirementNeeded=true;throw error;});return this.ready;}
 async retirePipelines(){if(this.program){await this.program.fee();this.program=null;}}
 async run({L,M,width,height,start,rows,params,kernel},{signal}={}){
  checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Gradient field GPU closed.');if(this.busy)throw new EngineError('BUSY','Gradient field GPU active.');this.busy=true;let transaction,failed=false,primary;
  try{
   if(this.pending.size||this.retirementNeeded||this.lost)await retireOwnedGpuDevice(this);
   transaction=gpuTransaction(this);transaction.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'detail-gradient-field',label:'gradient-field-native-band'});await this.initialize(signal);const device=this.device;transaction.device=device;
   this.sync(()=>device.pushErrorScope('validation'),signal);transaction.scopes++;this.sync(()=>device.pushErrorScope('out-of-memory'),signal);transaction.scopes++;
   const inputBytes=L.length*8,outputBytes=width*rows*8,tapBytes=Math.max(16,kernel.taps.length*16),groups=Math.ceil(width*rows/256),groupsX=Math.min(groups,device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);
   if(!(groupsY<=device.limits.maxComputeWorkgroupsPerDimension&&[inputBytes,outputBytes,tapBytes].every(v=>v<=device.limits.maxStorageBufferBindingSize&&v<=device.limits.maxBufferSize)))throw this.failure(new EngineError('GPU_LIMIT','Gradient field GPU band exceeds actual device limits.'));
   transaction.workspace=this.reserve(inputBytes*2+outputBytes*2+tapBytes*2+65536);
   const make=(size,usage,label)=>{const buffer=this.sync(()=>device.createBuffer({size,usage,label}),signal);transaction.buffers.set(buffer,{bytes:size,destroyed:false,release:this.budget.registerBacking?.('gpu',size,{owner:'detail-gradient-field',label})});return buffer;};
   const input=make(inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'gradient-gray-membership'),taps=make(tapBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'gradient-coefficients'),output=make(outputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'gradient-vectors'),read=make(outputBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'gradient-vector-readback'),uniform=make(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'gradient-band-shape');
   const native=nativeGradientField(params),kind=native?(params.method==='sobel'?2:3):params.method==='kirsch'?1:0,prepared=new Float32Array(L.length*2);
   // Difference kernels annihilate a constant. Remove one admitted luminance
   // reference in float64 BEFORE float32 upload, preserving faint variations
   // after heavy smoothing instead of quantizing them onto a large DC offset.
   const reference=native?-1:M.findIndex(value=>value!==0),origin=reference<0?0:L[reference];
   for(let i=0;i<L.length;i++){prepared[2*i]=native?Math.round(L[i]*255):L[i]-origin;prepared[2*i+1]=M[i];}const coefficients=Float32Array.from(kernel.taps.flat());if(kind===3)for(let i=0;i<coefficients.length;i+=4){const x=coefficients[i],y=coefficients[i+1],weight=x&&y?4:7;coefficients[i+2]=x*weight;coefficients[i+3]=y*weight;}
   this.sync(()=>{device.queue.writeBuffer(input,0,prepared);if(coefficients.length)device.queue.writeBuffer(taps,0,coefficients);device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,start,rows,params.sampleStep,kind,kernel.taps.length,groupsX,['reflect','nearest','omit'].indexOf(params.border),0,0,0]));},signal);
   const group=this.sync(()=>device.createBindGroup({layout:this.program.pipeline.getBindGroupLayout(0),entries:[input,taps,output,uniform].map((buffer,binding)=>({binding,resource:{buffer}}))}),signal),encoder=this.sync(()=>device.createCommandEncoder(),signal),pass=this.sync(()=>encoder.beginComputePass(),signal);
   this.sync(()=>{pass.setPipeline(this.program.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(output,0,read,0,outputBytes);},signal);transaction.drained=false;this.sync(()=>device.queue.submit([encoder.finish()]),signal);
   await this.asyncApi(()=>read.mapAsync(GPUMapMode.READ),signal);transaction.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);const mapped=this.sync(()=>read.getMappedRange(),signal);transaction.mapping.release=this.budget.registerBacking?.('gpu-mapped',outputBytes,{owner:'detail-gradient-field',label:'field-vector-map',identity:mapped});const slopes=Float64Array.from(new Float32Array(mapped));this.sync(()=>read.unmap(),signal);transaction.mapping.mapped=false;await transaction.mapping.release?.();transaction.mapping=null;
   const oom=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;const invalid=await this.asyncApi(()=>device.popErrorScope(),signal);transaction.scopes--;if(oom||invalid)throw this.failure(new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??invalid).message));checkAbort(signal);if(this.lost)throw this.failure(new EngineError('GPU_FAILED','Gradient field GPU lost before publication.'));transaction.drained=true;return{slopes,gpuJobs:1};
  }catch(error){failed=true;primary=error;throw error;}finally{try{if(transaction)await retireGpuTransaction(this,transaction);if(failed&&this.mayFallback(primary))await retireOwnedGpuDevice(this);}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}finally{this.busy=false;}}
 }
 dispose(){return disposeGpuOwner(this);}
}
 const services=new WeakMap();
export function getGradientFieldGpu(budget){
 let service=services.get(budget);if(service)return service;
 let gpu,queue=Promise.resolve(),closed=false;const observations=new WeakMap(),failures=new WeakMap();
 service={
  shouldRun(token,backend,key){
   if(backend==='cpu')return false;
   if(backend==='webgpu'){failures.get(token)?.delete(key);if(!globalThis.navigator?.gpu)throw new EngineError('GPU_UNAVAILABLE','WebGPU is unavailable in this browser.');return true;}
   const row=failures.get(token),failure=row?.get(key);
   if(failure?.memory&&budget.limit-budget.total()>=failure.available+4*MiB)row.delete(key);
   return !!globalThis.navigator?.gpu&&!row?.has(key)&&(observations.get(token)?.get(key)??0)>50;
  },
  observeCpu(token,ms,key){let row=observations.get(token);if(!row){row=new Map();observations.set(token,row);}if(row.size>32)row.delete(row.keys().next().value);row.set(key,ms);},
  observeGpuFailure(token,key,error){let row=failures.get(token);if(!row){row=new Map();failures.set(token,row);}if(row.size>=32)row.delete(row.keys().next().value);row.set(key,{memory:['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(error?.code),available:budget.limit-budget.total()});},
  // Only the GPU owner can authorize recovery, after every native reservation,
  // buffer and fence has retired. Caller/source errors are never GPU failures.
  mayFallback(error){return !!gpu&&gpu.mayFallback(error)&&!gpu.retirementNeeded&&!gpu.pending.size;},
  run(input,hooks){const work=async()=>{if(closed)throw new EngineError('DISPOSED','Gradient GPU service closed.');gpu??=new FieldGpu(budget);return gpu.run(input,hooks);};const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;},
  ownsResources(){return !!gpu;},async dispose(){closed=true;await queue;await gpu?.dispose();gpu=null;}
 };services.set(budget,service);return service;
}
export const hasGradientFieldGpuResources=budget=>services.get(budget)?.ownsResources()??false;
export async function disposeGradientFieldGpu(budget){const service=services.get(budget);if(service){await service.dispose();services.delete(budget);}}
