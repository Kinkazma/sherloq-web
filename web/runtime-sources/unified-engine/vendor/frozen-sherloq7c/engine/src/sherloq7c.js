import "../../../../../runtime-context.js?v=0.31.0";
import {prepare7cNative16,baseline7c,solveTarget7c,linked7cNative16Cooperative,stretch7cNative16,strictTargetSeed7c,cooperator,allocate7c,copy7c} from './sherloq7c-math.js';
import {solveTarget7cWasm,createTargetWasmModule,createTargetWasmSession} from './sherloq7c-target-wasm.js';
import {prepare7cNative16Native,nativeGraphPlan} from './sherloq7c-graph-native.js';
import {createProjectionOSQP} from './sherloq7c-project.js';
const error=(code,message,details)=>Object.assign(new Error(message),{code,details});
const MiB=1024*1024;
const pageCeil=bytes=>Math.ceil(bytes/65536)*65536;
const maxComponentBytes=p=>p.levels.length*8;
function attachCleanup(primary,cleanup){if(primary&&typeof primary==='object')try{if(Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}}
async function admitPreviousSeed(p,raw,{signal}){
 const cooperate=cooperator(signal);let total=0,violated=0,edges=0,invalidBounds=0;
 for(let i=0;i<raw.length;i++){if(!(raw[i]>0&&raw[i]<1))invalidBounds++;if((i&16383)===0)await cooperate();}
 for(let e=0;e<p.low.length;e++){
  const mass=p.multiplicity[e];total+=mass;
  if(!(raw[p.high[e]]-raw[p.low[e]]>.1*p.difference[e])){violated+=mass;edges++;}
  if((e&16383)===0)await cooperate();
 }
 const fraction=total?violated/total:0;
 // Offline-qualified performance heuristic, not a mathematical certificate.
 // Only the starting point changes; the full current problem is still solved.
 return {accepted:invalidBounds===0&&fraction<=.01,violatingMultiplicityFraction:fraction,violatingEdges:edges,invalidBounds,threshold:.01};
}
async function sourceKey(source,{reserve,signal}){
 // Original-file identity alone is insufficient: ELA/gradient/adjustment
 // proxies can change pixels while keeping the same original and buffer id.
 if(source.immutable===true&&source.identityVerified===true&&/^[a-f0-9]{64}$/.test(source.pixelSha256??''))return source.width+'x'+source.height+':rgb16:'+source.pixelSha256;
 const release=reserve(source.data.byteLength+32);
 try{const bytes=new Uint8Array(source.data.buffer,source.data.byteOffset,source.data.byteLength),digest=await crypto.subtle.digest('SHA-256',bytes);if(signal?.aborted)throw error('CANCELLED','Proxy superseded during identification.');return source.width+'x'+source.height+':rgb16:'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}finally{release();}
}

// One instance belongs to one shared engine/worker, never one instance per input
// event. Source inputs are borrowed immutable RGB16 owner views. Output arrays
// have an independent reservation until the caller awaits release().
export function createSherloq7C({budget,kernel='wasm',maxCachedValues=6,dynamicWarmStart=true,gpuAutoMinimumComponents=32768,gpuInitialIterations=null,gpuColdZeroIterations=512,gpuLargeColdZeroIterations=4096,gpuDualScale=64,nativeGraph=true,gpuNativePacking=true}={}){
 let closed=false,disposed=false,busy=false,current=null,targetModule=null,targetHeapLease=null,targetHeapMaximum=0;
 let gpuTarget=null,gpuAttempts=0;
 const projectionHeapHints=new Map();
 const retainedOutputs=new Set(),unregisterReclaimers=[];let cacheHits=0,cacheMisses=0;
 const reserve=bytes=>budget?.reserve?budget.reserve(bytes):()=>{};
 const availablePolicy=()=>Number.isSafeInteger(budget?.limit)&&typeof budget?.total==='function'?Math.max(0,budget.limit-budget.total()):Infinity;
 function noteProjectionHeapRefusal(entry,cause){
  const maximum=cause?.details?.maximumBytes;
  if(cause?.code!=='MEMORY_ALLOCATION'||cause.details?.allocationKind!=='wasm'||!Number.isSafeInteger(maximum)||maximum<=0)return;
  const next=Math.min(2**31,pageCeil(maximum*2));projectionHeapHints.delete(entry.key);projectionHeapHints.set(entry.key,next);while(projectionHeapHints.size>8)projectionHeapHints.delete(projectionHeapHints.keys().next().value);
 }
 async function retireProjectionWorkspace(entry){if(!entry?.projection)return;await entry.projection.dispose();entry.projection=null;entry.projectionLease?.();entry.projectionLease=null;}
 async function reserveForTarget(entry,bytes){try{return reserve(bytes);}catch(e){if(e.code!=='MEMORY_LIMIT'||!entry.projection)throw e;try{await retireProjectionWorkspace(entry);}catch(cleanup){attachCleanup(e,cleanup);throw e;}return reserve(bytes);}}
 function retireTargetWorkspace(entry){entry?.targetSession?.dispose();if(entry)entry.targetSession=null;targetModule=null;targetHeapLease?.();targetHeapLease=null;targetHeapMaximum=0;}
 function ownResult(out,metrics,ownedLease){
  let released=false;const result={...out,metrics,async release(){if(released)return;released=true;retainedOutputs.delete(result);for(const key of ['pixels','pixels16','scalar'])result[key]=null;ownedLease();}};retainedOutputs.add(result);return result;
 }
 const releaseEntry=async entry=>{
  if(!entry)return;const failures=[];const attempt=async f=>{try{await f();}catch(e){failures.push(e);}};
  await attempt(()=>{entry.targetSession?.dispose();entry.targetSession=null;});
  await attempt(async()=>{await entry.projection?.dispose();entry.projection=null;entry.projectionLease?.();entry.projectionLease=null;});
  for(const [key,item]of entry.targets)await attempt(()=>{item.lease();entry.targets.delete(key);});
  for(const [key,item]of entry.bases)await attempt(()=>{item.lease();entry.bases.delete(key);});
  if(entry.warm)await attempt(()=>{entry.warm.release();entry.warm=null;});
  if(!entry.targetSession&&!entry.projection&&!entry.targets.size&&!entry.bases.size)await attempt(()=>{entry.graphLease();entry.p=null;});
  if(failures.length)throw new AggregateError(failures,'Sherloq cache retirement failed.',{cause:failures[0]});
 };
 async function clearCache(){if(busy)throw error('BUSY','Sherloq calculation must settle before clearing its cache.');const entry=current;await releaseEntry(entry);if(current===entry)current=null;}
 async function reclaimIdle({allocationKind='array-buffer'}={}){
  if(busy)return 0;
  let retired=0;
  if(allocationKind==='wasm'){
   retired=(targetModule?.HEAPU8.buffer.byteLength??0)+(current?.projection?.memoryBytes??0);
   // Retire the requested arena without discarding already certified JS
   // targets. A failed QP setup can then retry without recomputing them.
   await retireProjectionWorkspace(current);retireTargetWorkspace(current);return retired;
  }
  if(current){retired=current.p?.ownedBytes??0;for(const item of current.targets.values())retired+=item.z.byteLength;for(const item of current.bases.values())retired+=item.z.byteLength;}
  await clearCache();
  // Count only known materialized buffers made unreachable in this domain,
  // never the larger policy envelopes reserved for possible WASM growth.
  return retired;
 }
 if(budget?.registerAsyncReclaimer)for(const allocationKind of ['array-buffer','wasm'])unregisterReclaimers.push(budget.registerAsyncReclaimer(context=>reclaimIdle({...context,allocationKind:context?.allocationKind??allocationKind}),{owner:'sherloq7c',label:'idle-sherloq7c-'+allocationKind,allocationKind,discardOnAllocationFailure:true}));
 async function ensureTargetModule(p){
  // Conservative hard maximum includes native vectors, IC(0), source copies
  // and allocator growth; admission happens before instantiating/growing WASM.
  const needed=pageCeil(Math.max(16*MiB,96*p.low.length+256*p.levels.length+8*MiB));
  if(targetModule&&needed<=targetHeapMaximum)return targetModule;
  targetModule=null;targetHeapLease?.();targetHeapLease=null;targetHeapMaximum=0;
  let lease,maximum=needed;try{lease=reserve(needed);}catch(e){
   if(e.code!=='MEMORY_LIMIT')throw e;
   if(current?.p===p&&current.projection)try{await retireProjectionWorkspace(current);}catch(cleanup){attachCleanup(e,cleanup);throw e;}
   maximum=Math.floor(Math.min(needed,availablePolicy())/65536)*65536;if(maximum<16*MiB)throw e;lease=reserve(maximum);
  }
  try{targetModule=await createTargetWasmModule({memoryBudgetBytes:maximum});targetHeapLease=lease;targetHeapMaximum=maximum;return targetModule;}catch(e){lease();throw e;}
 }
 async function ensureGpuTarget(){
  if(gpuTarget)return gpuTarget;
  const {Sherloq7cTargetGpu}=await import('./sherloq7c-target-gpu.js');
  return gpuTarget=new Sherloq7cTargetGpu(budget);
 }
 async function getEntry(source,hooks){
  const key=await sourceKey(source,{reserve,signal:hooks.signal}),N=source.width*source.height;
  if(current&&current.key===key&&current.width===source.width&&current.height===source.height){cacheHits++;return current;}
  cacheMisses++;const old=current;let warm=null;
  if(dynamicWarmStart&&source.dynamicProxy===true&&old&&old.width===source.width&&old.height===source.height){
   const items=new Map(),wanted=hooks.revelation===1?[hooks.micro]:[0,hooks.micro];
   for(const b of wanted){let candidate,nearest=Infinity;for(const [value,item]of old.targets)if(Math.abs(value-b)<nearest){nearest=Math.abs(value-b);candidate=[value,item];}if(candidate)items.set(candidate[0],candidate[1]);}
   const fields=new Map(),leases=[],cooperate=cooperator(hooks.signal);let released=false;
   try{
    for(const [b,item]of items){const lease=reserve(N*8);leases.push(lease);const values=allocate7c(Float64Array,N);for(let i=0;i<N;i++){values[i]=item.z[old.p.labels[i]];if((i&16383)===0)await cooperate();}fields.set(b,values);}
    if(fields.size)warm={fields,release(){if(released)return;released=true;fields.clear();for(const lease of leases)lease();}};
   }catch(e){for(const lease of leases)lease();if(hooks.signal?.aborted)throw e;if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code))throw e;}
   if(!warm&&old.warm){warm=old.warm;old.warm=null;}
  }
  try{await releaseEntry(old);}catch(e){warm?.release();throw e;}if(current===old)current=null;
  // Prefer the native graph only when its full heap and simultaneous JS
  // outputs fit. Otherwise keep the existing JS path and its smaller envelope.
  let staging,prepare=prepare7cNative16,preparationBackend='js';
  if(nativeGraph&&kernel==='wasm'&&N>=32768){
   try{const plan=nativeGraphPlan(source.width,source.height);staging=reserve(plan.wasmMaximumBytes+plan.maximumOutputBytes);prepare=prepare7cNative16Native;preparationBackend='wasm';}
   catch(e){if(e.code!=='MEMORY_LIMIT'){warm?.release();throw e;}}
  }
  if(!staging)try{staging=reserve(320*N+MiB);}catch(e){warm?.release();throw e;}
  let p;
  try{
   hooks.onProgress?.({phase:'sherloq-prepare-start',fraction:0,proxyRevision:source.proxyRevision??source.revision??null});
   try{p=await prepare(source,hooks);}
   catch(e){
    if(hooks.signal?.aborted)throw error('CANCELLED','Task cancelled.');
    if(prepare!==prepare7cNative16Native||e.code!=='MEMORY_ALLOCATION'||e.details?.allocationKind!=='wasm')throw e;
    // Native preparation rejects only after its finally has destroyed the
    // graph and input. Release its larger envelope before admitting JS; keep
    // the optional warm fields alive across this one resource-specific retry.
    staging();staging=null;staging=reserve(320*N+MiB);
    preparationBackend='js';p=await prepare7cNative16(source,hooks);
   }
  }catch(e){warm?.release();if(hooks.signal?.aborted&&e.code!=='CANCELLED')throw error('CANCELLED','Task cancelled.');throw e;}finally{staging?.();}
  let graphLease;try{graphLease=reserve(p.ownedBytes);}catch(e){warm?.release();throw e;}
  return current={key,width:source.width,height:source.height,p,graphLease,preparationBackend,warm,targets:new Map(),bases:new Map(),projection:null,projectionLease:null};
 }
 function touch(map,key,item){map.delete(key);map.set(key,item);return item;}
 function trim(map,protectZero=false){while(map.size>maxCachedValues){let key=map.keys().next().value;if(protectZero&&key===0){touch(map,key,map.get(key));key=map.keys().next().value;}const item=map.get(key);map.delete(key);item.lease();}}
 async function target(entry,micro,options){
  const cached=entry.targets.get(micro);
  if(cached&&(options.maxError===null?cached.metrics.rmsErrorBound<=options.tolerance:cached.metrics.maxErrorBound<=options.maxError)){touch(entry.targets,micro,cached);return {...cached,hit:true};}
  let initial=cached?.z,nearest=Infinity,warmKind=initial?'same-source-refinement':null;
  if(!initial)for(const [b,item]of entry.targets)if(Math.abs(b-micro)<nearest){nearest=Math.abs(b-micro);initial=item.z;warmKind='same-source-nearest';}
  let out,workspace,gpuOutput,gpuMetrics=null,autoFallback=null,warmAdmission=null,failed=false,primary;const candidates=[],candidateKinds=[];const lease=await reserveForTarget(entry,maxComponentBytes(entry.p));
  try{workspace=await reserveForTarget(entry,(kernel==='js'?56*entry.p.low.length+192*entry.p.levels.length:8*entry.p.low.length+128*entry.p.levels.length)+2*MiB);}catch(e){lease();throw e;}
  try{
   if(entry.warm?.fields.size){let pixels,distance=Infinity;for(const [b,values]of entry.warm.fields)if(Math.abs(b-micro)<distance){distance=Math.abs(b-micro);pixels=values;}
    const sums=allocate7c(Float64Array,entry.p.levels.length),cooperate=cooperator(options.signal);for(let i=0;i<pixels.length;i++){sums[entry.p.labels[i]]+=pixels[i];if((i&16383)===0)await cooperate();}for(let i=0;i<sums.length;i++)sums[i]/=entry.p.counts[i];warmAdmission=await admitPreviousSeed(entry.p,sums,options);
    if(warmAdmission.accepted){const previous=await strictTargetSeed7c(entry.p,sums,options);if(!initial){initial=previous;warmKind='previous-proxy-initial-only';}else{candidates.push(previous);candidateKinds.push('previous-proxy-initial-only');}}
   }
   // GPU computes an initializer on the complete current graph. The accepted
   // answer always comes from the original binary64 objective and certificate.
   // Auto's size policy is fixed from offline measurements, with no preflight.
   const useGpu=kernel==='wasm'&&(options.backend==='webgpu'||options.backend==='auto'&&entry.p.levels.length>=gpuAutoMinimumComponents&&globalThis.navigator?.gpu);
   if(useGpu){
    const provider=await ensureGpuTarget();gpuAttempts++;let submittedBatches=0;
    try{
     // A longer cold initializer replaces expensive native Newton/PCG work.
     // The policy depends on graph size, never on a timed calibration. Explicit
     // overrides, nearby cached seeds and strict modes keep their short policy.
     const coldFast=options.maxError===.002&&!cached&&!warmAdmission?.accepted&&(!initial||nearest>=.5);
     const largeGraph=entry.p.levels.length>=100000&&entry.p.low.length>=500000;
     const mediumGraph=entry.p.levels.length>=32768;
     const gpuIterations=coldFast&&micro===0?(largeGraph?gpuLargeColdZeroIterations:gpuColdZeroIterations)
       :gpuInitialIterations??(coldFast?(largeGraph?1024:mediumGraph?256:64):64);
     // Keep the seed away from nearly singular endpoint barriers. This guard
     // only repairs the initializer; the native objective and certificate do
     // not change, and the final result can be closer to either endpoint.
     const initialGuard=coldFast?1e-5:1e-7;
     gpuOutput=await provider.run(entry.p,micro,{maxIterations:gpuIterations,batchIterations:Math.min(512,gpuIterations),dualScale:gpuDualScale,initialGuard,nativePacking:gpuNativePacking&&entry.p.levels.length>=32768,certificateMode:'initializer',captureDual:false,packIndices:true,singleComputePass:true,signal:options.signal,onProgress:options.onProgress,onSubmitted:()=>{submittedBatches++;}});
     gpuMetrics={...gpuOutput.metrics,submittedBatches,completedReadbacks:gpuOutput.metrics.readbacks,completedAfterAck:true,role:'initializer-only'};
     if(initial){candidates.push(initial);candidateKinds.push(warmKind??'source-ranks');}initial=gpuOutput.z;warmKind='gpu-initializer';
    }catch(e){
     // mayFallback is true only after the provider has drained its transaction
     // and recognized a GPU resource/device failure. Cancellation never falls back.
     if(options.backend!=='auto'||!provider.mayFallback(e))throw e;
     autoFallback={code:e.code,message:e.message};
    }
   }
   if(kernel==='wasm'&&!entry.targetSession)entry.targetSession=await createTargetWasmSession(entry.p,{signal:options.signal,wasmModule:await ensureTargetModule(entry.p)});
   out=kernel==='js'?await solveTarget7c(entry.p,micro,{...options,initial}):await solveTarget7cWasm(entry.p,micro,{...options,initial,alternativeInitials:candidates,initialPolicy:'best-objective',wasmSession:entry.targetSession});
   const choice=out.metrics.initialChoice;out.metrics.warmStart=choice==='source-ranks'?'source-ranks':choice?.startsWith('alternative-')?candidateKinds[Number(choice.slice(12))]:warmKind??'source-ranks';
   out.metrics.gpu=gpuMetrics;out.metrics.actualGPUWork=!!gpuMetrics;out.metrics.gpuInitializerAccepted=!!gpuMetrics&&out.metrics.warmStart==='gpu-initializer';out.metrics.autoFallback=autoFallback;out.metrics.warmAdmission=warmAdmission;
  }catch(e){failed=true;primary=e;}
  finally{
   // A failed output ACK remains owned by the provider and can be retried on
   // disposal. It must neither mask the primary error nor leak a CPU result fee.
   for(const cleanup of [()=>gpuOutput?.release(),()=>workspace()])try{await cleanup();}catch(e){if(failed)attachCleanup(primary,e);else{failed=true;primary=e;}}
  }
  if(failed){try{lease();}catch(e){attachCleanup(primary,e);}throw primary;}
  if(cached){entry.targets.delete(micro);cached.lease();}
  const item={...out,lease};entry.targets.set(micro,item);trim(entry.targets,true);return {...item,hit:false};
 }
 async function projection(entry,t0,tb,hooks){
  const p=entry.p,basePlan=pageCeil(Math.max(32*MiB,256*p.low.length+256*p.levels.length+16*MiB));
  // Polishing can allocate another factorization after convergence. Its
  // envelope is funded as part of reference work, before the native solve.
  const plannedMaximum=Math.min(2**31,Math.max(basePlan*(hooks.certificateTolerance===undefined?2:1),projectionHeapHints.get(entry.key)??0));
  if(entry.projection&&(entry.projectionPolicy?.plannedMaximum??0)<plannedMaximum)await retireProjectionWorkspace(entry);
  if(!entry.projection){
   // CSC host staging is separate from the fixed maximum native heap.
   let host,lease,maximum,retiredTargetForBudget=false;
   try{host=reserve(128*p.low.length+192*p.levels.length+2*MiB);}catch(e){if(e.code!=='MEMORY_LIMIT'||!targetModule)throw e;retireTargetWorkspace(entry);retiredTargetForBudget=true;host=reserve(128*p.low.length+192*p.levels.length+2*MiB);}
   try{
    // Admit the conservative maximum when possible. Under pressure, idle
    // target storage may retire and the imported heap gets a smaller funded
    // maximum. The graph, objective and precision are never reduced.
    try{lease=reserve(plannedMaximum);maximum=plannedMaximum;}catch(e){
     if(e.code!=='MEMORY_LIMIT')throw e;
     if(targetModule){retireTargetWorkspace(entry);retiredTargetForBudget=true;}
     maximum=Math.floor(Math.min(plannedMaximum,availablePolicy())/65536)*65536;
     if(maximum<2*MiB)throw e;lease=reserve(maximum);
    }
   }catch(e){host();throw e;}
   // The owner survives individual requests. Its yield callback must not
   // capture the first request's AbortSignal; solve checks each current signal.
   try{entry.projection=await createProjectionOSQP(p,{eps:1e-11,reduce:true,returnDual:false,certifyInitialState:true,chunkIterations:50,memoryBudgetBytes:maximum,signal:hooks.signal,cooperate:cooperator()});entry.projectionPolicy={plannedMaximum,admittedMaximum:maximum,retiredTargetForBudget,chunkIterations:50};entry.projectionLease=()=>{host();lease();};}
   catch(e){noteProjectionHeapRefusal(entry,e);host();lease();throw e;}
  }
  hooks.onProgress?.({phase:'sherloq-projection',fraction:0});
  try{const out=await entry.projection.solve(t0,tb,{...hooks,onProgress:event=>hooks.onProgress?.({...event,phase:'sherloq-projection'})});out.info.memoryPolicy=entry.projectionPolicy;return out;}
  catch(e){noteProjectionHeapRefusal(entry,e);if(entry.projection.memoryBytes===0)try{await retireProjectionWorkspace(entry);}catch(cleanup){attachCleanup(e,cleanup);}throw e;}
 }
 async function run(source,params={},hooks={}){
  if(closed)throw error('DISPOSED','Sherloq engine is disposed.');if(busy)throw error('BUSY','Sherloq engine is already running.');
  const {revelation=0,micro=0,precision='reference'}=params;
  const requestedBackend=hooks.backend??params.backend??'auto';
  if(!['auto','cpu','webgpu'].includes(requestedBackend))throw error('INVALID_INPUT','Unknown Sherloq backend.');
  if(requestedBackend==='webgpu'&&kernel!=='wasm')throw error('GPU_UNAVAILABLE','The GPU initializer requires the binary64 WASM refinement kernel.');
  if(!(revelation>=0&&revelation<=1&&micro>=0&&micro<=1))throw error('INVALID_INPUT','Invalid Sherloq controls.');
  if(!(source.data instanceof Uint16Array)||!Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height)||source.width<1||source.height<1||!Number.isSafeInteger(source.width*source.height)||source.data.length!==source.width*source.height*3)throw error('INVALID_INPUT','A true RGB16 source with valid dimensions is required.');
  const started=performance.now(),N=source.width*source.height,tolerance={reference:null,'1e-2':.002,'1e-4':.00002,'1e-7':.00000002}[precision];
  if(tolerance===undefined)throw error('INVALID_INPUT','Unknown Sherloq precision.');
  const signal=hooks.signal,onProgress=hooks.onProgress;
  if(signal?.aborted)throw error('CANCELLED','Task cancelled.');busy=true;let outputLease,sourceLease,runScratchLease;
  try{
   // Unowned mutable proxies are snapshotted synchronously before the first
   // await, so a later producer update cannot mix two generations in one run.
   if(source.immutable!==true){
    sourceLease=reserve(source.data.byteLength);let snapshot;
    try{snapshot=new Uint16Array(source.data);}catch(cause){throw Object.assign(new Error('Proxy snapshot allocation failed.',{cause}),{code:'MEMORY_ALLOCATION',details:{allocationKind:'array-buffer',requestedBytes:source.data.byteLength}});}
    source={...source,data:snapshot,immutable:true,identityVerified:false};
   }
   onProgress?.({phase:'sherloq-input',fraction:1,proxyRevision:source.proxyRevision??source.revision??null});
   if(revelation===0&&micro===0){
    outputLease=reserve(N*17);const out=await stretch7cNative16(source,{signal,onProgress});if(signal?.aborted)throw error('CANCELLED','Proxy superseded before publication.');
    const result=ownResult(out,{version:'7C',workingBitDepth:16,nativeBitDepth:source.nativeBitDepth??source.sourceBitDepth??16,workingPrecision:'float64',requestedPrecision:precision,maxErrorBoundFloat:0,maxErrorBoundRGB16:.5/65535,actualBackend:'cpu',kernel:'linear-stretch-f64',cache:'not-required',elapsedMs:performance.now()-started,graphPrepared:false,proxyRevision:source.proxyRevision??source.revision??null},outputLease);outputLease=null;return result;
   }
   outputLease=reserve(N*17);
   const entry=await getEntry(source,{signal,onProgress,micro,revelation}),p=entry.p,n=p.levels.length;
   runScratchLease=reserve(n*(revelation===1?8:16));
   let z,base,targetValue,projectionInfo=null,targetInfos=[],actualBackend='cpu',cache='miss',numericMaxBound=0,targetBound=0,baseBound=0;
   const cachedZeroBase=revelation===0&&micro!==0?entry.bases.get(micro):null;
   if(!p.low.length){z=copy7c(p.levels);cache='constant';}
   else if(revelation===0&&micro===0){z=baseline7c(p);cache='stretch';}
   else if(cachedZeroBase?.precision===precision){z=cachedZeroBase.z;projectionInfo=cachedZeroBase.metrics;numericMaxBound=cachedZeroBase.maxErrorBound;cache='hit';touch(entry.bases,micro,cachedZeroBase);}
   else{
    const t=await target(entry,micro,{signal,onProgress,tolerance:2e-4,maxError:tolerance,backend:requestedBackend});targetValue=t.z;targetInfos.push({...t.metrics,cacheHit:t.hit});targetBound=t.metrics.maxErrorBound;
    if(revelation===1){z=targetValue;cache=t.hit?'hit':'miss';numericMaxBound=targetBound;}
    else{
     if(micro===0)base=baseline7c(p);
     else{
      const existing=entry.bases.get(micro);
      if(existing&&existing.precision===precision){base=existing.z;projectionInfo=existing.metrics;baseBound=existing.maxErrorBound;cache=t.hit?'hit':'miss';touch(entry.bases,micro,existing);}
      else{
       const t0=await target(entry,0,{signal,onProgress,tolerance:2e-4,maxError:tolerance,backend:requestedBackend});targetInfos.push({...t0.metrics,cacheHit:t0.hit});
       // Current-source target vectors now replace the previous proxy seeds.
       // Retire those optional full-image fields before admitting the QP.
       entry.warm?.release();entry.warm=null;
       // Finance the complete base's error, independently of revelation, so
       // every later reveal-only change can reuse the same certified base.
       const remaining=precision==='reference'?undefined:Math.max(1e-12,(Number(precision)-targetBound-t0.metrics.maxErrorBound)*.95);
       const baseLease=reserve(maxComponentBytes(p));let q;
       try{q=await projection(entry,t0.z,targetValue,{signal,onProgress,certificateTolerance:remaining});}catch(e){baseLease();throw e;}
       base=q.z;projectionInfo=q.info;baseBound=targetBound+t0.metrics.maxErrorBound+q.info.certificateMax;
       const old=entry.bases.get(micro);if(old)old.lease();entry.bases.set(micro,{z:base,metrics:q.info,precision,maxErrorBound:baseBound,lease:baseLease});trim(entry.bases);
      }
     }
     z=allocate7c(Float64Array,n);for(let i=0;i<n;i++)z[i]=(1-revelation)*base[i]+revelation*targetValue[i];numericMaxBound=(1-revelation)*baseBound+revelation*targetBound;
    }
   }
   if(signal?.aborted)throw error('CANCELLED','Task cancelled.');
   if(!Number.isFinite(numericMaxBound)||numericMaxBound<0||precision!=='reference'&&numericMaxBound>Number(precision))throw error('NUMERIC_PRECISION','The requested maximum error is not certified for this result.',{requested:precision==='reference'?null:Number(precision),maxErrorBound:numericMaxBound});
   const actualGPUWork=targetInfos.some(info=>!info.cacheHit&&info.actualGPUWork),actualUsefulGPUWork=targetInfos.some(info=>!info.cacheHit&&info.gpuInitializerAccepted);if(actualUsefulGPUWork)actualBackend='hybrid';
   entry.warm?.release();entry.warm=null;
   const out=await linked7cNative16Cooperative(source,p,z,{signal,onProgress});
   if(signal?.aborted)throw error('CANCELLED','Proxy superseded before RGB16 publication.');
   const result=ownResult(out,{version:'7C',workingBitDepth:16,nativeBitDepth:source.nativeBitDepth??source.sourceBitDepth??16,inputPixelIdentity:entry.key,proxyRevision:source.proxyRevision??source.revision??null,workingPrecision:'float64',requestedPrecision:precision,maxErrorBoundFloat:numericMaxBound,maxErrorBoundRGB16:numericMaxBound+.5/65535,requestedBackend,actualBackend,actualGPUWork,actualUsefulGPUWork,kernel,cache,elapsedMs:performance.now()-started,preparationMs:p.preparationMs,preparationBackend:entry.preparationBackend,targets:targetInfos,projection:projectionInfo,components:n,edges:p.low.length,sourceCache:{hits:cacheHits,misses:cacheMisses},targetHeapBytes:targetModule?.HEAPU8.buffer.byteLength??0,targetHeapMaximum},outputLease);outputLease=null;return result;
  }catch(e){outputLease?.();throw e;}finally{runScratchLease?.();sourceLease?.();busy=false;}
 }
 return {run,clearCache,async dispose(){if(busy)throw error('BUSY','Await cancellation before disposal.');if(disposed)return;closed=true;await clearCache();await gpuTarget?.dispose();gpuTarget=null;targetModule=null;targetHeapLease?.();targetHeapLease=null;targetHeapMaximum=0;for(const unregister of unregisterReclaimers)unregister?.();unregisterReclaimers.length=0;disposed=true;},memory(){return {busy,closed,gpuAttempts,sourceCacheHits:cacheHits,sourceCacheMisses:cacheMisses,retainedOutputs:retainedOutputs.size,targetHeapBytes:targetModule?.HEAPU8.buffer.byteLength??0,targetHeapMaximum,cachedTargets:current?.targets.size??0,cachedBases:current?.bases.size??0};}};
}
