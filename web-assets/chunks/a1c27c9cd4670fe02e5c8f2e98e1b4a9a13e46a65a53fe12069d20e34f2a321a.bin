import {FUSED_NONLOCAL_RANDOM_WGSL,FUSED_NONLOCAL_RANDOM_ENTRYPOINT} from './fused-nonlocal-random-wgsl.js';
import {D2PRL_EVALUATOR_WGSL,specializeEvaluatorShader} from './evaluator-gpu-kernel.js';
import {getD2prlDescriptorLease} from './descriptor-ownership.js';
import {residentPlanFrame} from './resident-candidate-plan.js';
import {createConvolutionSyncRetirement,preserveConvolutionPrimary} from './convolution-retirement.js';
import {MPS_PHILOX_CORE_WGSL} from './random-philox-wgsl.js';
// Existing 13-plane propagation followed by
// native two-stage wrapping, with the same f32 operation boundaries.
import {requireValue,checkAbort,EngineError,controlCheckpoint,normalizeResourceError} from '../../src/errors.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
export const CANDIDATE_WGSL=MPS_PHILOX_CORE_WGSL+String.raw`
struct Shape{side:u32,begin:u32,count:u32,pad:u32};
@group(0) @binding(0) var<storage,read> source:array<f32>;
@group(0) @binding(1) var<storage,read_write> output:array<f32>;
@group(0) @binding(2) var<uniform> shape:Shape;
fn roundedAdd(a:f32,b:f32)->f32{return fma(1.0,a,b);}
// Source offsets are bounded by one grid side. Propagation reaches at most
// three sides, and adding the original coordinate reaches at most four.
// Subtraction of these exactly represented integer multiples loses no bits.
fn remainder(value:f32)->f32{
 var r=value;let side=f32(shape.side);
 for(var i=0u;i<4u;i++){if(r>=side){r=roundedAdd(r,-side);}if(r<=-side){r=roundedAdd(r,side);}}
 if(r==0.0){return bitcast<f32>(bitcast<u32>(value)&2147483648u);}
 if(r<0.0){r=roundedAdd(r,side);}return r;
}
fn wrap(value:f32,coordinate:f32)->f32{
 var absolute=roundedAdd(value,coordinate);
 if(absolute<=0.0){absolute=remainder(absolute);}
 if(absolute>=f32(shape.side)){absolute=remainder(absolute);}
 return roundedAdd(absolute,-coordinate);
}
fn shifted(index:u32,step:i32)->u32{
 let side=i32(shape.side);return u32((i32(index)+step+2*side)%side);
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3<u32>){
 let at=id.x;if(at>=shape.count){return;}let i=shape.begin+at;let n=shape.side*shape.side;
 let x=i%shape.side;let y=i/shape.side;
 let xm1=shifted(x,-1);let xp1=shifted(x,1);let xm2=shifted(x,-2);let xp2=shifted(x,2);
 let ym1=shifted(y,-1)*shape.side;let yp1=shifted(y,1)*shape.side;
 let ym2=shifted(y,-2)*shape.side;let yp2=shifted(y,2)*shape.side;let row=y*shape.side;
 let a=array<u32,8>(row+xm1,row+xp1,ym1+x,yp1+x,ym1+xm1,yp1+xp1,ym1+xp1,yp1+xm1);
 let b=array<u32,8>(row+xm2,row+xp2,ym2+x,yp2+x,ym2+xm2,yp2+xp2,ym2+xp2,yp2+xm2);
 for(var axis=0u;axis<2u;axis++){
  let base=axis*n;let outBase=axis*13u*shape.count;var coordinate=select(f32(x),f32(y),axis==1u);if(shape.pad!=0u){coordinate=source[(2u+axis)*n+i];}
  output[outBase+at]=wrap(source[base+i],coordinate);
  for(var k=0u;k<4u;k++){output[outBase+(k+1u)*shape.count+at]=wrap(source[base+a[k]],coordinate);}
  for(var k=0u;k<8u;k++){
   let twice=2.0*source[base+a[k]];let value=roundedAdd(twice,-source[base+b[k]]);
   output[outBase+(k+5u)*shape.count+at]=wrap(value,coordinate);
  }
 }
}
// Existing five-plan random interpolation. The supplied noise is never drawn
// or advanced here: a null admission result leaves it available to the CPU.
@compute @workgroup_size(64) fn randomMain(@builtin(global_invocation_id) id:vec3<u32>){
 let at=id.x;if(at>=shape.count){return;}let i=shape.begin+at;let n=shape.side*shape.side;
 let a=source[6u*n+i];let b=roundedAdd(1.0,source[7u*n+i]);
 let dx=roundedAdd(source[3u*n+i],-source[2u*n+i])*0.5;
 let dy=roundedAdd(source[5u*n+i],-source[4u*n+i])*0.5;
 let x0=roundedAdd(source[2u*n+i],dx*a);let x1=roundedAdd(source[2u*n+i],dx*b);
 let y0=roundedAdd(source[4u*n+i],dy*a);let y1=roundedAdd(source[4u*n+i],dy*b);
 var ox=f32(i%shape.side);var oy=f32(i/shape.side);
 if(shape.pad!=0u){ox=source[8u*n+i];oy=source[9u*n+i];}
 let xs=array<f32,5>(x0,x1,x0,x1,source[i]);let ys=array<f32,5>(y0,y0,y1,y1,source[n+i]);
 for(var k=0u;k<5u;k++){output[k*shape.count+at]=wrap(xs[k],ox);output[(5u+k)*shape.count+at]=wrap(ys[k],oy);}
}
struct RandomSource{counter:vec4<u32>,key:vec2<u32>,reserved:vec2<u32>};
@group(0) @binding(3) var<uniform> randomSource:RandomSource;
@compute @workgroup_size(64) fn randomSourceMain(@builtin(global_invocation_id) id:vec3<u32>){
 let at=id.x;if(at>=shape.count){return;}let i=shape.begin+at;let n=shape.side*shape.side;
 let a=mpsPhiloxValue(randomSource.counter,randomSource.key,i);let b=roundedAdd(1.0,mpsPhiloxValue(randomSource.counter,randomSource.key,n+i));
 let dx=roundedAdd(source[3u*n+i],-source[2u*n+i])*0.5;
 let dy=roundedAdd(source[5u*n+i],-source[4u*n+i])*0.5;
 let x0=roundedAdd(source[2u*n+i],dx*a);let x1=roundedAdd(source[2u*n+i],dx*b);
 let y0=roundedAdd(source[4u*n+i],dy*a);let y1=roundedAdd(source[4u*n+i],dy*b);
 var ox=f32(i%shape.side);var oy=f32(i/shape.side);
 if(shape.pad!=0u){ox=source[6u*n+i];oy=source[7u*n+i];}
 let xs=array<f32,5>(x0,x1,x0,x1,source[i]);let ys=array<f32,5>(y0,y0,y1,y1,source[n+i]);
 for(var k=0u;k<5u;k++){output[k*shape.count+at]=wrap(xs[k],ox);output[(5u+k)*shape.count+at]=wrap(ys[k],oy);}
}

struct NonlocalSource{counterX:vec4<u32>,counterY:vec4<u32>,key:vec2<u32>,reserved:vec2<u32>};
@group(0) @binding(4) var<uniform> nonlocalSource:NonlocalSource;
fn nonlocalIsLocal(x:f32,y:f32)->bool{
 let xx=x*x;let yy=y*y;return roundedAdd(xx,yy)<=25.0;
}
@compute @workgroup_size(64) fn nonlocalSourceMain(@builtin(global_invocation_id) id:vec3<u32>){
 let at=id.x;if(at>=shape.count){return;}let i=shape.begin+at;let n=shape.side*shape.side;
 let oldX=source[i];let oldY=source[n+i];var x=oldX;var y=oldY;
 if(nonlocalIsLocal(oldX,oldY)){
  let nx=mpsPhiloxValue(nonlocalSource.counterX,nonlocalSource.key,i);
  let ny=mpsPhiloxValue(nonlocalSource.counterY,nonlocalSource.key,i);
  let gx=f32(i%shape.side);let gy=f32(i/shape.side);
  x=roundedAdd(-gx,f32(shape.side)*nx);y=roundedAdd(-gy,f32(shape.side)*ny);
  if(shape.pad!=0u){x=roundedAdd(x,roundedAdd(gx,-source[2u*n+i]));y=roundedAdd(y,roundedAdd(gy,-source[3u*n+i]));}
 }
 output[at]=x;output[shape.count+at]=y;
}
`;

export async function createCandidateGpu({budget,operation=(_label,work)=>work(),maximumTilePixels=262144,onRetirementOwner,signal,residentEvaluator=false}={}){
 requireValue(budget?.reserve&&Number.isInteger(maximumTilePixels)&&maximumTilePixels>0,'Candidate GPU shared budget required');
 requireValue(onRetirementOwner===undefined||typeof onRetirementOwner==='function','Candidate retirement callback');
 let adapter,device,binding=0,tilePixels=0,pipeline,randomPipeline,sourceRandomPipeline,nonlocalPipeline,shaderModule,nonlocalPipelineRelease,nonlocalUnavailable=false,initialized=false,busy=false,disposed=false,lost=false,closing,destroyed=false,contextClosed=false;
 // Funds the context/pipelines before requestDevice or compilation, including
 // metadata of refused owners retained until their real acknowledgement.
 let pipelineRelease=budget.reserve(6*1024**2);
 const scorePipelines=new Map(),scoreSources=new Map();let scoreFee,halfQualification,deferredPipeline,deferredFee,deferredUnavailable=false;
 const buffers=new Map(),orphans=new Set(),retirements=new Set(),failedOutputs=new Set(),lostWaiters=new Set();
 const stats={residentNonlocalFusedCalls:0,residentCalls:0,residentSelectedReadbackBytes:0,residentInputUploadBytes:0,residentSourceUploadBytes:0,calls:0,propagationCalls:0,randomCalls:0,nonlocalCalls:0,pixels:0,dispatches:0,transportBytes:0,readbackBytes:0,bufferAllocations:0,bufferReuses:0,residentBytes:0,fallbacks:0};
 const lostErrors=new WeakSet(),lostFailure=()=>{const error=new EngineError('GPU_FAILED','Candidate GPU device lost');lostErrors.add(error);return error;};
 const withLost=async promise=>{if(lost){void Promise.resolve(promise).catch(()=>{});throw lostFailure();}let rejectLost;const terminal=new Promise((_,reject)=>{rejectLost=()=>reject(lostFailure());lostWaiters.add(rejectLost);});try{return await Promise.race([promise,terminal]);}catch(error){if(lost)throw lostFailure();throw error;}finally{lostWaiters.delete(rejectLost);}};
 const newRun=()=>({queued:false,acknowledged:true,scopes:0,complete:false,hasPrimary:false});
 const push=(run,kind)=>{try{device.pushErrorScope(kind);run.scopes++;}catch(error){run.scopeUnknown=true;run.scopeFailure=error;throw error;}};
 const pop=async run=>{try{const value=await withLost(device.popErrorScope());run.scopes--;return value;}catch(error){run.scopeUnknown=true;run.scopeFailure=error;throw error;}};
 const write=(run,...args)=>{run.queued=true;run.acknowledged=false;device.queue.writeBuffer(...args);};
 const submit=(run,...args)=>{run.queued=true;run.acknowledged=false;device.queue.submit(...args);};
 const ownedResult=(x,y,fees)=>{let result;const owner=createConvolutionSyncRetirement(fees.map(fee=>()=>fee()));result={x,y,release(){try{owner.release();failedOutputs.delete(result);}catch(error){failedOutputs.add(result);throw error;}}};return result;};
 const retire=entry=>{entry.retirement.release();orphans.delete(entry);};
 const buffer=(key,size,usage)=>{
  const old=buffers.get(key);if(old&&!old.retirement.started&&old.size>=size){stats.bufferReuses++;return old.buffer;}
  requireValue(size<=binding,'Candidate GPU binding limit');if(old){retire(old);buffers.delete(key);}
  const entry={size,free:null,buffer:null,backing:null,allocated:false};
  entry.retirement=createConvolutionSyncRetirement([()=>entry.buffer?.destroy(),()=>entry.backing?.(),()=>entry.free?.(),()=>{if(entry.allocated){stats.residentBytes-=entry.size;entry.allocated=false;}},()=>{if(entry.buffer)budget.notifyBackingRelease?.('gpu',entry.size);},()=>{entry.buffer=null;entry.backing=null;entry.free=null;}]);
  orphans.add(entry);
  try{entry.free=budget.reserve(size);entry.buffer=device.createBuffer({size,usage});entry.allocated=true;stats.residentBytes+=size;stats.bufferAllocations++;entry.backing=budget.registerBacking?.('gpu',size,{owner:'d2prl',label:'candidate-'+key});buffers.set(key,entry);orphans.delete(entry);return entry.buffer;}
  catch(error){try{retire(entry);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw normalizeResourceError(error);}
 };
 function runRetirement(run){
  const local=createConvolutionSyncRetirement([()=>{if(run.read?.mapState==='mapped')run.read.unmap();},()=>{if(!run.complete)run.resultRelease?.();},()=>{if(!run.complete)run.resultMetadata?.();},()=>run.temporary?.(),()=>run.lease?.release()]);
  return{async release(){
   if(run.mapping){try{await withLost(run.mapping);}catch(error){if(!lost&&run.acknowledged)throw error;}run.mapping=null;}
   if(run.queued&&!run.acknowledged&&!lost){try{await withLost(device.queue.onSubmittedWorkDone());run.acknowledged=true;}catch(error){if(!lost)throw error;}}
   if(lost)run.scopes=0;else{if(run.scopeUnknown)throw run.scopeFailure;while(run.scopes>0)await pop(run);}
   local.release();
  }};
 }
 async function drainRetirements(){let failed=false,primary;const attempt=async work=>{try{await work();}catch(error){if(!failed){failed=true;primary=error;}}};for(const record of [...retirements])await attempt(async()=>{await record.release();retirements.delete(record);});for(const entry of [...orphans])await attempt(()=>retire(entry));for(const [key,entry]of [...buffers])if(entry.retirement.started)await attempt(()=>{retire(entry);buffers.delete(key);});if(failed)throw primary;}
 const closeContext=async()=>{if(contextClosed)return;if(device){if(!destroyed){device.destroy();destroyed=true;}await device.lost;lost=true;}contextClosed=true;};
 async function retireAll(){
  // An explicit disposal may abandon work, but its bytes remain owned until
  // device.lost acknowledges the destroyed context. No fence refusal is hidden.
  await closeContext();let failed=false,primary;const attempt=async work=>{try{await work();}catch(error){if(!failed){failed=true;primary=error;}}};
  await attempt(drainRetirements);for(const [key,entry]of [...buffers])await attempt(()=>{retire(entry);buffers.delete(key);});for(const result of [...failedOutputs])await attempt(()=>result.release());
  if(failed)throw primary;pipeline=randomPipeline=sourceRandomPipeline=null;pipelineRelease?.();pipelineRelease=null;nonlocalPipeline=null;shaderModule=null;nonlocalPipelineRelease?.();nonlocalPipelineRelease=null;scorePipelines.clear();scoreSources.clear();scoreFee?.();scoreFee=null;deferredPipeline=null;deferredFee?.();deferredFee=null;
 }
 async function ensureNonlocal(){
  if(nonlocalPipeline)return true;if(nonlocalUnavailable)return false;
  try{nonlocalPipelineRelease??=budget.reserve(2*1024**2);nonlocalPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shaderModule,entryPoint:'nonlocalSourceMain'}});return true;}
  catch(error){const normalized=normalizeResourceError(error);if(['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(normalized?.code)){nonlocalUnavailable=!!nonlocalPipelineRelease;return false;}throw error;}
 }
 async function ensureDeferred(){
  if(deferredPipeline)return true;if(deferredUnavailable)return false;
  try{deferredFee??=budget.reserve(2*1024**2);deferredPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shaderModule,entryPoint:FUSED_NONLOCAL_RANDOM_ENTRYPOINT}});return true;}
  catch(error){const normalized=normalizeResourceError(error);if(['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(normalized?.code)){deferredUnavailable=!!deferredFee;return false;}throw error;}
 }
 const engine={
  nonlocalSourceAlgorithm:'pytorch-2.8-mps-philox4x32-10-float32/v1',
  isContextLostError:error=>lost&&lostErrors.has(error),
  randomSourceAlgorithm:'pytorch-2.8-mps-philox4x32-10-float32/v1',
  get stats(){return{...stats,...(halfQualification?{halfConversion:{...halfQualification}}:{}),tilePixels,retiringWorkspaces:retirements.size,retiringAllocations:orphans.size,failedOutputs:failedOutputs.size};},
  async propagateAndWrap(pair,side,{signal,originalX,originalY}={}){
   checkAbort(signal);requireValue(initialized&&!busy&&!disposed&&!lost,'Candidate GPU unavailable');const n=side*side;
   requireValue(Number.isInteger(side)&&side>=2&&side<=1792&&pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===n&&pair.y.length===n,'Candidate GPU input extent');
   const origins=originalX!==undefined||originalY!==undefined;requireValue(!origins||(originalX instanceof Float32Array&&originalY instanceof Float32Array&&originalX.length===n&&originalY.length===n),'Candidate GPU origin extent');
   busy=true;let run,record;
   try{
    run=newRun();await drainRetirements();record=runRetirement(run);retirements.add(record);
    // The shader uses a bounded exact remainder. Unusual finite values or
    // coordinates return to the existing CPU transformation without clipping.
    // The lower bound also prevents f32 subnormal arithmetic in this fast path.
    let stamp=performance.now();const valid=v=>Number.isFinite(v)&&Math.abs(v)<=side&&(v===0||Math.abs(v)>=7.888609052210118e-31);
    for(let i=0;i<n;i++){
     if(!valid(pair.x[i])||!valid(pair.y[i])||(origins&&(!valid(originalX[i])||!valid(originalY[i])))){stats.fallbacks++;return null;}
     if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
    }
    const maximum=Math.min(n,tilePixels),bytes=maximum*26*4;
    const inputBytes=(origins?16:8)*n;run.temporary=budget.reserve(2*inputBytes+bytes+4096);run.resultRelease=budget.reserve(26*n*4);run.resultMetadata=run.temporary.split(2048);
    const data=new Float32Array(26*n),x=data.subarray(0,13*n),y=data.subarray(13*n);
    const input=new Float32Array(inputBytes/4);input.set(pair.x);input.set(pair.y,n);if(origins){input.set(originalX,2*n);input.set(originalY,3*n);}
    run.lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-candidates'});
    push(run,'validation');push(run,'out-of-memory');
    const src=buffer('input',input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=buffer('output',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),uniform=buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);run.read=read;
    write(run,src,0,input);stats.transportBytes+=input.byteLength;
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[src,out,uniform].map((v,binding)=>({binding,resource:{buffer:v}}))});
    for(let begin=0;begin<n;begin+=tilePixels){
     checkAbort(signal);const count=Math.min(tilePixels,n-begin),size=count*26*4;write(run,uniform,0,new Uint32Array([side,begin,count,Number(origins)]));
     const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,size);checkAbort(signal);submit(run,[encoder.finish()]);run.queued=true;stats.dispatches++;
     await operation('candidate-gpu:readback',()=>run.mapping=withLost(read.mapAsync(GPUMapMode.READ,0,size)).then(value=>{run.acknowledged=true;return value;}),{bytes:size});
     try{checkAbort(signal);const mapped=new Float32Array(read.getMappedRange(0,size));for(let k=0;k<13;k++){x.set(mapped.subarray(k*count,(k+1)*count),k*n+begin);y.set(mapped.subarray((13+k)*count,(14+k)*count),k*n+begin);}}
     finally{read.unmap();run.mapping=null;}stats.readbackBytes+=size;
    }
    const oom=await pop(run);const invalid=await pop(run);
    if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    checkAbort(signal);if(lost)throw new EngineError('GPU_FAILED','Candidate GPU device lost');
    const result=ownedResult(x,y,[run.resultRelease,run.resultMetadata]);run.output=result;run.complete=true;stats.calls++;stats.propagationCalls++;stats.pixels+=n;return result;
   }catch(error){if(run){run.hasPrimary=true;run.primary=error;}throw error;}finally{try{if(record){await record.release();retirements.delete(record);}}catch(cleanup){if(run.output)try{run.output.release();}catch(outputCleanup){preserveConvolutionPrimary(cleanup,outputCleanup);}if(run.hasPrimary)preserveConvolutionPrimary(run.primary,cleanup);else throw cleanup;}finally{busy=false;}}
  },
  async randomAndWrap(pair,bounds,noise,side,{signal,originalX,originalY}={}){
   checkAbort(signal);requireValue(initialized&&!busy&&!disposed&&!lost,'Candidate GPU unavailable');const n=side*side;
   requireValue(Number.isInteger(side)&&side>=2&&side<=1792&&pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===n&&pair.y.length===n,'Candidate GPU input extent');
   const origins=originalX!==undefined||originalY!==undefined;requireValue(!origins||(originalX instanceof Float32Array&&originalY instanceof Float32Array&&originalX.length===n&&originalY.length===n),'Candidate GPU origin extent');
   const generated=noise?.algorithm==='pytorch-2.8-mps-philox4x32-10-float32/v1';if(generated)requireValue(noise.active===true&&noise.count===2*n&&noise.counter?.length===4&&noise.key?.length===2&&[...noise.counter,...noise.key].every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff),'Candidate Philox source extent');
   busy=true;let run,record;
   try{
    run=newRun();await drainRetirements();record=runRetirement(run);retirements.add(record);
    // The shader uses a bounded exact remainder. Unusual finite values or
    // coordinates return to the existing CPU transformation without clipping.
    // The lower bound also prevents f32 subnormal arithmetic in this fast path.
    requireValue((generated||noise instanceof Float32Array&&noise.length===2*n)&&['minX','maxX','minY','maxY'].every(k=>bounds?.[k] instanceof Float32Array&&bounds[k].length===n),'Candidate GPU random extent');
    if((generated?(origins?32:24):(origins?40:32))*n>binding){stats.fallbacks++;return null;}
    let stamp=performance.now();const small=7.888609052210118e-31;
    const valid=(v,limit)=>Number.isFinite(v)&&Math.abs(v)<=limit&&(v===0||Math.abs(v)>=small),noiseValid=v=>Number.isFinite(v)&&v>=0&&v<1&&(v===0||v>=5.960464477539063e-8);
    for(let i=0;i<n;i++){
     const lx=bounds.minX[i],hx=bounds.maxX[i],ly=bounds.minY[i],hy=bounds.maxY[i],a=generated?0:noise[i],b=generated?0:noise[n+i];
     const dx=Math.fround(Math.fround(hx-lx)/2),dy=Math.fround(Math.fround(hy-ly)/2);
     if(!valid(pair.x[i],side)||!valid(pair.y[i],side)||!valid(lx,2*side)||!valid(hx,2*side)||!valid(ly,2*side)||!valid(hy,2*side)||lx>hx||ly>hy||!valid(dx,2*side)||!valid(dy,2*side)||!noiseValid(a)||!noiseValid(b)||(origins&&(!valid(originalX[i],side)||!valid(originalY[i],side)))){stats.fallbacks++;return null;}
     if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
    }
    const maximum=Math.min(n,tilePixels),bytes=maximum*10*4;
    const inputBytes=(generated?(origins?32:24):(origins?40:32))*n;run.temporary=budget.reserve(2*inputBytes+bytes+4096);run.resultRelease=budget.reserve(10*n*4);run.resultMetadata=run.temporary.split(2048);
    const data=new Float32Array(10*n),x=data.subarray(0,5*n),y=data.subarray(5*n);
    const input=new Float32Array(inputBytes/4);input.set(pair.x);input.set(pair.y,n);for(const[k,key]of['minX','maxX','minY','maxY'].entries())input.set(bounds[key],(2+k)*n);if(!generated)input.set(noise,6*n);if(origins){input.set(originalX,(generated?6:8)*n);input.set(originalY,(generated?7:9)*n);}
    run.lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-random-candidates'});
    push(run,'validation');push(run,'out-of-memory');
    const src=buffer('input',input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=buffer('output',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),uniform=buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);run.read=read;
    write(run,src,0,input);stats.transportBytes+=input.byteLength;
    const chosenPipeline=generated?sourceRandomPipeline:randomPipeline,entries=[src,out,uniform].map((v,binding)=>({binding,resource:{buffer:v}}));if(generated){const sourceUniform=buffer('random-source',32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),words=new Uint32Array(8);words.set(noise.counter);words.set(noise.key,4);write(run,sourceUniform,0,words);entries.push({binding:3,resource:{buffer:sourceUniform}});}const group=device.createBindGroup({layout:chosenPipeline.getBindGroupLayout(0),entries});
    for(let begin=0;begin<n;begin+=tilePixels){
     checkAbort(signal);const count=Math.min(tilePixels,n-begin),size=count*10*4;write(run,uniform,0,new Uint32Array([side,begin,count,Number(origins)]));
     const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(chosenPipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,size);checkAbort(signal);submit(run,[encoder.finish()]);run.queued=true;stats.dispatches++;
     await operation('candidate-random-gpu:readback',()=>run.mapping=withLost(read.mapAsync(GPUMapMode.READ,0,size)).then(value=>{run.acknowledged=true;return value;}),{bytes:size});
     try{checkAbort(signal);const mapped=new Float32Array(read.getMappedRange(0,size));for(let k=0;k<5;k++){x.set(mapped.subarray(k*count,(k+1)*count),k*n+begin);y.set(mapped.subarray((5+k)*count,(6+k)*count),k*n+begin);}}
     finally{read.unmap();run.mapping=null;}stats.readbackBytes+=size;
    }
    const oom=await pop(run);const invalid=await pop(run);
    if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    checkAbort(signal);if(lost)throw new EngineError('GPU_FAILED','Candidate GPU device lost');
    const result=ownedResult(x,y,[run.resultRelease,run.resultMetadata]);run.output=result;run.complete=true;stats.calls++;stats.randomCalls++;stats.pixels+=n;return result;
   }catch(error){if(run){run.hasPrimary=true;run.primary=error;}throw error;}finally{try{if(record){await record.release();retirements.delete(record);}}catch(cleanup){if(run.output)try{run.output.release();}catch(outputCleanup){preserveConvolutionPrimary(cleanup,outputCleanup);}if(run.hasPrimary)preserveConvolutionPrimary(run.primary,cleanup);else throw cleanup;}finally{busy=false;}}
  },
  async nonlocalOffsets(pair,ticket,side,{signal,originalX,originalY,output}={}){
   checkAbort(signal);requireValue(initialized&&!busy&&!disposed&&!lost,'Candidate GPU unavailable');const n=side*side;
   requireValue(Number.isInteger(side)&&side>=2&&side<=1792&&pair?.x instanceof Float32Array&&pair.y instanceof Float32Array&&pair.x.length===n&&pair.y.length===n,'Nonlocal input extent');
   requireValue(output?.x instanceof Float32Array&&output.y instanceof Float32Array&&output.x.length===n&&output.y.length===n,'Caller-owned nonlocal output extent');
   const overlap=(a,b)=>a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;
   requireValue(!overlap(output.x,output.y)&&[output.x,output.y].every(target=>![pair.x,pair.y].some(source=>overlap(target,source))),'Nonlocal output aliases an input');
   const origins=originalX!==undefined||originalY!==undefined;requireValue(!origins||(originalX instanceof Float32Array&&originalY instanceof Float32Array&&originalX.length===n&&originalY.length===n&&!overlap(output.x,originalX)&&!overlap(output.x,originalY)&&!overlap(output.y,originalX)&&!overlap(output.y,originalY)),'Nonlocal origin extent');
   requireValue(ticket?.algorithm==='pytorch-2.8-mps-philox4x32-10-float32/v1'&&ticket.kind==='native-tensor-pair'&&ticket.active===true&&ticket.count===n&&ticket.counters?.length===2&&Array.from(ticket.counters).every(counter=>counter?.length===4&&Array.from(counter).every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff))&&ticket.key?.length===2&&Array.from(ticket.key).every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff),'Two active native nonlocal tensors required');
   busy=true;let run,record;
   try{
    run=newRun();await drainRetirements();record=runRetirement(run);retirements.add(record);
    if((origins?16:8)*n>binding){stats.fallbacks++;return null;}
    let stamp=performance.now();const small=7.888609052210118e-31,valid=v=>Number.isFinite(v)&&Math.abs(v)<=side&&(v===0||Math.abs(v)>=small);
    for(let i=0;i<n;i++){if(!valid(pair.x[i])||!valid(pair.y[i])||(origins&&(!valid(originalX[i])||!valid(originalY[i])))){stats.fallbacks++;return null;}if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
    run.lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-gpu-nonlocal-candidates'});
    push(run,'validation');push(run,'out-of-memory');if(!await ensureNonlocal()){stats.fallbacks++;return null;}checkAbort(signal);
    const maximum=Math.min(n,tilePixels),bytes=maximum*2*4,inputBytes=(origins?16:8)*n;run.temporary=budget.reserve(2*inputBytes+bytes+4096);
    const input=new Float32Array(inputBytes/4);input.set(pair.x);input.set(pair.y,n);if(origins){input.set(originalX,2*n);input.set(originalY,3*n);}
    const src=buffer('input',input.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=buffer('output',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),uniform=buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),sourceUniform=buffer('nonlocal-source',48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);run.read=read;
    const words=new Uint32Array(12);words.set(ticket.counters[0]);words.set(ticket.counters[1],4);words.set(ticket.key,8);write(run,src,0,input);write(run,sourceUniform,0,words);stats.transportBytes+=input.byteLength;
    const entries=[src,out,uniform].map((buffer,binding)=>({binding,resource:{buffer}}));entries.push({binding:4,resource:{buffer:sourceUniform}});const group=device.createBindGroup({layout:nonlocalPipeline.getBindGroupLayout(0),entries});
    for(let begin=0;begin<n;begin+=tilePixels){
     checkAbort(signal);const count=Math.min(tilePixels,n-begin),size=count*2*4;write(run,uniform,0,new Uint32Array([side,begin,count,Number(origins)]));
     const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(nonlocalPipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,size);checkAbort(signal);submit(run,[encoder.finish()]);stats.dispatches++;
     await operation('candidate-nonlocal-gpu:readback',()=>run.mapping=withLost(read.mapAsync(GPUMapMode.READ,0,size)).then(value=>{run.acknowledged=true;return value;}),{bytes:size});
     try{checkAbort(signal);const mapped=new Float32Array(read.getMappedRange(0,size));output.x.set(mapped.subarray(0,count),begin);output.y.set(mapped.subarray(count,2*count),begin);}finally{read.unmap();run.mapping=null;}stats.readbackBytes+=size;
    }
    const oom=await pop(run),invalid=await pop(run);if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message,oom?{details:{allocationKind:'gpu'}}:undefined);
    checkAbort(signal);if(lost)throw new EngineError('GPU_FAILED','Candidate GPU device lost');run.complete=true;stats.calls++;stats.nonlocalCalls++;stats.pixels+=n;return output;
   }catch(error){if(run){run.hasPrimary=true;run.primary=error;}throw error;}finally{try{if(record){await record.release();retirements.delete(record);}}catch(cleanup){if(run.hasPrimary)preserveConvolutionPrimary(run.primary,cleanup);else throw cleanup;}finally{busy=false;}}
  },
  async evaluateResident(plan,{source,side,channels,referenceThreads=8},{signal}={}){
   checkAbort(signal);requireValue(residentEvaluator&&initialized&&!busy&&!disposed&&!lost,'Resident evaluator unavailable');const frame=residentPlanFrame(plan),n=side*side;
   requireValue(frame&&!frame.closed&&side===448&&frame.side===side&&[36,96].includes(channels)&&source instanceof Uint16Array&&source.length===channels*n&&Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Resident normal448 extent');
   const selected=signal?AbortSignal.any([signal,frame.signal]):frame.signal,kind=frame.kind,candidates=kind==='random'?5:13,positions=candidates*n;busy=true;let run,record;
   try{
    await plan.drainGpu();checkAbort(selected);run=newRun();await drainRetirements();record=runRetirement(run);retirements.add(record);plan.adoptGpuRetirement(()=>record.release());
    // The same Native445e bounded certificate. Unusual finite inputs retain
    // the original CPU candidate transform and the SAME ticket recipe.
    const packed=frame.packed,small=2**-100,valid=(v,limit)=>Number.isFinite(v)&&Math.abs(v)<=limit&&(v===0||Math.abs(v)>=small);let admitted=true,stamp=performance.now();
    for(let i=0;i<n;i++){
     if(!valid(packed[i],side)||!valid(packed[n+i],side)){admitted=false;break;}
     if(kind==='random'&&!frame.nonlocal){const lx=packed[2*n+i],hx=packed[3*n+i],ly=packed[4*n+i],hy=packed[5*n+i],dx=Math.fround(Math.fround(hx-lx)/2),dy=Math.fround(Math.fround(hy-ly)/2);if(!valid(lx,2*side)||!valid(hx,2*side)||!valid(ly,2*side)||!valid(hy,2*side)||lx>hx||ly>hy||!valid(dx,2*side)||!valid(dy,2*side)){admitted=false;break;}}
     if((i&8191)===0&&performance.now()-stamp>=8){await controlCheckpoint(selected);stamp=performance.now();}
    }
    if(frame.nonlocal&&admitted&&!await ensureDeferred())admitted=false;
    let cpu,hostInput;if(!admitted){cpu=await plan.materialize();stats.fallbacks++;}
    const inputBytes=admitted?packed.byteLength:positions*8,bytes=n*8,token=getD2prlDescriptorLease(source),oldSource=scoreSources.get(channels),sourceNeedsUpload=!token||oldSource?.token!==token||oldSource?.ref.deref()!==source||buffers.get('score-source-'+channels)?.buffer!==oldSource?.buffer;
    run.temporary=budget.reserve(2*inputBytes+bytes+4096+(sourceNeedsUpload?source.byteLength:0));run.resultRelease=budget.reserve(bytes);run.resultMetadata=run.temporary.split(2048);if(cpu){hostInput=new Float32Array(positions*2);hostInput.set(cpu.x);hostInput.set(cpu.y,positions);}
    run.lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal:selected,resourceOwner:'d2prl',label:'d2prl-resident-candidates-score'});push(run,'validation');push(run,'out-of-memory');
    const src=buffer('score-source-'+channels,source.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);if(sourceNeedsUpload){write(run,src,0,source);scoreSources.set(channels,{token,ref:new WeakRef(source),buffer:src});stats.residentSourceUploadBytes+=source.byteLength;}
    const candidate=buffer('resident-candidates',positions*8,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),out=buffer('resident-selected',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=buffer('resident-readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),meta=buffer('resident-meta',4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),target=buffer('resident-target',4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),foreign=buffer('resident-foreign',4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),uniform=buffer('resident-score-shape',64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);run.read=read;
    const shape=new ArrayBuffer(64),u=new Uint32Array(shape),f=new Float32Array(shape);u.set([side,channels,candidates,0,n,referenceThreads,0,0]);f.set([0,0,side-1,side-1],8);u.set([0,0,0,1],12);write(run,uniform,0,new Uint8Array(shape));write(run,meta,0,new Int32Array(1));write(run,target,0,new Uint16Array(2));write(run,foreign,0,new Uint16Array(2));
    const encoder=device.createCommandEncoder();if(admitted){
     const sampleInput=buffer('input',packed.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),sampleShape=buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),chosen=frame.nonlocal?deferredPipeline:kind==='random'?sourceRandomPipeline:pipeline,entries=[sampleInput,candidate,sampleShape].map((buffer,binding)=>({binding,resource:{buffer}}));write(run,sampleInput,0,packed);write(run,sampleShape,0,new Uint32Array([side,0,n,0]));
     if(kind==='random'){requireValue(frame.ticket?.active&&frame.ticket.count===2*n,'Resident active source');const rng=buffer('random-source',32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),words=new Uint32Array(8);words.set(frame.ticket.counter);words.set(frame.ticket.key,4);write(run,rng,0,words);entries.push({binding:3,resource:{buffer:rng}});}
     if(frame.nonlocal){const dual=buffer('deferred-nonlocal-source',48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),words=new Uint32Array(12);words.set(frame.nonlocal.counters[0]);words.set(frame.nonlocal.counters[1],4);words.set(frame.nonlocal.key,8);write(run,dual,0,words);entries.push({binding:4,resource:{buffer:dual}});}
     const group=device.createBindGroup({layout:chosen.getBindGroupLayout(0),entries}),pass=encoder.beginComputePass();pass.setPipeline(chosen);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();stats.dispatches++;
    }else write(run,candidate,0,hostInput);
    const score=scorePipelines.get(channels),group=device.createBindGroup({layout:score.getBindGroupLayout(0),entries:[src,target,candidate,meta,out,uniform,foreign].map((buffer,binding)=>({binding,resource:{buffer}}))}),pass=encoder.beginComputePass();pass.setPipeline(score);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();encoder.copyBufferToBuffer(out,0,read,0,bytes);checkAbort(selected);submit(run,[encoder.finish()]);stats.dispatches++;stats.residentInputUploadBytes+=inputBytes+76+(admitted?16+(kind==='random'?32:0)+(frame.nonlocal?48:0):0);
    await operation(kind==='random'?'candidate-random-gpu:readback':'candidate-gpu:readback',()=>run.mapping=withLost(read.mapAsync(GPUMapMode.READ,0,bytes)).then(value=>{run.acknowledged=true;return value;}),{bytes});
    let data;try{checkAbort(selected);data=new Float32Array(bytes/4);data.set(new Float32Array(read.getMappedRange(0,bytes)));}finally{read.unmap();run.mapping=null;}
    const oom=await pop(run),invalid=await pop(run);if(oom||invalid)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??invalid).message,oom?{details:{allocationKind:'gpu'}}:undefined);checkAbort(selected);if(lost)throw lostFailure();
    const result=ownedResult(data.subarray(0,n),data.subarray(n),[run.resultRelease,run.resultMetadata]);run.output=result;run.complete=true;stats.calls++;stats.residentCalls++;if(frame.nonlocal&&admitted)stats.residentNonlocalFusedCalls++;stats.residentSelectedReadbackBytes+=bytes;stats.pixels+=n;if(kind==='random')stats.randomCalls++;else stats.propagationCalls++;return result;
   }catch(error){if(run){run.hasPrimary=true;run.primary=error;}throw error;}finally{try{if(record){await record.release();retirements.delete(record);}}catch(cleanup){if(run.output)try{run.output.release();}catch(outputCleanup){preserveConvolutionPrimary(cleanup,outputCleanup);}if(run.hasPrimary)preserveConvolutionPrimary(run.primary,cleanup);else throw cleanup;}finally{busy=false;}}
  },

  dispose(){requireValue(initialized&&!busy,'Candidate GPU busy');if(closing)return closing;disposed=true;const task=retireAll();closing=task;task.then(()=>{if(closing===task)closing=null;},()=>{if(closing===task)closing=null;});return task;}
 };
 try{
  onRetirementOwner?.(engine);
  adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new EngineError('GPU_UNAVAILABLE','Candidate WebGPU adapter unavailable');
  binding=Math.min(adapter.limits.maxStorageBufferBindingSize,adapter.limits.maxBufferSize);tilePixels=Math.floor(Math.min(maximumTilePixels,binding/(26*4),adapter.limits.maxComputeWorkgroupsPerDimension*64));requireValue(tilePixels>0,'Candidate GPU tile limit');
  device=await adapter.requestDevice({requiredLimits:{maxStorageBufferBindingSize:binding,maxBufferSize:adapter.limits.maxBufferSize}});
  device.lost.then(()=>{lost=true;for(const reject of lostWaiters)reject();lostWaiters.clear();},()=>{});
  const module=shaderModule=device.createShaderModule({code:CANDIDATE_WGSL+(residentEvaluator?FUSED_NONLOCAL_RANDOM_WGSL:"")}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED',info.messages.map(m=>m.message).join('\n'));
  pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});randomPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'randomMain'}});sourceRandomPipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'randomSourceMain'}});
  if(residentEvaluator){halfQualification={decode:true,round:true,mode:'builtin-unprobed',reason:'runtime-probes-disabled',probed:false,qualified:false,cases:{decode:0,round:0}};scoreFee=budget.reserve(4*1024**2);
  for(const channels of [36,96]){const shader=device.createShaderModule({code:specializeEvaluatorShader(D2PRL_EVALUATOR_WGSL,{channels,arithmetic:'mps'})}),info=await shader.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new EngineError('GPU_FAILED','Resident scorer compilation');scorePipelines.set(channels,await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main',constants:{d2prlBuiltinDecode:Number(halfQualification.decode),d2prlBuiltinHalf:Number(halfQualification.round)}}}));}
  }
  initialized=true;return engine;
 }catch(error){initialized=true;try{await engine.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw normalizeResourceError(error);}
}
