// Experimental overlapping-domain GPU initializer only. The full evolved
// interior is committed, retaining the frozen outer rows at each interface.
// Isolated equality pairs crossing the active boundary are frozen. The native Float64 objective, feasibility
// checks and final certificate remain authoritative. No E-sized arrays.
const MiB=1024**2,align4=x=>Math.ceil(x/4)*4;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const SHADER=`
struct Shape { width:u32, rows:u32, regularRootCount:u32, groupsX:u32,
 coreFirst:u32, coreEnd:u32, regularRootFirst:u32, globalHeight:u32,
 omega:f32, eta:f32, guard:f32, momentum:f32,
 largeRootFirst:u32, largeRootCount:u32, largeGroupsX:u32, padding2:u32 }
struct Terms { gradient:f32, diagonal:f32, down:f32, up:f32, equals:u32, neighbour:u32 }
@group(0) @binding(0) var<storage,read> levels:array<u32>;
@group(0) @binding(1) var<storage,read> coeff:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read> previous:array<f32>;
@group(0) @binding(3) var<storage,read_write> next:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
@group(0) @binding(5) var<storage,read> topology:array<vec2<u32>>;
@group(0) @binding(6) var<storage,read> members:array<u32>;
var<workgroup> partial:array<vec4<f32>,256>;
fn level(i:u32)->u32 { return (levels[i>>1u] >> ((i&1u)*16u)) & 65535u; }
fn state(i:u32)->f32 {let leader=topology[i].x;return previous[select(leader&0x7fffffffu,i,leader==0xffffffffu)];}
// Active singleton roots have no metadata. Other active roots own a two-word
// header in members. Nonroot topology.y is still the original linked chain.
fn componentArea(i:u32)->u32 {let componentMeta=topology[i].y;if(componentMeta==0xffffffffu){return 1u;}return members[componentMeta];}
fn firstMember(i:u32)->u32 {let componentMeta=topology[i].y;if(componentMeta==0xffffffffu){return 0xffffffffu;}return members[componentMeta+1u];}

fn terms(i:u32,y:f32)->Terms {
 let x=i%shape.width;let row=i/shape.width;
 let native=level(i);let lo=max(y,shape.guard);let hi=max(1.0-y,shape.guard);
 var gradient=0.0;var diagonal=0.0;
 var down=2.0*shape.eta*lo;var up=2.0*shape.eta*hi;var equals=0u;var equalNeighbour=i;
 for(var dy=-1;dy<=1;dy++){for(var dx=-1;dx<=1;dx++){
  if(dx==0&&dy==0){continue;}let xx=i32(x)+dx;let yy=i32(row)+dy;
  if(xx<0||yy<0||xx>=i32(shape.width)||yy>=i32(shape.rows)){continue;}
  let j=u32(yy)*shape.width+u32(xx);let other=level(j);
  if(other==native){equals++;equalNeighbour=j;continue;}
  let gap=max(native,other)-min(native,other);let c=coeff[gap];
  let multiplicity=select(1.0,0.7071067811865476,dx!=0&&dy!=0);
  let weight=c.y*multiplicity;let fidelity=c.z*multiplicity;
  let high=native>other;let delta=select(state(j)-y,y-state(j),high);
  let slack=delta-c.x;let safe=max(slack,1e-12);
  let force=-weight/safe+fidelity*(delta-c.w);
  gradient+=select(-force,force,high);diagonal+=weight/(safe*safe)+fidelity;
  let closing=shape.eta*max(0.0,slack-shape.guard);
  if(high){down=min(down,closing);}else{up=min(up,closing);}
 }}
 return Terms(gradient,diagonal,down,up,equals,equalNeighbour);
}
@compute @workgroup_size(256)
fn jacobi(@builtin(global_invocation_id) gid:vec3<u32>) {
 let slot=gid.x+gid.y*shape.groupsX*256u;if(slot>=shape.regularRootCount){return;}
 let i=members[shape.regularRootFirst-slot];let y=previous[i];
 var a=terms(i,y);let count=f32(componentArea(i));let lo=max(y,shape.guard);let hi=max(1.0-y,shape.guard);a.gradient+=.1*count*(-1.0/lo+1.0/hi);a.diagonal+=.1*count*(1.0/(lo*lo)+1.0/(hi*hi));var member=firstMember(i);
 loop {if(member==0xffffffffu){break;}let b=terms(member,y);a.gradient+=b.gradient;a.diagonal+=b.diagonal;a.down=min(a.down,b.down);a.up=min(a.up,b.up);member=topology[member].y;}
 let step=clamp(-shape.omega*a.gradient/a.diagonal+shape.momentum*(y-next[i]),-a.down,a.up);
 next[i]=clamp(y+step,shape.guard,1.0-shape.guard);
}
@compute @workgroup_size(256)
fn jacobiLarge(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) laneId:vec3<u32>){
 let groupIndex=group.x+group.y*shape.largeGroupsX;if(groupIndex>=shape.largeRootCount){return;}
 let i=members[shape.largeRootFirst+groupIndex];let lane=laneId.x;let y=state(i);let componentMeta=topology[i].y;let head=componentMeta+2u;let count=members[componentMeta+1u];
 var a=Terms(0.0,0.0,1e30,1e30,0u,i);if(lane==0u){a=terms(i,y);}
 for(var k=lane;k<count;k+=256u){let b=terms(members[head+k],y);a.gradient+=b.gradient;a.diagonal+=b.diagonal;a.down=min(a.down,b.down);a.up=min(a.up,b.up);}
 partial[lane]=vec4<f32>(a.gradient,a.diagonal,a.down,a.up);workgroupBarrier();
 for(var stride=128u;stride>0u;stride/=2u){if(lane<stride){let b=partial[lane+stride];let v=partial[lane];partial[lane]=vec4<f32>(v.x+b.x,v.y+b.y,min(v.z,b.z),min(v.w,b.w));}workgroupBarrier();}
 if(lane==0u){let v=partial[0];let area=f32(componentArea(i));let lo=max(y,shape.guard);let hi=max(1.0-y,shape.guard);let gradient=v.x+.1*area*(-1.0/lo+1.0/hi);let diagonal=v.y+.1*area*(1.0/(lo*lo)+1.0/(hi*hi));let down=min(v.z,2.0*shape.eta*lo);let up=min(v.w,2.0*shape.eta*hi);
  let step=clamp(-shape.omega*gradient/diagonal+shape.momentum*(y-next[i]),-down,up);next[i]=clamp(y+step,shape.guard,1.0-shape.guard);
 }
}
`;


// The regular shader and the WG256 reduction remain byte-for-byte original.
// Small long-row buckets keep the original lane assignment (stride256) and
// emulate all missing high reduction stages before the smaller shared tree.
const LARGE_WORKGROUPS=[32,64,128,256];
function largeShader(workgroup){
 if(workgroup===256)return SHADER;
 const neutral=`let neutral=vec4<f32>(bitcast<f32>(shape.padding2),bitcast<f32>(shape.padding2),bitcast<f32>(shape.globalHeight),bitcast<f32>(shape.globalHeight));
 var v=vec4<f32>(a.gradient,a.diagonal,a.down,a.up);
 for(var missing=128u;missing>=${workgroup}u;missing/=2u){v=vec4<f32>(v.x+neutral.x,v.y+neutral.y,min(v.z,neutral.z),min(v.w,neutral.w));}
 partial[lane]=v;workgroupBarrier();`;
 return SHADER.replace('partial:array<vec4<f32>,256>','partial:array<vec4<f32>,'+workgroup+'>')
 .replace('@compute @workgroup_size(256)\nfn jacobiLarge','@compute @workgroup_size('+workgroup+')\nfn jacobiLarge')
 .replace('partial[lane]=vec4<f32>(a.gradient,a.diagonal,a.down,a.up);workgroupBarrier();',neutral)
 .replace('for(var stride=128u;stride>0u;stride/=2u)','for(var stride='+workgroup/2+'u;stride>0u;stride/=2u)');
}
const largeBucket=count=>count<=32?0:count<=64?1:count<=128?2:3;

export function gridGpuSchwarzSeedPlan(width,height,limits,{windowBytes=64*MiB,bandRows=height,haloRows=8}={}){
 const n=width*height,fixed=8*MiB;
 if(!Number.isSafeInteger(n)||n<1||n>=2**31||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isInteger(bandRows)||bandRows<1||!Number.isInteger(haloRows)||haloRows<1||haloRows>64||!Number.isSafeInteger(windowBytes)||windowBytes<1)throw fail('INVALID_INPUT','Invalid pixel-grid extent');
 const storage=Math.min(limits?.maxStorageBufferBindingSize??128*MiB,limits?.maxBufferSize??256*MiB);
 const maxTile=Math.floor(Math.min((windowBytes-fixed)/84.5,storage/8));
 const fitRows=Math.floor(maxTile/width),maxRows=height<=fitRows?height:fitRows-2*haloRows,coreRows=Math.min(height,bandRows,maxRows);
 if(coreRows<1)throw fail('GPU_LIMIT','A core row and two halo rows do not fit the admitted GPU window');
 const tileRows=Math.min(height,coreRows+2*haloRows),tilePixels=tileRows*width,corePixels=coreRows*width;
 const memberCapacity=Math.ceil(tilePixels*3/2)+9,memberBytes=4*memberCapacity;
 const gpuBytes=align4(tilePixels*2)+tilePixels*8+tilePixels*4+tilePixels*8+memberBytes+65536*16+64+192;
 const hostBytes=align4(tilePixels*2)+tilePixels*4+tilePixels*4+tilePixels*8+memberBytes+65536*16+65536*8+64+192+96;
 // One upload batch can be in flight. Charge its full contents separately
 // from both host arrays and destination buffers, plus pipeline allowance.
 const uploadStagingBytes=align4(tilePixels*2)+tilePixels*4+tilePixels*8+memberBytes+65536*16+64+192,pipelineAllowanceBytes=4*MiB;
 if(limits&&(limits.maxComputeInvocationsPerWorkgroup<256||limits.maxComputeWorkgroupSizeX<256||limits.maxStorageBuffersPerShaderStage<6||limits.maxComputeWorkgroupStorageSize<4096||65536*16>storage))throw fail('GPU_LIMIT','GPU does not support the grid initializer layout');
 return{pixels:n,topologyBytesPerPixel:8,temporaryMemberMarginWords:8,uniformBankBytes:256,bucketScratchBytes:96,largeWorkgroups:[...LARGE_WORKGROUPS],memberCapacity,memberBytes,haloRows,coreWriteOnly:false,alternatingSweeps:true,coreRows,tileRows,tilePixels,corePixels,gpuBytes,hostBytes,uploadStagingBytes,pipelineAllowanceBytes,windowBytes:gpuBytes+hostBytes+uploadStagingBytes+pipelineAllowanceBytes,seedBytes:4*n,bands:Math.ceil(height/coreRows),largestStorageBytes:Math.max(8*tilePixels,65536*16),edgeIndexBytes:0,dualBytes:0};
}

function seedBank(n,bytes){const per=bytes/4,segments=[];for(let i=0;i<n;i+=per)segments.push(new Float32Array(Math.min(per,n-i)));let live=true;return{get:i=>{if(!live)throw fail('DISPOSED','GPU seed is closed');return segments[Math.floor(i/per)][i%per];},set:(i,v)=>{segments[Math.floor(i/per)][i%per]=v;},dispose(){live=false;segments.length=0;}};}

export async function runGridGpuSchwarzSeed(p,micro,{iterations=256,sweeps=1,bandRows=p.height,haloRows=8,windowBytes=64*MiB,segmentBytes=32*MiB,omega=.5,eta=.12,guard=1e-5,momentum=0,pairComponents=false,minimumSavedLaneWork=1800000000,batchIterations=128,onProgress,signal,reserve,seed:providedSeed}={}){
 const start=performance.now(),{width,height}=p,n=width*height;let levelAt=p.levelAt??(i=>p.nativeLevels[i]),readLevelSpan=p.readLevelSpan;
 if(readLevelSpan!==undefined&&typeof readLevelSpan!=='function')throw fail('INVALID_INPUT','Bulk level reader must be a function.');
 if(onProgress!==undefined&&typeof onProgress!=='function')throw fail('INVALID_INPUT','GPU initializer progress callback must be a function');
 if(!Number.isInteger(batchIterations)||batchIterations<1||batchIterations>512)throw fail('INVALID_INPUT','GPU initializer batches must contain one to512 iterations');
 if(!(micro>=0&&micro<=1)||!Number.isInteger(iterations)||iterations<1||iterations>4096||!Number.isInteger(sweeps)||sweeps<1||sweeps>8||!(omega>0&&omega<=(1-2*eta)**2&&eta>0&&eta<.5)||!(guard>0&&guard<=.01)||!(momentum>=0&&momentum<1)||typeof pairComponents!=='boolean'||![p.median,p.weakScale,p.normalizer].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(segmentBytes)||segmentBytes<256||segmentBytes>64*MiB||segmentBytes%4)throw fail('INVALID_INPUT','Invalid grid initializer controls');
 if(!Number.isSafeInteger(minimumSavedLaneWork)||minimumSavedLaneWork<0)throw fail('INVALID_INPUT','Invalid workgroup compilation work threshold');
 if(providedSeed&&(typeof providedSeed.get!=='function'||typeof providedSeed.set!=='function'))throw fail('INVALID_INPUT','Provided seed needs get/set');
 const check=()=>{if(signal?.aborted)throw fail('CANCELLED','Grid initializer cancelled');};check();
 let cooperateAt=performance.now()+8,progressAt=-Infinity;
 const cooperate=async()=>{check();if(performance.now()<cooperateAt)return;await new Promise((resolve,reject)=>{let channel;try{channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);}catch(error){channel?.port1.close();channel?.port2.close();reject(error);}});check();cooperateAt=performance.now()+8;};
 const progress=(event,force=false)=>{const now=performance.now();if(onProgress&&(force||now>=progressAt)){progressAt=now+250;onProgress({phase:'native-gpu-initialize',micro,elapsedMs:now-start,...event});check();}};

 let device,seed,seedRelease,windowRelease,successful=false,primary,abortFailure;const buffers=[],errorScopes=[];
 const drainErrorScopes=async()=>{const errors=[];while(errorScopes.length){const kind=errorScopes.pop();try{const error=await device.popErrorScope();if(error)errors.push(fail(kind==='out-of-memory'?'GPU_MEMORY':'GPU_VALIDATION',error.message,{errorScope:kind}));}catch(error){errors.push(error);}}if(errors.length){const error=errors[0];if(errors.length>1)error.cleanupErrors=errors.slice(1);throw error;}};
 const abort=()=>{try{device?.destroy();}catch(error){abortFailure=error;}};
 const metrics={backend:'experimental-parallel-boundary-component-jacobi-f32',micro,iterations,sweeps,haloRows,coreWriteOnly:false,alternatingSweeps:true,omega,eta,guard,momentum,pairComponents,pairComponentsApplied:false,topologyBytesPerPixel:8,earlyStateUploads:0,minimumSavedLaneWork,workgroupDecisions:[],largeWorkgroups:[...LARGE_WORKGROUPS],batchIterations,submittedBatches:0,completedBatches:0,maximumBatchWallMs:0,shaderCompileMs:0,gpuAndReadbackMs:0,uploadAndPackingMs:0,seedInitializationMs:0,deviceMs:0,retirementMs:0,actualGpuWork:false,seedOnly:true};
 try{
  if(!globalThis.navigator?.gpu)throw fail('GPU_UNAVAILABLE','WebGPU unavailable');
  let at=performance.now();const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw fail('GPU_UNAVAILABLE','No GPU adapter');check();
  const plan=gridGpuSchwarzSeedPlan(width,height,adapter.limits,{windowBytes,bandRows,haloRows});metrics.plan=plan;
  windowRelease=reserve?.(plan.windowBytes)??(()=>{});if(!providedSeed)seedRelease=reserve?.(plan.seedBytes)??(()=>{});
  device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.max(128*MiB,plan.largestStorageBytes),maxBufferSize:Math.max(256*MiB,plan.largestStorageBytes)}});signal?.addEventListener('abort',abort,{once:true});metrics.deviceMs=performance.now()-at;check();
  gridGpuSchwarzSeedPlan(width,height,device.limits,{windowBytes,bandRows,haloRows});metrics.deviceLimits={maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,maxBufferSize:device.limits.maxBufferSize,maxComputeWorkgroupsPerDimension:device.limits.maxComputeWorkgroupsPerDimension};seed=providedSeed??seedBank(n,segmentBytes);
  // The upload window is already included in plan.windowBytes. Reuse it for
  // seed initialization, then bulk transfer contiguous bands when supported.
  const states=new Float32Array(plan.tilePixels),stateWords=new Uint32Array(states.buffer),bulkRead=typeof seed.readInto==='function',bulkWrite=typeof seed.writeSpan==='function';
  metrics.bulkSeedRead=bulkRead;metrics.bulkSeedWrite=bulkWrite;metrics.bulkNativeLevels=!!readLevelSpan;
  // Already charged in hostBytes. Reuse this same upload window for all
  // native-level copies; do not allocate another image or staging bank.
  const nativeWords=new Uint32Array(Math.ceil(plan.tilePixels/2)),native=new Uint16Array(nativeWords.buffer);let packedNativePrefix=0;
  at=performance.now();const histogram=new Uint32Array(65536),initial=new Float32Array(65536);let unique=0;
  if(readLevelSpan){for(let first=0;first<n;){await cooperate();progress({stage:'source-levels',pixelsPrepared:first,pixels:n});const count=Math.min(65536,plan.tilePixels,n-first);readLevelSpan(native.subarray(0,count),first);for(let j=0;j<count;j++){const value=native[j];if(!Number.isInteger(value)||value<0||value>65535)throw fail('INVALID_INPUT','Unsigned 16-bit levels required');if(histogram[value]++===0)unique++;}first+=count;}}
  else for(let i=0;i<n;i++){if((i&65535)===0){await cooperate();progress({stage:'source-levels',pixelsPrepared:i,pixels:n});}const value=levelAt(i);if(!Number.isInteger(value)||value<0||value>65535)throw fail('INVALID_INPUT','Unsigned 16-bit levels required');if(histogram[value]++===0)unique++;}

  let rank=0;for(let v=0;v<65536;v++)if(histogram[v])initial[v]=unique===1?v/65535:.1*v/65535+.9*(.01+.98*rank++/(unique-1));
  if(readLevelSpan){
   if(bulkWrite){for(let first=0;first<n;first+=states.length){const count=Math.min(states.length,n-first);for(let j=0;j<count;j+=65536){await cooperate();const end=Math.min(count,j+65536);readLevelSpan(native.subarray(j,end),first+j);for(let k=j;k<end;k++)states[k]=initial[native[k]];}seed.writeSpan(first,states.subarray(0,count));check();}}
   else for(let first=0;first<n;){await cooperate();const count=Math.min(65536,plan.tilePixels,n-first);readLevelSpan(native.subarray(0,count),first);for(let j=0;j<count;j++)seed.set(first+j,initial[native[j]]);first+=count;}
  }else if(bulkWrite){for(let first=0;first<n;first+=states.length){const count=Math.min(states.length,n-first);for(let j=0;j<count;j++){if((j&65535)===0)await cooperate();states[j]=initial[levelAt(first+j)];}seed.writeSpan(first,states.subarray(0,count));check();}}
  else for(let i=0;i<n;i++){if((i&65535)===0)await cooperate();seed.set(i,initial[levelAt(i)]);}

  metrics.seedInitializationMs=performance.now()-at;check();
  if(typeof device.pushErrorScope==='function')for(const kind of ['out-of-memory','validation']){device.pushErrorScope(kind);errorScopes.push(kind);}
  at=performance.now();const module=device.createShaderModule({code:SHADER}),compilation=await module.getCompilationInfo();const errors=compilation.messages.filter(m=>m.type==='error');if(errors.length)throw fail('GPU_SHADER',errors.map(e=>e.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===4?'uniform':binding===3?'storage':'read-only-storage'}}))});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});const pipeline=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'jacobi'}}),largePipeline=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'jacobiLarge'}});const largePipelines=[null,null,null,largePipeline];
  const ensureLargePipeline=async b=>{if(largePipelines[b])return;const compileAt=performance.now(),bucketModule=device.createShaderModule({code:largeShader(LARGE_WORKGROUPS[b])}),bucketInfo=await bucketModule.getCompilationInfo(),bucketErrors=bucketInfo.messages.filter(m=>m.type==='error');if(bucketErrors.length)throw fail('GPU_SHADER',bucketErrors.map(e=>e.message).join('\n'));largePipelines[b]=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module:bucketModule,entryPoint:'jacobiLarge'}});metrics.shaderCompileMs+=performance.now()-compileAt;(metrics.lazyShaderBuckets??=[]).push(LARGE_WORKGROUPS[b]);check();};
  metrics.shaderCompileMs=performance.now()-at;check();
  const create=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;};
  const levelBuffer=create(align4(plan.tilePixels*2),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),coeffBuffer=create(65536*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
  const stateBuffers=[0,1].map(()=>create(plan.tilePixels*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC));
  const uniformBuffer=create(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readBuffer=create(plan.tilePixels*4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
  const uniformBuffers=[create(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),create(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),create(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),uniformBuffer];
  const memberBuffer=create(plan.memberBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),memberIndices=new Uint32Array(plan.memberCapacity);const topologyBuffer=create(plan.tilePixels*8,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);const topology=new Uint32Array(plan.tilePixels*2);
  const groups=[0,1].map(k=>device.createBindGroup({layout,entries:[levelBuffer,coeffBuffer,stateBuffers[k],stateBuffers[1-k],uniformBuffer,topologyBuffer,memberBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}));
  const bucketGroups=uniformBuffers.map((bucketUniform,b)=>b===3?groups:[0,1].map(k=>device.createBindGroup({layout,entries:[levelBuffer,coeffBuffer,stateBuffers[k],stateBuffers[1-k],bucketUniform,topologyBuffer,memberBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}))); 
  const coefficients=new Float32Array(65536*4),gain=Math.max(4*16**micro,(.5+7.5*micro)/(255*p.weakScale));
  for(let delta=1;delta<65536;delta++){const d=delta/65535,w=n*Math.sqrt(d/(d+p.median))/p.normalizer,wanted=gain*d/(1+(gain-1)*d),a=d/(8*p.weakScale);coefficients[4*delta]=.1*d;coefficients[4*delta+1]=w;coefficients[4*delta+2]=20*w/(1+a**4)/(wanted*wanted);coefficients[4*delta+3]=wanted;}
  device.queue.writeBuffer(coeffBuffer,0,coefficients);
  const uniform=new Uint32Array(16),uniformFloat=new Float32Array(uniform.buffer);
  const bucketUniforms=[new Uint32Array(16),new Uint32Array(16),new Uint32Array(16),uniform],bucketCounts=new Uint32Array(4),bucketStarts=new Uint32Array(4),bucketCursors=new Uint32Array(4),bucketGroupsX=new Uint32Array(4),bucketGroupsY=new Uint32Array(4),bucketMembers=new Uint32Array(4);
  for(let sweep=0;sweep<sweeps;sweep++)for(let band=0;band<plan.bands;band++){
   const first=((sweep&1)?plan.bands-1-band:band)*plan.coreRows;
   check();at=performance.now();const end=Math.min(height,first+plan.coreRows),tileFirst=Math.max(0,first-haloRows),tileEnd=Math.min(height,end+haloRows),tileN=(tileEnd-tileFirst)*width,coreN=(end-first)*width,activeFirst=tileFirst===0?0:1,activeEnd=tileEnd===height?tileEnd-tileFirst:tileEnd-tileFirst-1,writeN=(activeEnd-activeFirst)*width;
   if(readLevelSpan){for(let i=0;i<tileN;i+=65536){await cooperate();const end=Math.min(tileN,i+65536);readLevelSpan(native.subarray(i,end),tileFirst*width+i);}if(bulkRead)seed.readInto(states.subarray(0,tileN),tileFirst*width);else for(let i=0;i<tileN;i++){if((i&65535)===0)await cooperate();states[i]=seed.get(tileFirst*width+i);}
    // Preserve even the old upload's unused high half-word: if no earlier
    // packing reached this slot, its historical value was zero, not a level
    // left by the histogram/LUT staging. No extra clearing pass is necessary.
    if((tileN&1)&&tileN>=packedNativePrefix)native[tileN]=0;packedNativePrefix=Math.max(packedNativePrefix,tileN);
   }else if(bulkRead){for(let i=0;i<tileN;i++){if((i&65535)===0)await cooperate();native[i]=levelAt(tileFirst*width+i);}seed.readInto(states.subarray(0,tileN),tileFirst*width);}
   else for(let i=0;i<tileN;i++){if((i&65535)===0)await cooperate();const global=tileFirst*width+i;native[i]=levelAt(global);states[i]=seed.get(global);}

   // writeBuffer snapshots its source on the content timeline. This is the
   // ONLY state upload for this band. The same host bank is then dead until
   // readback and can hold exact Uint32 component counts and inactive flags.
   device.queue.writeBuffer(stateBuffers[0],0,states,0,tileN);metrics.earlyStateUploads++;
   stateWords.fill(0,0,tileN);topology.fill(0xffffffff,0,2*tileN);const globalFirst=tileFirst*width;
   let linkedBoundaryMembers=0,largestBoundaryList=0,completeComponents=0,frozenComponents=0;
   for(let i=0;i<tileN;i++){
    if((i&65535)===0){await cooperate();progress({stage:'topology',sweep:sweep+1,sweeps,band:band+1,bands:plan.bands,pixelsPrepared:i,pixels:tileN});}
    const r=(p.graph?.ownerAt(globalFirst+i)??(globalFirst+i))-globalFirst;if(r<0||r>=tileN)continue;topology[2*i]=r;
    if(i!==r){const x=i%width,row=Math.floor(i/width),value=native[i];let boundary=false;
     for(let dy=-1;dy<=1&&!boundary;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=row+dy;if((dx||dy)&&xx>=0&&xx<width&&yy>=0&&yy<tileEnd-tileFirst&&native[yy*width+xx]!==value){boundary=true;break;}}
     if(boundary){topology[2*i+1]=topology[2*r+1];topology[2*r+1]=i;linkedBoundaryMembers++;}
    }
    stateWords[r]++;const row=Math.floor(i/width);if(row<activeFirst||row>=activeEnd)stateWords[r]|=0x80000000;
   }
   let regularRoots=0,packedMembers=0,largeRoots=0;bucketCounts.fill(0);bucketMembers.fill(0);const regularRootFirst=memberIndices.length-1;
   for(let r=0;r<tileN;r++){
    if((r&65535)===0)await cooperate();if(topology[2*r]!==r)continue;
    const area=stateWords[r],head=topology[2*r+1],complete=area===(p.graph?.countAt(globalFirst+r)??1);let count=0,member=head;
    if(!complete){while(member!==0xffffffff){if(count&&(count&65535)===0)await cooperate();count++;member=topology[2*member+1];}largestBoundaryList=Math.max(largestBoundaryList,count);topology[2*r]=(r|0x80000000)>>>0;frozenComponents++;continue;}
    completeComponents++;
    if(area===1){if(head!==0xffffffff)throw fail('INVALID_INPUT','Singleton boundary list must be empty');stateWords[r]=0;}
    else{
     const meta=packedMembers;if(packedMembers+2+regularRoots>memberIndices.length)throw fail('GPU_LIMIT','Component metadata capacity exceeded');
     memberIndices[packedMembers++]=area;packedMembers++;
     // Materialize while counting, then discard at most eight temporary ids
     // for a regular row. The fixed eight-word margin funds this transient.
     while(member!==0xffffffff){if(count&&(count&65535)===0)await cooperate();if(packedMembers+regularRoots>=memberIndices.length)throw fail('GPU_LIMIT','Boundary member capacity exceeded');memberIndices[packedMembers++]=member;count++;member=topology[2*member+1];}
     if(count<=8){packedMembers=meta+2;memberIndices[meta+1]=head;}else memberIndices[meta+1]=count;
     topology[2*r+1]=meta;stateWords[r]=count;
    }
    largestBoundaryList=Math.max(largestBoundaryList,count);
    if(count<=8){if(packedMembers+regularRoots>=memberIndices.length)throw fail('GPU_LIMIT','Regular root capacity exceeded');memberIndices[regularRootFirst-regularRoots++]=r;}else{const bucket=largeBucket(count);bucketCounts[bucket]++;bucketMembers[bucket]+=count;}
   }
   // Pay a cold shader compilation only when known repeated work can amortize it.
   // Counts are immutable source topology: this spatial band repeats unchanged
   // in later sweeps. Other bands are deliberately not extrapolated.
   const decisionAt=performance.now();
   for(let b=0;b<3;b++){
    const roots=bucketCounts[b],workPerRoot=iterations*(sweeps-sweep)*(256-LARGE_WORKGROUPS[b]),rawWork=roots*workPerRoot,savedLaneWork=Math.min(Number.MAX_SAFE_INTEGER,rawWork),alreadyCompiled=!!largePipelines[b],enabled=roots>0&&(alreadyCompiled||roots>=Math.ceil(minimumSavedLaneWork/workPerRoot));
    metrics.workgroupDecisions.push({sweep:sweep+1,band:band+1,workgroupSize:LARGE_WORKGROUPS[b],roots,boundaryMembers:bucketMembers[b],savedLaneWork,workSaturated:rawWork>Number.MAX_SAFE_INTEGER,minimumSavedLaneWork,alreadyCompiled,enabled,reason:!roots?'empty':alreadyCompiled?'reuse':enabled?'work-amortizes-compilation':'original-WG256'});
    if(enabled&&!alreadyCompiled)await ensureLargePipeline(b);
    if(!largePipelines[b]){bucketCounts[3]+=bucketCounts[b];bucketMembers[3]+=bucketMembers[b];bucketCounts[b]=bucketMembers[b]=0;}
   }
   at+=performance.now()-decisionAt;
   const largeRootFirst=packedMembers;let nextBucket=largeRootFirst;for(let b=0;b<4;b++){bucketStarts[b]=bucketCursors[b]=nextBucket;nextBucket+=bucketCounts[b];largeRoots+=bucketCounts[b];}if(nextBucket+regularRoots>memberIndices.length)throw fail('GPU_LIMIT','Boundary root capacity exceeded');
   for(let r=0;r<tileN;r++){if((r&65535)===0)await cooperate();if(topology[2*r]===r&&stateWords[r]>8){const requestedBucket=largeBucket(stateWords[r]),bucket=largePipelines[requestedBucket]?requestedBucket:3;memberIndices[bucketCursors[bucket]++]=r;}}
   packedMembers=nextBucket;for(let b=0;b<4;b++)if(bucketCursors[b]!==bucketStarts[b]+bucketCounts[b])throw fail('INVALID_INPUT','Boundary bucket count mismatch');
   // Per complete component: singleton costs1, regular nontrivial costs3,
   // large costs B+3 with area>=B+1>=10. Final payload<=1.5*tileN;
   // only a regular row's <=8 transient ids exceed that final payload.
   if(packedMembers+regularRoots>Math.ceil(tileN*3/2))throw fail('INVALID_INPUT','GPU compact topology packing exceeded its component bound');
   for(let b=0;b<4;b++){bucketGroupsX[b]=Math.min(bucketCounts[b],device.limits.maxComputeWorkgroupsPerDimension);bucketGroupsY[b]=bucketCounts[b]?Math.ceil(bucketCounts[b]/bucketGroupsX[b]):0;if(bucketGroupsY[b]>device.limits.maxComputeWorkgroupsPerDimension)throw fail('GPU_LIMIT','Boundary reduction dispatch exceeds limits');}
   metrics.boundaryWork??=[];metrics.boundaryWork.push({tilePixels:tileN,linkedBoundaryMembers,largestBoundaryList,completeComponents,frozenComponents,largeRoots,regularRoots,packedMembers:largeRootFirst,largeBuckets:LARGE_WORKGROUPS.map((workgroupSize,b)=>({workgroupSize,roots:bucketCounts[b],boundaryMembers:bucketMembers[b]}))});
   if(packedMembers)device.queue.writeBuffer(memberBuffer,0,memberIndices,0,packedMembers);
   if(regularRoots)device.queue.writeBuffer(memberBuffer,(memberIndices.length-regularRoots)*4,memberIndices,memberIndices.length-regularRoots,regularRoots);
   device.queue.writeBuffer(topologyBuffer,0,topology,0,2*tileN);
   const gx=Math.max(1,Math.min(Math.ceil(regularRoots/256),device.limits.maxComputeWorkgroupsPerDimension)),gy=Math.ceil(regularRoots/(256*gx));
   if(gy>device.limits.maxComputeWorkgroupsPerDimension)throw fail('GPU_LIMIT','Grid dispatch exceeds limits');
   uniform.set([width,tileEnd-tileFirst,regularRoots,gx,tileFirst===0?0:1,tileEnd===height?tileEnd-tileFirst:tileEnd-tileFirst-1,regularRootFirst,height]);uniformFloat[8]=omega;uniformFloat[9]=eta;uniformFloat[10]=guard;uniformFloat[11]=momentum;uniform[12]=bucketStarts[3];uniform[13]=bucketCounts[3];uniform[14]=bucketGroupsX[3];
   for(let b=0;b<3;b++){bucketUniforms[b].set(uniform);bucketUniforms[b][12]=bucketStarts[b];bucketUniforms[b][13]=bucketCounts[b];bucketUniforms[b][14]=bucketGroupsX[b];new Float32Array(bucketUniforms[b].buffer)[7]=1e30;bucketUniforms[b][15]=0;}
   device.queue.writeBuffer(levelBuffer,0,nativeWords,0,Math.ceil(tileN/2));for(let b=0;b<4;b++)device.queue.writeBuffer(uniformBuffers[b],0,bucketUniforms[b]);metrics.uploadAndPackingMs+=performance.now()-at;
   at=performance.now();
   for(let firstIteration=0;firstIteration<iterations;firstIteration+=batchIterations){
    await cooperate();const batchAt=performance.now(),lastIteration=Math.min(iterations,firstIteration+batchIterations),encoder=device.createCommandEncoder();
    // Copy the history exactly once. Later batches keep both the current
    // state and the previous state used by momentum resident on the GPU.
    if(firstIteration===0)encoder.copyBufferToBuffer(stateBuffers[0],0,stateBuffers[1],0,tileN*4);
    const pass=encoder.beginComputePass();
    for(let it=firstIteration;it<lastIteration;it++){pass.setBindGroup(0,groups[it&1]);if(regularRoots){pass.setPipeline(pipeline);pass.dispatchWorkgroups(gx,gy);}for(let b=0;b<4;b++)if(bucketCounts[b]){pass.setBindGroup(0,bucketGroups[b][it&1]);pass.setPipeline(largePipelines[b]);pass.dispatchWorkgroups(bucketGroupsX[b],bucketGroupsY[b]);}}
    pass.end();
    // A single full seed readback, after the final batch only.
    if(lastIteration===iterations)encoder.copyBufferToBuffer(stateBuffers[iterations&1],activeFirst*width*4,readBuffer,0,writeN*4);
    device.queue.submit([encoder.finish()]);metrics.actualGpuWork=true;metrics.submittedBatches++;
    await device.queue.onSubmittedWorkDone();metrics.completedBatches++;metrics.maximumBatchWallMs=Math.max(metrics.maximumBatchWallMs,performance.now()-batchAt);check();
    progress({stage:'iterations',sweep:sweep+1,sweeps,band:band+1,bands:plan.bands,completedIterations:lastIteration,iterations},lastIteration===iterations);
   }
   await readBuffer.mapAsync(GPUMapMode.READ,0,writeN*4);
   // Finish the mapped read before yielding to cancellation. The existing
   // host state array is reused; no second image/window bank is allocated.
   try{states.set(new Float32Array(readBuffer.getMappedRange(0,writeN*4)),0);}finally{readBuffer.unmap();}
   for(let i=0;i<writeN;i++){
    if((i&65535)===0)await cooperate();const pixel=activeFirst*width+i,leader=topology[2*pixel],root=leader&0x7fffffff;
    if(leader!==0xffffffff&&root>=activeFirst*width&&root<activeFirst*width+writeN){const source=root-activeFirst*width;if(source>i)throw fail('INVALID_INPUT','GPU source representative must precede its members');if(source!==i)states[i]=states[source];}
   }
   if(bulkWrite)seed.writeSpan((tileFirst+activeFirst)*width,states.subarray(0,writeN));else for(let i=0;i<writeN;i++){if((i&65535)===0)await cooperate();seed.set((tileFirst+activeFirst)*width+i,states[i]);}
   metrics.gpuAndReadbackMs+=performance.now()-at;
  }
  await drainErrorScopes();check();successful=true;
 }catch(error){primary=signal?.aborted?fail('CANCELLED','Grid initializer cancelled',{cause:String(error)}):error;throw primary;}finally{
  const at=performance.now();let cleanup=abortFailure;
  if(device){try{await device.queue.onSubmittedWorkDone();}catch(error){cleanup=error;}try{await drainErrorScopes();}catch(error){cleanup??=error;}for(const b of buffers)try{b.destroy();}catch(error){cleanup??=error;}try{device.destroy();}catch(error){cleanup??=error;}}
  signal?.removeEventListener('abort',abort);buffers.length=0;device=null;metrics.retirementMs=performance.now()-at;windowRelease?.();windowRelease=null;p=null;levelAt=null;readLevelSpan=null;
  if(!successful||cleanup){if(!providedSeed)seed?.dispose();seed=null;seedRelease?.();seedRelease=null;}
  if(cleanup){if(primary)primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];else throw cleanup;}
 }
 metrics.elapsedMs=performance.now()-start;let live=true;
 const result={width,height,seed,metrics,release(){if(!live)return;live=false;if(!providedSeed)seed.dispose();seed=null;providedSeed=null;result.seed=null;seedRelease?.();seedRelease=null;}};return result;
}
