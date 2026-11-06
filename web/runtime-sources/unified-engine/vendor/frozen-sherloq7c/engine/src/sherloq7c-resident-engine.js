import {createTargetWasmModule,createTargetWasmSession,solveTarget7cWasm} from './sherloq7c-target-wasm.js';
import {createProjectionOSQP} from './sherloq7c-project.js';
import {baseline7c,cooperator,allocate7c} from './sherloq7c-math.js';
import {createResidentOutput} from './sherloq7c-resident-memory.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';

const MiB=1024**2,page=65536,round=n=>Math.ceil(n/page)*page;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','Resident 7C calculation cancelled.');};

// This engine shares the frozen solver and GPU initializer. Preparation and
// presentation are separate owners: there is no full-image Float64 source or
// simultaneous RGB8/RGB16/scalar result materialization in this path.
export function createSherloq7CResident({budget,prepareGraph,gpu=true}={}){
 if(!budget?.reserve||typeof prepareGraph!=='function')throw fail('INVALID_INPUT','Resident budget and graph preparation required.');
 let current=null,busy=false,closed=false,provider=null,maintenance=null;
 const outputs=new Set();
 async function retire(entry){
  if(entry.retired)return;if(entry.retiring)return entry.retiring;
  const task=(async()=>{
   await entry.session?.dispose();entry.session=null;entry.module=null;entry.heapBacking?.();entry.heapBacking=null;entry.heapLease?.();entry.heapLease=null;
   if(entry.projection){await entry.projection.dispose();entry.projection=null;}
   entry.projectionBacking?.();entry.projectionBacking=null;entry.projectionLease?.();entry.projectionLease=null;
   for(const [key,item] of entry.targets){await item.release();entry.targets.delete(key);}
   for(const [key,item] of entry.bases){await item.release();entry.bases.delete(key);}
   await entry.graph?.dispose();entry.graph=null;entry.p=null;
   await entry.sourceRelease?.();entry.sourceRelease=null;entry.source=null;entry.retired=true;
  })();entry.retiring=task;
  try{await task;}finally{if(entry.retiring===task)entry.retiring=null;}
 }
 function retainEntry(entry){
  if(entry.retired||entry.retiring)throw fail('DISPOSED','Resident graph is retiring.');
  entry.references++;let dropped=false,done=false;
  return async()=>{if(done)return;if(!dropped){entry.references--;dropped=true;}if(entry.references===0)await retire(entry);done=true;};
 }
 async function clearCurrent(){
  const old=current;if(!old)return;old.cacheLive=false;
  await old.releaseCache();if(current===old)current=null;
 }
 function ownTarget(out,free){
  const item={...out};let backing;try{backing=budget.registerBacking?.('array-buffer',item.z.buffer.byteLength,{owner:'sherloq7c-resident',label:'certified target',identity:item.z.buffer});}catch(error){free();throw error;}out=null;let references=1,cacheLive=true;
  const drop=()=>{if(--references===0){item.z=null;backing?.();backing=null;free();}};
  item.retain=()=>{if(!references)throw fail('DISPOSED','Resident target is closed.');references++;let live=true;return()=>{if(live){live=false;drop();}};};
  item.release=()=>{if(cacheLive){cacheLive=false;drop();}};
  return item;
 }
 async function getEntry(source,hooks){
  if(current?.source===source&&current.cacheLive&&current.p)return current;
  await clearCurrent();check(hooks.signal);
  const entry={source,sourceRelease:source.retain(),graph:null,p:null,references:0,cacheLive:true,retired:false,retiring:null,targets:new Map(),bases:new Map(),module:null,session:null,heapLease:null,projection:null,projectionLease:null};
  entry.releaseCache=retainEntry(entry);current=entry;
  try{entry.graph=await prepareGraph(source,{...hooks,budget});entry.p=entry.graph.p;check(hooks.signal);return entry;}
  catch(error){entry.cacheLive=false;try{await entry.releaseCache();if(current===entry)current=null;}catch(cleanup){attachGpuCleanup(error,cleanup);}throw error;}
 }
 async function target(entry,micro,options){
  const cached=entry.targets.get(micro);
  if(cached){entry.targets.delete(micro);entry.targets.set(micro,cached);}
  if(cached&&(options.maxError===null?cached.metrics.rmsErrorBound<=2e-4:cached.metrics.maxErrorBound<=options.maxError))return{...cached,owner:cached,hit:true};
  const p=entry.p,n=p.levels.length,E=p.low.length,release=budget.reserve(8*n);
  let workspace,seed,out,initial=cached?.z,nearest=Infinity,gpuMetrics=null,failure,failed=false;
  if(!initial)for(const [value,item]of entry.targets)if(Math.abs(value-micro)<nearest){nearest=Math.abs(value-micro);initial=item.z;}
  try{
   workspace=budget.reserve(8*E+128*n+2*MiB);
   const useGpu=gpu&&(options.backend==='webgpu'||options.backend==='auto'&&n>=32768&&globalThis.navigator?.gpu);
   if(useGpu&&E){
    provider??=new (await import('./sherloq7c-target-gpu.js')).Sherloq7cTargetGpu(budget);
    const cold=options.maxError===.002&&!cached&&(!initial||nearest>=.5),large=n>=100000&&E>=500000;
    const iterations=cold?(micro===0?(large?4096:512):(large?1024:n>=32768?256:64)):64;
    try{
     seed=await provider.run(p,micro,{maxIterations:iterations,batchIterations:Math.min(512,iterations),dualScale:64,initialGuard:cold?1e-5:1e-7,nativePacking:n>=32768,certificateMode:'initializer',captureDual:false,packIndices:true,singleComputePass:true,signal:options.signal,onProgress:options.onProgress});
     gpuMetrics=seed.metrics;
    }catch(error){if(options.backend!=='auto'||!provider.mayFallback(error))throw error;}
   }
   if(!entry.session&&E){
    const maximum=round(Math.max(16*MiB,96*E+256*n+8*MiB));
    if(maximum>2**31)throw fail('MEMORY_LIMIT','Explicit target requires the implicit memory solver.',{maximumBytes:maximum});
    const heapLease=budget.reserve(maximum);
    try{entry.module=await createTargetWasmModule({memoryBudgetBytes:maximum});entry.heapBacking=budget.registerBacking?.('wasm',entry.module.HEAPU8.buffer.byteLength,{owner:'sherloq7c-resident',label:'target workspace',identity:entry.module});entry.session=await createTargetWasmSession(p,{wasmModule:entry.module,signal:options.signal});entry.heapBacking?.resize?.(entry.module.HEAPU8.buffer.byteLength);entry.heapLease=heapLease;}
    catch(error){entry.module=null;entry.heapBacking?.();entry.heapBacking=null;heapLease();throw error;}
   }
   out=await solveTarget7cWasm(p,micro,{...options,tolerance:2e-4,initial:seed?.z??initial,alternativeInitials:seed&&initial?[initial]:[],initialPolicy:'best-objective',wasmSession:entry.session??undefined});
   entry.heapBacking?.resize?.(entry.module?.HEAPU8.buffer.byteLength??0);
   out.metrics={...out.metrics,gpu:gpuMetrics,actualGPUWork:!!gpuMetrics};
  }catch(error){failure=error;failed=true;}
  try{await seed?.release();}catch(cleanup){if(failed)attachGpuCleanup(failure,cleanup);else{failure=cleanup;failed=true;}}
  finally{workspace?.();}
  if(failed){release();throw failure;}
  cached?.release();const item=ownTarget(out,release);entry.targets.set(micro,item);
  while(entry.targets.size>3){const candidate=[...entry.targets.keys()].find(value=>value!==micro&&value!==0)??[...entry.targets.keys()].find(value=>value!==micro);entry.targets.get(candidate).release();entry.targets.delete(candidate);}
  return{...item,owner:item,hit:false};
 }
 async function projection(entry,t0,tb,options){
  const p=entry.p,n=p.levels.length,E=p.low.length;
  const base=round(Math.max(32*MiB,256*E+256*n+16*MiB))*(options.certificateTolerance===undefined?2:1);
  const retireProjection=async()=>{await entry.projection?.dispose();entry.projection=null;entry.projectionBacking?.();entry.projectionBacking=null;entry.projectionLease?.();entry.projectionLease=null;};
  for(let attempt=0;attempt<4;attempt++){
   if(!entry.projection){
    const maximum=Math.min(2**31,Math.max(base,entry.projectionMaximumHint??0));
    if(base>2**31)throw fail('MEMORY_LIMIT','Explicit projection requires the implicit forest solver.',{maximumBytes:base});
    const free=budget.reserve(maximum+128*E+192*n+2*MiB);
    try{
     entry.projection=await createProjectionOSQP(p,{eps:1e-11,reduce:true,returnDual:false,certifyInitialState:true,chunkIterations:50,memoryBudgetBytes:maximum,signal:options.signal,cooperate:cooperator()});
     entry.projectionBacking=budget.registerBacking?.('wasm',entry.projection.memoryBytes,{owner:'sherloq7c-resident',label:'projection workspace',identity:entry.projection});entry.projectionLease=free;entry.projectionMaximum=maximum;
    }catch(error){await entry.projection?.dispose();entry.projection=null;free();throw error;}
   }
   try{return await entry.projection.solve(t0,tb,options);}
   catch(error){
    if(error.code!=='MEMORY_ALLOCATION'||error.details?.allocationKind!=='wasm'||entry.projectionMaximum>=2**31||attempt===3)throw error;
    // Sparse factor fill depends on topology. Retire the failed allocation,
    // then admit a larger exact workspace; no disk or altered QP is used.
    const larger=Math.min(2**31,entry.projectionMaximum*2);
    try{await retireProjection();}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}
    entry.projectionMaximumHint=larger;check(options.signal);
   }finally{if(entry.projection)entry.projectionBacking?.resize?.(entry.projection.memoryBytes);}
  }
 }
 async function run(source,{revelation=0,micro=0,precision='reference',backend='auto'}={},hooks={}){
  if(closed)throw fail('DISPOSED','Resident engine is closed.');if(busy||maintenance)throw fail('BUSY','Resident engine is running or retiring resources.');
  const threshold={reference:null,'1e-2':.002,'1e-4':.00002,'1e-7':.00000002}[precision];
  if(threshold===undefined||!(revelation>=0&&revelation<=1&&micro>=0&&micro<=1)||!['cpu','auto','webgpu'].includes(backend)||!source?.retain||!source.immutable)throw fail('INVALID_INPUT','Immutable resident RGB16 source and valid 7C parameters required.');
  const {signal,onProgress}=hooks;check(signal);busy=true;const started=performance.now();let extraRelease;
  try{
   if(revelation===0&&micro===0){
    await clearCurrent();check(signal);
    const cooperate=cooperator(signal),N=source.width*source.height;let minimum=65535,maximum=0;
    for(let first=0;first<N;first+=65536){const end=Math.min(first+65536,N);for(let i=first;i<end;i++){const v=source.maxAt(i);if(v<minimum)minimum=v;if(v>maximum)maximum=v;}await cooperate();}
    check(signal);const lo=minimum/65535,span=maximum/65535-lo;
    const metrics={version:'7C-resident-experimental',resolution:'native',workingPrecision:'float64',requestedPrecision:precision,maxErrorBoundFloat:0,maxErrorBoundRGB16:.5/65535,components:null,edges:null,sourceBytes:source.byteLength,preparation:{preparationBackend:'linear-extrema',graphAllocated:false},targets:[],projection:null,elapsedMs:performance.now()-started,budgetPeak:budget.peak,temporaryDiskBytes:0,output:'owned-windows'};
    let out;out=createResidentOutput(source,i=>{const v=source.maxAt(i)/65535;return span?(v-lo)/span:v;},{budget,metrics,releaseState:()=>{outputs.delete(out);}});outputs.add(out);return out;
   }
   const entry=await getEntry(source,hooks),p=entry.p,n=p.levels.length,targetInfos=[];
   let values,bound=0,projectionInfo=null;
   if(!p.low.length){values=p.levels;}
   else if(revelation===0&&micro===0){extraRelease=budget.reserve(n*8);values=baseline7c(p);}
   else{
    const tb=await target(entry,micro,{signal,onProgress,maxError:threshold,backend});targetInfos.push(tb.metrics);values=tb.z;bound=tb.metrics.maxErrorBound;
    if(revelation===1)extraRelease=tb.owner.retain();
    if(revelation!==1){
     let base,baseBound=0;
     if(micro===0){extraRelease=budget.reserve(n*16);base=baseline7c(p);}
     else{
      const cached=entry.bases.get(micro);
      if(cached?.precision===precision){base=cached.z;baseBound=cached.bound;projectionInfo=cached.info;}
      else{
       const zero=await target(entry,0,{signal,onProgress,maxError:threshold,backend});targetInfos.push(zero.metrics);
       const release=budget.reserve(n*8);let q;
       try{q=await projection(entry,zero.z,tb.z,{signal,onProgress,certificateTolerance:precision==='reference'?undefined:Math.max(1e-12,(Number(precision)-bound-zero.metrics.maxErrorBound)*.95)});}
       catch(error){release();throw error;}
       base=q.z;projectionInfo=q.info;baseBound=bound+zero.metrics.maxErrorBound+q.info.certificateMax;cached?.release();entry.bases.set(micro,{z:base,bound:baseBound,info:q.info,precision,release});while(entry.bases.size>2){const key=entry.bases.keys().next().value;entry.bases.get(key).release();entry.bases.delete(key);}
      }
      extraRelease=budget.reserve(n*8);
     }
     values=allocate7c(Float64Array,n,'Resident blended scalar');const cooperate=cooperator(signal);for(let i=0;i<n;i++){values[i]=(1-revelation)*base[i]+revelation*tb.z[i];if((i&16383)===0)await cooperate();}
     bound=(1-revelation)*baseBound+revelation*bound;
    }
   }
   check(signal);if(!Number.isFinite(bound)||bound<0||precision!=='reference'&&bound>Number(precision))throw fail('NUMERIC_PRECISION','Resident result does not meet the requested certificate.',{maxErrorBound:bound,precision});
   const releaseEntry=retainEntry(entry),releaseExtra=extraRelease;
   const metrics={version:'7C-resident-experimental',resolution:'native',workingPrecision:'float64',requestedPrecision:precision,maxErrorBoundFloat:bound,maxErrorBoundRGB16:bound+.5/65535,components:n,edges:p.low.length,sourceBytes:source.byteLength,preparation:entry.graph.stats,targets:targetInfos,projection:projectionInfo,elapsedMs:performance.now()-started,budgetPeak:budget.peak,temporaryDiskBytes:0,output:'owned-windows'};
   let out;
   try{out=createResidentOutput(source,i=>values[entry.graph.componentOfPixel(i)],{budget,metrics,releaseState:async()=>{await releaseEntry();releaseExtra?.();outputs.delete(out);}});}
   catch(error){try{await releaseEntry();}catch(cleanup){attachGpuCleanup(error,cleanup);}throw error;}
   extraRelease=null;outputs.add(out);return out;
  }finally{extraRelease?.();busy=false;}
 }
 return{run,async clearCache(){
  if(busy||maintenance)throw fail('BUSY','Await active calculation or retirement before clearing its cache.');
  const task=Promise.resolve().then(clearCurrent);maintenance=task;try{await task;}finally{if(maintenance===task)maintenance=null;}
 },async dispose(){
  if(busy||maintenance)throw fail('BUSY','Await calculation or retirement before disposal.');if(closed)return;
  const task=Promise.resolve().then(async()=>{await clearCurrent();await provider?.dispose();provider=null;closed=true;});maintenance=task;
  try{await task;}finally{if(maintenance===task)maintenance=null;}
 },memory(){return{busy,retiring:!!maintenance,closed,budgetBytes:budget.limit,accountedBytes:budget.total(),budgetPeak:budget.peak,retainedOutputs:outputs.size};}};
}
