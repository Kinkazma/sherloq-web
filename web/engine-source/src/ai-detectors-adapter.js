import {createCfResidentPool,cfResidentAdmission} from './ai-detectors-resident-pool.js';
import {createExternalMemoryCache} from './external-memory-cache.js';
import {prepareAiTensor,aiPreparationPlan,AI_METHODS,AI_PREPARATION_VERSION} from './ai-detectors-prepare.js';
import {loadAiManifest,aiInferenceAdmission,runAiWorker} from './ai-detectors-runtime.js';
import {aiDetectorGpuMethods} from './ai-detectors-gpu-policy.js';
import {aiPerformancePolicy,aiRequestedCpu,aiGrantedPerformance} from './ai-detectors-performance.js';

const failure=(code,message)=>Object.assign(new Error(message),{code});
const check=signal=>{if(signal?.aborted)throw failure('CANCELLED','AI detection cancelled.');};
const MANIFEST_ADMISSION_BYTES=2*1024**2;
export const AI_RESULT_CACHE_LIMIT=4;
export const AI_RESULT_CACHE_ENTRY_BYTES=2*1024**2;
function withCleanup(primary,cleanup){
 const result=new AggregateError([primary,cleanup],primary?.message??String(primary),{cause:primary});
 result.code=primary?.code??'AI_DETECTOR_ERROR';result.cleanupErrors=[cleanup];return result;
}
function retirementFailure(errors,message){
 const result=new AggregateError(errors,message);result.code='AI_RETIREMENT_ERROR';result.cleanupErrors=errors;return result;
}
// All reservations belong to the engine's shared budget and scheduler. No
// source-specific tensors survive a job. Opt-in CF model sessions use a
// separately funded asynchronous cache. At most four separately funded scalar
// envelopes are retained; neither input surfaces nor inference tensors are kept.
export function createAiDetectorsAdapter({budget,scheduler,createResidentPool=createCfResidentPool,...defaults}){
 let config=defaults,configured=false,closed=false,current=null,clearing=null,configRevision=0,nextSourceId=0;
 let cfPool=null,cfPoolIdentity=null,configuring=false;
 async function closeCfPool(){if(!cfPool)return;await cfPool.dispose();cfPool=null;cfPoolIdentity=null;}
 const retirements=new Set();
 const resultCache=new Map(),sourceIds=new WeakMap();
 function cacheSnapshot(){return{entries:[...resultCache.values()].filter(entry=>entry.result).length,reservedBytes:resultCache.size*AI_RESULT_CACHE_ENTRY_BYTES,pendingRetirements:[...resultCache.values()].filter(entry=>!entry.result).length,limit:AI_RESULT_CACHE_LIMIT};}
 function retireEntry(entry){
  entry.result=null;entry.release();resultCache.delete(entry.key);
 }
 function clearCache(){
  const errors=[];for(const entry of [...resultCache.values()])try{retireEntry(entry);}catch(error){errors.push(error);}
  if(errors.length)throw retirementFailure(errors,'AI scalar cache retirement failed.');
 }
 function reclaimCache(bytes){
  const errors=[];
  for(const entry of [...resultCache.values()]){
   if(budget.total()+bytes<=budget.limit)break;
   try{retireEntry(entry);}catch(error){errors.push(error);}
  }
  if(errors.length)throw retirementFailure(errors,'AI scalar cache eviction failed.');
 }
 const unregisterReclaimer=budget.registerReclaimer?.(reclaimCache,{owner:'ai-detector-scalar-results',label:'AI detector scalar results'});
 function resultIdentity(task,im,method,backend){
  const surface=im.surface,descriptor=surface?.descriptor,pin=config.models?.[method];
  if(!surface||!descriptor||typeof descriptor.id!=='string'||!Number.isSafeInteger(descriptor.revision)||descriptor.revision<1||typeof im.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(pin?.sha256??''))return null;
  let sourceId=sourceIds.get(surface);if(!sourceId){sourceId=++nextSourceId;sourceIds.set(surface,sourceId);}
  return JSON.stringify([sourceId,descriptor.id,descriptor.revision,descriptor.width,descriptor.height,descriptor.orientation??1,descriptor.format,im.sha256,method,pin.sha256,backend,AI_PREPARATION_VERSION,configRevision]);
 }
 function cacheResult(key,result){
  if(!key)return false;
  const existing=resultCache.get(key);if(existing)retireEntry(existing);
  while(resultCache.size>=AI_RESULT_CACHE_LIMIT)retireEntry(resultCache.values().next().value);
  let release;
  try{release=budget.reserve(AI_RESULT_CACHE_ENTRY_BYTES);}catch(error){if(error?.code==='MEMORY_LIMIT')return false;throw error;}
  const entry={key,result:null,release};resultCache.set(key,entry);
  try{entry.result=structuredClone(result);return true;}
  catch(error){try{retireEntry(entry);}catch(cleanup){throw withCleanup(error,cleanup);}if(error instanceof RangeError)return false;throw error;}
 }
 function borrowResult(entry,task,im,started){
  const result=structuredClone(entry.result);
  resultCache.delete(entry.key);resultCache.set(entry.key,entry);
  result.id=task.id;result.imageId=task.imageId;result.operation=task.operation;
  result.provenance.operation=task.operation;result.provenance.originalSha256=im.sha256;result.provenance.decode=structuredClone(im.provenance??{});
  result.metrics={...result.metrics,totalMs:performance.now()-started,preparationMs:0,inferenceMs:0,stages:[],modelCache:result.metrics.modelCache?{used:false,inferenceSkipped:true}:null,cache:{hit:true,stored:true,...cacheSnapshot()},memory:budget.snapshot?.()};
  return result;
 }
 function retire(owner){
  if(owner.retiring)return owner.retiring;
  const task=(async()=>{
   const errors=[];
   for(const window of [...owner.windows])try{await window.release();owner.windows.delete(window);}catch(error){errors.push(error);}
   // A failed window ACK keeps the remaining phase credits alive. Once every
   // window is retired, independent credits are attempted even if one fails.
   if(!owner.windows.size){
    for(const key of ['lease','backup','scratch','metadata','resident']){
     const resource=owner[key];if(!resource)continue;
     try{await (key==='lease'?resource.release():resource());owner[key]=null;}catch(error){errors.push(error);}
    }
    if(['lease','backup','scratch','metadata','resident'].every(key=>!owner[key]))retirements.delete(owner);
   }
   if(errors.length)throw retirementFailure(errors,'AI detector resource retirement failed.');
  })();
  owner.retiring=task;void task.finally(()=>{if(owner.retiring===task)owner.retiring=null;}).catch(()=>{});return task;
 }
 function clear(){
  if(clearing)return clearing;
  const task=(async()=>{
   const running=current;if(running){running.controller.abort();try{await running.promise;}catch{} }
   const errors=[];try{clearCache();}catch(error){errors.push(error);}for(const owner of [...retirements])try{await retire(owner);}catch(error){errors.push(error);}
   if(errors.length)throw retirementFailure(errors,'AI detector cleanup incomplete.');
  })();
  clearing=task;void task.finally(()=>{if(clearing===task)clearing=null;}).catch(()=>{});return task;
 }
 async function configure(value){
  if(closed)throw failure('DISPOSED','AI detector adapter disposed.');
  if(current||clearing||configuring)throw failure('BUSY','AI detector configuration cannot change now.');
  if(!value||typeof value!=='object'||!value.models||typeof value.ortModuleUrl!=='string'&&typeof defaults.ortModuleUrl!=='string')throw failure('MODEL_CONTRACT','AI detector configuration required.');
  const nextConfig={...defaults,...structuredClone(value)};configuring=true;try{await closeCfPool();clearCache();config=nextConfig;configRevision++;configured=true;}finally{configuring=false;}
 }
 async function compute(task,im,{signal,onProgress,knownHeapBytes=0}={}){
  if(closed)throw failure('DISPOSED','AI detector adapter disposed.');
  if(!configured)throw failure('MODEL_UNAVAILABLE','Configure AI detector weights before analysis.');
  const method=task.params?.method??'dda',backend=task.backend??'auto';
  if(!AI_METHODS.includes(method))throw failure('INVALID_INPUT','Unknown AI detector.');
  if(!['cpu','auto','webgpu'].includes(backend))throw failure('UNSUPPORTED_BACKEND','Unsupported detector backend.');
  const gpuQualified=aiDetectorGpuMethods(config).includes(method)&&typeof config.ortGpuModuleUrl==='string';
  if(backend==='webgpu'&&!gpuQualified){
   const familyQualified=aiDetectorGpuMethods(config,{gpuAvailable:true}).includes(method)&&typeof config.ortGpuModuleUrl==='string';
   if(familyQualified)throw failure('GPU_UNAVAILABLE','WebGPU unavailable; select CPU or automatic.');
   throw failure('UNSUPPORTED_BACKEND','This detector GPU conversion has not been qualified for this browser engine.');
  }
  if(task.regions?.length)throw failure('UNSUPPORTED_REGION','AI detection uses the complete source.');
  if(!Number.isSafeInteger(knownHeapBytes)||knownHeapBytes<0)throw failure('INVALID_INPUT','Invalid resident heap accounting.');
  check(signal);for(const owner of [...retirements])await retire(owner);check(signal);
  if(cfPool?.snapshot().poisoned)await closeCfPool();check(signal);
  const started=performance.now(),owner={windows:new Set()};
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const hooks={signal:controller.signal,onProgress:event=>onProgress?.({id:task.id,...event})};
  const reservePhase=async(bytes,headroomBytes=0)=>{await budget.reclaim?.(bytes+headroomBytes,{signal:controller.signal});check(controller.signal);return budget.reserve(bytes);};
  retirements.add(owner);let primary,failed=false,result,key,cacheHit=false;
  try{
   owner.resident=await reservePhase(knownHeapBytes);
   // Fund manifest fetch chunks, integrity input and decoded metadata before
   // loading them; the bounded metadata remains live through inference.
   owner.metadata=await reservePhase(MANIFEST_ADMISSION_BYTES);
   const descriptor=im.surface?.descriptor;
   if(!descriptor||descriptor.format!=='rgb8')throw failure('INVALID_INPUT','Qualified oriented RGB8 source required.');
   key=resultIdentity(task,im,method,backend);const cached=key&&resultCache.get(key);
   if(cached?.result){check(controller.signal);cacheHit=true;result=borrowResult(cached,task,im,started);}
   else{
   // Bound coexistence on small machines: park CF sessions only across CF calls.
   // A different detector retires that cache before admitting its own ORT heap.
   if(method!=='community-forensics')await closeCfPool();
   const loaded=await loadAiManifest(config,method,{signal:controller.signal});check(controller.signal);
   const plan=aiPreparationPlan(method,descriptor.width,descriptor.height);
   let chosenBackend=backend!=='cpu'&&gpuQualified&&globalThis.navigator?.gpu?'webgpu':'cpu',backendFallback=null,admission,gpuInputBackupBytes=0,executionPerformance;
   if(backend==='webgpu'&&chosenBackend!=='webgpu')throw failure('GPU_UNAVAILABLE','WebGPU unavailable; select CPU or automatic.');
   // The provider funds its own returned windows; exclude that allowance here
   // to avoid counting the same backing in both provider and consumer.
   owner.scratch=await reservePhase(plan.scratchBytes-plan.width*3,plan.width*3);
   const source={width:descriptor.width,height:descriptor.height,async readWindow(bounds,options){
    let backing=await im.surface.readWindow(bounds,options),released=false,pending;
    // Register ownership before inspecting provider metadata; getters can fail
    // while a valid release handle still owns an admitted window backing.
    const window={get pixels(){return backing?.pixels;},release(){
     if(released)return Promise.resolve();if(pending)return pending;
     const task=Promise.resolve().then(()=>backing.release()).then(()=>{released=true;backing=null;owner.windows.delete(window);});
     pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
    }};
    owner.windows.add(window);return window;
   }};
   const preparationStarted=performance.now();
   let nextCooperation=performance.now()+8;
   const prepared=await prepareAiTensor(source,method,{...hooks,checkpoint:async()=>{check(controller.signal);if(performance.now()<nextCooperation)return;await new Promise(r=>setTimeout(r,0));check(controller.signal);nextCooperation=performance.now()+8;}});
   const preparationMs=performance.now()-preparationStarted,preparationMetrics=prepared.metrics;prepared.rgb=null;
   // A source window is always retired before the layer heap is admitted.
   check(controller.signal);
   const releaseBackup=async()=>{if(owner.backup){await owner.backup();owner.backup=null;}};
   const releaseLease=async()=>{if(owner.lease){await owner.lease.release();owner.lease=null;}};
   const acquire=async()=>{
    // This credit survives retirement of a failed GPU lease while its owned
    // backup is waiting for CPU admission. It is separate from ORT workspace.
    if(chosenBackend==='webgpu'&&!owner.backup)owner.backup=await reservePhase(prepared.data.byteLength);
    const residentGpu=method==='community-forensics'&&config.cfResident===true&&chosenBackend==='webgpu';
    admission=residentGpu?cfResidentAdmission(loaded.manifest,{backend:chosenBackend}):aiInferenceAdmission(loaded.manifest,{backend:chosenBackend});
    if(residentGpu){executionPerformance={...aiPerformancePolicy(config,method,chosenBackend),cpuThreads:1};return;}
    
    const policy=aiPerformancePolicy(config,method,chosenBackend),cpu=aiRequestedCpu(policy,chosenBackend,{capacity:scheduler.capacity?.cpu??1});
    owner.lease=await scheduler.acquire({cpu,minCpu:1,gpu:chosenBackend==='webgpu'?1:0,bytes:admission.bytes,signal:controller.signal,label:'ai-detector-'+method});
    executionPerformance=aiGrantedPerformance(policy,chosenBackend,owner.lease.cpu);
    if(Number.isSafeInteger(owner.lease.cpu)&&owner.lease.cpu>executionPerformance.cpuThreads)owner.lease.releaseCpu?.(owner.lease.cpu-executionPerformance.cpuThreads);
   };
   try{await acquire();}catch(error){
    if(backend!=='auto'||chosenBackend!=='webgpu'||error?.code!=='MEMORY_LIMIT')throw error;
    try{await releaseBackup();}catch(cleanup){throw withCleanup(error,cleanup);}
    backendFallback={from:'webgpu',to:'cpu',reason:'MEMORY_LIMIT'};chosenBackend='cpu';await acquire();
   }
   const runDetector=async(prepared,loaded,runConfig,runHooks)=>{
    if(method!=='community-forensics'||config.cfResident!==true||runHooks.backend!=='webgpu')return runAiWorker(prepared,loaded,runConfig,runHooks);
    const identity=JSON.stringify([loaded.sha256,configRevision,runHooks.backend,runConfig.ortModuleUrl,runConfig.ortWasmPaths,executionPerformance]);
    if(cfPool&&(cfPoolIdentity!==identity||cfPool.snapshot().closed))await closeCfPool();
    if(!cfPool){cfPool=createResidentPool({budget,scheduler,createMemoryCache:createExternalMemoryCache,workerUrl:new URL('./ai-detectors-resident-worker.js',import.meta.url)});cfPoolIdentity=identity;}
    return cfPool.infer(prepared,loaded,{...runConfig,contractModuleUrl:new URL('./ai-detectors-runtime.js',import.meta.url).href,gpuPolicyModuleUrl:new URL('./ai-detectors-gpu-policy.js',import.meta.url).href},{signal:controller.signal,backend:'webgpu',policy:executionPerformance});
   };
   let answer;
   if(chosenBackend==='webgpu'){
    // This small, funded backup survives input transfer into a failed GPU
    // worker. It is never a second full source image or an activation dump.
    let backup;
    try{
     try{backup=prepared.data.slice();gpuInputBackupBytes=backup.byteLength;}catch(cause){if(!(cause instanceof RangeError))throw cause;throw Object.assign(new Error('GPU input backup allocation failed.',{cause}),{code:'GPU_MEMORY_LIMIT'});}
     answer=await runDetector(prepared,loaded,{...config,performance:executionPerformance,ortModuleUrl:config.ortGpuModuleUrl,ortWasmPaths:config.ortGpuWasmPaths},{...hooks,backend:'webgpu'});
    }
    catch(error){
     const resource=(method==='community-forensics'&&config.cfResident===true&&error?.code==='MEMORY_LIMIT')||['GPU_UNAVAILABLE','GPU_MEMORY_LIMIT','GPU_DEVICE_LOST','GPU_TRACKING_UNAVAILABLE'].includes(error?.code);
     if(backend!=='auto'||!resource||error?.cleanupErrors?.length)throw error;
     check(controller.signal);
     try{if(method==='community-forensics'&&config.cfResident===true)await closeCfPool();await releaseLease();if(!backup)await releaseBackup();}catch(cleanup){throw withCleanup(error,cleanup);}
     backendFallback={from:'webgpu',to:'cpu',reason:error.code};chosenBackend='cpu';if(backup)prepared.data=backup;
     await acquire();answer=await runDetector(prepared,loaded,{...config,performance:executionPerformance},{...hooks,backend:'cpu'});
    }
   }else answer=await runDetector(prepared,loaded,{...config,performance:executionPerformance},{...hooks,backend:'cpu'});
   check(controller.signal);
   const threshold=loaded.manifest.decision?.threshold??0.5,operator=loaded.manifest.decision?.operator??'>=';
   const decision=operator==='>'?answer.score>threshold:answer.score>=threshold;
   result={id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:{method,score:answer.score,logit:answer.logit,threshold,decision,decisionOperator:operator,calibrated:false},layers:[],
    provenance:{engine:defaults.engineVersion??'sherloq-ai-detectors/1',operation:task.operation,params:{method},originalSha256:im.sha256,decode:structuredClone(im.provenance??{}),sourceUnchanged:true,sourceDimensions:[descriptor.width,descriptor.height],preparation:plan,preparationVersion:AI_PREPARATION_VERSION,inputTensorSha256:answer.inputSha256,modelManifestSha256:loaded.sha256,model:structuredClone(loaded.manifest.source??{}),backend:chosenBackend,precision:'float32',precisionDeclaration:structuredClone(loaded.manifest.numericalPolicy??loaded.manifest.experimentalNumerics??loaded.manifest.candidate??{}),semantics:'Uncalibrated model index; not an authenticity verdict.'},
    metrics:{totalMs:performance.now()-started,preparationMs,inferenceMs:answer.callWallMs??answer.totalMs,stages:answer.timings,preparation:preparationMetrics,admission,gpuInputBackupBytes,backend:chosenBackend,backendFallback,gpu:answer.gpu??null,performancePolicy:answer.performancePolicy??executionPerformance,modelCache:answer.modelCache??null,cache:{hit:false,stored:false},temporaryStorageBytes:0,memory:budget.snapshot?.()}};
   }
   hooks.onProgress?.({phase:'complete',fraction:1,cacheHit});
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   signal?.removeEventListener('abort',cancel);
   try{await retire(owner);}catch(cleanup){if(!failed)throw cleanup;throw withCleanup(primary,cleanup);/* failed owners remain retryable through clear() */}
  }
  check(signal);
  if(!cacheHit)result.metrics.cache={hit:false,stored:cacheResult(key,result),...cacheSnapshot()};
  result.metrics.totalMs=performance.now()-started;return result;
 }
 return{residentSnapshot:()=>cfPool?.snapshot()??null,configure,configured:()=>configured&&!closed,cacheSnapshot,run(task,im,hooks){
  if(closed)throw failure('DISPOSED','AI detector adapter disposed.');
  if(current||clearing||configuring)throw failure('BUSY','An AI detector is already running or retiring.');
  const controller=new AbortController(),cancel=()=>controller.abort();hooks?.signal?.addEventListener('abort',cancel,{once:true});if(hooks?.signal?.aborted)cancel();
  const running={controller,promise:null};current=running;
  const promise=Promise.resolve().then(()=>compute(task,im,{...hooks,signal:controller.signal}));
  running.promise=promise.finally(()=>{hooks?.signal?.removeEventListener('abort',cancel);if(current===running)current=null;});
  return running.promise;
 },clear,async dispose(){closed=true;await clear();await closeCfPool();unregisterReclaimer?.();}};
}
