import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {initializeGpuOwner,gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,openOwnedGpuDevice,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {allocateTypedArray} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';

const MiB=1024**2;
const F32_CODE=`
struct Shape { nodes:u32, edges:u32, nodeGroupsX:u32, edgeGroupsX:u32, tauScale:f32, sigmaScale:f32, theta:f32, padding:f32 }
struct Edge { low:u32, high:u32, floor:f32, sigma:f32 }
@group(0) @binding(0) var<storage,read> metadata:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read> rowptr:array<u32>;
@group(0) @binding(2) var<storage,read> adjacency:array<u32>;
@group(0) @binding(3) var<storage,read> edge:array<Edge>;
@group(0) @binding(4) var<storage,read_write> dual:array<f32>;
@group(0) @binding(5) var<storage,read_write> state:array<vec2<f32>>;
@group(0) @binding(6) var<uniform> shape:Shape;
@compute @workgroup_size(256)
fn dualStep(@builtin(global_invocation_id) id:vec3<u32>){
 let e=id.x+id.y*shape.edgeGroupsX*256u;if(e>=shape.edges){return;}
 let v=edge[e];let difference=state[v.high].y-state[v.low].y;
 dual[e]=max(0.0,dual[e]+v.sigma*shape.sigmaScale*(v.floor-difference));
}
@compute @workgroup_size(256)
fn primalStep(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x+id.y*shape.nodeGroupsX*256u;if(i>=shape.nodes){return;}
 let m=metadata[i];let old=state[i].x;
 if(m.w>=0.0){state[i]=vec2<f32>(m.w);return;}
 var force=0.0;
 for(var a=rowptr[i];a<rowptr[i+1u];a++){
  let code=adjacency[a];let value=dual[code>>1u];
  force+=select(-value,value,(code&1u)!=0u);
 }
 let tau=m.z*shape.tauScale;
 var next=clamp((old+tau*(m.y*m.x+force))/(1.0+tau*m.y),0.0,1.0);
 if(m.w>=0.0){next=m.w;}
 state[i]=vec2<f32>(next,next+shape.theta*(next-old));
}
`;

// Reuse the arithmetic construction exercised by the existing native-graph
// Fourier/Noisesniffer kernels. This changes solver arithmetic, not its QP.
const PAIR_CODE=`
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2<f32>{let s=a32(a,b);let v=s32(s,a);let e=a32(s32(a,s32(s,v)),s32(b,v));return vec2<f32>(s,e);}
fn add(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn sub(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return add(a,-b);}
fn mul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
fn divide(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let q=a.x/b.x;let r=sub(a,mul(b,vec2<f32>(q,0.0)));return twoSum(q,a32(r.x,r.y)/b.x);}
fn less(a:vec2<f32>,b:vec2<f32>)->bool{return a.x<b.x||(a.x==b.x&&a.y<b.y);}
struct Shape { nodes:u32, edges:u32, nodeGroupsX:u32, edgeGroupsX:u32, tauScale:f32, sigmaScale:f32, theta:f32, padding:f32 }
struct Node { trial:vec2<f32>,count:vec2<f32>,tau:vec2<f32>,anchor:vec2<f32> }
struct Edge { low:u32, high:u32, floor:vec2<f32>, sigma:vec2<f32> }
@group(0) @binding(0) var<storage,read> metadata:array<Node>;
@group(0) @binding(1) var<storage,read> rowptr:array<u32>;
@group(0) @binding(2) var<storage,read> adjacency:array<u32>;
@group(0) @binding(3) var<storage,read> edge:array<Edge>;
@group(0) @binding(4) var<storage,read_write> dual:array<vec2<f32>>;
@group(0) @binding(5) var<storage,read_write> state:array<vec4<f32>>;
@group(0) @binding(6) var<uniform> shape:Shape;
@compute @workgroup_size(256)
fn dualStep(@builtin(global_invocation_id) id:vec3<u32>){
 let e=id.x+id.y*shape.edgeGroupsX*256u;if(e>=shape.edges){return;}
 let v=edge[e];let difference=sub(state[v.high].zw,state[v.low].zw);
 var next=add(dual[e],mul(mul(v.sigma,vec2<f32>(shape.sigmaScale,0.0)),sub(v.floor,difference)));
 if(less(next,vec2<f32>(0.0))){next=vec2<f32>(0.0);}dual[e]=next;
}
@compute @workgroup_size(256)
fn primalStep(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x+id.y*shape.nodeGroupsX*256u;if(i>=shape.nodes){return;}
 let m=metadata[i];let old=state[i].xy;
 if(m.anchor.x>=0.0){state[i]=vec4<f32>(m.anchor,m.anchor);return;}
 var force=vec2<f32>(0.0);
 for(var a=rowptr[i];a<rowptr[i+1u];a++){
  let code=adjacency[a];let value=dual[code>>1u];
  force=add(force,select(-value,value,(code&1u)!=0u));
 }
 let tau=mul(m.tau,vec2<f32>(shape.tauScale,0.0));
 var next=divide(add(old,mul(tau,add(mul(m.count,m.trial),force))),add(vec2<f32>(1.0,0.0),mul(tau,m.count)));
 if(less(next,vec2<f32>(0.0))){next=vec2<f32>(0.0);}
 if(less(vec2<f32>(1.0,0.0),next)){next=vec2<f32>(1.0,0.0);}
 if(m.anchor.x>=0.0){next=m.anchor;}
 state[i]=vec4<f32>(next,add(next,mul(vec2<f32>(shape.theta,0.0),sub(next,old))));
}
`;

export function projectionGpuPlan(nodes,edges,limits,precision='f32',batchIterations=128){
 requireValue(Number.isSafeInteger(nodes)&&nodes>0&&nodes<2**31&&Number.isSafeInteger(edges)&&edges>=0&&edges<2**30,'Invalid Sherloq graph dimensions.');
 requireValue(['f32','f32x2'].includes(precision),'Unsupported Sherloq GPU precision.');
 const paired=precision==='f32x2';
 const storageBytes=Math.max(nodes*(paired?32:16),(nodes+1)*4,edges*8,edges*(paired?24:16),edges*(paired?8:4),nodes*(paired?16:8),4);
 const readBytes=nodes*(paired?16:8)+edges*(paired?8:4),bufferBytes=Math.max(storageBytes,readBytes,256*batchIterations);
 const uniformStride=256,uniformBytes=uniformStride*batchIterations;
 const gpuBytes=nodes*(paired?68:36)+edges*(paired?48:32)+4+uniformBytes;
 // Packed host arrays + certificate scratch + returned binary64 z/dual.
 const hostBytes=nodes*(paired?92:60)+edges*(paired?48:32)+8+uniformBytes;
 if(limits&&(storageBytes>limits.maxStorageBufferBindingSize||bufferBytes>limits.maxBufferSize||limits.maxComputeInvocationsPerWorkgroup<256||limits.maxStorageBuffersPerShaderStage<6))throw new EngineError('GPU_LIMIT','Sherloq projection exceeds negotiated GPU limits.',{details:{storageBytes,bufferBytes}});
 return{nodes,edges,precision,storageBytes,bufferBytes,readBytes,uniformStride,uniformBytes,gpuBytes,hostBytes,workspaceBytes:gpuBytes+hostBytes};
}

/** A primal/dual certificate for the SAME anchored quadratic projection.
 * lambda >= 0 multiplies floor - Bz. Bounds and anchors are minimized exactly
 * in the separable dual; no float32 arithmetic is used in this check.
 */
export async function certifyProjection(prepared,trial,baseline,z,dual,{rho=.1,signal,repair=true,scratch}={}){
 const {levels,counts,low,high,difference}=prepared,n=levels.length,e=low.length,cooperate=createCooperator(signal);
 let minimum=Infinity,maximum=-Infinity,total=0;
 for(let i=0;i<n;i++){minimum=Math.min(minimum,levels[i]);maximum=Math.max(maximum,levels[i]);total+=counts[i];}
 const force=scratch?.force??new Float64Array(n);force.fill(0);let alpha=0,minFree=Infinity,anchors=0;
 for(let i=0;i<n;i++){
  if((i&8191)===0)await cooperate();
  if(!Number.isFinite(z[i]))throw new EngineError('GPU_FAILED','Nonfinite Sherloq projection value.');
  z[i]=Math.max(0,Math.min(1,z[i]));
  if(levels[i]===minimum||levels[i]===maximum){z[i]=baseline[i];anchors++;}else minFree=Math.min(minFree,counts[i]);
 }
 for(let k=0;k<e;k++){
  if((k&8191)===0)await cooperate();
  if(!Number.isFinite(dual[k]))throw new EngineError('GPU_FAILED','Nonfinite Sherloq dual multiplier.');
  dual[k]=Math.max(0,dual[k]);
  const slack=z[high[k]]-z[low[k]]-rho*difference[k];
  if(slack<0){const base=baseline[high[k]]-baseline[low[k]]-rho*difference[k];alpha=Math.max(alpha,-slack/(base-slack));}
 }
 let repairKind='none';
 if(repair&&alpha>0&&scratch?.order&&scratch?.upper&&scratch?.ptr&&scratch?.adj){
  const {upper,order,ptr,adj}=scratch;
  for(let i=0;i<n;i++)upper[i]=levels[i]===minimum?0:1;
  // A tiny outward rounding allowance changes no model constraint. It makes
  // the repaired point strictly feasible for the original uninflated floor.
  const guard=4*Number.EPSILON;
  for(let k=n-1;k>=0;k--){if((k&8191)===0)await cooperate();const i=order[k];for(let a=ptr[i];a<ptr[i+1];a++){const code=adj[a];if(!(code&1))continue;const edge=code>>>1,j=low[edge];upper[j]=Math.min(upper[j],upper[i]-rho*difference[edge]-guard);}}
  for(let i=0;i<n;i++){z[i]=Math.max(0,Math.min(upper[i],z[i]));if(levels[i]===minimum||levels[i]===maximum)z[i]=baseline[i];}
  for(let k=0;k<n;k++){if((k&8191)===0)await cooperate();const i=order[k];for(let a=ptr[i];a<ptr[i+1];a++){const code=adj[a];if(code&1)continue;const edge=code>>>1,j=high[edge];z[j]=Math.max(z[j],z[i]+rho*difference[edge]+guard);}}
  repairKind='dag-forward-backward';
 }else if(repair&&alpha>0){alpha=Math.min(1,alpha*1.0001+1e-12);for(let i=0;i<n;i++)z[i]=(1-alpha)*z[i]+alpha*baseline[i];repairKind='baseline-convex-combination';}
 let floorTerm=0,minMargin=Infinity;
 for(let k=0;k<e;k++){
  if((k&8191)===0)await cooperate();
  const a=low[k],b=high[k],lambda=dual[k],floor=rho*difference[k];
  force[a]-=lambda;force[b]+=lambda;floorTerm+=lambda*floor;
  minMargin=Math.min(minMargin,z[b]-z[a]-floor);
 }
 let primal=0,dualValue=floorTerm,arithmeticScale=1,minimumOutput=Infinity,maximumOutput=-Infinity;
 for(let i=0;i<n;i++){
  if((i&8191)===0)await cooperate();
  const anchored=levels[i]===minimum||levels[i]===maximum;
  const u=anchored?baseline[i]:Math.max(0,Math.min(1,trial[i]+force[i]/counts[i]));
  const p=.5*counts[i]*(z[i]-trial[i])**2,d=.5*counts[i]*(u-trial[i])**2-force[i]*u;
  primal+=p;dualValue+=d;arithmeticScale+=Math.abs(p)+Math.abs(d);
  minimumOutput=Math.min(minimumOutput,z[i]);maximumOutput=Math.max(maximumOutput,z[i]);
 }
 const rawGap=primal-dualValue,allowance=128*Number.EPSILON*(n+e+1)*arithmeticScale;
 const gap=Math.max(0,rawGap)+allowance;
 return{primal,dual:dualValue,rawGap,dualityGap:gap,arithmeticAllowance:allowance,
   rmsErrorBound:Math.sqrt(2*gap/total),maxErrorBound:minFree<Infinity?Math.sqrt(2*gap/minFree):0,
   feasibilityRepairFraction:repairKind==='baseline-convex-combination'?alpha:0,rawFeasibilityRepairFraction:alpha,repairKind,
   minimumConstraintMargin:minMargin,minimumOutput,maximumOutput,feasible:minMargin>=-2e-15&&minimumOutput>=0&&maximumOutput<=1,anchors,totalPixels:total};
}

export class Sherloq7cProjectionGpu {
 constructor(budget){requireValue(budget?.reserve,'Shared budget required.');initializeGpuOwner(this,budget,'sherloq7c-projection');this.program=null;this.life=new AbortController();this.finished=null;}
 mayFallback(error){return !this.retirementNeeded&&!this.pending.size&&gpuOwnerMayFallback(this,error);}
 async retirePipelines(){if(this.program){await this.program.free();this.program=null;}}
 async prepare(plan,signal){
  if(this.device&&this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Sherloq GPU device lost before preparation.'));
  if(!this.device)await openOwnedGpuDevice(this,signal,adapter=>{projectionGpuPlan(plan.nodes,plan.edges,adapter.limits,plan.precision,plan.uniformBytes/plan.uniformStride);return{maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,Math.max(128*MiB,plan.storageBytes)),maxBufferSize:Math.min(adapter.limits.maxBufferSize,Math.max(256*MiB,plan.bufferBytes))};});
  projectionGpuPlan(plan.nodes,plan.edges,this.device.limits,plan.precision,plan.uniformBytes/plan.uniformStride);if(this.program)return this.program;
  const free=gpuOwnerReserve(this,4*MiB);this.orphanPipelineFees.add(free);
  const device=this.device,module=gpuOwnerSync(this,()=>device.createShaderModule({code:plan.precision==='f32x2'?PAIR_CODE:F32_CODE}),signal),info=await gpuOwnerAsync(this,()=>module.getCompilationInfo(),signal);
  if(info.messages.some(m=>m.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n')));
  const layout=gpuOwnerSync(this,()=>device.createBindGroupLayout({entries:Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===6?'uniform':binding>=4?'storage':'read-only-storage',...(binding===6?{hasDynamicOffset:true,minBindingSize:32}:{})}}))}),signal);
  const pipelineLayout=gpuOwnerSync(this,()=>device.createPipelineLayout({bindGroupLayouts:[layout]}),signal);
  const dual=await gpuOwnerAsync(this,()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'dualStep'}}),signal);
  const primal=await gpuOwnerAsync(this,()=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'primalStep'}}),signal);
  checkAbort(signal);this.program={dual,primal,layout,free,precision:plan.precision};this.orphanPipelineFees.delete(free);return this.program;
 }
 async run(prepared,{trial,baseline,rho=.1,tolerance=1e-2,maxIterations=20000,batchIterations=128,stopMetric='max',precision='f32',accelerated=false,dualScale=1,initial,signal,onProgress,onSubmitted}={}){
  const {levels,counts,low,high,difference}=prepared,n=levels?.length,e=low?.length;
  requireValue(levels instanceof Float64Array&&counts instanceof Float64Array&&low instanceof Uint32Array&&high instanceof Uint32Array&&difference instanceof Float64Array&&counts.length===n&&high.length===e&&difference.length===e&&trial instanceof Float64Array&&baseline instanceof Float64Array&&trial.length===n&&baseline.length===n,'Prepared binary64 graph, trial and baseline required.');
  requireValue(rho>0&&rho<1&&tolerance>0&&Number.isInteger(maxIterations)&&maxIterations>0&&Number.isInteger(batchIterations)&&batchIterations>0&&batchIterations<=512&&['max','rms'].includes(stopMetric),'Invalid projection solver controls.');
  if(initial?.z)requireValue(initial.z instanceof Float64Array&&initial.z.length===n&&initial.z.every(Number.isFinite),'Invalid projection primal warm start.');
  if(initial?.dual)requireValue(initial.dual instanceof Float64Array&&initial.dual.length===e&&initial.dual.every(Number.isFinite),'Invalid projection dual warm start.');
  if(this.closed)throw new EngineError('DISPOSED','Sherloq GPU closed.');if(this.busy)throw new EngineError('BUSY','Sherloq GPU active.');
  requireValue(Number.isFinite(dualScale)&&dualScale>0&&dualScale<=1000,'Invalid PDHG dual step scale.');
  const combined=AbortSignal.any([signal,this.life.signal].filter(Boolean));checkAbort(combined);const plan=projectionGpuPlan(n,e,undefined,precision,batchIterations),paired=precision==='f32x2',started=performance.now(),cooperate=createCooperator(combined);
  this.busy=true;let finish;this.finished=new Promise(r=>finish=r);
  let record,result,failed=false,primary;const hostOwners=new Set(),fees=new Set();
  const metrics={backend:'webgpu-pdhg-'+precision+'-cpu-f64-certificate',precision:precision+' iteration / f64 validation',accelerated,dualScale,iterations:0,dispatches:0,readbacks:0,compileMs:0,uploadMs:0,iterationAndReadbackMs:0,certificateMs:0,requestedTolerance:tolerance,stopMetric,converged:false,plan};
  const reserve=bytes=>{const free=gpuOwnerReserve(this,bytes);fees.add(free);return async()=>{await free();fees.delete(free);};};
  const allocate=(Type,count,label)=>{let array;try{array=allocateTypedArray(Type,count,{label});}catch(error){throw gpuOwnerFailure(this,error);}const owner={bytes:array.byteLength,release:this.budget.registerBacking?.('array-buffer',array.byteLength,{owner:'sherloq7c',label,identity:array.buffer})};hostOwners.add(owner);return{array,owner};};
  let abortedDevice=false,abortFailure;const abortDevice=()=>{if(this.device&&!this.deviceDestroyed)try{gpuOwnerSync(this,()=>this.device.destroy());this.deviceDestroyed=true;this.retirementNeeded=true;abortedDevice=true;}catch(error){abortFailure=error;}};combined.addEventListener('abort',abortDevice,{once:true});
  try{
   if(this.pending.size||this.retirementNeeded||this.device&&(this.lost||plan.storageBytes>this.device.limits.maxStorageBufferBindingSize||plan.bufferBytes>this.device.limits.maxBufferSize))await retireOwnedGpuDevice(this);
   if(this.program&&this.program.precision!==precision)await this.retirePipelines();
   record=gpuTransaction(this);record.workspace=async()=>{let failure;for(const owner of [...hostOwners])try{const bytes=await owner.release?.();hostOwners.delete(owner);if(bytes!==0)this.budget.notifyBackingRelease?.('array-buffer',bytes??owner.bytes);}catch(error){failure??=error;}if(failure)throw failure;for(const free of [...fees])try{await free();}catch(error){failure??=error;}if(failure)throw failure;};
   reserve(plan.workspaceBytes);let at=performance.now();
   const nodeStride=paired?8:4,edgeStride=paired?6:4,stateStride=paired?4:2,dualStride=paired?2:1;
   const {array:metadata}=allocate(Float32Array,n*nodeStride,'Sherloq GPU node metadata'),{array:ptr}=allocate(Uint32Array,n+1,'Sherloq GPU adjacency offsets'),{array:adj}=allocate(Uint32Array,e*2,'Sherloq GPU adjacency'),{array:edges}=allocate(Uint32Array,e*edgeStride,'Sherloq GPU edges'),edgeFloat=new Float32Array(edges.buffer),{array:states}=allocate(Float32Array,n*stateStride,'Sherloq GPU primal upload'),{array:dualUpload}=allocate(Float32Array,e*dualStride,'Sherloq GPU dual upload');
   const pair=(array,at,value)=>{array[at]=Math.fround(value);array[at+1]=Math.fround(value-array[at]);};
   let minimum=Infinity,maximum=-Infinity,strongConvexity=Infinity;for(let i=0;i<n;i++){minimum=Math.min(minimum,levels[i]);maximum=Math.max(maximum,levels[i]);}
   for(let k=0;k<e;k++){if((k&8191)===0)await cooperate();requireValue(low[k]<n&&high[k]<n&&difference[k]>0,'Invalid graph edge.');ptr[low[k]+1]++;ptr[high[k]+1]++;edges[edgeStride*k]=low[k];edges[edgeStride*k+1]=high[k];if(paired){pair(edgeFloat,edgeStride*k+2,rho*difference[k]);pair(edgeFloat,edgeStride*k+4,.495*dualScale);pair(dualUpload,k*2,Math.max(0,initial?.dual?.[k]??0));}else{edgeFloat[4*k+2]=rho*difference[k];edgeFloat[4*k+3]=.495*dualScale;dualUpload[k]=Math.max(0,initial?.dual?.[k]??0);}}
   for(let i=0;i<n;i++){if((i&8191)===0)await cooperate();requireValue(counts[i]>0&&Number.isFinite(counts[i])&&Number.isFinite(trial[i])&&Number.isFinite(baseline[i]),'Invalid graph node.');const degree=ptr[i+1];ptr[i+1]+=ptr[i];const anchor=levels[i]===minimum||levels[i]===maximum?baseline[i]:-1,value=anchor>=0?anchor:initial?.z?.[i]??baseline[i],tau=.99/(dualScale*Math.max(1,degree));if(anchor<0)strongConvexity=Math.min(strongConvexity,counts[i]*tau);if(paired){pair(metadata,8*i,trial[i]);pair(metadata,8*i+2,counts[i]);pair(metadata,8*i+4,tau);pair(metadata,8*i+6,anchor);pair(states,4*i,value);pair(states,4*i+2,value);}else{metadata[4*i]=trial[i];metadata[4*i+1]=counts[i];metadata[4*i+2]=tau;metadata[4*i+3]=anchor;states[2*i]=states[2*i+1]=value;}}
   const {array:cursor}=allocate(Uint32Array,n+1,'Sherloq GPU CSR construction cursor');cursor.set(ptr);for(let k=0;k<e;k++){if((k&8191)===0)await cooperate();adj[cursor[low[k]]++]=k*2;adj[cursor[high[k]]++]=k*2+1;}
   const {array:order}=allocate(Uint32Array,n,'Sherloq GPU topological repair order');for(let i=0;i<n;i++)order[i]=i;order.sort((a,b)=>levels[a]-levels[b]);
   const {array:force}=allocate(Float64Array,n,'Sherloq GPU certificate scratch'),{array:upper}=allocate(Float64Array,n,'Sherloq GPU feasibility scratch');
   const {array:uniforms}=allocate(Uint32Array,plan.uniformBytes/4,'Sherloq GPU iteration schedule'),uniformFloats=new Float32Array(uniforms.buffer);
   metrics.hostPreparationMs=performance.now()-at;
   record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal:combined,resourceOwner:'sherloq7c',label:'sherloq7c-projection'});
   at=performance.now();const program=await this.prepare(plan,combined);metrics.compileMs=performance.now()-at;record.device=this.device;const device=this.device,api=fn=>gpuOwnerSync(this,fn,combined),asyncApi=fn=>gpuOwnerAsync(this,fn,combined);
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const make=(size,usage,label)=>{const buffer=api(()=>device.createBuffer({size:Math.max(4,size),usage,label})),entry={bytes:Math.max(4,size),destroyed:false,release:null};record.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',entry.bytes,{owner:'sherloq7c',label,identity:buffer});return buffer;};
   const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST;
   const buffers=[make(metadata.byteLength,storage,'sherloq-node-data'),make(ptr.byteLength,storage,'sherloq-csr-offsets'),make(adj.byteLength,storage,'sherloq-csr-edges'),make(edges.byteLength,storage,'sherloq-edge-data'),make(dualUpload.byteLength,storage|GPUBufferUsage.COPY_SRC,'sherloq-duals'),make(states.byteLength,storage|GPUBufferUsage.COPY_SRC,'sherloq-primal-state'),make(plan.uniformBytes,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'sherloq-shape')];
   const read=make(plan.readBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'sherloq-projection-readback');
   const nodesX=Math.min(Math.ceil(n/256),device.limits.maxComputeWorkgroupsPerDimension),edgesX=Math.min(Math.max(1,Math.ceil(e/256)),device.limits.maxComputeWorkgroupsPerDimension),nodesY=Math.ceil(Math.ceil(n/256)/nodesX),edgesY=Math.ceil(Math.max(1,Math.ceil(e/256))/edgesX);
   requireValue(nodesY<=device.limits.maxComputeWorkgroupsPerDimension&&edgesY<=device.limits.maxComputeWorkgroupsPerDimension,'Sherloq projection dispatch grid exceeds limits.');
   requireValue(plan.uniformStride>=device.limits.minUniformBufferOffsetAlignment,'Unsupported GPU uniform alignment.');
   at=performance.now();api(()=>{for(const [buffer,array]of buffers.slice(0,6).map((b,i)=>[b,[metadata,ptr,adj,edges,dualUpload,states][i]]))device.queue.writeBuffer(buffer,0,array);});
   const bind=api(()=>device.createBindGroup({layout:program.layout,entries:buffers.map((buffer,binding)=>({binding,resource:{buffer,...(binding===6?{size:32}:{})}}))}));metrics.uploadMs=performance.now()-at;
   record.outputFree=gpuOwnerReserve(this,n*8+e*8);const {array:z,owner:zOwner}=allocate(Float64Array,n,'Sherloq projected nodes'),{array:dual,owner:dualOwner}=allocate(Float64Array,e,'Sherloq dual warm start');
   let tauScale=1,sigmaScale=1;strongConvexity=Number.isFinite(strongConvexity)?strongConvexity:1;metrics.strongConvexity=strongConvexity;
   for(let done=0;done<maxIterations;){
    await cooperate();checkAbort(combined);at=performance.now();const count=Math.min(batchIterations,maxIterations-done),encoder=api(()=>device.createCommandEncoder());
    for(let k=0;k<count;k++){const at=k*plan.uniformStride/4,theta=accelerated?1/Math.sqrt(1+2*strongConvexity*tauScale):1;uniforms[at]=n;uniforms[at+1]=e;uniforms[at+2]=nodesX;uniforms[at+3]=edgesX;uniformFloats[at+4]=tauScale;uniformFloats[at+5]=sigmaScale;uniformFloats[at+6]=theta;tauScale*=theta;sigmaScale/=theta;}
    api(()=>{device.queue.writeBuffer(buffers[6],0,uniforms.buffer,0,count*plan.uniformStride);for(let k=0;k<count;k++){const offsets=[k*plan.uniformStride];const a=encoder.beginComputePass();a.setPipeline(program.dual);a.setBindGroup(0,bind,offsets);a.dispatchWorkgroups(edgesX,edgesY);a.end();const b=encoder.beginComputePass();b.setPipeline(program.primal);b.setBindGroup(0,bind,offsets);b.dispatchWorkgroups(nodesX,nodesY);b.end();}encoder.copyBufferToBuffer(buffers[5],0,read,0,states.byteLength);encoder.copyBufferToBuffer(buffers[4],0,read,states.byteLength,dualUpload.byteLength);});
    record.drained=false;api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.({iterations:done+count});await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};const mapped=api(()=>read.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',plan.readBytes,{owner:'sherloq7c',label:'sherloq-projection-map',identity:mapped});const f=new Float32Array(mapped);
    for(let i=0;i<n;i++)z[i]=paired?f[4*i]+f[4*i+1]:f[2*i];for(let k=0;k<e;k++)dual[k]=paired?f[4*n+2*k]+f[4*n+2*k+1]:f[2*n+k];api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;record.drained=true;
    done+=count;metrics.iterations=done;metrics.dispatches+=count*2;metrics.readbacks++;metrics.iterationAndReadbackMs+=performance.now()-at;
    at=performance.now();const certificate=await certifyProjection(prepared,trial,baseline,z,dual,{rho,signal:combined,scratch:{force,upper,order,ptr,adj}});metrics.certificateMs+=performance.now()-at;metrics.certificate=certificate;
    onProgress?.({phase:'sherloq7c-projection',iterations:done,certificate});
    if(certificate.feasible&&certificate[stopMetric==='max'?'maxErrorBound':'rmsErrorBound']<=tolerance){metrics.converged=true;break;}
   }
   while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}checkAbort(combined);if(this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Sherloq GPU context lost.'));
   result=ownGpuArrays({z,dual},record.outputFree,[zOwner,dualOwner],this.budget,{metrics},this.pendingResults);hostOwners.delete(zOwner);hostOwners.delete(dualOwner);record.outputFree=null;
  }catch(error){failed=true;primary=error;if(gpuOwnerMayFallback(this,error))this.retirementNeeded=true;}
  finally{
   try{if(record)await retireGpuTransaction(this,record);}catch(error){this.retirementNeeded=true;if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
   if(failed&&this.retirementNeeded)try{await retireOwnedGpuDevice(this);}catch(error){attachGpuCleanup(primary,error);}
   if(failed&&result)try{await result.release();}catch(error){attachGpuCleanup(primary,error);}
   if(abortFailure){if(failed)attachGpuCleanup(primary,abortFailure);else{failed=true;primary=abortFailure;}}
   combined.removeEventListener('abort',abortDevice);this.busy=false;finish();metrics.totalMs=performance.now()-started;metrics.abortedDevice=abortedDevice;
  }
  if(failed)throw primary;return result;
 }
 async dispose(){this.closed=true;this.life.abort();await this.finished;return disposeGpuOwner(this);}
}

export async function project7cGpu(prepared,options={}){
 const provider=options.provider??new Sherloq7cProjectionGpu(options.budget);let result,failed=false,primary;
 try{result=await provider.run(prepared,options);}
 catch(error){failed=true;primary=error;}
 finally{if(!options.provider)try{await provider.dispose();}catch(error){if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}}
 if(failed){if(result)try{await result.release();}catch(error){attachGpuCleanup(primary,error);}throw primary;}return result;
}
