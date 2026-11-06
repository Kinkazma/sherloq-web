import {createZeroTargetStore} from './target-zero-cache-private.mjs';
// Funded native states shared by immutable views. Completed revelation pairs
// may retain a small, reclaimable history; target-only graph reuse stays in place.
import {createNativeMemoryTarget as createGeneralTarget,nativeMemoryTargetPlan} from './target-memory-ringcert-general.mjs';
import {createNativeMemoryTarget as createPaletteTarget} from './target-memory-ringcert.mjs';
import {createResidentMemoryPolicy,createResidentRgb16,createResidentOutput,createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {createResidentPng16} from '../engine/src/sherloq7c-resident-png-source.js';
import {cooperator} from '../engine/src/sherloq7c-math.js';
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const check=signal=>{if(signal?.aborted)throw fail('CANCELLED','Bounded operation cancelled.');};
const emptyWork=()=>({sourcePasses:0,nativePreparations:0,targetSolves:0,computedTargetMicros:[],initializerRuns:0,initializations:[],projections:0,fullImageBlendBytes:0,actualGPUWork:false});

export function createBounded7C(options={}){
 const factories=options.nativeFactories??{general:createGeneralTarget,palette:createPaletteTarget};
 if(typeof factories.general!=='function'||typeof factories.palette!=='function')throw fail('INVALID_INPUT','General and palette native factories are required.');
 const maxCachedPairs=options.maxCachedPairs??'budget';
 if(maxCachedPairs!=='budget'&&(!Number.isSafeInteger(maxCachedPairs)||maxCachedPairs<1))throw fail('INVALID_INPUT','maxCachedPairs must be budget or a positive safe integer.');
 const cachedPairLimit=maxCachedPairs==='budget'?Infinity:maxCachedPairs;
 const generalFactory=factories.general,paletteFactory=factories.palette;
 const policy=createResidentMemoryPolicy({...options,memoryBudgetBytes:options.memoryBudgetBytes??options.budget?.limit}),budget=policy.budget;
 const cacheZeroTargets=options.cacheZeroTargets??false;if(typeof cacheZeroTargets!=='boolean')throw fail('INVALID_INPUT','cacheZeroTargets must be boolean.');
 const cacheZeroTargets16=options.cacheZeroTargets16??false;if(typeof cacheZeroTargets16!=='boolean')throw fail('INVALID_INPUT','cacheZeroTargets16 must be boolean.');
 const zeroCache=cacheZeroTargets?createZeroTargetStore(budget):null;
 const zeroCacheBytes=precision=>(cacheZeroTargets16&&['1e-2','1e-4'].includes(precision)?2:4);
 const outputs=new Set(),pending=new Set(),states=new Set(),pairCache=new Set(),sourceInfos=new WeakMap();let current=null,closed=false,busy=false;
 const open=()=>{if(closed)throw fail('DISPOSED','Bounded engine is closed.');};
 // Published native states retire synchronously. A failed acknowledgement keeps
 // its backing charged. Transient GPU owners never enter the idle reclaimer.
 function retire(entry){
  if(entry.retired)return;if(entry.references)throw fail('BUSY','A bounded state still has readers.');
  entry.retirementPending=true;
  try{
   if(entry.projected){entry.projected.dispose();entry.projected=null;entry.native=null;}
   else if(entry.native){entry.native.dispose();entry.native=null;}
   if(entry.sourceRelease){entry.sourceRelease();entry.sourceRelease=null;}
   entry.source=null;entry.retired=true;entry.retirementPending=false;pending.delete(entry);states.delete(entry);pairCache.delete(entry);
  }catch(error){pending.add(entry);throw error;}
 }
 function retain(entry){
  if(entry.retired||entry.retirementPending)throw fail('DISPOSED','Bounded state is retiring.');
  entry.references++;let dropped=false;
  return()=>{if(!dropped){dropped=true;entry.references--;}if(!entry.references)retire(entry);};
 }
 function dropCache(entry){
  pairCache.delete(entry);entry.cacheLive=false;
  try{entry.releaseCache();}finally{if(current===entry)current=null;}
 }
 function clearCurrent(){if(current)dropCache(current);}
 function clearCached(){
  const earlierPending=[...pending],errors=[];
  for(const entry of new Set([...pairCache,current].filter(Boolean)))try{dropCache(entry);}catch(error){errors.push(error);}
  for(const entry of earlierPending)if(!entry.retryCleanup&&!entry.references)try{retire(entry);}catch(error){errors.push(error);}
  if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Bounded cached-state retirement remains pending.');
 }
 function trimPairs(){while(pairCache.size>=cachedPairLimit)dropCache(pairCache.values().next().value);}
 function pairHeadroom(entry){
  const owned=entry.native?.memory?.().accountedHeapBytes,maximum=entry.native?.plan?.wasmMaximumBytes;
  if(!Number.isSafeInteger(owned)||owned<=0||!Number.isSafeInteger(maximum)||maximum<owned)return Infinity;
  // The new same-source state can need its full native plan, packed target,
  // input/seed band and the largest already-observed accelerator workspace.
  // This is an optional cache-admission estimate, never a reservation or a
  // promise that another allocation will succeed; live reclaim remains active.
  const accelerator=Math.max(0,...[entry.initialMetrics,entry.zeroInitialMetrics].map(m=>(m?.plan?.windowBytes??0)+(m?.seedBytes??0)));
  const N=entry.source.width*entry.source.height;
  return maximum+4*N+Math.min(N,65536)*4+accelerator;
 }
 function leaveCurrent(source,{existingState=false}={}){
  const old=current;if(!old)return;
  let keep=cachedPairLimit>1&&old.ready&&(old.kind==='pair'||old.kind==='target'&&old.micro===0)&&old.source===source&&!old.retirementPending&&!budget.recovering&&!budget.isBackingUnderPressure?.('wasm');
  if(keep&&!existingState){
   const needed=pairHeadroom(old);
   for(const cached of [...pairCache]){if(budget.total()+needed<=budget.limit)break;if(cached.references===1)dropCache(cached);}
   keep=Number.isFinite(needed)&&budget.total()+needed<=budget.limit;
  }
  if(!keep){clearCurrent();return;}
  current=null;pairCache.delete(old);pairCache.add(old);trimPairs();budget.notifyReclaimable?.();
 }
 function reclaim(bytes=0){
  const before=budget.total();
  // Older pairs cannot be the active preparation. Their synchronous owners
  // may retire even while another state is being computed. Public readers
  // and the current/busy state are never retired by this admission callback.
  for(const entry of [...pairCache]){if(budget.total()+bytes<=budget.limit)break;if(entry.ready&&entry.references===1)dropCache(entry);}
  if(budget.total()+bytes>budget.limit&&!busy&&current?.ready&&current.references===1)clearCurrent();
  return Math.max(0,before-budget.total());
 }
 const unregister=budget.registerReclaimer?.(reclaim,{owner:'sherloq7c-bounded-state',label:'idle-certified-state',allocationKind:'wasm'});
 const idle=()=>{open();if(busy)throw fail('BUSY','Await the current bounded operation.');};
 const baseline=(source,info,i)=>{const lo=info.minimum/65535,span=info.maximum/65535-lo;return span?(source.maxAt(i)/65535-lo)/span:lo;};
 function snapshot(entry,r,precision,started,timings,work,reuse){
  let bound,certified;
  if(entry.kind==='baseline'){bound=0;certified={backend:'bounded-linear-baseline',graphAllocated:false};}
  else if(entry.kind==='pair'){bound=entry.projected.boundAt(r);certified=entry.certified;}
  else{bound=entry.micro===0?r*entry.targetMetrics.maxErrorBound:entry.targetMetrics.maxErrorBound;certified={...entry.targetMetrics,initialization:entry.initialMetrics};}
  if(!entry.fixedStepMode&&(!Number.isFinite(bound)||bound<0||precision!=='reference'&&bound>Number(precision)))throw fail('NUMERIC_PRECISION','Cached state misses requested precision.');
  if(entry.fixedStepMode)bound=null;
  const history=entry.kind==='pair'?entry.certified.targets:[entry.targetMetrics].filter(Boolean);
  return {...certified,version:'7C-economy-reuse-candidate',micro:entry.micro,revelation:r,requestedPrecision:precision,workingPrecision:'float64',resolution:'native',
   computationMode:entry.computationMode??'precision',effectiveComputationMode:entry.fixedStepMode?'fast':'precision',fallbackReason:entry.fallbackReason??null,approximate:!!entry.fixedStepMode,strictPrecisionMet:!entry.fixedStepMode&&precision!=='reference'&&bound<=Number(precision),approximation:entry.fixedStepMode?{method:'fixed-newton-steps',maximumNewtonSteps:3,requiresGpuSeed:true,guaranteedConvergenceFraction:false}:null,
   maxErrorBound:bound,maxErrorBoundFloat:bound,maxErrorBoundRGB16:bound===null?null:bound+.5/65535,sourceBytes:entry.source.byteLength,budgetPeak:budget.peak,elapsedMs:performance.now()-started,temporaryDiskBytes:0,
   timings,work,reuse,preparedTimings:{...entry.preparedTimings},preparedTargets:history,preparedProjection:entry.certified?.projection??null,
   targets:history.filter(target=>work.computedTargetMicros.includes(target.micro)),projection:work.projections?entry.certified?.projection??null:null,
   preparedInitialization:entry.initialMetrics??null,preparedZeroInitialization:entry.zeroInitialMetrics??null,initialization:work.initializations[0]?.metrics??null,
   actualGPUWork:work.actualGPUWork,nativeSelection:entry.info.selection,output:'owned-immutable-revelation-windows'};
 }
 function publish(entry,r,precision,started,timings,work,reuse){
  // Capture the representation and r, independently of subsequent controls.
  const source=entry.source,kind=entry.kind,native=entry.native,projected=entry.projected,info=entry.info,micro=entry.micro;
  const independentBaseline=kind==='baseline'||micro===0&&r===0;
  const scalar=independentBaseline?i=>baseline(source,info,i):kind==='pair'?i=>projected.scalarAt(i,r):micro===0?i=>(1-r)*baseline(source,info,i)+r*native.scalarAt(i):i=>native.scalarAt(i);
  if(kind==='pair'&&typeof projected.readScalarSpan==='function')scalar.readSpan=(first,count)=>projected.readScalarSpan(first,count,r);
  const metrics=snapshot(entry,r,precision,started,timings,work,reuse),release=independentBaseline?()=>{}:retain(entry);let output;
  try{output=createResidentOutput(source,scalar,{budget,metrics,releaseState:()=>{release();outputs.delete(output);}});}catch(error){release();throw error;}
  outputs.add(output);return output;
 }
 async function inspect(source,needsTarget,{signal},entry){
  const pause=cooperator(signal),N=source.width*source.height;let bank,mask,minimum=65535,maximum=0,distinct=0,inspectedPixels=0,selectorRefusal=null;
  try{
   if(needsTarget)try{bank=await createResidentArray(Uint8Array,8192,{budget,segmentBytes:8192,signal,label:'bounded target level selector'});mask=bank.segments[0];}
   catch(error){const optional=error?.code==='MEMORY_LIMIT'||error?.code==='MEMORY_ALLOCATION'&&error?.details?.allocationKind==='array-buffer';if(!optional||signal?.aborted||error.cleanupError||error.cleanupErrors?.length||error.retryCleanup)throw error;selectorRefusal=error.code;}
   for(let first=0;first<N;first+=65536){const end=Math.min(N,first+65536);let i=first;
    if(mask&&distinct<=16){for(;i<end&&distinct<=16;i++){const value=source.maxAt(i);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);const index=value>>>3,bit=1<<(value&7);if(!(mask[index]&bit)){mask[index]|=bit;distinct++;}}inspectedPixels=i;}
    for(;i<end;i++){const value=source.maxAt(i);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}await pause();
   }
   const isBaseline=!needsTarget||minimum===maximum;
   return{minimum,maximum,selection:{variant:isBaseline?'baseline':mask&&distinct<=16?'palette':'general',reason:isBaseline?'linear-baseline':selectorRefusal?'selector-memory-refusal':distinct>16?'more-than-16-levels':'at-most-16-levels',distinctLevels:mask&&distinct<=16?distinct:null,atLeastLevels:distinct>16?17:null,inspectedPixels,sourcePasses:1,maskBytes:mask?8192:0,refusalCode:selectorRefusal}};
  }finally{mask=null;if(bank)try{bank.dispose();}catch(error){entry.extraCleanup=()=>bank.dispose();throw error;}}
 }
 async function prepare(entry,params,hooks,{reuseGraph=false,reuseTarget=false}={}){
  const {micro,revelation,precision,prepareRevelationRange,computationMode}=params,{signal,onProgress,initialize}=hooks,source=entry.source;
  const threshold={reference:null,'1e-2':.002,'1e-4':.00002,'1e-7':.00000002}[precision],timings={},work=emptyWork();
  let initialization,packed,zeroDestination,targetDestination,capturedZero;const started=performance.now();
  try{
   if(!reuseGraph){
    const needsTarget=!(micro===0&&revelation===0&&!prepareRevelationRange),cached=sourceInfos.get(source);
    if(cached&&(!needsTarget||cached.minimum===cached.maximum||cached.selection.variant!=='baseline'&&!cached.selection.refusalCode)){entry.info=cached;timings.extremaMs=0;work.sourceInfoCacheHit=true;}
    else{entry.info=await inspect(source,needsTarget,hooks,entry);sourceInfos.set(source,entry.info);timings.extremaMs=performance.now()-started;work.sourcePasses++;}
   }
   if((micro===0&&revelation===0&&!prepareRevelationRange)||entry.info.minimum===entry.info.maximum){entry.kind='baseline';}
   else{
    if(!reuseGraph){const at=performance.now();entry.native=await (entry.info.selection.variant==='palette'?paletteFactory:generalFactory)(source,{approximateNewtonSteps:computationMode==='fast'?3:0,reserve:n=>budget.reserve(n),availableBytes:()=>Math.max(0,budget.limit-budget.total()),registerBacking:budget.registerBacking.bind(budget),notifyBackingRelease:budget.notifyBackingRelease?.bind(budget),signal,onProgress,...(zeroCache?{beforeNativeAdmission:plans=>zeroCache.beforeNativeAdmission(plans)}:{})});timings.prepareMs=performance.now()-at;work.nativePreparations++;}
    if(!reuseTarget){
     let at=performance.now();
     if(initialize&&(!reuseGraph||params.backend==='webgpu'||computationMode==='fast')){
      targetDestination=entry.native.createSeedDestination?.()??null;
      work.initializerRuns++;initialization=await initialize({source,preparation:entry.native.preparation,graph:entry.native.initializerGraph(),budget,micro,precision,signal,onProgress,smallPalette:entry.info.selection.variant==='palette',...(targetDestination?{seedDestination:targetDestination}:{})});
     }
     timings.initializationMs=performance.now()-at;let initial=initialization?.initial;entry.initialMetrics=initialization?.metrics;work.actualGPUWork=entry.initialMetrics?.actualGpuWork===true;if(initialization)work.initializations.push({micro,metrics:entry.initialMetrics});
     if(targetDestination&&initial!==targetDestination){targetDestination.release();targetDestination=null;}
     if(initialization&&initial===undefined){await initialization.release();initialization=null;}
     entry.fixedStepMode=computationMode==='fast'&&params.backend!=='cpu'&&initial!==undefined&&entry.initialMetrics?.actualGpuWork===true;
     entry.fallbackReason=computationMode==='fast'&&!entry.fixedStepMode?(entry.initialMetrics?.reason??(params.backend==='cpu'?'cpu-requested':'GPU_UNAVAILABLE')):null;
     at=performance.now();const solveOptions={maxError:threshold,approximateNewtonSteps:entry.fixedStepMode?3:0,armijoBound:params.armijoBound,rawApReuse:params.rawApReuse,stablePairBlocks:params.stablePairBlocks,pixelCidMap:params.pixelCidMap,exactCgCandidate:params.exactCgCandidate,exactCgScreen:params.exactCgScreen,repairInitial:initial!==undefined&&entry.initialMetrics?.requiresFeasibilityRepair===true,repairInitialGuard:entry.initialMetrics?.guard??1e-5,signal,onProgress,initial,certifyInitialFirst:initial!==undefined&&entry.initialMetrics?.actualGpuWork===true,onInitialConsumed:initialization?async()=>{initial=null;await initialization.release();initialization=null;if(targetDestination){targetDestination.release();targetDestination=null;}}:undefined};
     if(reuseGraph)await entry.native.replaceTarget(micro,{...solveOptions,...(initial===undefined?{reuseInitial:true}:{})});else await entry.native.solve(micro,solveOptions);
     initial=null;timings.targetMs=performance.now()-at;work.targetSolves++;work.computedTargetMicros.push(micro);entry.targetMetrics=entry.native.metrics;
    }
    entry.kind='target';
    const cacheQuality=entry.fixedStepMode?'fast':'precision',approximationOptions=entry.fixedStepMode?{approximation:'fixed-newton-steps'}:{};
    // A first zero export may also materialize the native 256KiB packHeads bank.
    if(zeroCache&&micro===0&&entry.targetMetrics.components>64&&!zeroCache.find(source,precision,cacheQuality)&&budget.limit-budget.total()>=(entry.fixedStepMode?4:zeroCacheBytes(precision))*source.width*source.height+1048576){
     let candidate;try{candidate=await entry.native.exportTarget({budget,levelSource:source,signal,compact:false,cachePrecision:precision,cache16:entry.fixedStepMode?false:cacheZeroTargets16,...approximationOptions});if(zeroCache.keep(candidate,source,precision,cacheQuality)){capturedZero=candidate;candidate=null;}else candidate.release();}
     catch(error){if(candidate)candidate.release();if(!(error?.code==='MEMORY_LIMIT'||error?.code==='MEMORY_ALLOCATION'&&error?.details?.allocationKind==='array-buffer')||signal?.aborted||error.cleanupError||error.cleanupErrors?.length||error.retryCleanup)throw error;}
    }
    if(micro!==0&&(revelation!==1||prepareRevelationRange)){
     let at=performance.now();packed=await entry.native.exportTarget({budget,levelSource:source,signal,compact:!entry.fixedStepMode,...approximationOptions});timings.packingMs=performance.now()-at;at=performance.now();
     // Tb already occupies the external packed bank. On an identity graph the
     // admitted native Float32 work vector can hold the GPU's T0 seed instead
     // of allocating a second full-image bank. Other layouts keep the original
     // packed-target initialization, with identical native certification.
     // On a compact graph a cold component Newton solve is faster than a
     // transferred seed, which would skip that solver and build N-pixel CG data.
     const componentTarget=packed.storage==='float64-native-components';
     let cachedZero=!componentTarget?zeroCache?.find(source,precision,cacheQuality):null,zeroMetrics;
     if(cachedZero&&entry.native.canProjectWithCachedZero?.(packed,cachedZero,precision,approximationOptions)!==true)cachedZero=null;
     if(cachedZero){zeroMetrics=zeroCache.summary(cachedZero);timings.zeroInitializationMs=timings.zeroTargetMs=0;work.zeroTargetCacheHits=(work.zeroTargetCacheHits??0)+1;}else{
     let zeroInitial=componentTarget?undefined:i=>packed.scalarAt(i),consumeZero,zeroHasGpuSeed=false;
     if(initialize&&!componentTarget&&(zeroDestination=entry.native.createSeedDestination?.())){
      work.initializerRuns++;initialization=await initialize({source,preparation:entry.native.preparation,graph:entry.native.initializerGraph(),budget,micro:0,precision,signal,onProgress,smallPalette:entry.info.selection.variant==='palette',seedDestination:zeroDestination});
      entry.zeroInitialMetrics=initialization?.metrics;work.initializations.push({micro:0,metrics:entry.zeroInitialMetrics});work.actualGPUWork||=entry.zeroInitialMetrics?.actualGpuWork===true;
      const retireZero=async()=>{if(initialization){await initialization.release();initialization=null;}if(zeroDestination){zeroDestination.release();zeroDestination=null;}};
      if(initialization?.initial!==undefined){
       zeroHasGpuSeed=entry.zeroInitialMetrics?.actualGpuWork===true;
       zeroInitial=initialization.initial;
       // Existing custom initializers may provide their own seed instead of
       // accepting the offered native destination. Retire the unused lease
       // before solve, while keeping their seed alive through ingestion.
       if(zeroInitial!==zeroDestination){zeroDestination.release();zeroDestination=null;}
       consumeZero=retireZero;
      }else await retireZero();
     }
     timings.zeroInitializationMs=performance.now()-at;at=performance.now();
     await entry.native.replaceTarget(0,{maxError:threshold,approximateNewtonSteps:entry.fixedStepMode&&zeroHasGpuSeed?3:0,armijoBound:params.armijoBound,rawApReuse:params.rawApReuse,stablePairBlocks:params.stablePairBlocks,pixelCidMap:params.pixelCidMap,exactCgCandidate:params.exactCgCandidate,exactCgScreen:params.exactCgScreen,repairInitial:zeroInitial!==undefined&&entry.zeroInitialMetrics?.requiresFeasibilityRepair===true,repairInitialGuard:entry.zeroInitialMetrics?.guard??1e-5,signal,onProgress,initial:zeroInitial,onInitialConsumed:consumeZero,certifyInitialFirst:entry.zeroInitialMetrics?.actualGpuWork===true});zeroInitial=null;zeroMetrics=entry.native.metrics;timings.zeroTargetMs=performance.now()-at;work.targetSolves++;work.computedTargetMicros.push(0);
     if(zeroCache&&!componentTarget&&budget.limit-budget.total()>=(entry.fixedStepMode?4:zeroCacheBytes(precision))*source.width*source.height+65536){
      let candidate;try{candidate=await entry.native.exportTarget({budget,levelSource:source,signal,compact:false,cachePrecision:precision,cache16:entry.fixedStepMode?false:cacheZeroTargets16,projectionTarget:packed,...approximationOptions});if(zeroCache.keep(candidate,source,precision,cacheQuality)){candidate=null;cachedZero=zeroCache.find(source,precision,cacheQuality);capturedZero=cachedZero;if(cachedZero&&entry.native.canProjectWithCachedZero?.(packed,cachedZero,precision,approximationOptions)!==true){zeroCache.remove(cachedZero);capturedZero=cachedZero=null;}}else candidate.release();}
      catch(error){if(candidate)candidate.release();if(!(error?.code==='MEMORY_LIMIT'||error?.code==='MEMORY_ALLOCATION'&&error?.details?.allocationKind==='array-buffer')||signal?.aborted||error.cleanupError||error.cleanupErrors?.length||error.retryCleanup)throw error;}
     }
     }at=performance.now();
     entry.projected=await entry.native.projectWithPacked(packed,{revelation:0,precision,prepareRevelationRange:true,signal,onProgress,...approximationOptions,...(cachedZero?{zeroTarget:cachedZero}:{})});timings.projectionMs=performance.now()-at;work.projections++;
     packed.release();packed=null;entry.kind='pair';entry.certified={...entry.projected.metrics,targets:[entry.targetMetrics,zeroMetrics],initialization:entry.initialMetrics};
    }
   }
   check(signal);entry.micro=micro;entry.precision=precision;entry.backend=params.backend;entry.computationMode=computationMode;entry.initialize=initialize;
   entry.preparedTimings={...entry.preparedTimings,...timings};entry.ready=true;return{timings,work};
  }catch(error){
   const cleanups=[],originalRetry=error?.retryCleanup;if(typeof originalRetry==='function')cleanups.push(()=>originalRetry.call(error));
   if(capturedZero)cleanups.push(()=>zeroCache.remove(capturedZero));if(initialization)cleanups.push(()=>initialization.release());if(targetDestination)cleanups.push(()=>targetDestination.release());if(zeroDestination)cleanups.push(()=>zeroDestination.release());if(packed)cleanups.push(()=>packed.release());if(entry.extraCleanup)cleanups.push(entry.extraCleanup);
   if(cleanups.length)entry.asyncCleanup=async()=>{while(cleanups.length){await cleanups[0]();cleanups.shift();}};
   throw error;
  }
 }
 async function discardFailed(entry,error){
  entry.cacheLive=false;entry.ready=false;if(current===entry)current=null;
  const retry=async()=>{if(entry.asyncCleanup){await entry.asyncCleanup();entry.asyncCleanup=null;}entry.releaseCache();pending.delete(entry);};
  try{await retry();}catch(cleanupError){pending.add(entry);entry.retryCleanup=retry;let primary=error;if(!primary||typeof primary!=='object'||!Object.isExtensible(primary))primary=Object.assign(new AggregateError([error,cleanupError],'Bounded operation and retirement failed.',{cause:error}),{code:error?.code??'CLEANUP_FAILED'});primary.cleanupError=cleanupError;primary.retryCleanup=retry;throw primary;}
 }
 const api={
  budget,plan:nativeMemoryTargetPlan,
  async createSource(input,opts={}){idle();zeroCache?.clear();clearCached();return createResidentRgb16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  async createPngSource(input,opts={}){idle();zeroCache?.clear();clearCached();return createResidentPng16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  updateResourceHints:hints=>policy.updateResourceHints(hints),
  hasCachedSource:source=>!!(current?.cacheLive&&current.ready&&current.source===source),
  memory:()=>({zeroTargets:zeroCache?.memory()??null,closed,busy,retainedOutputs:outputs.size,pendingRetirements:pending.size,maxCachedPairs,cachePolicy:maxCachedPairs==='budget'?'budget':'count-and-budget',cachedPairs:[...pairCache,...(current?.cacheLive&&current.kind==='pair'?[current]:[])].map(state=>({micro:state.micro,precision:state.precision,computationMode:state.computationMode,views:state.references-1})),cachedState:current?.cacheLive?{kind:current.kind,micro:current.micro,precision:current.precision,views:current.references-1}:null,policy:policy.snapshot(),resources:budget.resourceSnapshot()}),
  async run(source,{micro=0,revelation=0,precision='reference',backend='auto',computationMode='precision',prepareRevelationRange=false,armijoBound=true,rawApReuse=true,stablePairBlocks=true,pixelCidMap=true,exactCgCandidate=true,exactCgScreen=true}={},hooks={}){
   idle();if(!Number.isFinite(micro)||!(micro>=0&&micro<=1)||!Number.isFinite(revelation)||!(revelation>=0&&revelation<=1)||typeof prepareRevelationRange!=='boolean'||typeof armijoBound!=='boolean'||typeof rawApReuse!=='boolean'||typeof stablePairBlocks!=='boolean'||typeof pixelCidMap!=='boolean'||typeof exactCgCandidate!=='boolean'||typeof exactCgScreen!=='boolean'||!['fast','precision'].includes(computationMode)||!['reference','1e-2','1e-4','1e-7'].includes(precision)||!['auto','cpu','webgpu'].includes(backend)||!source?.immutable||typeof source.retain!=='function'||source.nativeBitDepth!==16)throw fail('INVALID_INPUT','Native immutable RGB16 source and supported 7C parameters required.');
   check(hooks.signal);busy=true;const started=performance.now();let entry;
   try{
    for(const old of [...pending]){if(old.retryCleanup)await old.retryCleanup();else if(!old.references)retire(old);}
    const supports=state=>state.kind==='pair'||state.kind==='target'&&(state.micro===0||revelation===1&&!prepareRevelationRange)||state.kind==='baseline'&&(revelation===0&&!prepareRevelationRange||state.info.minimum===state.info.maximum);
    const precisionCompatible=state=>{
     if(state.computationMode!==computationMode)return false;
     if(state.precision===precision)return true;
     if(state.fixedStepMode)return false;
     // Reference uses a different stopping contract. Reuse across numeric
     // requests only when this existing representation already certifies them.
     if(state.precision==='reference'||precision==='reference'||!supports(state))return false;
     let bound;
     if(state.kind==='baseline')bound=0;
     else if(state.kind==='pair')bound=prepareRevelationRange?Math.max(state.projected.boundAt(0),state.projected.boundAt(1)):state.projected.boundAt(revelation);
     else bound=(state.micro===0&&!prepareRevelationRange?revelation:1)*state.targetMetrics.maxErrorBound;
     return Number.isFinite(bound)&&bound>=0&&bound<=Number(precision);
    };
    const matches=state=>state.ready&&!state.retired&&!state.retirementPending&&state.source===source&&state.micro===micro&&precisionCompatible(state)&&state.backend===backend&&state.initialize===hooks.initialize;
    // Another displayed result may already own exactly this scientific state.
    // Indexing those funded owners adds no image storage and revives no retired
    // release callback: the optional cache gets a fresh reference of its own.
    let retainedViewHit=false,pairCacheHit=false;
    if(!(current?.cacheLive&&matches(current)&&supports(current))){
     const previous=[...states].find(state=>state!==current&&matches(state)&&supports(state));
     if(previous){
      pairCacheHit=pairCache.has(previous);retainedViewHit=previous.references>(previous.cacheLive?1:0);
      pairCache.delete(previous);
      try{leaveCurrent(source,{existingState:true});}catch(error){if(pairCacheHit)pairCache.add(previous);throw error;}
      if(!previous.cacheLive)previous.releaseCache=retain(previous);previous.cacheLive=true;current=previous;
     }
    }
    const sameSource=current?.cacheLive&&current.source===source,compatible=sameSource&&matches(current);
    const canServe=compatible&&supports(current);
    if(canServe)return publish(current,revelation,precision,started,{},emptyWork(),{stateHit:true,retainedViewHit,pairCacheHit,graphHit:true,targetHit:current.kind!=='baseline',projectionHit:current.kind==='pair',lazyRevelation:true});
    if(sameSource&&micro===0&&revelation===0&&!prepareRevelationRange){
     const info=current.info;let output;output=createResidentOutput(source,i=>baseline(source,info,i),{budget,metrics:{version:'7C-economy-reuse-candidate',micro,revelation,requestedPrecision:precision,computationMode,effectiveComputationMode:'precision',fallbackReason:null,approximate:false,strictPrecisionMet:true,maxErrorBoundFloat:0,maxErrorBoundRGB16:.5/65535,elapsedMs:performance.now()-started,temporaryDiskBytes:0,work:emptyWork(),reuse:{stateHit:true,lazyRevelation:true},targets:[],projection:null},releaseState:()=>outputs.delete(output)});outputs.add(output);return output;
    }
    // A solved zero target may be kept as its whole immutable native owner.
    // Do not retarget that owner's Y in place when the existing cache policy
    // can fund a second state. A refused optional cache keeps legacy reuse.
    const preserveZeroTarget=sameSource&&micro!==0&&cachedPairLimit>1&&current.ready&&current.kind==='target'&&current.micro===0&&!current.retirementPending&&!budget.recovering&&!budget.isBackingUnderPressure?.('wasm')&&Number.isFinite(pairHeadroom(current))&&budget.total()+pairHeadroom(current)<=budget.limit;
    const reuseGraph=!preserveZeroTarget&&sameSource&&current.ready&&current.kind==='target'&&current.references===1&&current.backend===backend&&current.initialize===hooks.initialize&&current.computationMode===computationMode;
    const reuseTarget=!!reuseGraph&&compatible;
    if(reuseGraph){entry=current;current=null;entry.cacheLive=false;entry.ready=false;}
    else{leaveCurrent(source);entry={source,sourceRelease:source.retain(),references:0,cacheLive:false,ready:false,kind:null,native:null,projected:null,retired:false,preparedTimings:{}};entry.releaseCache=retain(entry);states.add(entry);}
    try{
     const {timings,work}=await prepare(entry,{micro,revelation,precision,backend,computationMode,prepareRevelationRange,armijoBound,rawApReuse,stablePairBlocks,pixelCidMap,exactCgCandidate,exactCgScreen},hooks,{reuseGraph:!!reuseGraph,reuseTarget});
     check(hooks.signal);entry.cacheLive=true;current=entry;budget.notifyReclaimable?.();
     return publish(entry,revelation,precision,started,timings,work,{stateHit:false,graphHit:!!reuseGraph,targetHit:reuseTarget,projectionHit:false,lazyRevelation:true,previousTargetSeed:!!reuseGraph&&!reuseTarget});
    }catch(error){await discardFailed(entry,error);throw error;}
   }finally{busy=false;}
  },
  async clearCache(){idle();zeroCache?.clear();clearCached();},
  async dispose(){if(busy)throw fail('BUSY','Await cancellation before closing the bounded engine.');closed=true;unregister?.();const errors=[];
   try{zeroCache?.dispose();}catch(error){errors.push(error);}
   try{clearCached();}catch(error){errors.push(error);}
   for(const entry of [...pending])try{if(entry.retryCleanup)await entry.retryCleanup();else if(!entry.references)retire(entry);}catch(error){errors.push(error);}
   if(errors.length)throw new AggregateError(errors,'Bounded cache retirement remains pending.');
  }
 };return api;
}
