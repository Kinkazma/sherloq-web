import {EngineError,requireValue,checkAbort} from './errors.js';
import {gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,openOwnedGpuDevice,retireOwnedGpuDevice} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {allocateTypedArray} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {tryNativeGpuPack} from './sherloq7c-gpu-pack.js';
import {Sherloq7cProjectionGpu} from './sherloq7c-projection-gpu.js';

// Local to Sherloq7C: same 8 ms cooperative control checkpoint without the
// browser's nested-timer clamp. Each native channel closes before continuation.
function createCooperator(signal){
 let next=performance.now()+8;
 return async()=>{
  checkAbort(signal);if(performance.now()<next)return;
  await new Promise((resolve,reject)=>{let channel;try{
   channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);
  }catch(error){channel?.port1.close();channel?.port2.close();reject(error);}});
  checkAbort(signal);next=performance.now()+8;
 };
}
const MiB=1024**2;
const SHADER=`
struct Shape{nodes:u32,edges:u32,nodeGroupsX:u32,edgeGroupsX:u32,tauScale:f32,sigmaScale:f32,theta:f32,padding:f32}
struct Edge{low:u32,high:u32,floor:f32,weight:f32,fidelity:f32,wanted:f32}
@group(0) @binding(0) var<storage,read> nodes:array<vec2<f32>>;
@group(0) @binding(1) var<storage,read> offsets:array<u32>;
@group(0) @binding(2) var<storage,read> adjacency:array<u32>;
@group(0) @binding(3) var<storage,read> edges:array<Edge>;
@group(0) @binding(4) var<storage,read_write> dual:array<f32>;
@group(0) @binding(5) var<storage,read_write> state:array<vec2<f32>>;
@group(0) @binding(6) var<uniform> shape:Shape;
@compute @workgroup_size(256)
fn dualStep(@builtin(global_invocation_id) id:vec3<u32>){
 let k=id.x+id.y*shape.edgeGroupsX*256u;if(k>=shape.edges){return;}
 let e=edges[k];let sigma=0.495*shape.sigmaScale;
 let u=dual[k]+sigma*(state[e.high].y-state[e.low].y);
 let a=e.fidelity+sigma;let b=e.fidelity*(e.wanted-e.floor)+u-sigma*e.floor;
 let root=sqrt(b*b+4.0*a*e.weight);
 var slack=2.0*e.weight/(root-b);
 if(b>=0.0){slack=(b+root)/(2.0*a);}
 dual[k]=u-sigma*(e.floor+slack);
}
fn nodeProx(v:f32,eta:f32)->f32{
 var y=clamp(v,0.0000001,0.9999999);
 if(v<=0.0){y=clamp(2.0*eta/(sqrt(v*v+4.0*eta)-v),0.0000001,0.9999999);}
 if(v>=1.0){let w=1.0-v;y=clamp(1.0-2.0*eta/(sqrt(w*w+4.0*eta)-w),0.0000001,0.9999999);}
 var low=0.0000001;var high=0.9999999;
 for(var iteration=0u;iteration<12u;iteration++){
  let value=y-v-eta/y+eta/(1.0-y);
  if(abs(value)<0.0000001){break;}
  if(value>0.0){high=y;}else{low=y;}
  let derivative=1.0+eta/(y*y)+eta/((1.0-y)*(1.0-y));
  var next=y-value/derivative;
  if(!(next>low&&next<high)){next=0.5*(low+high);}y=next;
 }
 return clamp(y,0.0000001,0.9999999);
}
@compute @workgroup_size(256)
fn primalStep(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x+id.y*shape.nodeGroupsX*256u;if(i>=shape.nodes){return;}
 var force=0.0;
 for(var a=offsets[i];a<offsets[i+1u];a++){let code=adjacency[a];let value=dual[code>>1u];force+=select(-value,value,(code&1u)!=0u);}
 let old=state[i].x;let tau=nodes[i].y*shape.tauScale;
 let next=nodeProx(old-tau*force,tau*nodes[i].x);
 state[i]=vec2<f32>(next,next+shape.theta*(next-old));
}
`;

// Buffers are allocated and financed by the caller. Stable ties match TypedArray
// comparison sorting of the original ascending node identifiers exactly.
export async function nativeTargetOrder(p,order,histogram,cooperate=createCooperator()){
 const levels=p.nativeLevels,n=p.levels.length;
 requireValue(levels instanceof Uint16Array&&levels.length===n&&order instanceof Uint32Array&&order.length===n&&histogram instanceof Uint32Array&&histogram.length===65537,'Native16 target order buffers required.');
 await cooperate();histogram.fill(0);
 for(let i=0;i<n;i++){requireValue(p.levels[i]===levels[i]/65535,'Native16 levels disagree with the prepared target graph.');histogram[levels[i]+1]++;if((i&8191)===0)await cooperate();}
 for(let value=0;value<65536;value++){histogram[value+1]+=histogram[value];if((value&8191)===0)await cooperate();}
 for(let i=0;i<n;i++){order[histogram[levels[i]]++]=i;if((i&8191)===0)await cooperate();}
 await cooperate();return order;
}

export function targetGpuPlan(n,e,limits,batch=128,packIndices=false,nativeOrder=false,captureDual=true,computeGradient=true,uploadDual=true){
 requireValue(Number.isSafeInteger(n)&&n>0&&n<2**31&&Number.isSafeInteger(e)&&e>0&&e<2**30,'Valid nonconstant target graph required.');
 const packedIndices=packIndices&&n<=65536,edgeWords=packedIndices?5:6;
 const uniformStride=256,uniformBytes=batch*uniformStride,storageBytes=Math.max(n*8,(n+1)*4,e*8,e*edgeWords*4,e*4),readBytes=n*8+(captureDual?e*4:0),bufferBytes=Math.max(storageBytes,readBytes,uniformBytes);
 if(limits&&(storageBytes>limits.maxStorageBufferBindingSize||bufferBytes>limits.maxBufferSize||limits.maxComputeInvocationsPerWorkgroup<256||limits.maxComputeWorkgroupSizeX<256||limits.maxStorageBuffersPerShaderStage<6))throw new EngineError('GPU_LIMIT','Sherloq target graph exceeds GPU limits.');
 const gpuBytes=n*28+e*((packedIndices?32:36)+(captureDual?4:0))+4+uniformBytes;
 // Upload arrays/CSR cursor/order and mapping; initializer mode needs weights
 // but no retained fidelity/contrast/gradient certificate arrays.
 const nativeOrderBytes=nativeOrder?65537*4:0,hostBytes=n*(computeGradient?52:44)+e*((packedIndices?56:60)+(captureDual?4:0)-(computeGradient?0:16)-(uploadDual?0:4))+8+uniformBytes+nativeOrderBytes;
 return{nodes:n,edges:e,packedIndices,edgeWords,nativeOrder,nativeOrderBytes,captureDual,computeGradient,uploadDual,storageBytes,bufferBytes,readBytes,uniformStride,uniformBytes,gpuBytes,hostBytes,workspaceBytes:gpuBytes+hostBytes};
}

export async function certifyTarget7c(p,z,weights,fidelity,wanted,{signal,scratch,repair=true,initialGuard=1e-7,computeGradient=true}={}){
 const n=p.levels.length,E=p.low.length,N=p.width*p.height,cooperate=createCooperator(signal),force=scratch.force;if(computeGradient)force.fill(0);
 if(repair){
  const {order,upper,ptr,adj}=scratch,epsilon=initialGuard,margin=Math.min(1e-7,.05/n);
  upper.fill(1-epsilon);
  for(let k=n-1;k>=0;k--){if((k&8191)===0)await cooperate();const i=order[k];for(let a=ptr[i];a<ptr[i+1];a++){const code=adj[a];if(!(code&1))continue;const e=code>>>1;upper[p.low[e]]=Math.min(upper[p.low[e]],upper[i]-.101*p.difference[e]-margin);}}
  for(let i=0;i<n;i++){if(!Number.isFinite(z[i]))throw new EngineError('GPU_FAILED','Nonfinite Sherloq GPU target.');z[i]=Math.max(epsilon,Math.min(upper[i],z[i]));}
  for(let k=0;k<n;k++){if((k&8191)===0)await cooperate();const i=order[k];for(let a=ptr[i];a<ptr[i+1];a++){const code=adj[a];if(code&1)continue;const e=code>>>1,j=p.high[e];z[j]=Math.max(z[j],z[i]+.101*p.difference[e]+margin);}}
 }
 let objective=0,minMargin=Infinity,minOutput=Infinity,maxOutput=-Infinity;
 for(let i=0;i<n;i++){
  if((i&8191)===0)await cooperate();const area=p.counts[i]/N,y=z[i];
  minOutput=Math.min(minOutput,y);maxOutput=Math.max(maxOutput,y);
  if(!(y>0&&y<1))return{feasible:false,rmsErrorBound:Infinity,maxErrorBound:Infinity};
  if(!computeGradient)continue;
  force[i]=.1*area*(-1/y+1/(1-y));objective-=.1*area*(Math.log(y)+Math.log1p(-y));
 }
 for(let e=0;e<E;e++){
  if((e&8191)===0)await cooperate();const l=p.low[e],h=p.high[e],d=z[h]-z[l],slack=d-.1*p.difference[e];minMargin=Math.min(minMargin,slack);
  if(!(slack>0))return{feasible:false,rmsErrorBound:Infinity,maxErrorBound:Infinity,minimumConstraintMargin:minMargin};
  if(!computeGradient)continue;
  const error=d-wanted[e],f=-weights[e]/slack+fidelity[e]*error;force[l]-=f;force[h]+=f;objective+=-weights[e]*Math.log(slack)+.5*fidelity[e]*error*error;
 }
 if(!computeGradient)return{feasible:true,certificateKind:'strict-feasibility-only',rmsErrorBound:Infinity,maxErrorBound:Infinity,minimumConstraintMargin:minMargin,minimumOutput:minOutput,maximumOutput:maxOutput};
 let norm=0,maxBound=0,linearBound=0;for(let i=0;i<n;i++){
  const area=p.counts[i]/N,y=z[i];norm+=force[i]*force[i]/area;
  const linear=Math.abs(force[i])/(.8*area),s=-1/y+1/(1-y)-force[i]/(.1*area),h=Math.hypot(s,2),inverse=s>=0?1-2/(2+s+h):2/(2-s+h);
  maxBound=Math.max(maxBound,Math.min(linear,Math.abs(y-inverse)+64*Number.EPSILON));linearBound=Math.max(linearBound,linear);
 }
 return{feasible:true,objective,rmsErrorBound:Math.sqrt(norm)/.8,maxErrorBound:maxBound,linearMaxErrorBound:linearBound,minimumConstraintMargin:minMargin,minimumOutput:minOutput,maximumOutput:maxOutput};
}

export class Sherloq7cTargetGpu extends Sherloq7cProjectionGpu{
 constructor(budget){super(budget);this.gpuLabel='sherloq7c-target';}
 async prepareTarget(plan,signal){
  if(!this.device)await openOwnedGpuDevice(this,signal,adapter=>{targetGpuPlan(plan.nodes,plan.edges,adapter.limits,plan.uniformBytes/256,plan.packedIndices,plan.nativeOrder,plan.captureDual,plan.computeGradient,plan.uploadDual);return{maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,Math.max(128*MiB,plan.storageBytes)),maxBufferSize:Math.min(adapter.limits.maxBufferSize,Math.max(256*MiB,plan.bufferBytes))};});
  targetGpuPlan(plan.nodes,plan.edges,this.device.limits,plan.uniformBytes/256,plan.packedIndices,plan.nativeOrder,plan.captureDual,plan.computeGradient,plan.uploadDual);if(this.program?.packedIndices===plan.packedIndices)return this.program;if(this.program)await this.retirePipelines();
  const free=gpuOwnerReserve(this,4*MiB);this.orphanPipelineFees.add(free);const device=this.device,api=fn=>gpuOwnerSync(this,fn,signal),asyncApi=fn=>gpuOwnerAsync(this,fn,signal);
  const code=plan.packedIndices?SHADER.replace('struct Edge{low:u32,high:u32,','struct Edge{pair:u32,').replace('let e=edges[k];','let e=edges[k];let low=e.pair&65535u;let high=e.pair>>16u;').replaceAll('e.low','low').replaceAll('e.high','high'):SHADER;
  const module=api(()=>device.createShaderModule({code})),info=await asyncApi(()=>module.getCompilationInfo());
  if(info.messages.some(m=>m.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n')));
  const layout=api(()=>device.createBindGroupLayout({entries:Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===6?'uniform':binding>=4?'storage':'read-only-storage',...(binding===6?{hasDynamicOffset:true,minBindingSize:32}:{})}}))})),pipelineLayout=api(()=>device.createPipelineLayout({bindGroupLayouts:[layout]}));
  const dual=await asyncApi(()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'dualStep'}})),primal=await asyncApi(()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'primalStep'}}));
  checkAbort(signal);this.program={dual,primal,layout,free,kind:'target',packedIndices:plan.packedIndices};this.orphanPipelineFees.delete(free);return this.program;
 }
 async run(p,micro,{tolerance=1e-2,stopMetric='max',maxIterations=4096,batchIterations=128,accelerated=true,dualScale=1,initialGuard=1e-7,certificateMode='full',nativePacking=false,packIndices=false,captureDual=true,singleComputePass=false,initial,signal,onProgress,onSubmitted}={}){
  const n=p.levels?.length,E=p.low?.length,N=p.width*p.height;
  requireValue(p.levels instanceof Float64Array&&p.counts instanceof Float64Array&&p.low instanceof Uint32Array&&p.high instanceof Uint32Array&&p.difference instanceof Float64Array&&p.multiplicity instanceof Float64Array&&p.weakScale>0&&p.median>0,'A prepared native Sherloq target graph is required.');
  requireValue(p.nativeLevels===undefined||p.nativeLevels instanceof Uint16Array&&p.nativeLevels.length===n,'Invalid native16 target levels.');
  requireValue(micro>=0&&micro<=1&&tolerance>0&&['max','rms'].includes(stopMetric)&&Number.isInteger(maxIterations)&&maxIterations>0&&Number.isInteger(batchIterations)&&batchIterations>0&&batchIterations<=512&&dualScale>0&&dualScale<=1000,'Invalid target GPU controls.');
  requireValue(Number.isFinite(initialGuard)&&initialGuard>=1e-7&&initialGuard<=.01,'Invalid target GPU initialization guard.');
  requireValue(['full','initializer'].includes(certificateMode),'Invalid target GPU certificate mode.');
  requireValue(typeof nativePacking==='boolean','Invalid native GPU packing option.');
  requireValue(typeof captureDual==='boolean','Invalid target GPU dual capture flag.');
  requireValue(typeof singleComputePass==='boolean','Invalid target GPU compute pass control.');
  if(initial?.z)requireValue(initial.z instanceof Float64Array&&initial.z.length===n&&initial.z.every(Number.isFinite),'Invalid target GPU primal warm start.');
  if(initial?.dual)requireValue(initial.dual instanceof Float64Array&&initial.dual.length===E&&initial.dual.every(Number.isFinite),'Invalid target GPU dual warm start.');
  if(this.closed)throw new EngineError('DISPOSED','Sherloq target GPU closed.');if(this.busy)throw new EngineError('BUSY','Sherloq target GPU active.');
  const combined=AbortSignal.any([signal,this.life.signal].filter(Boolean));checkAbort(combined);this.busy=true;let finish;this.finished=new Promise(r=>finish=r);
  const plan=targetGpuPlan(n,E,undefined,batchIterations,packIndices,p.nativeLevels!==undefined,captureDual,certificateMode==='full',!!initial?.dual),cooperate=createCooperator(combined),started=performance.now(),fees=new Set(),owners=new Set();let record,result,failed=false,primary,abortFailure;
  const metrics={backend:'webgpu-target-pdhg-f32',micro,gain:Math.max(4*16**micro,(.5+7.5*micro)/(255*p.weakScale)),accelerated,dualScale,initialGuard,certificateMode,singleComputePass,iterations:0,readbacks:0,deferredCertificates:0,converged:false,compileMs:0,iterationAndReadbackMs:0,certificateMs:0,plan};
  const reserve=bytes=>{const free=gpuOwnerReserve(this,bytes);fees.add(free);return free;};
  const allocate=(Type,length,label)=>{let array;try{array=allocateTypedArray(Type,length,{label});}catch(e){throw gpuOwnerFailure(this,e);}const owner={bytes:array.byteLength,release:this.budget.registerBacking?.('array-buffer',array.byteLength,{owner:'sherloq7c',label,identity:array.buffer})};owners.add(owner);return{array,owner};};
  const abort=()=>{if(this.device&&!this.deviceDestroyed)try{gpuOwnerSync(this,()=>this.device.destroy());this.deviceDestroyed=true;this.retirementNeeded=true;}catch(e){abortFailure=e;}};combined.addEventListener('abort',abort,{once:true});
  try{
   if(this.pending.size||this.retirementNeeded||this.device&&(this.lost||plan.storageBytes>this.device.limits.maxStorageBufferBindingSize||plan.bufferBytes>this.device.limits.maxBufferSize))await retireOwnedGpuDevice(this);
   record=gpuTransaction(this);record.workspace=async()=>{let error;for(const owner of [...owners])try{const bytes=await owner.release?.();owners.delete(owner);if(bytes!==0)this.budget.notifyBackingRelease?.('array-buffer',bytes??owner.bytes);}catch(e){error??=e;}if(error)throw error;for(const free of [...fees])try{await free();fees.delete(free);}catch(e){error??=e;}if(error)throw error;};reserve(plan.workspaceBytes);
   const {array:node}=allocate(Float32Array,n*2,'Sherloq GPU target nodes'),{array:ptr}=allocate(Uint32Array,n+1,'Sherloq target CSR'),{array:adj}=allocate(Uint32Array,E*2,'Sherloq target adjacency'),{array:edges}=allocate(Uint32Array,E*plan.edgeWords,'Sherloq target edge data'),ef=new Float32Array(edges.buffer),{array:states}=allocate(Float32Array,n*2,'Sherloq target initial'),{array:w}=allocate(Float64Array,E,'Sherloq target exact weights');
   // Initializer-only publication checks strict feasibility, not the gradient.
   // Fidelity/contrast are consumed directly during upload; only full certificates
   // require retained binary64 copies. GPU data and all arithmetic stay identical.
   // Fresh WebGPU buffers are initialized to zero. With no dual warm start,
   // an all-zero host array and upload duplicate that guaranteed initialization.
   const lambda=plan.uploadDual?allocate(Float32Array,E,'Sherloq target dual initial').array:null;
   const c=plan.computeGradient?allocate(Float64Array,E,'Sherloq target exact fidelity').array:null,wanted=plan.computeGradient?allocate(Float64Array,E,'Sherloq target exact contrast').array:null;
   const {array:order}=allocate(Uint32Array,n,'Sherloq target level order');
   let strong=Infinity,nativePacked=false;metrics.packingBackend='js';
   // Native packing preserves the cold initializer data byte for byte.
   // Warm starts, dual capture and full-gradient work keep the established JS.
   if(nativePacking&&certificateMode==='initializer'&&!captureDual&&p.nativeLevels&&!initial?.z&&!initial?.dual){
    const packed=await tryNativeGpuPack(p,{node,ptr,adj,edges,states,w,order},{gain:metrics.gain,dualScale,packedIndices:plan.packedIndices,signal:combined,reserveHeap:bytes=>{const free=reserve(bytes);return async()=>{await free();fees.delete(free);};}});
    if(packed.accepted){strong=packed.stats.strong;metrics.nativePacking=packed.stats;metrics.packingBackend='wasm-f64';nativePacked=true;}
    else metrics.nativePackingFallback=packed.fallback;
   }
   if(!nativePacked){
   let weightSum=0;for(let e=0;e<E;e++){if((e&8191)===0)await cooperate();requireValue(p.low[e]<n&&p.high[e]<n&&p.difference[e]>0&&Number.isFinite(p.difference[e])&&p.multiplicity[e]>0&&Number.isFinite(p.multiplicity[e]),'Invalid target graph edge.');w[e]=p.multiplicity[e]*Math.sqrt(p.difference[e]/(p.difference[e]+p.median));weightSum+=w[e];}
   for(let e=0;e<E;e++){if((e&8191)===0)await cooperate();w[e]/=weightSum;const d=p.difference[e],t=metrics.gain*d/(1+(metrics.gain-1)*d);const fidelity=20*w[e]/(1+(d/(8*p.weakScale))**4)/(t*t);if(plan.computeGradient){wanted[e]=t;c[e]=fidelity;}const at=plan.edgeWords*e,offset=plan.packedIndices?1:2;if(plan.packedIndices)edges[at]=p.low[e]|(p.high[e]<<16);else{edges[at]=p.low[e];edges[at+1]=p.high[e];}ef[at+offset]=.1*d;ef[at+offset+1]=N*w[e];ef[at+offset+2]=N*fidelity;ef[at+offset+3]=t;ptr[p.low[e]+1]++;ptr[p.high[e]+1]++;if(lambda)lambda[e]=initial?.dual?.[e]??0;}
   if(plan.nativeOrder){const {array:histogram}=allocate(Uint32Array,65537,'Sherloq target native16 order histogram');await nativeTargetOrder(p,order,histogram,cooperate);}
   else{for(let i=0;i<n;i++)order[i]=i;order.sort((a,b)=>p.levels[a]-p.levels[b]);}
   let rank=-1,prior=-1,unique=0;for(const i of order)if(p.levels[i]!==prior){prior=p.levels[i];unique++;}prior=-1;strong=Infinity;
   for(const i of order){if(p.levels[i]!==prior){prior=p.levels[i];rank++;}const value=initial?.z?.[i]??(.1*p.levels[i]+.9*(.01+.98*rank/(unique-1)));states[2*i]=states[2*i+1]=value;}
   for(let i=0;i<n;i++){requireValue(p.counts[i]>0&&Number.isFinite(p.counts[i]),'Invalid target component area.');const degree=ptr[i+1];ptr[i+1]+=ptr[i];node[2*i]=.1*p.counts[i];node[2*i+1]=.99/(dualScale*Math.max(degree,1));strong=Math.min(strong,.8*p.counts[i]*node[2*i+1]);}
   const {array:cursor}=allocate(Uint32Array,n+1,'Sherloq target CSR cursor');cursor.set(ptr);for(let e=0;e<E;e++){if((e&8191)===0)await cooperate();adj[cursor[p.low[e]]++]=2*e;adj[cursor[p.high[e]]++]=2*e+1;}
   }
   const force=plan.computeGradient?allocate(Float64Array,n,'Sherloq target gradient').array:null;
   const {array:upper}=allocate(Float64Array,n,'Sherloq target repair'),{array:uniform}=allocate(Uint32Array,plan.uniformBytes/4,'Sherloq target iteration parameters'),uf=new Float32Array(uniform.buffer);
   record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'sherloq7c',label:'sherloq7c-target'});let at=performance.now();const program=await this.prepareTarget(plan,combined);metrics.compileMs=performance.now()-at;record.device=this.device;const device=this.device,api=fn=>gpuOwnerSync(this,fn,combined),asyncApi=fn=>gpuOwnerAsync(this,fn,combined);
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const make=(bytes,usage,label)=>{const buffer=api(()=>device.createBuffer({size:Math.max(4,bytes),usage,label})),entry={bytes:Math.max(4,bytes),destroyed:false,release:this.budget.registerBacking?.('gpu',Math.max(4,bytes),{owner:'sherloq7c',label,identity:buffer})};record.buffers.set(buffer,entry);return buffer;};
   const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,buffers=[make(node.byteLength,storage,'sherloq-target-nodes'),make(ptr.byteLength,storage,'sherloq-target-offsets'),make(adj.byteLength,storage,'sherloq-target-adjacency'),make(edges.byteLength,storage,'sherloq-target-edges'),make(E*4,storage|GPUBufferUsage.COPY_SRC,'sherloq-target-dual'),make(states.byteLength,storage|GPUBufferUsage.COPY_SRC,'sherloq-target-state'),make(plan.uniformBytes,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'sherloq-target-schedule')],read=make(plan.readBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'sherloq-target-readback');
   const bind=api(()=>device.createBindGroup({layout:program.layout,entries:buffers.map((buffer,binding)=>({binding,resource:{buffer,...(binding===6?{size:32}:{})}}))}));
   api(()=>{for(const [i,a]of [node,ptr,adj,edges,lambda,states].entries())if(a)device.queue.writeBuffer(buffers[i],0,a);});
   const nx=Math.min(Math.ceil(n/256),device.limits.maxComputeWorkgroupsPerDimension),ny=Math.ceil(Math.ceil(n/256)/nx),ex=Math.min(Math.ceil(E/256),device.limits.maxComputeWorkgroupsPerDimension),ey=Math.ceil(Math.ceil(E/256)/ex);
   requireValue(ny<=device.limits.maxComputeWorkgroupsPerDimension&&ey<=device.limits.maxComputeWorkgroupsPerDimension,'Target dispatch grid exceeds GPU limits.');
   record.outputFree=gpuOwnerReserve(this,n*8+(captureDual?E*8:0));const {array:z,owner:zo}=allocate(Float64Array,n,'Sherloq GPU target result');let dual=null,lo=null;if(captureDual){const allocated=allocate(Float64Array,E,'Sherloq GPU target dual');dual=allocated.array;lo=allocated.owner;}let tauScale=1,sigmaScale=dualScale;
   for(let done=0;done<maxIterations;){
    await cooperate();checkAbort(combined);at=performance.now();const count=Math.min(batchIterations,maxIterations-done);
    for(let k=0;k<count;k++){const base=k*64,theta=accelerated?1/Math.sqrt(1+2*strong*tauScale):1;uniform[base]=n;uniform[base+1]=E;uniform[base+2]=nx;uniform[base+3]=ex;uf[base+4]=tauScale;uf[base+5]=sigmaScale;uf[base+6]=theta;tauScale*=theta;sigmaScale/=theta;}
    api(()=>device.queue.writeBuffer(buffers[6],0,uniform.buffer,0,count*256));const encoder=api(()=>device.createCommandEncoder());
    api(()=>{
     if(singleComputePass){
      // Dispatch boundaries retain the dual→primal and primal→dual ordering.
      // Dynamic uniforms remain distinct; only redundant pass boundaries go away.
      const pass=encoder.beginComputePass();
      for(let k=0;k<count;k++){pass.setPipeline(program.dual);pass.setBindGroup(0,bind,[k*256]);pass.dispatchWorkgroups(ex,ey);pass.setPipeline(program.primal);pass.dispatchWorkgroups(nx,ny);}
      pass.end();
     }else for(let k=0;k<count;k++){const offset=[k*256],a=encoder.beginComputePass();a.setPipeline(program.dual);a.setBindGroup(0,bind,offset);a.dispatchWorkgroups(ex,ey);a.end();const b=encoder.beginComputePass();b.setPipeline(program.primal);b.setBindGroup(0,bind,offset);b.dispatchWorkgroups(nx,ny);b.end();}
     encoder.copyBufferToBuffer(buffers[5],0,read,0,n*8);if(captureDual)encoder.copyBufferToBuffer(buffers[4],0,read,n*8,E*4);
    });
    record.drained=false;api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.({iterations:done+count});await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};const mapped=api(()=>read.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',plan.readBytes,{owner:'sherloq7c',label:'sherloq-target-map',identity:mapped});const f=new Float32Array(mapped);for(let i=0;i<n;i++)z[i]=f[2*i];if(captureDual)for(let e=0;e<E;e++)dual[e]=f[2*n+e];api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;record.drained=true;
    done+=count;metrics.iterations=done;metrics.readbacks++;metrics.iterationAndReadbackMs+=performance.now()-at;
    // Initializer checkpoints publish no scientific result. Repairing the host
    // readback never changes resident GPU state, so do that work exactly once,
    // after the last batch. The readback/ACK above still bounds cancellation.
    if(certificateMode==='initializer'&&done<maxIterations){metrics.deferredCertificates++;onProgress?.({phase:'sherloq-target-gpu',micro,iterations:done,certificate:null,certificateDeferred:true});continue;}
    at=performance.now();const certificate=await certifyTarget7c(p,z,w,c,wanted,{signal:combined,scratch:{force,upper,order,ptr,adj},initialGuard,computeGradient:certificateMode==='full'});metrics.certificateMs+=performance.now()-at;metrics.certificate=certificate;onProgress?.({phase:'sherloq-target-gpu',micro,iterations:done,certificate});
    if(certificate.feasible&&certificate[stopMetric==='max'?'maxErrorBound':'rmsErrorBound']<=tolerance){metrics.converged=true;break;}
   }
   while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}checkAbort(combined);if(this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Sherloq target GPU device lost before publication.'));
   result=ownGpuArrays({z,dual},record.outputFree,lo?[zo,lo]:[zo],this.budget,{metrics},this.pendingResults);owners.delete(zo);if(lo)owners.delete(lo);record.outputFree=null;
  }catch(e){failed=true;primary=e;if(gpuOwnerMayFallback(this,e))this.retirementNeeded=true;}
  finally{
   try{if(record)await retireGpuTransaction(this,record);}catch(e){this.retirementNeeded=true;if(failed)attachGpuCleanup(primary,e);else{failed=true;primary=e;}}
   if(failed&&this.retirementNeeded)try{await retireOwnedGpuDevice(this);}catch(e){attachGpuCleanup(primary,e);}
   if(failed&&result)try{await result.release();}catch(e){attachGpuCleanup(primary,e);}
   if(abortFailure){if(failed)attachGpuCleanup(primary,abortFailure);else{failed=true;primary=abortFailure;}}combined.removeEventListener('abort',abort);this.busy=false;finish();metrics.totalMs=performance.now()-started;
  }
  if(failed)throw primary;return result;
 }
}
