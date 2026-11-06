// Experimental GPU initializer only. The native Float64 objective, feasibility
// checks and final certificate remain authoritative. No E-sized arrays.
const MiB=1024**2,align4=x=>Math.ceil(x/4)*4;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const SHADER=`
struct Shape { width:u32, rows:u32, nodes:u32, groupsX:u32,
 coreFirst:u32, coreEnd:u32, globalRow:u32, globalHeight:u32,
 omega:f32, eta:f32, guard:f32, momentum:f32,
 pairComponents:u32, padding0:u32, padding1:u32, padding2:u32 }
struct Terms { gradient:f32, diagonal:f32, down:f32, up:f32, equals:u32, neighbour:u32 }
@group(0) @binding(0) var<storage,read> levels:array<u32>;
@group(0) @binding(1) var<storage,read> coeff:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read> previous:array<f32>;
@group(0) @binding(3) var<storage,read_write> next:array<f32>;
@group(0) @binding(4) var<uniform> shape:Shape;
fn level(i:u32)->u32 { return (levels[i>>1u] >> ((i&1u)*16u)) & 65535u; }
fn terms(i:u32)->Terms {
 let x=i%shape.width;let row=i/shape.width;let y=previous[i];
 let native=level(i);let lo=max(y,1e-7);let hi=max(1.0-y,1e-7);
 var gradient=.1*(-1.0/lo+1.0/hi);var diagonal=.1*(1.0/(lo*lo)+1.0/(hi*hi));
 var down=2.0*shape.eta*lo;var up=2.0*shape.eta*hi;var equals=0u;var equalNeighbour=i;
 for(var dy=-1;dy<=1;dy++){for(var dx=-1;dx<=1;dx++){
  if(dx==0&&dy==0){continue;}let xx=i32(x)+dx;let yy=i32(row)+dy;
  if(xx<0||yy<0||xx>=i32(shape.width)||yy>=i32(shape.rows)){continue;}
  let j=u32(yy)*shape.width+u32(xx);let other=level(j);
  if(other==native){equals++;equalNeighbour=j;continue;}
  let gap=max(native,other)-min(native,other);let c=coeff[gap];
  let multiplicity=select(1.0,0.7071067811865476,dx!=0&&dy!=0);
  let weight=c.y*multiplicity;let fidelity=c.z*multiplicity;
  let high=native>other;let delta=select(previous[j]-y,y-previous[j],high);
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
 let i=gid.x+gid.y*shape.groupsX*256u;if(i>=shape.nodes){return;}
 let row=i/shape.width;let y=previous[i];
 if(row<shape.coreFirst||row>=shape.coreEnd){next[i]=y;return;}
 var a=terms(i);
 if(a.equals>0u){
  let j=a.neighbour;let otherRow=j/shape.width;
  if(shape.pairComponents==0u||a.equals!=1u||otherRow<shape.coreFirst||otherRow>=shape.coreEnd||previous[j]!=y){next[i]=y;return;}
  let b=terms(j);if(b.equals!=1u){next[i]=y;return;}
  // Both endpoints form exactly the same two-term sums and minima. Momentum
  // reads each thread's OWN old output slot: no read/write race on next[j].
  a.gradient+=b.gradient;a.diagonal+=b.diagonal;a.down=min(a.down,b.down);a.up=min(a.up,b.up);
 }
 let step=clamp(-shape.omega*a.gradient/a.diagonal+shape.momentum*(y-next[i]),-a.down,a.up);
 next[i]=clamp(y+step,1e-7,0.9999999);
}
`;

export function gridGpuSeedPlan(width,height,limits,{windowBytes=64*MiB,bandRows=height}={}){
 const n=width*height,fixed=8*MiB;
 if(!Number.isSafeInteger(n)||n<1||n>=2**31||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isInteger(bandRows)||bandRows<1||!Number.isSafeInteger(windowBytes)||windowBytes<1)throw fail('INVALID_INPUT','Invalid pixel-grid extent');
 const storage=Math.min(limits?.maxStorageBufferBindingSize??128*MiB,limits?.maxBufferSize??256*MiB);
 const maxTile=Math.floor(Math.min((windowBytes-fixed)/30,storage/4));
 const maxRows=Math.floor(maxTile/width)-2,coreRows=Math.min(height,bandRows,maxRows);
 if(coreRows<1)throw fail('GPU_LIMIT','A core row and two halo rows do not fit the admitted GPU window');
 const tileRows=Math.min(height,coreRows+2),tilePixels=tileRows*width,corePixels=coreRows*width;
 const gpuBytes=align4(tilePixels*2)+tilePixels*8+corePixels*4+65536*16+64;
 const hostBytes=align4(tilePixels*2)+tilePixels*4+corePixels*4+65536*16+65536*8+64;
 // One upload batch can be in flight. Charge its full contents separately
 // from both host arrays and destination buffers, plus pipeline allowance.
 const uploadStagingBytes=align4(tilePixels*2)+tilePixels*4+65536*16+64,pipelineAllowanceBytes=4*MiB;
 if(limits&&(limits.maxComputeInvocationsPerWorkgroup<256||limits.maxComputeWorkgroupSizeX<256||limits.maxStorageBuffersPerShaderStage<4||65536*16>storage))throw fail('GPU_LIMIT','GPU does not support the grid initializer layout');
 return{pixels:n,coreRows,tileRows,tilePixels,corePixels,gpuBytes,hostBytes,uploadStagingBytes,pipelineAllowanceBytes,windowBytes:gpuBytes+hostBytes+uploadStagingBytes+pipelineAllowanceBytes,seedBytes:4*n,bands:Math.ceil(height/coreRows),largestStorageBytes:Math.max(4*tilePixels,65536*16),edgeIndexBytes:0,dualBytes:0};
}

function seedBank(n,bytes){const per=bytes/4,segments=[];for(let i=0;i<n;i+=per)segments.push(new Float32Array(Math.min(per,n-i)));let live=true;return{get:i=>{if(!live)throw fail('DISPOSED','GPU seed is closed');return segments[Math.floor(i/per)][i%per];},set:(i,v)=>{segments[Math.floor(i/per)][i%per]=v;},dispose(){live=false;segments.length=0;}};}

export async function runGridGpuSeed(p,micro,{iterations=256,sweeps=1,bandRows=p.height,windowBytes=64*MiB,segmentBytes=32*MiB,omega=.5,eta=.12,guard=1e-7,momentum=0,pairComponents=false,signal,reserve,seed:providedSeed}={}){
 const start=performance.now(),{width,height}=p,n=width*height;let levelAt=p.levelAt??(i=>p.nativeLevels[i]);
 if(!(micro>=0&&micro<=1)||!Number.isInteger(iterations)||iterations<1||iterations>4096||!Number.isInteger(sweeps)||sweeps<1||sweeps>8||!(omega>0&&omega<=(1-2*eta)**2&&eta>0&&eta<.5)||!(guard>0&&guard<=.01)||!(momentum>=0&&momentum<1)||typeof pairComponents!=='boolean'||![p.median,p.weakScale,p.normalizer].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(segmentBytes)||segmentBytes<256||segmentBytes>64*MiB||segmentBytes%4)throw fail('INVALID_INPUT','Invalid grid initializer controls');
 if(providedSeed&&(typeof providedSeed.get!=='function'||typeof providedSeed.set!=='function'))throw fail('INVALID_INPUT','Provided seed needs get/set');
 const check=()=>{if(signal?.aborted)throw fail('CANCELLED','Grid initializer cancelled');};check();
 let device,seed,seedRelease,windowRelease,successful=false,primary,abortFailure;const buffers=[],errorScopes=[];
 const drainErrorScopes=async()=>{const errors=[];while(errorScopes.length){const kind=errorScopes.pop();try{const error=await device.popErrorScope();if(error)errors.push(fail(kind==='out-of-memory'?'GPU_MEMORY':'GPU_VALIDATION',error.message,{errorScope:kind}));}catch(error){errors.push(error);}}if(errors.length){const error=errors[0];if(errors.length>1)error.cleanupErrors=errors.slice(1);throw error;}};
 const abort=()=>{try{device?.destroy();}catch(error){abortFailure=error;}};
 const metrics={backend:'experimental-grid-jacobi-f32',micro,iterations,sweeps,omega,eta,guard,momentum,pairComponents,shaderCompileMs:0,gpuAndReadbackMs:0,uploadAndPackingMs:0,seedInitializationMs:0,deviceMs:0,retirementMs:0,actualGpuWork:false,seedOnly:true};
 try{
  if(!globalThis.navigator?.gpu)throw fail('GPU_UNAVAILABLE','WebGPU unavailable');
  let at=performance.now();const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw fail('GPU_UNAVAILABLE','No GPU adapter');check();
  const plan=gridGpuSeedPlan(width,height,adapter.limits,{windowBytes,bandRows});metrics.plan=plan;
  windowRelease=reserve?.(plan.windowBytes)??(()=>{});if(!providedSeed)seedRelease=reserve?.(plan.seedBytes)??(()=>{});
  device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:Math.max(128*MiB,plan.largestStorageBytes),maxBufferSize:Math.max(256*MiB,plan.largestStorageBytes)}});signal?.addEventListener('abort',abort,{once:true});metrics.deviceMs=performance.now()-at;check();
  gridGpuSeedPlan(width,height,device.limits,{windowBytes,bandRows});metrics.deviceLimits={maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,maxBufferSize:device.limits.maxBufferSize,maxComputeWorkgroupsPerDimension:device.limits.maxComputeWorkgroupsPerDimension};seed=providedSeed??seedBank(n,segmentBytes);
  // The upload window is already included in plan.windowBytes. Reuse it for
  // seed initialization, then bulk transfer contiguous bands when supported.
  const states=new Float32Array(plan.tilePixels),bulkRead=typeof seed.readInto==='function',bulkWrite=typeof seed.writeSpan==='function';
  metrics.bulkSeedRead=bulkRead;metrics.bulkSeedWrite=bulkWrite;
  at=performance.now();const histogram=new Uint32Array(65536),initial=new Float32Array(65536);let unique=0;
  for(let i=0;i<n;i++){const value=levelAt(i);if(!Number.isInteger(value)||value<0||value>65535)throw fail('INVALID_INPUT','Unsigned 16-bit levels required');if(histogram[value]++===0)unique++;}
  let rank=0;for(let v=0;v<65536;v++)if(histogram[v])initial[v]=unique===1?v/65535:.1*v/65535+.9*(.01+.98*rank++/(unique-1));
  if(bulkWrite){for(let first=0;first<n;first+=states.length){const count=Math.min(states.length,n-first);for(let j=0;j<count;j++)states[j]=initial[levelAt(first+j)];seed.writeSpan(first,states.subarray(0,count));check();}}
  else for(let i=0;i<n;i++)seed.set(i,initial[levelAt(i)]);
  metrics.seedInitializationMs=performance.now()-at;check();
  if(typeof device.pushErrorScope==='function')for(const kind of ['out-of-memory','validation']){device.pushErrorScope(kind);errorScopes.push(kind);}
  at=performance.now();const module=device.createShaderModule({code:SHADER}),compilation=await module.getCompilationInfo();const errors=compilation.messages.filter(m=>m.type==='error');if(errors.length)throw fail('GPU_SHADER',errors.map(e=>e.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:Array.from({length:5},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===4?'uniform':binding===3?'storage':'read-only-storage'}}))});
  const pipeline=await device.createComputePipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:'jacobi'}});metrics.shaderCompileMs=performance.now()-at;check();
  const create=(size,usage)=>{const b=device.createBuffer({size,usage});buffers.push(b);return b;};
  const levelBuffer=create(align4(plan.tilePixels*2),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),coeffBuffer=create(65536*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
  const stateBuffers=[0,1].map(()=>create(plan.tilePixels*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC));
  const uniformBuffer=create(64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),readBuffer=create(plan.corePixels*4,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
  const groups=[0,1].map(k=>device.createBindGroup({layout,entries:[levelBuffer,coeffBuffer,stateBuffers[k],stateBuffers[1-k],uniformBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))}));
  const coefficients=new Float32Array(65536*4),gain=Math.max(4*16**micro,(.5+7.5*micro)/(255*p.weakScale));
  for(let delta=1;delta<65536;delta++){const d=delta/65535,w=n*Math.sqrt(d/(d+p.median))/p.normalizer,wanted=gain*d/(1+(gain-1)*d),a=d/(8*p.weakScale);coefficients[4*delta]=.1*d;coefficients[4*delta+1]=w;coefficients[4*delta+2]=20*w/(1+a**4)/(wanted*wanted);coefficients[4*delta+3]=wanted;}
  device.queue.writeBuffer(coeffBuffer,0,coefficients);
  const nativeWords=new Uint32Array(Math.ceil(plan.tilePixels/2)),native=new Uint16Array(nativeWords.buffer),uniform=new Uint32Array(16),uniformFloat=new Float32Array(uniform.buffer);
  for(let sweep=0;sweep<sweeps;sweep++)for(let first=0;first<height;first+=plan.coreRows){
   check();at=performance.now();const end=Math.min(height,first+plan.coreRows),tileFirst=Math.max(0,first-1),tileEnd=Math.min(height,end+1),tileN=(tileEnd-tileFirst)*width,coreN=(end-first)*width;
   if(bulkRead){for(let i=0;i<tileN;i++)native[i]=levelAt(tileFirst*width+i);seed.readInto(states.subarray(0,tileN),tileFirst*width);}
   else for(let i=0;i<tileN;i++){const global=tileFirst*width+i;native[i]=levelAt(global);states[i]=seed.get(global);}
   const gx=Math.min(Math.ceil(tileN/256),device.limits.maxComputeWorkgroupsPerDimension),gy=Math.ceil(tileN/(256*gx));
   if(gy>device.limits.maxComputeWorkgroupsPerDimension)throw fail('GPU_LIMIT','Grid dispatch exceeds limits');
   uniform.set([width,tileEnd-tileFirst,tileN,gx,first-tileFirst,end-tileFirst,tileFirst,height]);uniformFloat[8]=omega;uniformFloat[9]=eta;uniformFloat[10]=guard;uniformFloat[11]=momentum;uniform[12]=pairComponents?1:0;
   device.queue.writeBuffer(levelBuffer,0,nativeWords,0,Math.ceil(tileN/2));device.queue.writeBuffer(stateBuffers[0],0,states,0,tileN);device.queue.writeBuffer(uniformBuffer,0,uniform);metrics.uploadAndPackingMs+=performance.now()-at;
   at=performance.now();const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(stateBuffers[0],0,stateBuffers[1],0,tileN*4);const pass=encoder.beginComputePass();pass.setPipeline(pipeline);for(let it=0;it<iterations;it++){pass.setBindGroup(0,groups[it&1]);pass.dispatchWorkgroups(gx,gy);}pass.end();
   encoder.copyBufferToBuffer(stateBuffers[iterations&1],(first-tileFirst)*width*4,readBuffer,0,coreN*4);device.queue.submit([encoder.finish()]);metrics.actualGpuWork=true;
   await readBuffer.mapAsync(GPUMapMode.READ,0,coreN*4);try{const values=new Float32Array(readBuffer.getMappedRange(0,coreN*4));if(bulkWrite)seed.writeSpan(first*width,values);else for(let i=0;i<coreN;i++)seed.set(first*width+i,values[i]);}finally{readBuffer.unmap();}metrics.gpuAndReadbackMs+=performance.now()-at;
  }
  await drainErrorScopes();check();successful=true;
 }catch(error){primary=signal?.aborted?fail('CANCELLED','Grid initializer cancelled',{cause:String(error)}):error;throw primary;}finally{
  const at=performance.now();let cleanup=abortFailure;
  if(device){try{await device.queue.onSubmittedWorkDone();}catch(error){cleanup=error;}try{await drainErrorScopes();}catch(error){cleanup??=error;}for(const b of buffers)try{b.destroy();}catch(error){cleanup??=error;}try{device.destroy();}catch(error){cleanup??=error;}}
  signal?.removeEventListener('abort',abort);buffers.length=0;device=null;metrics.retirementMs=performance.now()-at;windowRelease?.();windowRelease=null;p=null;levelAt=null;
  if(!successful||cleanup){if(!providedSeed)seed?.dispose();seed=null;seedRelease?.();seedRelease=null;}
  if(cleanup){if(primary)primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];else throw cleanup;}
 }
 metrics.elapsedMs=performance.now()-start;let live=true;
 const result={width,height,seed,metrics,release(){if(!live)return;live=false;if(!providedSeed)seed.dispose();seed=null;providedSeed=null;result.seed=null;seedRelease?.();seedRelease=null;}};return result;
}
