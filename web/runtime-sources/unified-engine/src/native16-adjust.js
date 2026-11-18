import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {createGpuAttemptArray,gpuRetirementFailure,gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {isWorkerResourceFailure} from './adaptive-concurrency.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgb16Surface,native16Descriptor} from './rgb16-surface.js';
import {createNative16DisplayOwner,native16DisplayPlan} from './native16-display-owner.js';
import {createNative16RgbWorkingContext} from './native16-rgb-working-view.js';
import {MAX_DISPLAY_PIXELS} from './display-sampling.js';
import {payloadBytes} from './pixel-operations.js';
import {migrationWorkspaceBytes,missingMigrationWorkspaceBytes} from './migration-workspace.js';
import {native16AdjustParams,native16AdjustNeedsPrefix,native16AdjustPrefixKey,native16AdjustEqualization,native16AdjustPerceptualActive,NATIVE16_ADJUST_UNITS} from './native16-adjust-contract.js';
import {requireAdjustPerceptualLinearRgb16,adjustPerceptualCurvePlan,adjustPerceptualCurveTables,composeAdjustPerceptualInverse,ADJUST_PERCEPTUAL_CURVE_POLICY} from './adjust-perceptual-curve.js';
import {adjustNative16PrefixRows,native16AdjustGpuAdmission} from './native16-adjust-prefix.js';
import {SEPARATION_HEAP_BYTES,separationHeapBytes,native16AdjustWorkspace} from './separation-math.js';
import {openSeparationGpu} from './separation-gpu-session.js';
import {Native16AdjustWorkers} from './native16-adjust-workers.js';
import {adjustPointLut,adjustToneLut,adjustFinishLut,applyAdjustPointLut} from './adjust-point-lut.js';
import {createNative16AdjustLutProgram,NATIVE16_ADJUST_LUT_TABLE_BYTES} from './native16-adjust-lut-gpu.js';
import {nativeEqualizationProgramPlan,prepareNativeEqualization} from './equalization-native-program.js';
import {applyNativeEqualizationBands} from './equalization-native-bands.js';
import {native16EqualizationGpuProgramDescriptor,native16EqualizationGpuProgramPlan} from './equalization-native-gpu.js';
import {addNative16AdjustOtsuHistogram,native16AdjustOtsu,NATIVE16_ADJUST_OTSU_HISTOGRAM_BYTES} from './native16-adjust-otsu.js';

const MiB=1024**2,MAX_SOURCE_BAND_BYTES=32*MiB,owners=new WeakMap();
const LITTLE_ENDIAN=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const bytesOf=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
const sameChoice=(a,b)=>a&&b&&['gpu','workers','rows','storage'].every(key=>a[key]===b[key]);
function validate(surface,input,options={}){
 requireValue(surface?.descriptor?.format==='rgb16'&&surface.descriptor.depth===16&&options.budget?.reserve,'A budgeted RGB16 adjustment source is required.');
 requireValue(options.parameterUnits===undefined||options.parameterUnits==='ui8','Adjustment controls use historical UI8 units.');
 const d=surface.descriptor,n=d.width*d.height;
 requireValue([d.width,d.height,n,n*6].every(Number.isSafeInteger)&&d.width>0&&d.height>0,'Unsafe native16 adjustment dimensions.');
 requireValue(options.rowsPerBlock===undefined||Number.isSafeInteger(options.rowsPerBlock)&&options.rowsPerBlock>0,'Invalid native16 adjustment row group.');
 requireValue(['cpu','auto','webgpu'].includes(options.backend??'auto')&&Number.isInteger(options.maxWorkers??1)&&(options.maxWorkers??1)>0&&(options.maxWorkers??1)<=32,'Invalid native16 adjustment execution policy.');
 return native16AdjustParams(input);
}
function sourceScratch(d){return (d.orientation??1)===1&&(d.sourceWidth??d.width)===d.width?0:Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*6;}
function sourceReadBytes(surface,rows){
 const d=surface.descriptor;if(typeof surface.readWindowPlan!=='function')return sourceScratch(d);
 const plan=surface.readWindowPlan({x:0,y:0,width:d.width,height:rows});
 requireValue(plan?.known===true&&plan.outputBytes===d.width*rows*6&&Number.isSafeInteger(plan.additionalBytes)&&plan.additionalBytes>=0,'The native16 Source read plan must describe its actual owned window.');
 return plan.additionalBytes;
}
function metadataBytes(d){return 2*payloadBytes({color:d.color,provenance:d.provenance})+payloadBytes(NATIVE16_ADJUST_UNITS);}
function workingContextFor(surface,context){
 const original=context.sourceSurface??surface;let owner=owners.get(original);
 if(!owner){owner=createOwner(original,context);owners.set(original,owner);}
 return owner.rgbWorkingContext(context);
}
function ioPlan(image,budget,n){
 const canMigrate=!!(image.session||image.ensureTemporarySession),migration=canMigrate&&image.session?.backend!=='opfs'?migrationWorkspaceBytes(n*6,image.session):0;
 return{canMigrate,sourceIoBytes:image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*MiB:0,
  migrationBytes:canMigrate?missingMigrationWorkspaceBytes(budget,migration):0};
}
function coreExtent(w,h,rows,halo){return{sourceBytes:w*Math.min(h,rows+2*halo)*6,outputBytes:w*rows*6};}
function maximumRows(w,h,p,target){
 const halo=Math.floor(p.sharpen/4);let low=0,high=target;
 while(low<high){const mid=Math.ceil((low+high)/2),height=Math.min(h,mid+2*halo),fits=height*w*6<=MAX_SOURCE_BAND_BYTES&&(!native16AdjustNeedsPrefix(p)||native16AdjustWorkspace(w,height,mid,p)<=SEPARATION_HEAP_BYTES);if(fits)low=mid;else high=mid-1;}
 return low;
}

/** Pure expressions shared by admission and the real producer. No pixel,
 * coefficient table, device, store or arithmetic actor is constructed here. */
export function native16AdjustExecutionPlan(image,input,{budget,backend='auto',maxWorkers=1,rowsPerBlock,runtimeBytes=0,colorBackend='auto',displayAssumption=image?.provenance?.displayProjection}={},state={}){
 const surface=image.surface,p=validate(surface,input,{budget,backend,maxWorkers,rowsPerBlock}),d=surface.descriptor,w=d.width,h=d.height,n=w*h;
 const prefix=native16AdjustNeedsPrefix(p)&&!state.prefixHit,halo=prefix?Math.floor(p.sharpen/4):0;
 const target=Math.min(h,rowsPerBlock??h,Math.max(1,Math.floor(MAX_SOURCE_BAND_BYTES/(w*6)))),rows=maximumRows(w,h,prefix?p:{...p,sharpen:0,brightness:0,saturation:0,hue:0},target);
 requireValue(rows>0,'One native16 adjustment row and its halo exceed the arithmetic heap.');
 const workers=prefix&&typeof Worker!=='undefined'?Math.min(maxWorkers,Math.max(1,Math.ceil(h/rows))):1;
 const working=state.workingModel?.plan(surface)??null;
 if(working?.known===false)return{known:false,reason:'native16-adjust-working-color-not-inspected'};
 const workingDescriptor=working?.workingDescriptor??d;
 const perceptual=native16AdjustPerceptualActive(p);
 if(p.toneDomain==='perceptual-srgb-trc')requireAdjustPerceptualLinearRgb16({...workingDescriptor,range:d.range,channelOrder:d.channelOrder});
 const equalization=native16AdjustEqualization(p),equalizationPlan=equalization?nativeEqualizationProgramPlan({...workingDescriptor,orientation:1,sourceWidth:w,sourceHeight:h},equalization):null;
 if(equalizationPlan&&!equalizationPlan.known)return{known:false,reason:equalizationPlan.reason};
 const exactLocalEqualization=!!equalization&&['clahe','ahe'].includes(equalization.method.id)&&p.threshold<255;
 const equalizationGpuProgram=equalization&&!exactLocalEqualization?native16EqualizationGpuProgramDescriptor(equalizationPlan):null,
  equalizationPackedBytes=equalizationGpuProgram?native16EqualizationGpuProgramPlan(equalizationPlan).hostTableBytes:0,
  equalizationWorkspaceBytes=equalization?equalizationPlan.preparationBytes+equalizationPackedBytes:0;
 const io=ioPlan(image,budget,n),curveBytes=perceptual?(state.curvesReady?0:adjustPerceptualCurvePlan().residentBytes)+NATIVE16_ADJUST_LUT_TABLE_BYTES:0,lutBytes=NATIVE16_ADJUST_LUT_TABLE_BYTES+curveBytes,
  histogramBytes=p.threshold===0?NATIVE16_ADJUST_OTSU_HISTOGRAM_BYTES:0,
  color=native16DisplayPlan(workingDescriptor,{totalPixels:n,backend:colorBackend,displayAssumption}),
  finalMetadataBytes=Math.max(metadataBytes(d),metadataBytes(workingDescriptor))+(working?.metadataBytes??0),
  missingWorkingBytes=working?.missingRetainedBytes??0,additionalPreparationBytes=working?.additionalPreparationBytes??0;
 if(!color.known)return{known:false,reason:color.limitation?.code??'native16-adjust-color-unknown'};
 const presentBytes=color.bytes+Math.min(n,MAX_DISPLAY_PIXELS)*9+Math.max(w,h)*6;
 const heap=(count,useGpu)=>{
  const main=separationHeapBytes(),localPrefix=prefix&&(count===1||useGpu&&halo>0);
  return {mainHeapBytes:localPrefix?Math.max(main,SEPARATION_HEAP_BYTES):main,
   missingWorkerHeapBytes:prefix&&count>1?Math.max(0,count-(state.poolCount??0))*SEPARATION_HEAP_BYTES:0};
 };
 const gpuFor=countRows=>native16AdjustGpuAdmission(w,Math.min(h,countRows+2*halo),countRows,prefix?p:{...p,sharpen:0,brightness:0,saturation:0,hue:0},{budget,backend,session:state.gpu,priorBytes:runtimeBytes,nativeEqualizationProgram:equalizationGpuProgram,perceptualDomain:false});
 const batch=(count,countRows,useGpu,gpuInfo)=>{
  const windowRows=Math.min(h,countRows+2*halo),extent=coreExtent(w,h,countRows,halo),heaps=heap(count,useGpu),readPlan=state.prefixHit?null:state.workingModel?.plan(surface,{rect:{x:0,y:0,width:w,height:windowRows}})?.readPlan;
  if(readPlan)requireValue(Number.isSafeInteger(readPlan.additionalBytes)&&readPlan.additionalBytes>=0,'The working color read plan must expose its actual transient bytes.');
  const sourceRowBytes=state.prefixHit?0:readPlan?.additionalBytes??sourceReadBytes(surface,windowRows);
  // The main/worker arithmetic heaps already contain all native mallocs.
  // Owned Source windows, output copies and GPU host arrays are separate.
  const sourceBytes=state.prefixHit?0:count*extent.sourceBytes,
   targetBytes=count*extent.outputBytes,
   curveBandBytes=perceptual&&!state.prefixHit&&prefix?sourceBytes:0,
   cpuBytes=sourceBytes+targetBytes+sourceRowBytes+curveBandBytes,
   gpuBytes=useGpu?(gpuInfo?.missingResidentBytes??0)+(gpuInfo?.hostBytes??0):0,
   gpuPhaseBytes=useGpu?Math.max(sourceBytes+(prefix?targetBytes:0)+gpuBytes+curveBandBytes,
    (p.threshold===0?extent.outputBytes:0)+gpuBytes):0,
   packedLutBytes=useGpu?NATIVE16_ADJUST_LUT_TABLE_BYTES:0;
  return{...heaps,sourceBytes,targetBytes,sourceRowBytes,cpuBytes,gpuBytes,curveBandBytes,
   bytes:heaps.mainHeapBytes+heaps.missingWorkerHeapBytes+lutBytes+histogramBytes+io.sourceIoBytes+packedLutBytes+Math.max(cpuBytes,gpuPhaseBytes)+equalizationWorkspaceBytes};
 };
 let gpu=gpuFor(rows),gpuRows=rows;
 if(!gpu.known){let low=0,high=rows-1,attested;while(low<high){const candidate=Math.ceil((low+high)/2),value=gpuFor(candidate);if(value.known){low=candidate;attested=value;}else high=candidate-1;}if(low){gpuRows=low;gpu=attested??gpuFor(low);}}
 return{known:true,width:w,height:h,pixels:n,outputBytes:n*6,finalMetadataBytes,lutBytes,histogramBytes,presentBytes,color,working,perceptual,curveBytes,missingWorkingBytes,additionalPreparationBytes,
  targetRows:target,rows,gpuRows,maximumWorkers:workers,prefix,halo,io,gpu,heap,batch,gpuFor,equalization,equalizationPlan,equalizationWorkspaceBytes,exactLocalEqualization,equalizationGpuProgram,equalizationPackedBytes,finalStorageOverheadBytes:Math.min(4*MiB,n*6)+io.migrationBytes};
}

export function native16AdjustAdmissionPlan(image,input,options={}){
 try{
  const {budget,backend='auto',runtimeBytes=0}=options,surface=image.surface,p=validate(surface,input,options),owner=owners.get(surface),state=owner?owner.admissionState(p,backend,budget):{known:true,prefixHit:false,poolCount:0,gpu:null};
  if(!state.known)return state;
  const plan=native16AdjustExecutionPlan(image,p,options,state);if(!plan.known)return plan;
  if(!plan.gpu.known)return plan.gpu;
  const useGpu=!!plan.gpu.available,count=useGpu&&plan.halo?1:plan.maximumWorkers,
   cpu=plan.batch(plan.maximumWorkers,plan.rows,false),gpu=useGpu?plan.batch(count,plan.gpuRows,true,plan.gpu):null,
   fixed=plan.outputBytes+plan.finalMetadataBytes+plan.finalStorageOverheadBytes,
   bytes=runtimeBytes+Math.max(plan.additionalPreparationBytes,plan.missingWorkingBytes+fixed+Math.max(cpu.bytes,gpu?.bytes??0,plan.presentBytes,plan.gpu.openingBytes??0));
  return Number.isSafeInteger(bytes)&&bytes>=0?{known:true,bytes,completeResidentAlternative:true,parallelWorkers:count,rows:useGpu?plan.gpuRows:plan.rows,
   outputBytes:plan.outputBytes,retainedResultBytes:plan.outputBytes+plan.finalMetadataBytes,prefixCacheHit:state.prefixHit,
   gpuState:plan.gpu.state,mainHeapBytes:Math.max(cpu.mainHeapBytes,gpu?.mainHeapBytes??0),workerHeapBytes:Math.max(cpu.missingWorkerHeapBytes,gpu?.missingWorkerHeapBytes??0),nativeColorAdmission:plan.color}: {known:false,reason:'unsafe-native16-adjust-plan'};
 }catch(error){return{known:false,reason:'native16-adjust-plan-uninspectable',detail:error?.message};}
}

// Every transient owner is adopted before its first allocation. Failed ACKs
// stay reachable from both the error and the Source owner until retry succeeds.
function createScope(owner){
 const entries=new Set(),children=new Set();let flight;
 const scope={add(value,method='dispose'){const entry={value,method};entries.add(entry);owner.debts.add(scope);return entry;},forget(entry){entries.delete(entry);},
  adoptFailure(error){const child=error?.cleanupOwner;if(child&&child!==scope&&typeof child.dispose==='function')children.add(child);},
  async drop(entry){if(!entries.has(entry))return;try{await ack(()=>typeof entry.value==='function'?entry.value():entry.value?.[entry.method]?.());entries.delete(entry);}catch(error){scope.adoptFailure(error);throw withRetirementOwner(error,scope,error);}},
  dispose(){if(flight)return flight;const task=(async()=>{
   // Drain a failed GPU/CMM borrower before releasing its Source/LUT/target.
   try{for(const child of [...children]){await ack(()=>child.dispose());children.delete(child);}for(const entry of [...entries])await scope.drop(entry);}
   catch(primary){scope.adoptFailure(primary);throw withRetirementOwner(primary,scope,primary);}
   owner.debts.delete(scope);
  })();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
 owner.debts.add(scope);return scope;
}
function array(scope,Type,length,budget,label){const value=createGpuAttemptArray(Type,length,{budget,owner:'native16-adjust',label}),entry=scope.add(value,'release');value.allocate();return{value,entry};}
function transferredOutput(scope,bytes,budget){
 let free=budget.reserve(bytes),data,backing,notified=false;
 const owner={adopt(value){data=value;backing=budget.registerBacking?.('array-buffer',bytes,{owner:'native16-adjust',label:'native16-adjust-worker-output',identity:value.buffer});},
  dispose(){const retired=backing?.();backing=null;if(free){free();free=null;}if(!notified&&data){if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);notified=true;}data=null;}};
 return{owner,entry:scope.add(owner)};
}
function choose(plan,room,{temporary=true,cacheBytes=0}={}){
 if(!plan.known)return null;room-=cacheBytes;
 const fixed=plan.finalMetadataBytes+plan.io.migrationBytes+plan.missingWorkingBytes,full=plan.outputBytes+Math.min(4*MiB,plan.outputBytes),gpuRequested=plan.gpu.known&&plan.gpu.available;
 // Storage is selected before reducing useful actor capacity. A final may use
 // the common temporary bank; optional prefix caching never changes this.
 for(const storage of temporary?['memory','temporary']:['memory']){
  const storageBytes=storage==='memory'?full:0,maximum=gpuRequested&&plan.halo?1:plan.maximumWorkers;
  for(let count=maximum;count>=1;count--){
   let low=0,high=plan.rows,selected;
   while(low<high){const rows=Math.ceil((low+high)/2),gpu=plan.gpuFor(rows);if(!gpu.known){high=rows-1;continue;}const useGpu=!!gpu.available,actualCount=useGpu&&plan.halo?1:count,
    batch=plan.batch(actualCount,rows,useGpu,gpu),required=Math.max(plan.additionalPreparationBytes,fixed+storageBytes+Math.max(batch.bytes,plan.presentBytes,gpu.openingBytes??0));
    if(required<=room){low=rows;selected={gpu:useGpu,workers:actualCount,rows,storage,gpuPlan:gpu,batch,requiredBytes:required};}else high=rows-1;
   }
   if(low){if(!selected||selected.rows!==low){const gpu=plan.gpuFor(low),useGpu=!!(gpu.known&&gpu.available),actualCount=useGpu&&plan.halo?1:count,batch=plan.batch(actualCount,low,useGpu,gpu);selected={gpu:useGpu,workers:actualCount,rows:low,storage,gpuPlan:gpu,batch,requiredBytes:Math.max(plan.additionalPreparationBytes,fixed+storageBytes+Math.max(batch.bytes,plan.presentBytes,gpu.openingBytes??0))};}return selected;}
  }
 }
 return null;
}

function createOwner(surface,initial){
 const budget=initial.budget,d=surface.descriptor,n=d.width*d.height,stop=new AbortController(),debts=new Set();
 let active,base,gpu,pool,curveTables,curvePreparations=0,closing,closed=false,rgbContext,workingModel;
 async function clearBase(){if(!base)return;const previous=base;try{await ack(()=>previous.value.release());if(base===previous)base=null;}catch(error){throw gpuRetirementFailure(error,{dispose:clearBase},error);}}
 async function clearGpu(){if(!gpu)return;const previous=gpu;try{await ack(()=>previous.dispose());if(gpu===previous)gpu=null;}catch(error){throw gpuRetirementFailure(error,{dispose:clearGpu},error);}}
 async function clearPool(){if(!pool)return;const previous=pool;try{await ack(()=>previous.workers?.clear());for(const actor of previous.actors??[])await actor.dispose();await ack(()=>previous.free?.());if(pool===previous)pool=null;}catch(error){throw gpuRetirementFailure(error,{dispose:clearPool},error);}}
 async function clearCurveTables(){if(!curveTables)return;const previous=curveTables;previous.ready=false;try{previous.encode.release();previous.decode.release();if(curveTables===previous)curveTables=null;}catch(error){throw gpuRetirementFailure(error,{dispose:clearCurveTables},error);}}
 async function ensureCurveTables(){
  if(curveTables?.ready)return curveTables;
  await clearCurveTables();const record={encode:createGpuAttemptArray(Uint16Array,65536,{budget,owner:'native16-adjust',label:'perceptual-encode-cache'}),decode:createGpuAttemptArray(Uint16Array,65536,{budget,owner:'native16-adjust',label:'perceptual-decode-cache'}),ready:false};curveTables=record;
  try{record.encode.allocate();record.decode.allocate();adjustPerceptualCurveTables({encodeTarget:record.encode.data,decodeTarget:record.decode.data});record.ready=true;curvePreparations++;return record;}catch(error){try{await clearCurveTables();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:clearCurveTables},cleanup);}throw error;}
 }
 async function drain(){for(const scope of [...debts])await scope.dispose();}
 async function ensurePool(count){if(pool?.count===count&&pool.workers?.workers.length===count&&pool.free?.bytes===count*SEPARATION_HEAP_BYTES)return pool;await clearPool();if(count<2)return null;
  const record={count,free:null,workers:null,actors:[]};pool=record;
  try{record.free=budget.reserve(count*SEPARATION_HEAP_BYTES);record.workers=new Native16AdjustWorkers(count,{budget,resourceOwner:'native16-adjust',onWorker:worker=>{
    const terminate=worker.terminate.bind(worker);let done=false,flight,failureObserved=false;
    const startTermination=()=>{if(done)return Promise.resolve();if(flight)return flight;const task=(async()=>{await terminate();done=true;})();flight=task;void task.catch(()=>{});return task;};
    const actor={async dispose(){if(failureObserved){flight=null;failureObserved=false;}try{await startTermination();}catch(error){failureObserved=true;throw error;}}};
    record.actors.push(actor);worker.terminate=startTermination;
   }});
   return record;
  }catch(error){try{await clearPool();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:clearPool},cleanup);}throw error;}
 }
 const unregister=budget.registerAsyncReclaimer?.(async()=>{if(active)return 0;const before=budget.total();await drain();await clearBase();await clearGpu();await clearPool();await clearCurveTables();return Math.max(0,before-budget.total());},{owner:'native16-adjust',label:'idle-native16-adjust-prefix-gpu-workers'});
 const owner={debts,
  rgbWorkingContext(context){requireValue(context.budget===budget,'The working color context belongs to this Original budget.');
   if(!rgbContext)rgbContext=createNative16RgbWorkingContext({profileSource:surface,budget,sourceBinding:context.sourceBinding,isCurrent:context.isSourceCurrent},{},{onOwner:value=>{rgbContext=value;workingModel=value;}});
   workingModel=rgbContext;return rgbContext;
  },
  admissionState(p,backend,expectedBudget){
   if(expectedBudget!==budget||closed||closing||active||debts.size)return{known:false,reason:'native16-adjust-owner-not-idle'};
   if(base&&(!(base.value.data instanceof Uint16Array)||base.value.data.byteLength!==n*6||base.value.retired))return{known:false,reason:'native16-adjust-prefix-unattested'};
   if(pool&&(!pool.workers||pool.workers.workers.length!==pool.count||pool.free?.bytes!==pool.count*SEPARATION_HEAP_BYTES))return{known:false,reason:'native16-adjust-workers-unattested'};
   return{known:true,prefixHit:base?.key===native16AdjustPrefixKey(d,p,backend),poolCount:pool?.count??0,gpu,workingModel,curvesReady:curveTables?.ready===true};
  },
  async prepare(p,backend,context){
   requireValue(!closed&&!active,'Adjustment source is not idle.');await drain();
   if(p?.toneDomain!=='perceptual-srgb-trc')await clearCurveTables();
   if(pool&&pool.workers?.workers.length!==pool.count)await clearPool();
   if(!p||base&&base.key!==native16AdjustPrefixKey(d,p,backend))await clearBase();
   if(!p||backend==='cpu'){await clearGpu();if(!p)await clearPool();}
   if(p&&(base?.key===native16AdjustPrefixKey(d,p,backend)||!native16AdjustNeedsPrefix(p)||backend!=='cpu'&&globalThis.navigator?.gpu&&(!gpu||gpu.available)&&Math.floor(p.sharpen/4)>0))await clearPool();
   if(p&&context?.budget){workingModel=workingContextFor(surface,context);await workingModel.inspectProfile({signal:context.signal});}
  },
  run(image,input,hooks={}){
   requireValue(!closed&&!active&&hooks.budget===budget,'Native16 adjustment source is busy, retired or belongs to another budget.');
   const p=validate(surface,input,{...hooks,budget}),backend=hooks.backend??'auto',linked=new AbortController(),abort=()=>linked.abort();
   stop.signal.addEventListener('abort',abort,{once:true});hooks.signal?.addEventListener('abort',abort,{once:true});if(stop.signal.aborted||hooks.signal?.aborted)linked.abort();
   const task=(async()=>{const observer=hooks.nativeGpuRetirement?.hasPort('base-gpu')?hooks.nativeGpuRetirement:null;
    if(observer)observer.enter('base-gpu',owner);const retirementCacheOwner=observer?.cacheOwner(owner,'native16-adjust-source-cache');
    const context={...hooks,backend,signal:linked.signal,adjustObserver:observer,adjustRetirementCacheOwner:retirementCacheOwner};
    try{try{return await calculate(image,p,context);}
     catch(error){if(linked.signal.aborted||(hooks.maxWorkers??1)<=1||gpuRetirementBlocked(error)||!isWorkerResourceFailure(error))throw error;
      await clearPool();const record=await calculate(image,p,{...context,maxWorkers:1});record.metrics.resourceRetry={from:hooks.maxWorkers,to:1,code:error?.code};return record;}
    }finally{if(observer)observer.finish('base-gpu',owner);}
   })();active=task;
   void task.finally(()=>{stop.signal.removeEventListener('abort',abort);hooks.signal?.removeEventListener('abort',abort);if(active===task)active=null;}).catch(()=>{});return task;
  },
  dispose(){if(closing)return closing;closed=true;stop.abort();const task=(async()=>{await active?.catch(()=>{});await drain();await clearBase();await clearGpu();await clearPool();await clearCurveTables();await rgbContext?.dispose();unregister?.();})();closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;}
 };
 async function calculate(image,p,hooks){
  const{signal,backend,adjustObserver:observer,adjustRetirementCacheOwner:retirementCacheOwner}=hooks,scope=createScope(owner),started=performance.now(),cooperate=createCooperator(signal);
  let outputEntry,output,finalSurface,finalEntry,cacheCandidate,cacheEntry,programEntry,program,encodeLut,decodeLut,metadataEntry,published=false,primary,failed=false,retirementBlocked=false,heapEntry,lut,histogram,workingView,analysisSurface,colorContext;
  const metrics={kernel:'native16-adjustment-pipeline',inputDepth:16,sourceReads:0,blocks:0,workerJobs:0,workers:1,gpuJobs:0,readMs:0,prefixMs:0,toneMs:0,finishMs:0,writeMs:0,analysisCacheHit:false};
  let renderGpuJobs=0,prefixGpuJobs=0,prefixBackend='none';
  try{
   checkAbort(signal);await drainOther();
   if(pool&&pool.workers?.workers.length!==pool.count)await clearPool();
   const key=native16AdjustPrefixKey(d,p,backend);if(base&&base.key!==key)await clearBase();if(backend==='cpu')await clearGpu();
   const cached=base?.key===key;metrics.analysisCacheHit=!!cached;
   workingModel??=workingContextFor(surface,hooks);
   let state={known:true,prefixHit:!!cached,poolCount:pool?.count??0,gpu,workingModel,curvesReady:curveTables?.ready===true},plan=native16AdjustExecutionPlan(image,p,{...hooks,budget},state);
   requireValue(plan.known,'Native16 adjustment presentation policy is unknown.');
   let choice=choose(plan,budget.limit-budget.total(),{temporary:plan.io.canMigrate});
   const openGpu=async()=>{const ticket=observer?.expect('base-gpu',owner,'adjust16-gpu-construction');await openSeparationGpu({budget,backend,signal,sampleDepth:16,native16GaussianRadius:25,nativeGpuRetirement:observer,retirementTicket:ticket,retirementCacheOwner,onOwner:value=>{gpu=value;}});
    // Inspect actual binding limits and funded warm capacities. Cold heap and
    // pipelines are no longer guessed or charged a second time after open.
    state={...state,gpu};plan=native16AdjustExecutionPlan(image,p,{...hooks,budget},state);choice=choose(plan,budget.limit-budget.total(),{temporary:plan.io.canMigrate});
   };
   const canReachRealOpening=()=>!gpu&&plan.gpu.reason==='separation-gpu-opening-headroom'&&plan.additionalPreparationBytes<=budget.limit-budget.total();
   if(!choice&&!canReachRealOpening())throw new EngineError('MEMORY_LIMIT','Native16 adjustment cannot admit one complete useful row.');
   // An idle optional owner cannot shrink this new operation's capacity.
   if(choice&&(pool&&pool.count!==choice.workers||choice.gpu&&plan.halo&&pool)){await clearPool();state={...state,poolCount:0};plan=native16AdjustExecutionPlan(image,p,{...hooks,budget},state);choice=choose(plan,budget.limit-budget.total(),{temporary:plan.io.canMigrate});}
   if(!choice&&!canReachRealOpening())throw new EngineError('MEMORY_LIMIT','Native16 adjustment actor plan no longer fits.');
   // ICCGray development is a serialized source preparation, before GPU/CPU
   // arithmetic staging. Its LCMS heap is closed before any science actor runs.
   const colorStarted=performance.now();await workingModel.prepare({signal});workingView=workingModel.view(surface);scope.add(workingView);
   analysisSurface=workingView.surface;colorContext=workingView.colorContext();
   requireValue(analysisSurface?.descriptor?.format==='rgb16'&&analysisSurface.descriptor.width===d.width&&analysisSurface.descriptor.height===d.height,'The RGB16 working view changed the analysis grid.');
   state={...state,gpu,poolCount:pool?.count??0};plan=native16AdjustExecutionPlan(image,p,{...hooks,budget},state);choice=choose(plan,budget.limit-budget.total(),{temporary:plan.io.canMigrate});
   metrics.colorPreparationMs=performance.now()-colorStarted;metrics.workingColorMode=plan.working?.mode??'passthrough';
   // Only the real opening policy can attest a GPU_HEADROOM CPU fallback.
   // A passive refusal is not that observation, nor a debt/binding bypass.
   if(!choice&&canReachRealOpening())await openGpu();
   if(!choice)throw new EngineError('MEMORY_LIMIT','The prepared RGB16 source cannot admit a complete useful row.');
   if(choice.gpu&&!gpu){await openGpu();
    if(!choice)throw new EngineError('MEMORY_LIMIT',plan.gpu.reason??'The opened native16 adjustment owner cannot admit a GPU row.');
   }
   const mayCache=!cached&&plan.prefix&&choice.storage==='memory'&&!budget.isBackingUnderPressure?.('array-buffer')&&sameChoice(choice,choose(plan,budget.limit-budget.total(),{temporary:plan.io.canMigrate,cacheBytes:n*6}));
   const useGpu=!!choice.gpu&&!!gpu?.available,rows=choice.rows,count=choice.workers,needsPrefix=plan.prefix;
   if(count>1&&needsPrefix)await ensurePool(count);
   // Only the arithmetic heap is credited here. All host arrays and stores
   // below have their own real owners and never share this reservation.
   const mainHeapBytes=plan.heap(count,useGpu).mainHeapBytes;
   if(mainHeapBytes)heapEntry=scope.add(budget.reserve(mainHeapBytes));
   metadataEntry=scope.add(budget.reserve(plan.finalMetadataBytes));
   output=await createSegmentedBytes(n*6,{budget,storage:choice.storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal,owner:'native16-adjust',label:'native16-adjust-final'});outputEntry=scope.add(output);
   if(mayCache){
    cacheCandidate=createGpuAttemptArray(Uint16Array,n*3,{budget,owner:'native16-adjust',label:'native16-adjust-prefix-cache'});cacheEntry=scope.add(cacheCandidate,'release');
    try{cacheCandidate.allocate();}catch(error){await scope.drop(cacheEntry);cacheEntry=cacheCandidate=null;if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;}
   }
   const lookup=array(scope,Uint16Array,65536,budget,'native16-adjust-lut');lut=lookup.value;
   if(plan.perceptual){
    const curves=await ensureCurveTables();encodeLut=curves.encode;decodeLut=curves.decode;
    metrics.curveMs=0;
   }
   if(p.threshold===0){const owned=array(scope,Float64Array,65536,budget,'native16-adjust-otsu');histogram=owned.value;}
   if(p.threshold===0||plan.equalization)adjustToneLut(p,{depth:16,target:lut.data});
   else adjustPointLut(p,{depth:16,target:lut.data});
   if(plan.perceptual&&p.threshold!==0&&!plan.equalization)composeAdjustPerceptualInverse(lut.data,decodeLut.data,{target:lut.data});
   // A point-only pipeline composes the already quantized input curve once,
   // instead of transporting every image word through a separate GPU pass.
   const encodeInPointLut=plan.perceptual&&!needsPrefix&&!cached;
   if(encodeInPointLut){const scratch=array(scope,Uint16Array,65536,budget,'native16-adjust-input-composition');for(let code=0;code<65536;code++)scratch.value.data[code]=lut.data[encodeLut.data[code]];lut.data.set(scratch.value.data);await scope.drop(scratch.entry);}
   function buildProgram(){if(!useGpu)return;program=createNative16AdjustLutProgram(lut.data,{budget,signal,onOwner:value=>{programEntry=scope.add(value);}});}
   buildProgram();
   async function map(data,w,height,mutable=false,table=lut.data,selectedProgram=program,curve=false,forceCpu=false){
    checkAbort(signal);const at=performance.now();
    if(useGpu&&gpu?.available&&!forceCpu){
     const result=await gpu.runNativeProgram({width:w,height,data},selectedProgram,0,height,{signal,nativeGpuRetirement:observer,retirementTicket:observer?.expect('base-gpu',owner,curve?'adjust16-curve-band':'adjust16-lut-band'),retirementCacheOwner});
     if(result){renderGpuJobs++;metrics[curve?'curveMs':'toneMs']+=performance.now()-at;return{data:result.bytes,entry:scope.add(result,'release'),gpu:true};}
    }
    if(mutable){applyAdjustPointLut(data,table,{target:data});metrics[curve?'curveMs':'toneMs']+=performance.now()-at;return{data,entry:null};}
    const owned=array(scope,Uint16Array,data.length,budget,curve?'native16-adjust-curve-band':'native16-adjust-point-band');applyAdjustPointLut(data,table,{target:owned.value.data});metrics[curve?'curveMs':'toneMs']+=performance.now()-at;return{data:owned.value.data,entry:owned.entry};
   }
   const abortWorkers=()=>pool?.workers.clear();signal?.addEventListener('abort',abortWorkers,{once:true});
   try{
    for(let y=0;y<d.height;y+=rows*count){
     await cooperate();const jobs=[];
     try{for(let slot=0;slot<count&&y+slot*rows<d.height;slot++){
      const coreY=y+slot*rows,coreRows=Math.min(rows,d.height-coreY),top=Math.max(0,coreY-plan.halo),bottom=Math.min(d.height,coreY+coreRows+plan.halo);let input,inputEntry;
      if(cached){input={width:d.width,height:coreRows,data:base.value.data.subarray(coreY*d.width*3,(coreY+coreRows)*d.width*3)};}
      else{const at=performance.now(),window=await analysisSurface.readWindow({x:0,y:top,width:d.width,height:bottom-top},{signal});input=window.pixels;inputEntry=scope.add(window,'release');metrics.readMs+=performance.now()-at;metrics.sourceReads++;}
      if(plan.perceptual&&!cached&&!encodeInPointLut){
       // The financed host word band is encoded while prefix workers run.
       // Keep the qualified HSV/spatial arithmetic, without an extra GPU
       // pack/upload/readback/unpack or a copy of its returned output loan.
       const encoded=await map(input.data,d.width,input.height,false,encodeLut.data,null,true,true);
       if(inputEntry)await scope.drop(inputEntry);input={...input,data:encoded.data};inputEntry=encoded.entry;
      }
      if(needsPrefix){
       const at=performance.now(),start=coreY-top;
       if(count>1){
        const transfer=transferredOutput(scope,d.width*coreRows*6,budget);
        metrics.workerJobs++;jobs.push(pool.workers.call(slot,{image:input,params:p,start,rows:coreRows,nativeOriginX:0,nativeWidth:d.width}).then(value=>{transfer.owner.adopt(value.bytes);return{data:value.bytes,prefixEntry:transfer.entry,inputEntry,y:coreY,rows:coreRows,kernelMs:value.kernelMs};},error=>({error,inputEntry,prefixEntry:transfer.entry})));
       }else{
        const result=await adjustNative16PrefixRows(input,p,start,coreRows,{budget,signal,gpu:useGpu?gpu:null,nativeGpuRetirement:observer,retirementTicket:useGpu&&plan.halo?observer?.expect('base-gpu',owner,'adjust16-prefix-band'):undefined,retirementCacheOwner});
        const prefixEntry=scope.add(result,'release');prefixBackend=result.metrics.prefixBackend;prefixGpuJobs+=prefixBackend==='webgpu-gaussian+cpu-hsv'?1:0;metrics.prefixMs+=performance.now()-at;jobs.push(Promise.resolve({data:result.data,prefixEntry,inputEntry,y:coreY,rows:coreRows}));
       }
      }else jobs.push(Promise.resolve({data:input.data,inputEntry,y:coreY,rows:coreRows}));
     }
     const results=await Promise.all(jobs);checkAbort(signal);
     for(const item of results){
      if(item.error)throw item.error;
      if(item.kernelMs!==undefined){metrics.prefixMs+=item.kernelMs;prefixBackend='cpu-native16-workers';}
      const prefixData=needsPrefix?item.data:cached?item.data:item.data.subarray(0,d.width*item.rows*3);
      if(cacheCandidate)cacheCandidate.data.set(prefixData,item.y*d.width*3);
      const mapped=await map(prefixData,d.width,item.rows,needsPrefix);
      if(histogram&&!plan.equalization)addNative16AdjustOtsuHistogram(histogram.data,mapped.data,{signal});
      const at=performance.now();await writeWords(output,mapped.data,item.y*d.width*6,signal);metrics.writeMs+=performance.now()-at;
      if(mapped.entry)await scope.drop(mapped.entry);if(item.prefixEntry)await scope.drop(item.prefixEntry);if(item.inputEntry)await scope.drop(item.inputEntry);metrics.blocks++;hooks.onProgress?.((p.threshold===0?.7:1)*(item.y+item.rows)/d.height);
     }
     }catch(error){if(count>1)pool?.workers.clear();await Promise.allSettled(jobs);if(count>1)try{await clearPool();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:clearPool},cleanup);}throw error;}
    }
   }finally{signal?.removeEventListener('abort',abortWorkers);}
   await output.flush();checkAbort(signal);
   let threshold=null;
   if(plan.equalization){
    // The unpublished tone bank is the only scientific output store. The
    // common equalizer reads all its statistics before mapping it in place.
    // No second full-resolution bank, SDR input or independent GPU is created.
    if(programEntry){await scope.drop(programEntry);programEntry=null;program=null;}
    const toneSurface=createRgb16Surface(output,{width:d.width,height:d.height,budget,ownsStore:false,sourceDepth:analysisSurface.descriptor.sourceDepth,color:analysisSurface.descriptor.color,provenance:analysisSurface.descriptor.provenance}),toneEntry=scope.add(toneSurface);
    const equalizer=await prepareNativeEqualization(toneSurface,plan.equalization,{budget,signal,onProgress:value=>hooks.onProgress?.(.7+.1*(value.fraction??0))}),equalizerEntry=scope.add(equalizer);
    const mapped=await applyNativeEqualizationBands(toneSurface,equalizer,output,{budget,signal,gpu:useGpu&&!plan.exactLocalEqualization?gpu:null,containsAll:true,nativeGpuRetirement:observer,retirementOwner:owner,retirementCacheOwner,onProgress:value=>hooks.onProgress?.(.8+.1*(value.fraction??0))});
    metrics.equalization={...equalizer.metrics,mapping:mapped,inputDepth:16,outputDepth:16,placement:'after-tone-before-threshold-invert',precisionPolicy:plan.exactLocalEqualization?'exact-cpu-local-map-before-discontinuous-threshold':'registered-native-cpu-or-gpu-map'};renderGpuJobs+=mapped.gpuJobs;
    await scope.drop(equalizerEntry);await scope.drop(toneEntry);
    if(histogram)for(let y=0;y<d.height;y+=rows){await cooperate();const bandRows=Math.min(rows,d.height-y),input=array(scope,Uint16Array,d.width*bandRows*3,budget,'native16-adjust-equalized-otsu-band');await readWords(output,input.value.data,y*d.width*6,signal);addNative16AdjustOtsuHistogram(histogram.data,input.value.data,{signal});await scope.drop(input.entry);}
   }
   if(histogram||plan.equalization&&(p.threshold<255||p.invert||plan.perceptual)){
    if(histogram)threshold=native16AdjustOtsu(histogram.data,n,{signal});
    if(programEntry){await scope.drop(programEntry);programEntry=null;program=null;}
    adjustFinishLut(p,{depth:16,resolvedThreshold:threshold,target:lut.data});if(plan.perceptual)composeAdjustPerceptualInverse(lut.data,decodeLut.data,{target:lut.data});buildProgram();const at=performance.now();
    for(let y=0;y<d.height;y+=rows){await cooperate();const bandRows=Math.min(rows,d.height-y),input=array(scope,Uint16Array,d.width*bandRows*3,budget,'native16-adjust-finish-band');await readWords(output,input.value.data,y*d.width*6,signal);const mapped=await map(input.value.data,d.width,bandRows,true);await writeWords(output,mapped.data,y*d.width*6,signal);if(mapped.entry)await scope.drop(mapped.entry);await scope.drop(input.entry);hooks.onProgress?.(.7+.3*(y+bandRows)/d.height);}
    metrics.finishMs=performance.now()-at;await output.flush();
   }
   checkAbort(signal);if(hooks.isSourceCurrent?.()===false)throw new EngineError('SOURCE_CHANGED','Adjustment Original changed before publication.');
   if(cacheCandidate){base={key,value:cacheCandidate};scope.forget(cacheEntry);cacheCandidate=null;cacheEntry=null;}
   if(programEntry){await scope.drop(programEntry);programEntry=null;program=null;}
   const color=createNative16DisplayOwner({...colorContext,budget,backend:hooks.colorBackend??'auto',totalPixels:n,displayAssumption:hooks.displayAssumption}),colorEntry=scope.add(color);
   const finalStore=output;
   finalSurface=createRgb16Surface(output,{width:d.width,height:d.height,budget,sourceDepth:analysisSurface.descriptor.sourceDepth,color:analysisSurface.descriptor.color,provenance:analysisSurface.descriptor.provenance,displayTransform:color.displayTransform});
   finalEntry=scope.add(finalSurface);scope.forget(outputEntry);outputEntry=null;output=null;color.attach(finalSurface);scope.forget(colorEntry);
   // Attach the small descriptor lease to this exact final, after store/CMM ACK.
   const oldDispose=finalSurface.dispose.bind(finalSurface);let metadataDone=false,finalFlight;
   finalSurface.dispose=()=>{if(finalFlight)return finalFlight;const task=(async()=>{try{await ack(oldDispose);if(!metadataDone){await ack(metadataEntry.value);metadataDone=true;}}catch(error){throw withRetirementOwner(error,finalSurface,error);}})();finalFlight=task;void task.finally(()=>{if(finalFlight===task)finalFlight=null;}).catch(()=>{});return task;};
   scope.forget(metadataEntry);
   // Finish every temporary owner before publication; a NACK still owns the final.
   scope.forget(finalEntry);try{await scope.dispose();}catch(error){scope.add(finalSurface);throw error;}
   const snapshot=gpu?.snapshot(),gpuJobs=prefixGpuJobs+renderGpuJobs;
   metrics.gpuJobs=gpuJobs;metrics.backend=gpuJobs?'webgpu':'cpu';metrics.renderBackend=renderGpuJobs?'webgpu':'cpu';metrics.prefixBackend=cached?'retained-prefix':prefixBackend;metrics.workers=needsPrefix?count:1;
   metrics.rowsPerBlock=rows;metrics.haloRows=plan.halo;metrics.otsuThreshold=threshold;metrics.prefixCacheStored=!!base&&base.key===key;metrics.prefixCacheBytes=metrics.prefixCacheStored?n*6:0;metrics.prefixCacheStorage=metrics.prefixCacheStored?'memory':null;
   metrics.storage=finalSurface.descriptor.storage;metrics.retainedResultBytes=n*6+plan.finalMetadataBytes;metrics.totalMs=performance.now()-started;metrics.gpu=snapshot?.gpu??null;metrics.gpuFallback=snapshot?.gpuFallback??null;metrics.mainHeapBytes=mainHeapBytes;
   const tonalDomain=p.toneDomain?{id:p.toneDomain,policy:ADJUST_PERCEPTUAL_CURVE_POLICY,neutralBypass:!plan.perceptual,temporaryEncoding:'sRGB channel transfer curve, original RGB primaries retained',outputEncoding:'original linear RGB16',inputAndOutputProfilePreserved:true,intermediateDepth:16}:null;
   const units=tonalDomain?{...NATIVE16_ADJUST_UNITS,source:'Original linear RGB16; temporary sRGB channel transfer encoding before the complete adjustment pipeline, preserving original RGB primaries.',order:'Channel-curve encoding, sharpen/HSV, tone, equalization, threshold/inversion, inverse channel curve.',output:'Linear RGB16 in the unchanged Original profile; separate color-managed SDR display.'}:NATIVE16_ADJUST_UNITS;
   if(tonalDomain)metrics.tonalDomain={...tonalDomain,curvePreparations};
   published=true;return{surface:finalSurface,semantics:'RGB16 adjustment: shared sharpen/HSV prefix,65536-code tone and shared native-code equalization before global threshold, independent color-managed SDR display.'+(tonalDomain?' Experimental perceptual channel encoding before all adjustments, inverse encoding after all adjustments; original primaries retained.':''),provenance:{schema:'sherloq.native-input/1',...native16Descriptor(surface),operation:'inspection.adjust',numericalInputDepth:16,presentationOutputDepth:8,scientificOutputDepth:16,profileConversion:plan.working?.mode==='gray-icc-to-srgb16'?'exact-Gray-ICC-to-sRGB16-before-adjustment':'none-in-scientific-codes',workingInput:native16Descriptor(analysisSurface),units,...(tonalDomain?{tonalDomain}: {})},metrics,markCold:()=>finalStore.markCold?.(true),dispose:()=>finalSurface.dispose()};
  }catch(error){failed=true;primary=error;retirementBlocked=gpuRetirementBlocked(error);if(finalSurface&&!published)scope.add(finalSurface);scope.adoptFailure(error);
   if(pool&&!retirementBlocked)try{await clearPool();}catch(cleanup){scope.adoptFailure(cleanup);retirementBlocked=true;primary=gpuRetirementFailure(error,{dispose:clearPool},cleanup);}throw primary;
  }
  finally{
   if(!published){if(retirementBlocked)throw gpuRetirementFailure(primary,scope,primary);try{await scope.dispose();}catch(cleanup){throw gpuRetirementFailure(failed?primary:cleanup,scope,cleanup);}}
  }
  async function drainOther(){for(const previous of [...debts])if(previous!==scope)await previous.dispose();}
 }
 const previousDispose=surface.dispose.bind(surface);let sourceFlight;
 surface.dispose=()=>{if(sourceFlight)return sourceFlight;const task=(async()=>{await owner.dispose();await ack(previousDispose);})();sourceFlight=task;void task.catch(()=>{if(sourceFlight===task)sourceFlight=null;});return task;};
 return owner;
}
async function writeWords(store,data,offset,signal){if(LITTLE_ENDIAN)return store.write(bytesOf(data),offset,{signal});const bytes=bytesOf(data);for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}try{return await store.write(bytes,offset,{signal});}finally{for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}}}
async function readWords(store,target,offset,signal){await store.readInto(bytesOf(target),offset,{signal});if(!LITTLE_ENDIAN){const bytes=bytesOf(target);for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}}}
export async function prepareNative16AdjustCaches(surface,input,backend='auto',context){
 let owner=owners.get(surface);if(!owner&&input!==null&&context?.budget){owner=createOwner(surface,context);owners.set(surface,owner);}
 if(owner)await owner.prepare(input===null?null:native16AdjustParams(input),backend,context);
}
export async function segmentedNative16Adjust(image,input={},options={}){
 const p=validate(image?.surface,input,options);let owner=owners.get(image.surface);
 if(!owner){owner=createOwner(image.surface,options);owners.set(image.surface,owner);}
 try{await owner.prepare(p,options.backend??'auto',options);}
 catch(error){const observer=options.nativeGpuRetirement;if(observer?.hasPort('base-gpu')&&!observer.sealed&&observer.snapshot().ports.some(port=>port.name==='base-gpu'&&port.state==='expected'))observer.skip('base-gpu',owner,'before-adjustment-color-inspection');throw error;}
 return owner.run(image,p,options);
}
