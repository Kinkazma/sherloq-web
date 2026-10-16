import {Budget} from '../engine-source/src/cache.js';
import {resolveComputeProfile} from '../engine-source/src/profiles.js';
import {getExecutionScheduler} from '../engine-source/src/execution-scheduler.js';
import {NeuralGraphPool} from '../engine-source/src/neural-graph-pool.js';
import {SharedMemo,byteLength,retainBackings} from './shared-memo.js';
import {allocateOwnedTypedArray} from '../engine-source/src/allocation.js';
import {runWithResourceRecovery} from '../engine-source/src/resource-recovery.js';
import {createBlobSourceAnalysis} from './blob-source-analysis.js';
import {estimateComprintStatisticsPlan} from './comprint-streaming-statistics.js';
import {boundedDigest} from './bounded-digest.js';
const MiB=1024**2;
const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(data.buffer,data.byteOffset,data.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const aborted=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
function validateOutputs(outputs){
 if(!outputs||!Object.keys(outputs).length)throw Error('Empty neural output');
 for(const [name,tensor]of Object.entries(outputs)){
  if(!ArrayBuffer.isView(tensor?.data)||!Array.isArray(tensor.dims)||tensor.dims.some(d=>!Number.isSafeInteger(d)||d<0)||tensor.dims.reduce((a,b)=>a*b,1)!==tensor.data.length)throw Error('Invalid neural output geometry: '+name);
  if(tensor.data instanceof Float32Array||tensor.data instanceof Float64Array)for(const value of tensor.data)if(!Number.isFinite(value))throw Error('Nonfinite neural output: '+name);
 }
}
/** Planning admission, without a second RAM reservation or a CPU/GPU lane.
 * Real kernels still acquire the application's shared execution scheduler.
 * Estimates prevent simultaneous pipeline growth; Budget remains authoritative. */
export class PipelineAdmission {
 constructor(budget,{fraction=.9,prepare=()=>{}}={}){
  this.budget=budget;this.fraction=fraction;this.prepare=prepare;this.queue=[];this.active=new Set();this.closed=false;this.queuedPump=false;this.pumping=false;
  this.metrics={admitted:0,completed:0,peakStages:0,peakPlannedBytes:0,waitMs:0};
  this.unsubscribe=budget.subscribe?.(()=>this.schedule());
 }
 planned(){return [...this.active].reduce((sum,item)=>sum+item.bytes,0);}
 acquire({bytes=0,label='',priority=10,signal,onAdmit,onRelease,method,stage}={}){
  if(this.closed)return Promise.reject(new Error('Pipeline admission disposed'));
  try{aborted(signal);if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('Invalid pipeline bound');if(bytes>this.budget.limit){const error=new Error('Pipeline exceeds the shared memory budget');error.code='MEMORY_LIMIT';error.details={requestedBytes:bytes,budgetBytes:this.budget.limit};throw error;}}catch(error){return Promise.reject(error);}
  return new Promise((resolve,reject)=>{
   const request={bytes,label,priority,signal,onAdmit,onRelease,method,stage,resolve,reject,started:performance.now()};
   request.abort=()=>{const i=this.queue.indexOf(request);if(i<0)return;this.queue.splice(i,1);signal?.removeEventListener('abort',request.abort);reject(signal.reason??new DOMException('Aborted','AbortError'));this.schedule();};
   this.queue.push(request);signal?.addEventListener('abort',request.abort,{once:true});if(signal?.aborted)request.abort();else this.schedule();
  });
 }
 schedule(){if(this.closed||this.queuedPump)return;this.queuedPump=true;queueMicrotask(()=>{this.queuedPump=false;this.pump();});}
 pump(){
  if(this.closed||this.pumping)return;this.pumping=true;
  try{
   this.queue.sort((a,b)=>a.priority-b.priority||a.started-b.started);
   for(let index=0;index<this.queue.length;){
    const request=this.queue[index],planned=this.planned(),target=Math.floor(this.budget.limit*this.fraction);
    // A fresh host observation may lower the budget while this job waits.
    // Reject impossible admission instead of leaving a permanently blocked job.
    if(request.bytes>this.budget.limit){const error=Object.assign(new Error('Pipeline exceeds the updated shared memory budget'),{code:'MEMORY_LIMIT',details:{requestedBytes:request.bytes,budgetBytes:this.budget.limit}});this.queue.splice(index,1);request.signal?.removeEventListener('abort',request.abort);request.reject(error);continue;}
    // A single large useful pipeline may use the whole budget. Concurrency
    // keeps headroom for decoded inputs, returned maps and allocator overhead.
    if(this.active.size&&planned+request.bytes>target){index++;continue;}
    try{this.prepare(request);}catch(error){
     if(error.code==='MEMORY_LIMIT'&&this.active.size){index++;continue;}
     this.queue.splice(index,1);request.signal?.removeEventListener('abort',request.abort);request.reject(error);continue;
    }
    this.queue.splice(index,1);request.signal?.removeEventListener('abort',request.abort);this.active.add(request);let released=false;
    try{request.onAdmit?.();}catch(error){this.active.delete(request);request.reject(error);continue;}
    this.metrics.admitted++;this.metrics.peakStages=Math.max(this.metrics.peakStages,this.active.size);this.metrics.peakPlannedBytes=Math.max(this.metrics.peakPlannedBytes,this.planned());const waitMs=performance.now()-request.started;this.metrics.waitMs+=waitMs;
    request.resolve({waitMs,bytes:request.bytes,release:()=>{if(released)return;released=true;this.active.delete(request);request.onRelease?.();this.metrics.completed++;this.schedule();}});
   }
  }finally{this.pumping=false;}
 }
 snapshot(){return {...this.metrics,targetBytes:Math.floor(this.budget.limit*this.fraction),plannedBytes:this.planned(),active:[...this.active].map(({label,bytes})=>({label,bytes})),queued:this.queue.map(({label,bytes})=>({label,bytes})),meaning:'Pipeline growth estimates; actual RAM reservations and CPU/GPU admission remain in the shared budget/scheduler.'};}
 dispose(){if(this.closed)return;this.closed=true;this.unsubscribe?.();for(const r of this.queue){r.signal?.removeEventListener('abort',r.abort);r.reject(new DOMException('Pipeline admission disposed','AbortError'));}this.queue=[];}
}
function modelResident(asset,backend){
 const gpu=backend==='webgpu'||backend==='auto'&&Boolean(globalThis.navigator?.gpu),workspace=(gpu?asset.gpuWorkspaceBytes:undefined)??asset.workspaceBytes??0;
 const heap=Math.ceil((64*MiB+asset.bytes*2+(gpu?(asset.gpuWasmWorkspaceBytes??workspace):workspace))/(16*MiB))*16*MiB;
 return heap+asset.bytes*2+(gpu?asset.bytes+workspace:0)+4*MiB;
}
export function estimatePipelineBytes(method,stage,image,{assets,backend='auto',statistics={},maxWorkers=6,maxGpuJobs=2}={}){
 const n=image.width*image.height,models=Object.values(assets).filter(a=>a.method===method);
 if(!models.length)return 0; // Synthetic dependency-injected contract modules.
 if(stage==='statistics'){
  if(!image.data||n>4_000_000){
   // Admission funds one useful exact EM worker, not every potential lane.
   // The statistics implementation adds lanes only with real shared headroom.
   return estimateComprintStatisticsPlan(image.width,image.height,{mainHeapBytes:statistics.mainHeapBytes,chunkedEM:statistics.chunkedEM??true,maxWorkers:1}).minimumBytes;
  }
  const workers=Math.min(6,Math.max(1,Math.trunc(statistics.maxWorkers??4))),main=statistics.mainHeapBytes??768*MiB,fit=statistics.fitHeapBytes??256*MiB;
  return Math.ceil(main+408*MiB+workers*(fit+200*MiB)+n*160+192*MiB);
 }
 const model=Math.max(...models.map(a=>modelResident(a,backend)+(a.outputBytes??16*MiB)*2));
 // SPAI retires the encoder's eviction protection at the aggregator boundary;
 // graphs retain separate fallback state while their runtimes remain reusable.
 const gpu=backend==='webgpu'||backend==='auto'&&Boolean(globalThis.navigator?.gpu),copies=method==='comprint'&&gpu?Math.min(2,maxWorkers,maxGpuJobs):1,bounded=!image.data||n>4_000_000;
 let host=64*MiB+n*(method==='doctamper'?(bounded?6:96):method==='comprint'?(bounded?8:32):bounded?0:16);
 if(method==='spai'){const patches=Math.max(5,Math.floor(Math.max(224,image.width)/224)*Math.floor(Math.max(224,image.height)/224));host+=Math.min(64,patches)*3*3*224*224*4*2+Math.min(10,maxWorkers)*16*MiB;}
 return Math.ceil(model*copies+host);
}
/** Additive browser engine. Inject the application's SAME budget and scheduler.
 * Decoded inputs are read-only for the duration of analyze. Returned numerical
 * arrays belong to the caller, independently of the internal immutable cache;
 * keep their reservation until release(). No image is uploaded by this engine.
 * createPool/createCodec/loadModule are dependency injection hooks for contract tests. */
export async function createExtensionEngine({budget,scheduler,profile=resolveComputeProfile('maximum'),manifest,baseURL=new URL('./',import.meta.url).href,runtimes,statistics={},maxGpuJobs=2,createPool,createCodec,loadModule,blobSourceOptions}={}){
 const injectedResources={budget:Boolean(budget),scheduler:Boolean(scheduler)};
 budget??=new Budget(profile.memoryBudgetBytes);scheduler??=getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers,maxGpuJobs});
 manifest??=await(await fetch(new URL('models/manifest.json',baseURL))).json();
 if(manifest.execution?.startsWith('browser-only')!==true)throw Error('Browser-only extension manifest required');
 const core=new URL('../engine-source/',import.meta.url),absolute=p=>new URL(p,baseURL).href;
 runtimes??={wasm:{factoryUrl:absolute('runtime/cpu-factory.mjs'),ortUrl:new URL('vendor/m3-ort/ort.wasm.min.mjs',core).href,wasmUrl:new URL('vendor/d2prl/ort-wasm-simd-threaded.wasm',core).href},webgpu:{factoryUrl:absolute('runtime/gpu-factory.mjs'),ortUrl:new URL('vendor/segmentation/ort.all.min.mjs',core).href,wasmUrl:new URL('vendor/segmentation/ort-wasm-simd-threaded.jsep.wasm',core).href}};
 const assets=Object.fromEntries(Object.entries(manifest.assets).map(([k,a])=>[k,{...a,url:absolute(a.url)}])),pools=new Map(),memo=new SharedMemo(budget),modules=new Map();
 const spaiEncoder=assets['models/spai/encoder.onnx'];if(spaiEncoder?.workspaceByBatch){spaiEncoder.effectiveBatchSize=budget.limit>=6*1024**3&&spaiEncoder.workspaceByBatch[4]?4:1;spaiEncoder.gpuWorkspaceBytes=spaiEncoder.workspaceByBatch[spaiEncoder.effectiveBatchSize];}
 let disposed=false,disposal,codec,codecPromise,codecRetirement,codecUsers=0,comprintStatistics,statisticsResidentBytes=0,statisticsActive=0;
 const codecIdleWaiters=new Set();
 const activeModels=new Map();
 const unclaimStatistics=budget.registerReclaimer?.(bytes=>{if(!statisticsActive&&statisticsResidentBytes&&budget.total()+bytes>budget.limit){comprintStatistics?.clear();statisticsResidentBytes=0;}},{allocationKind:'wasm',owner:'extensions/comprint-statistics',label:'idle-Comprint-statistics'});
 // JPEG disposal awaits its queued native calls. Keep its policy reservation
 // until that acknowledgement; an idle reclaimer cannot count a promise as free.
 const unclaimCodec=budget.registerAsyncReclaimer?.(async({bytes,reason}={})=>{
  if(codecRetirement)await codecRetirement;
  if(!codecUsers&&codec&&(reason==='allocation'||budget.total()+(bytes??0)>budget.limit))await retireCodec();
  return 0; // Policy credit only; no assertion about immediate physical heap GC.
 },{allocationKind:'wasm',owner:'extensions/doctamper-codec',label:'idle-DTD-codec'});
 function stageResident(request){if(request.stage==='statistics')return statisticsResidentBytes;return [...pools].filter(([key])=>assets[key].method===request.method).reduce((n,[,pool])=>n+(pool.slots??[]).reduce((sum,s)=>sum+s.bytes,0),0);}
 const admission=new PipelineAdmission(budget,{prepare:request=>{for(let i=0;i<3;i++){const before=stageResident(request);budget.room(Math.max(0,request.bytes-before));if(before===stageResident(request))return;}budget.room(request.bytes);}});
 async function admit(method,stage,image,{backend,signal,onProgress}={}){
  const models=new Set();
  const unprotect=()=>{for(const key of models){const count=activeModels.get(key)-1;if(count)activeModels.set(key,count);else activeModels.delete(key);}models.clear();};
  const priority=method==='comprint'?0:2;
  const request=async selected=>{
   const bytes=estimatePipelineBytes(method,stage,image,{assets,backend:selected,statistics,maxWorkers:profile.maxWorkers,maxGpuJobs:scheduler.capacity?.gpu??maxGpuJobs});
   const acquire=()=>admission.acquire({bytes,label:method+'/'+stage,priority,signal,method,stage,onAdmit:()=>{if(stage==='statistics')statisticsActive++;},onRelease:()=>{unprotect();if(stage==='statistics')statisticsActive--;}});
   try{onProgress?.({method,phase:'pipeline-queued',plannedBytes:bytes,stage,backend:selected});}catch{}
   try{return {...await acquire(),backend:selected};}
   catch(error){
    // A real synchronous room refusal may be resolved by an idle owner whose
    // close requires an acknowledgement. Retry this admission once, after its
    // existing reservation has actually retired. An impossible plan never trims.
    if(error.code==='MEMORY_LIMIT'&&bytes>budget.limit){error.details={...error.details,admissionScope:'fixed'};throw error;}
    if(error.code!=='MEMORY_LIMIT'||!budget.reclaim)throw error;
    await budget.reclaim(Math.max(0,bytes-stageResident({method,stage})),{signal,owner:'extensions/'+method});
    return {...await acquire(),backend:selected};
   }
  };
  let lease;try{lease=await request(backend);}catch(error){if(error.code!=='MEMORY_LIMIT'||backend!=='auto'||stage!=='neural'||!globalThis.navigator?.gpu)throw error;lease=await request('cpu');}
  return {...lease,useModel:key=>{if(models.has(key))return;if(method==='spai')unprotect();models.add(key);activeModels.set(key,(activeModels.get(key)??0)+1);}};
 }
 const metrics={imageDigests:0,analyses:0,neuralCalls:0,neuralCacheHits:0,backendExecutions:[]};
 function live(){if(disposed)throw Error('Extension disposed');}
 function poolFor(key){live();if(!pools.has(key)){const assetRuntimes=assets[key].webgpuOrtURL?{...runtimes,webgpu:{...runtimes.webgpu,ortUrl:absolute(assets[key].webgpuOrtURL)}}:runtimes;const options={assets,runtimes:assetRuntimes,resourceOwner:'extensions/'+assets[key].method,workerFactory:()=>new Worker(new URL('neural-worker.js',baseURL),{type:'module'})};const pool=createPool?createPool(budget,profile,options):new NeuralGraphPool(budget,profile,options);if(pool.reclaim){const reclaim=pool.reclaim.bind(pool);pool.reclaim=(bytes,kind)=>{if(!activeModels.has(key))return reclaim(bytes,kind);};}pools.set(key,pool);}return pools.get(key);}
 async function moduleFor(method){if(!modules.has(method)){const pending=Promise.resolve().then(()=>loadModule?loadModule(method):import(new URL(method==='comprint'?'comprint-statistics.js':method+'.js',baseURL)));modules.set(method,pending);pending.catch(()=>{if(modules.get(method)===pending)modules.delete(method);});}return modules.get(method);}
 async function codecFor(){
  live();if(codecRetirement)await codecRetirement;live();
  if(!codecPromise){
   const pending=(async()=>{
    const factory=createCodec??(await import(new URL('doctamper-codec.js',baseURL))).createDoctamperCodec;live();const release=budget.reserve(128*MiB);
    try{const created=await factory();if(disposed){await created.dispose();throw Error('Extension disposed');}codec={value:created,release};return created;}
    catch(error){release();throw error;}
   })();
   codecPromise=pending;pending.catch(()=>{if(codecPromise===pending)codecPromise=undefined;});
  }
  return codecPromise;
 }
 function retireCodec(){
  if(codecRetirement)return codecRetirement;
  if(codecUsers||!codec)return Promise.resolve();
  const retired=codec;codec=undefined;codecPromise=undefined;
  const pending=Promise.resolve().then(async()=>{try{await retired.value.dispose();}finally{retired.value=undefined;retired.release();}});
  codecRetirement=pending;pending.finally(()=>{if(codecRetirement===pending)codecRetirement=undefined;}).catch(()=>{});return pending;
 }
 function releaseCodecUser(){
  if(--codecUsers===0){for(const resolve of codecIdleWaiters)resolve();codecIdleWaiters.clear();budget.notifyReclaimable?.();}
 }
 async function borrowCodec(){
  // A bounded preparation retains workingDCT for later tiles. Protect the
  // complete DTD producer, including preparation release and pending prefetch.
  codecUsers++;
  try{const value=await codecFor();let released=false;return {value,release:()=>{if(released)return;released=true;releaseCodecUser();}};}
  catch(error){releaseCodecUser();throw error;}
 }
 async function disposeCodec(){
  if(codecUsers)await new Promise(resolve=>codecIdleWaiters.add(resolve));
  await retireCodec();
 }
 function assetPath(asset){const path=typeof asset==='string'?asset:asset?.url??asset?.path;const found=Object.keys(assets).find(key=>key===path||assets[key].url===path||assets[key].sha256===asset?.sha256);if(!found)throw Error('Unregistered extension model '+path);return found;}
 async function inference(asset,feeds,{backend,signal,onProgress,scope,execution,pipeline,cache=true}={}){
  live();aborted(signal);const key=assetPath(asset),a=assets[key];pipeline?.useModel(key);metrics.neuralCalls++;
  const gpu=backend==='webgpu'||backend==='auto'&&!poolFor(key).cpuOnly&&Boolean(globalThis.navigator?.gpu);
  const count=key==='models/spai/encoder.onnx'?(feeds.x?.dims[0]??1):1,workspaceBytes=gpu?(a.workspaceByBatch?.[count]??a.gpuWorkspaceBytes??a.workspaceBytes):a.workspaceBytes,outputBytes=key==='models/spai/encoder.onnx'?Math.max(a.outputBytes??16*MiB,count*1096*4):(a.outputBytes??16*MiB);
  if(!cache){
   const result=await poolFor(key).run(key,feeds,{backend,signal,onProgress,workspaceBytes,outputBytes,gpuWasmWorkspaceBytes:a.gpuWasmWorkspaceBytes,cpuWorkspaceBytes:a.workspaceBytes});
   try{validateOutputs(result.result);execution.push({model:key,...result.metrics});metrics.backendExecutions.push({model:key,provider:result.metrics.provider,milliseconds:result.metrics.milliseconds});if(metrics.backendExecutions.length>256)metrics.backendExecutions.shift();Object.defineProperty(result.result,'release',{value:result.release,enumerable:false});return result.result;}catch(error){result.release();throw error;}
  }
  const identities=await Promise.all(Object.entries(feeds).sort(([a],[b])=>a.localeCompare(b)).map(async([name,t])=>[name,t.dims,t.type??'float32',await digest(t.data)]));aborted(signal);
  const cacheKey='v1/'+a.sha256+'/'+backend+'/'+JSON.stringify(identities);if(budget.get('extensions/network/'+cacheKey))metrics.neuralCacheHits++;
  return scope.get(cacheKey,async sharedSignal=>{
   live();aborted(sharedSignal);const result=await poolFor(key).run(key,feeds,{backend,signal:sharedSignal,onProgress,workspaceBytes,outputBytes,gpuWasmWorkspaceBytes:a.gpuWasmWorkspaceBytes,cpuWorkspaceBytes:a.workspaceBytes});
   // The pool lease remains owned through memo admission, including failures.
   try{validateOutputs(result.result);execution.push({model:key,...result.metrics});metrics.backendExecutions.push({model:key,provider:result.metrics.provider,milliseconds:result.metrics.milliseconds});if(metrics.backendExecutions.length>256)metrics.backendExecutions.shift();return memo.own(result.result,result.release);}catch(error){result.release();throw error;}
  });
 }
 async function analyzeOne(image,method,{backend='auto',signal,onProgress,identity,retainSourceBuffers}={}){
  aborted(signal);const start=performance.now(),prefix='extensions/'+identity,scope=memo.scope(prefix,{signal}),execution=[];let handedOff=false;
  try{
   const jpegIdentity=method==='doctamper'&&image.encodedBytes?await digest(image.encodedBytes):'';
   const prepKey='prepare/'+method+'/v2/'+(method==='doctamper'?JSON.stringify([image.sourceFormat,image.exifOrientation,jpegIdentity]):'');
   const resultKey='result/'+prepKey+'/'+backend+'/'+JSON.stringify(Object.values(assets).filter(a=>a.method===method).map(a=>a.sha256));
   // Lookup the finished result before loading a module or preparing FFT/DCT.
   const result=await scope.get(resultKey,async workSignal=>{
    const releaseSource=image.retainAnalysisSource?.();let releaseBuffers;
    try{
    releaseBuffers=retainSourceBuffers?.();
    const work=memo.scope(prefix,{signal:workSignal}),neural=memo.scope('extensions/network',{signal:workSignal}),localMemo=new Map();let pipeline,preparedRelease,workingRelease,resultRelease,codecUseRelease;
    try{
     pipeline=await admit(method,'neural',image,{backend,signal:workSignal,onProgress});
     backend=pipeline.backend??backend;
     const mod=await moduleFor(method);aborted(workSignal);let prepared;const bounded=!image.data||image.width*image.height>4_000_000;
     if(method==='comprint'&&!bounded)prepared=await work.get(prepKey,()=>mod.prepareComprintInput(image.data,image.width,image.height));
     else if(method==='comprint')prepared={width:image.width,height:image.height};
     else if(method==='doctamper'&&bounded&&mod.prepareBounded){
      const borrowed=await borrowCodec(),currentCodec=borrowed.value;codecUseRelease=borrowed.release;prepared=await mod.prepareBounded(image,{signal:workSignal,onProgress,budget,scheduler,workingDCT:currentCodec.workingDCT,nativeCategorySource:currentCodec.nativeCategorySource,getTemporarySession:image.getTemporarySession});preparedRelease=()=>prepared.release?.();
     }else if(method==='doctamper'){
      const borrowed=await borrowCodec(),currentCodec=borrowed.value;codecUseRelease=borrowed.release;
      prepared=await work.get(prepKey,sharedSignal=>mod.prepare(image,{memo:localMemo,signal:sharedSignal,onProgress,workingDCT:currentCodec.workingDCT,nativeDCT:currentCodec.nativeDCT}));
     }else prepared=await work.get(prepKey,async sharedSignal=>{
      const nested=memo.scope(prefix,{signal:sharedSignal});
      try{const gpu=backend==='webgpu'||backend==='auto'&&Boolean(globalThis.navigator?.gpu);const value=await mod.prepare(image,{memo:localMemo,signal:sharedSignal,onProgress,digest:identity,scheduler,budget,maxWorkers:profile.maxWorkers,encoderBatchSize:method==='spai'&&gpu?(spaiEncoder?.effectiveBatchSize??1):1});return memo.own(value,nested.release);}
      catch(error){nested.release();throw error;}
     });
     const calls={loadSession:async(id,path)=>({path,id}),infer:(asset,feeds,options={})=>inference(asset?.path??asset,feeds,{backend,signal:workSignal,onProgress,scope:neural,execution,pipeline,...options})};
     let result;
     if(method==='bfree'||method==='spai')result=await mod.runPrepared(prepared,calls,{memo:localMemo,signal:workSignal,onProgress,source:image,scheduler,budget,maxWorkers:profile.maxWorkers,encoderBatchSize:method==='spai'&&(backend==='webgpu'||backend==='auto'&&Boolean(globalThis.navigator?.gpu))?(spaiEncoder?.effectiveBatchSize??1):1});
     else if(method==='doctamper')result=await (bounded&&mod.analyzeBounded?mod.analyzeBounded:mod.analyze)(prepared,{runtime:{infer:calls.infer},asset:'models/doctamper/doctamper.onnx',signal:workSignal,onProgress,budget,render:false});
     else if(method==='comprint'){
      if(bounded)workingRelease=budget.reserve(image.width*image.height*8);
      const gpu=backend==='webgpu'||backend==='auto'&&Boolean(globalThis.navigator?.gpu),concurrency=gpu?Math.max(1,Math.min(2,profile.maxWorkers,scheduler.capacity?.cpu??profile.maxWorkers,scheduler.capacity?.gpu??maxGpuJobs)):1;
      const fingerprint=await (bounded?mod.runComprintFingerprintSource(image,{infer:calls.infer,asset:'models/comprint/comprint.onnx',signal:workSignal,onProgress,budget,scheduler,maxWorkers:profile.maxWorkers,concurrency}):mod.runComprintFingerprint(prepared,{infer:calls.infer,asset:'models/comprint/comprint.onnx',signal:workSignal,onProgress,budget,scheduler,maxWorkers:profile.maxWorkers,concurrency}));
      if(bounded)preparedRelease=()=>fingerprint.release?.();
      pipeline.release();pipeline=undefined;
      pipeline=await admit(method,'statistics',image,{backend,signal:workSignal,onProgress});
      if(!comprintStatistics)comprintStatistics=mod.createComprintStatistics({maxWorkers:profile.maxWorkers,...statistics,budget,scheduler});
      const fingerprintSha256=await boundedDigest(fingerprint.data,{budget,scheduler,signal:workSignal,onProgress});
      const numerical=await work.get('statistics/comprint/legacy-parallel-v2/'+assets['models/comprint/comprint.onnx'].sha256+'/'+fingerprintSha256,sharedSignal=>comprintStatistics.analyze(bounded?fingerprint.luminance:prepared.luminance,fingerprint.data,image.width,image.height,{signal:sharedSignal,onProgress,segmented:bounded,getTemporarySession:image.getTemporarySession,storage:'temporary'}));
      statisticsResidentBytes=numerical.metadata?.resourceAdmission?.residentBytes??statisticsResidentBytes;
      // Finished statistics no longer protect their idle WASM heaps. Permit
      // reclamation before reserving the original-size presentation field.
      pipeline.release();pipeline=undefined;if(bounded){fingerprint.data=null;fingerprint.luminance=null;await preparedRelease?.();preparedRelease=undefined;workingRelease?.();workingRelease=undefined;}
      const mapOwner=allocateOwnedTypedArray(Float64Array,image.width*image.height,{budget,owner:'comprint-result',label:'full-anomaly-map'});let map;
      try{map=mod.rasterComprintMap(numerical.outputs.map.data,numerical.outputs.valid.data,numerical.outputs.range0.data,numerical.outputs.range1.data,image.width,image.height,mapOwner.data);}catch(error){mapOwner.release();throw error;}
      result={method,status:'ok',width:image.width,height:image.height,...(bounded?{tiling:fingerprint.tiling}:{fingerprint}),statistics:numerical,anomaly:{data:map,dims:[image.height,image.width]},semantics:'Compression fingerprint consistency; anomaly is not a forgery probability.'};
      Object.defineProperty(result,'release',{value:mapOwner.release});
     }else throw Error('Method unsupported');
     resultRelease=result.release;aborted(workSignal);
     // Keep all borrowed neural/intermediate arrays admitted until SharedMemo
     // has admitted the final result, which can alias those same backing stores.
     await preparedRelease?.();preparedRelease=undefined;
     // Kernels have finished: publication must be allowed to retire idle
     // sessions/statistics heaps before admitting large scientific maps.
     pipeline?.release();pipeline=undefined;workingRelease?.();workingRelease=undefined;
     return memo.own(result,()=>{resultRelease?.();workingRelease?.();work.release();neural.release();pipeline?.release();});
    }catch(error){if(method==='comprint')statisticsResidentBytes=0;resultRelease?.();await preparedRelease?.();workingRelease?.();work.release();neural.release();pipeline?.release();throw error;}
    finally{codecUseRelease?.();}
    }finally{try{await releaseSource?.();}finally{releaseBuffers?.();}}
   });
   aborted(signal);handedOff=true;
   return {value:{...result,metrics:{totalMs:performance.now()-start,execution,cache:{neural:execution.length===0},memory:budget.snapshot()}},release:scope.release,evict:()=>budget.remove(prefix+'/'+resultKey)};
  }finally{if(!handedOff)scope.release();}
 }
 let blobAnalysis;
 const api={
  capabilities(){return {version:manifest.version,execution:'browser-only',methods:Object.keys(manifest.methods),gpu:!!globalThis.navigator?.gpu,cpu:'WebAssembly SIMD and available shared threads',sharedBudget:injectedResources.budget,resourceIntegration:injectedResources,advancedOptionalMethods:[],scheduler:scheduler.snapshot()};},
  async analyze(image,{methods=manifest.default_methods,backend='auto',signal,onProgress,resultMode='owned',onMethodResult}={}){
   live();aborted(signal);const n=image.width*image.height,windowSource=!image.data&&typeof image.readWindow==='function'&&typeof image.sourceSha256==='string';if(!Number.isSafeInteger(n)||n<1||(!windowSource&&(!(image.data instanceof Uint8Array)||image.data.length!==3*n)))throw Error('Decoded RGB8 or identified window source required');if(!methods.length||methods.some(m=>!Object.hasOwn(manifest.methods,m)))throw Error('Only approved lightweight methods are admitted');if(!['owned','borrowed','consumed'].includes(resultMode))throw Error('Unknown result ownership mode');if(resultMode==='consumed'&&typeof onMethodResult!=='function')throw Error('Consumed results require an awaited result consumer');
   const sourceBuffers={data:image.data,encodedBytes:image.encodedBytes},sourceLease=budget.reserve(byteLength(sourceBuffers)),started=performance.now(),holders=[];let outputLease,sourceBacking,handedOff=false;
   // Caller and actual shared producers borrow one admitted owner. Cancelling
   // a subscriber cannot retire buffers still used by a sibling's producer.
   let sourceReferences=1;
   const dropSourceReference=()=>{if(--sourceReferences===0)try{sourceBacking?.();}finally{sourceLease();}};
   const retainSourceBuffers=()=>{if(sourceReferences<1)throw Error('Analysis source owner retired');sourceReferences++;let released=false;return()=>{if(released)return;released=true;dropSourceReference();};};
   try{
    sourceBacking=retainBackings(budget,sourceBuffers,{label:'analysis-source'});if(!windowSource)metrics.imageDigests++;const pixelHash=windowSource?undefined:await digest(image.data);aborted(signal);const identity=[image.width,image.height,windowSource?'source/'+image.sourceSha256+'/'+JSON.stringify(image.decodeProvenance??{}):pixelHash].join('/');metrics.analyses++;
    // Every job settles before finally releases shared inputs, even on abort.
    const jobs=methods.map(async method=>{
     let holder;
     const failed=error=>({method,status:'error',error:{code:error.code??error.name,message:error.message,details:error.details}});
     try{
      holder=await runWithResourceRecovery(()=>analyzeOne(image,method,{backend:typeof backend==='object'?(backend[method]??'auto'):backend,signal,onProgress,identity,retainSourceBuffers}),{budget,signal,operation:'extensions/'+method,onRecovery:event=>onProgress?.({method,...event})});
      if(resultMode==='consumed'){await onMethodResult(holder.value);return {method,status:holder.value.status};}
      holders.push(holder);return holder.value;
     }catch(error){
      let failure=failed(error);
      if(resultMode==='consumed'&&!holder)try{await onMethodResult(failure);}catch(consumerError){failure=failed(consumerError);}
      return failure;
     }finally{if(resultMode==='consumed'&&holder){holder.evict();holder.release();}}
    });
    const results=await Promise.all(jobs);aborted(signal);live();
    let ownedResults;if(resultMode==='consumed'){ownedResults=results;outputLease=()=>{};handedOff=true;}else if(resultMode==='borrowed'){
     ownedResults=results;let released=false;outputLease=()=>{if(released)return;released=true;for(const holder of holders)holder.release();};handedOff=true;
    }else{
     outputLease=budget.reserve(byteLength(results));
     try{ownedResults=structuredClone(results);const backing=retainBackings(budget,ownedResults,{label:'public-analysis-result'}),reservation=outputLease;let released=false;outputLease=()=>{if(released)return;released=true;backing();reservation();};}catch(error){outputLease();outputLease=undefined;throw error;}
    }
    return {release:outputLease,status:results.every(r=>r.status==='ok')?'ok':'partial',ownership:resultMode,source:{width:image.width,height:image.height,...(pixelHash?{rgbSha256:pixelHash}:{originalSha256:image.sourceSha256,decode:structuredClone(image.decodeProvenance)})},results:ownedResults,metrics:{totalMs:performance.now()-started,memo:{...memo.metrics},pool:[...pools].map(([model,p])=>({model,...p.snapshot()})),execution:scheduler.snapshot(),pipelines:admission.snapshot(),memory:budget.snapshot()}};
   }finally{if(!handedOff)for(const holder of holders)holder.release();dropSourceReference();}
  },
  /** Caller retains the original core source until this promise settles. The
   * adapter publishes borrowed numerical results and owns release afterwards. */
  analyzeSource(source,options={}){
   const d=source.surface?.descriptor??source.descriptor??source;
   const read=source.readWindow?.bind(source)??source.surface?.readWindow?.bind(source.surface);
   return api.analyze({width:d.width,height:d.height,readWindow:read,retainAnalysisSource:source.retainAnalysisSource?.bind(source),sourceSha256:source.sourceSha256??source.sha256,sourceFormat:source.sourceFormat??source.provenance?.format,source:source.source??source.sourceFile,sourceBlob:source.sourceBlob??source.blob,encodedBytes:source.encodedBytes,exifOrientation:source.exifOrientation??source.provenance?.orientation??1,decodeProvenance:source.decodeProvenance??source.provenance,getTemporarySession:source.getTemporarySession??source.ensureTemporarySession},options);
  },
  /** onDecodedImage borrows a bounded presentation RGB only during its
   * awaited callback. originalWidth/Height and samplingStep identify exact
   * source texels; analysis always reads the full-resolution original. */
  async analyzeBlob(blob,options={}){
   live();aborted(options.signal);
   blobAnalysis??=createBlobSourceAnalysis({...blobSourceOptions,budget,analyzeSource:(source,settings)=>api.analyzeSource(source,settings)});
   return blobAnalysis.analyze(blob,options);
  },
  snapshot(){return {metrics:structuredClone(metrics),memo:{...memo.metrics},execution:scheduler.snapshot(),pipelines:admission.snapshot(),memory:budget.snapshot()};},
  clearCache(){memo.clear();},
  dispose(){
   if(disposal)return disposal;disposed=true;const cleanups=[];
   const clean=fn=>{try{cleanups.push(Promise.resolve(fn()));}catch(error){cleanups.push(Promise.reject(error));}};
   clean(()=>blobAnalysis?.dispose());clean(()=>admission.dispose());clean(()=>unclaimStatistics?.());clean(()=>unclaimCodec?.());clean(()=>memo.dispose());for(const pool of pools.values())clean(()=>pool.dispose());clean(()=>comprintStatistics?.dispose());clean(()=>disposeCodec());
   // The module import may still be pending. Dispose its preprocessing pool as
   // soon as it becomes available, including FFT workers and shared buffers.
   for(const method of ['spai']){const pending=modules.get(method);if(pending)cleanups.push(pending.then(mod=>mod.disposePreprocessing?.(scheduler),()=>{}));}
   if(codecPromise)cleanups.push(codecPromise.catch(()=>{}));
   disposal=Promise.allSettled(cleanups).then(results=>{const failures=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(failures.length)throw new AggregateError(failures,'Extension disposal failed');});return disposal;
  }
 };
 return api;
}
