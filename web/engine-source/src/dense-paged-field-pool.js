import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,countedDenseOwner,denseConstructionOwner,cleanupDenseOwners} from './dense-owner-retirement.js';
import {reclaimForResourceRecovery} from './resource-recovery.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {exportPortableDenseInput,portableDenseInputStagingBytes} from './dense-shared-field.js';
import {readByteStore} from './portable-byte-store.js';
import {getSharedReadCache} from './shared-read-cache.js';
import {createSegmentedBytes,adoptSharedSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession,removeTerminatedTemporarySession} from './temporary-storage.js';
import {DENSE_PAGED_WORKSPACE_BYTES,planDensePageMemory,densePagedMinimumWorkspace} from './dense-paged-memory.js';
import {AdaptiveConcurrency} from './adaptive-concurrency.js';
import {borrowDenseGpuService} from './dense-gpu-service.js';
import {serializeDenseError,deserializeDenseError} from './dense-memory-error.js';
const MiB=1024**2;

export class DensePagedFieldPool{
 constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-paged-field-worker.js',import.meta.url),{type:'module'}),forceBroker=false,onRetirementOwner}={}){this.onRetirementOwner=onRetirementOwner;this.pendingInputRetirements=new Set();this.pendingTaskRetirements=new Set();this.budget=budget;this.maxWorkers=maxWorkers;this.workerFactory=workerFactory;this.forceBroker=forceBroker;this.active=new Set();this.peakWorkers=0;this.jobs=0;this.adaptive=new AdaptiveConcurrency();this.cache=getSharedReadCache(budget);}
 start(input,options={}){
  const key=[input.width,input.height,input.dimensions,input.first.kind,options.iterations,options.radius,input.first.patch,input.second?.patch,input.first.quarter,input.second?.mirror].join(':'),scheduling=this.adaptive.select(key,this.maxWorkers,this.budget,()=>0);
  if(this.active.size>=scheduling.count)return null;
  const n=input.width*input.height,ownsAllowed=input.first.kind==='compact-sift'&&(input.first.quarter||input.second?.quarter),outputBytes=n*(8+(ownsAllowed?1:0));
  const {poolBytes,minimumFieldBytes}=densePagedMinimumWorkspace(n),inputTransportBytes=portableDenseInputStagingBytes(input),minimum=minimumFieldBytes+inputTransportBytes,room=this.budget.limit-this.budget.retained-this.budget.active;
  const outputStorage=options.storage==='temporary'||options.storage!=='memory'&&(this.budget.isBackingUnderPressure?.('array-buffer')||outputBytes+minimum>room||typeof SharedArrayBuffer!=='function'||globalThis.crossOriginIsolated!==true)?'temporary':'memory',outputReservation=outputStorage==='memory'?outputBytes:0;
  if(outputReservation+minimum>room)return null;
  const cap=Math.min(DENSE_PAGED_WORKSPACE_BYTES,Math.max(minimum,Math.floor(room/Math.max(1,scheduling.count-this.active.size))-outputReservation)),compact=input.first.kind==='compact-sift',second=input.second??input.first,dimensions=compact?128:input.dimensions??12;
  const boundBytes=compact?second.boundSamples?.byteLength??0:0,residentSiftBounds=!!boundBytes&&boundBytes<=Math.min(512*MiB,(cap-16*MiB-poolBytes)*.45);
  const lengths=[compact?input.first.hist.byteLength:n*dimensions*4,compact?second.hist.byteLength:n*dimensions*4,n,n*4,n*4,0,0,input.width*4,input.height*4,...(compact?[input.first.norms.byteLength,second.norms.byteLength,input.first.turns.byteLength,second.turns.byteLength,input.first.diverse.byteLength,second.diverse.byteLength,0,0]:[])];
  let plan;try{plan=planDensePageMemory({lengths,availableBytes:cap,residentBytes:poolBytes+(residentSiftBounds?boundBytes:0),n,dimensions,pageBytes:options.pageBytes,cachePages:options.cachePages,initialBatchPixels:options.initialBatchPixels});}catch(error){if(error.code==='MEMORY_LIMIT')return null;throw error;}
  let workspaceBytes=Math.min(cap,Math.max(minimum,plan.workspaceBytes+4*MiB)),releaseOutput,releaseRetirementMetadata;const workspaceReleases=[];
  try{releaseOutput=this.budget.reserve(outputReservation);workspaceReleases.push(this.budget.reserve(workspaceBytes));releaseRetirementMetadata=this.budget.reserve(4096);}catch(error){releaseOutput?.();for(const release of workspaceReleases)release();if(error.code==='MEMORY_LIMIT')return null;throw error;}
  const task={worker:null,reject:null,retirementPending:false,unavailable:false,sessionId:'job-'+crypto.randomUUID(),session:null,sessionReportedAbsent:false};const operation=this.budget.beginOperation?.({owner:'patchmatch',id:'field:'+task.sessionId,parent:options.resourceOperation});this.active.add(task);this.peakWorkers=Math.max(this.peakWorkers,this.active.size);this.jobs++;
  const promise=(async()=>{let lease,leaseId=0,gpuLease,gpuMemoryRelease,coordinatorCpuLease,coordinatorYielded=false,exported,delivered=false,adoptedSession=false,destinationSession,gpuTail=Promise.resolve(),failed=false,primary,inputOwner,outputOwner,taskOwner,forgetTask;const owned=[],requests=new Set(),gpuStaging=new Map(),controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,scheduler=getExecutionScheduler(this.budget,{maxWorkers:this.maxWorkers}),abort=()=>{resumeStartup?.();resumeStartup=null;if(task.retireWaiting)return;task.cancelRequested=true;if(!task.worker){task.reject?.(new EngineError('CANCELLED','Dense field worker cancelled before startup.'));return;}try{task.worker.postMessage({cancelDense:{sessionId:task.sessionId}});}catch(error){task.unavailable=true;task.worker.terminate();task.reject?.(error);}};
   let inputSerial=0,gpuRetireSerial=0,inputClosed=false,launch,resumeStartup;const suspendedInputs=new Set(),usefulProgress=new Map();const launched=new Promise(resolve=>{launch=resolve;}),inputRequests=new Map(),gpuRetireWaiters=new Map();
   const retireGpuStaging=async entry=>{if(inputClosed||signal.aborted||!task.worker)return false;const token=++gpuRetireSerial;const retired=await new Promise((resolve,reject)=>{gpuRetireWaiters.set(token,{resolve,reject});try{task.worker.postMessage({gpuRetire:{token,requestId:entry.id}});}catch(error){gpuRetireWaiters.delete(token);reject(error);}});gpuRetireWaiters.delete(token);if(retired){gpuStaging.delete(entry.id);entry.release();}return retired;};
   let denseGpuInputPublication,denseGpuResultTransfer;
   const remoteBackings=new Map();let sharedGpu;
   const observeBacking=(kind,bytes,{transfer=false}={})=>{if(!Number.isSafeInteger(bytes)||bytes<0)throw new EngineError('INVALID_INPUT','Invalid dense worker backing report.');const previous=remoteBackings.get(kind);if(previous?.bytes===bytes)return;previous?.release();if(bytes)remoteBackings.set(kind,{bytes,release:this.budget.registerBacking?.(kind,bytes,{owner:'patchmatch',label:'worker:'+task.sessionId})??(()=>{})});else remoteBackings.delete(kind);if(!transfer&&previous?.bytes>bytes)this.budget.notifyBackingRelease?.(kind,previous.bytes-bytes);};
   const controlInput=async(value,transfer=[])=>{
    if(inputClosed)return true;
    if(value.action==='detach')suspendedInputs.add(value.id);
    operation?.setState('io',{resource:'input-migration'});let paused=true;
    try{if(task.worker){await launched;if(inputClosed)return true;const ack=await new Promise((resolve,reject)=>{const token=++inputSerial;inputRequests.set(token,{resolve,reject});try{task.worker.postMessage({inputControl:{...value,token}},transfer);}catch(error){inputRequests.delete(token);reject(error);}});paused=ack?.paused!==false;}return paused;}
    finally{if(value.action==='attach'||!paused){suspendedInputs.delete(value.id);if(!suspendedInputs.size){resumeStartup?.();resumeStartup=null;}updateResourceActivity();}}
   };
   let resourceBlocks=0;
   const updateResourceActivity=()=>{for(const current of [lease,gpuLease,coordinatorCpuLease])current?.setResourceBlocked?.(resourceBlocks>0);operation?.setState(resourceBlocks?'recovery':suspendedInputs.size?'io':lease||gpuLease||coordinatorCpuLease?'compute':'ready',{resource:resourceBlocks?'memory':suspendedInputs.size?'input-migration':null});};
   const whileResourceBlocked=async work=>{resourceBlocks++;updateResourceActivity();try{return await work();}finally{resourceBlocks--;updateResourceActivity();}};
   signal?.addEventListener('abort',abort,{once:true});
   const cleanupSession=async()=>{if(task.sessionReportedAbsent&&!task.session)return;if(!task.worker&&!task.session)return;if(task.session){await removeTerminatedTemporarySession(task.session.id,task.session.backend);return;}await retireDenseOwners(['opfs','indexeddb'].map(backend=>()=>removeTerminatedTemporarySession(task.sessionId,backend)));};
   const retireStores=onceDenseRetirement(()=>retireDenseOwners(owned)),retireDestination=onceDenseRetirement(()=>destinationSession?.dispose()),retireSession=onceDenseRetirement(cleanupSession),retireOutput=onceDenseRetirement(async()=>{await retireStores();await retireDestination();await retireSession();releaseOutput();});
   const finalize=onceDenseRetirement(async()=>{
    if(task.retirementPending){
     if(task.unavailable)throw new EngineError('WORKER_FAILED','Dense field worker is unavailable; descendant cleanup ACK cannot be confirmed.',{details:{denseRetirementPending:true,workerTerminationRequested:true}});
     await new Promise((resolve,reject)=>{let settled=false;const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);task.retireWaiting=null;callback(value);},timer=setTimeout(()=>{task.unavailable=true;task.worker?.terminate();finish(reject,new EngineError('WORKER_FAILED','Dense field cleanup response timed out; termination is not a cleanup ACK.',{details:{denseRetirementPending:true,workerTerminationRequested:true}}));},10000);task.retireWaiting={resolve:()=>{task.retirementPending=false;finish(resolve);},reject:error=>finish(reject,error)};try{task.worker.postMessage({retireOutput:{token:1}});}catch(error){task.unavailable=true;task.worker?.terminate();finish(reject,error);}});
    }
    signal?.removeEventListener('abort',abort);controller.abort();task.worker?.terminate();for(const kind of [...remoteBackings.keys()])observeBacking(kind,0);inputClosed=true;for(const waiting of gpuRetireWaiters.values())waiting.resolve(false);gpuRetireWaiters.clear();resumeStartup?.();resumeStartup=null;launch();for(const waiting of inputRequests.values())waiting.resolve();inputRequests.clear();await Promise.allSettled([...requests]);gpuLease?.release();gpuMemoryRelease?.();for(const entry of gpuStaging.values())entry.release();gpuStaging.clear();coordinatorCpuLease?.release();for(const release of workspaceReleases)release();lease?.release();this.active.delete(task);
    await acknowledgeDenseRetirement(()=>inputOwner?.dispose());if(!delivered)await acknowledgeDenseRetirement(()=>outputOwner?outputOwner.dispose():retireOutput());else{if(!adoptedSession)await retireSession();outputOwner.publish();}sharedGpu?.release();operation?.release();this.pendingTaskRetirements.delete(taskOwner);releaseRetirementMetadata();forgetTask?.();forgetTask=null;
   });
   try{
    taskOwner={dispose:finalize,get state(){return{retirementPending:task.retirementPending,unavailable:task.unavailable,workerPresent:!!task.worker};}};this.pendingTaskRetirements.add(taskOwner);forgetTask=this.onRetirementOwner?.(taskOwner);
    inputOwner=denseConstructionOwner([],{onRetirementOwner:this.onRetirementOwner},async()=>{await acknowledgeDenseRetirement(()=>exported?.release());this.pendingInputRetirements.delete(inputOwner);});this.pendingInputRetirements.add(inputOwner);
    outputOwner=denseConstructionOwner(owned,{onRetirementOwner:this.onRetirementOwner},retireOutput);
    if(options.reuseGpuTransport===true&&options.enableDenseGpu===true)({denseGpuInputPublication,denseGpuResultTransfer}=await import('./dense-gpu-transport.js'));
    if(options.enableDenseGpu===true)try{sharedGpu=borrowDenseGpuService(this.budget);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
    operation?.setState('io',{resource:'input-publication'});exported=await exportPortableDenseInput(input,{budget:this.budget,signal,forceBroker:this.forceBroker,cache:this.cache,control:controlInput,immediateControl:true,onRetirementOwner:this.onRetirementOwner});checkAbort(signal);
    for(;;){lease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-paged-field'});checkAbort(signal);if(!suspendedInputs.size)break;lease.release();lease=null;await new Promise(resolve=>{resumeStartup=resolve;});checkAbort(signal);}task.worker=this.workerFactory();const started=performance.now(),concurrency=this.active.size;
    const remote=await new Promise((resolve,reject)=>{task.reject=reject;const protocol=installWorkerMessageProtocol(task.worker,data=>{
     if(data.backing){try{observeBacking('array-buffer',data.backing.arrayBufferBytes);observeBacking('wasm',data.backing.wasmBytes);}catch(error){reject(error);return;}}
     if(data.outputRetired){const waiter=task.retireWaiting;if(!waiter||data.outputRetired.token!==1)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Dense output retirement acknowledgement.');if(!data.outputRetired.error){task.retirementPending=false;if(data.outputRetired.sessionState==='retired'){task.session=null;task.sessionReportedAbsent=true;}}task.retireWaiting=null;data.outputRetired.error?waiter.reject(deserializeDenseError(data.outputRetired.error)):waiter.resolve();return;}
     if(data.inputAck){const waiting=inputRequests.get(data.inputAck.token);inputRequests.delete(data.inputAck.token);if(data.inputAck.error){const error=deserializeDenseError(data.inputAck.error);waiting?.reject(error);reject(error);}else waiting?.resolve(data.inputAck);return;}
     if(data.gpuRetired){gpuRetireWaiters.get(data.gpuRetired.token)?.resolve(data.gpuRetired.retired===true);return;}
     if(data.temporarySession){task.session=data.temporarySession;return;}
     const track=request=>{requests.add(request);request.then(()=>requests.delete(request),error=>{requests.delete(request);reject(error);});};
     if(data.memoryRequest){const request=whileResourceBlocked(async()=>{const {id,bytes}=data.memoryRequest;if(!Number.isSafeInteger(bytes)||bytes<0)throw new EngineError('INVALID_INPUT','Invalid allocation recovery request.');if(data.memoryRequest.action==='release-unused'){if(bytes>workspaceBytes)throw new EngineError('INVALID_INPUT','Unused workspace exceeds field reservation.');let remaining=bytes;for(const release of [...workspaceReleases].reverse()){const part=Math.min(remaining,release.bytes);if(part){release.split(part)();remaining-=part;}}workspaceBytes-=bytes;task.worker?.postMessage({memoryGrant:{id,releasedBytes:bytes}});return;}const failure=data.memoryRequest.error?deserializeDenseError(data.memoryRequest.error):new EngineError('MEMORY_LIMIT','Legacy field workspace request.',{details:{requestedBytes:bytes}});const releasedBytes=await reclaimForResourceRecovery(this.budget,failure,{signal,owner:'patchmatch',resourceOperation:operation,onReclaim:reclamation=>options.onProgress?.({phase:'resource-reclaimed',operation:'dense-field',reclamation})});task.worker?.postMessage({memoryGrant:{id,releasedBytes}});}).catch(error=>{task.worker?.postMessage({memoryGrant:{id:data.memoryRequest.id,error:serializeDenseError(error)}});if(!signal.aborted)throw error;});track(request);return;}
     if(data.gpuRequest){
      const request=gpuTail.then(async()=>{const {id,action}=data.gpuRequest;if(!['release','free','staging-free'].includes(action))checkAbort(signal);
       if(action==='distance-batch'){
        if(data.gpuRequest.job.reuseGpuTransport===true){const entry=gpuStaging.get(data.gpuRequest.job.gpuStagingToken),inputs=denseGpuInputPublication(data.gpuRequest.job),bytes=Object.values(inputs).reduce((sum,view)=>sum+view.buffer.byteLength,0);if(!entry||bytes>entry.bytes)throw new EngineError('INVALID_INPUT','Dense GPU transfer exceeds its owned reservation.');if(!entry.backing)entry.backing=this.budget.registerBacking?.('array-buffer',bytes,{owner:'patchmatch',label:'dense-gpu-transport'});}
        if(coordinatorCpuLease){coordinatorCpuLease.release();coordinatorCpuLease=null;coordinatorYielded=true;}else if(lease?.releaseCpu&&lease.cpu){lease.releaseCpu(1);coordinatorYielded=true;}
        try{sharedGpu??=borrowDenseGpuService(this.budget);return await sharedGpu.batch({...data.gpuRequest.job,signal});}
        finally{if(coordinatorYielded&&!signal.aborted){coordinatorCpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-native-refinement'});updateResourceActivity();coordinatorYielded=false;}}
       }
       if(action==='staging-reserve'){const bytes=data.gpuRequest.bytes;if(!Number.isSafeInteger(bytes)||bytes<0)throw new EngineError('INVALID_INPUT','Invalid GPU staging reservation.');await whileResourceBlocked(async()=>{if(this.budget.total()+bytes>this.budget.limit)await this.budget.reclaim?.(bytes,{signal,owner:'patchmatch',operation});const admission=await scheduler.acquire({cpu:0,bytes,domains:{'array-buffer':bytes},signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-staging'});try{const release=admission.retainMemory(bytes),entry={id,bytes};const unregister=data.gpuRequest.reusable===true?this.budget.registerAsyncReclaimer?.(()=>retireGpuStaging(entry),{owner:'patchmatch',allocationKind:'array-buffer',label:'dense-gpu-transport'}):null;let closed=false;entry.release=()=>{if(closed)return;closed=true;unregister?.();const retired=entry.backing?.();entry.backing=null;release();if(retired)this.budget.notifyBackingRelease?.('array-buffer',retired);};gpuStaging.set(id,entry);}finally{admission.release();}});return {bytes,token:id};}
       if(action==='staging-free'){gpuStaging.get(data.gpuRequest.token)?.release();gpuStaging.delete(data.gpuRequest.token);return {};}
       if(action==='reserve'){if(!gpuMemoryRelease){await whileResourceBlocked(async()=>{if(this.budget.total()+25*MiB>this.budget.limit)await this.budget.reclaim?.(25*MiB,{signal,owner:'patchmatch',operation});const admission=await scheduler.acquire({cpu:0,bytes:25*MiB,domains:{gpu:25*MiB},signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-resident'});try{gpuMemoryRelease=admission.retainMemory(25*MiB);}finally{admission.release();}});}return {bytes:25*MiB};}
       if(action==='acquire'){
        if(coordinatorCpuLease){coordinatorCpuLease.release();coordinatorCpuLease=null;coordinatorYielded=true;}else if(lease?.releaseCpu&&lease.cpu){lease.releaseCpu(1);coordinatorYielded=true;}
        gpuLease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-distance-gpu'});updateResourceActivity();return {};
       }
       if(action==='release'){gpuLease?.release();gpuLease=null;if(coordinatorYielded&&!signal.aborted){coordinatorCpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-native-refinement'});updateResourceActivity();coordinatorYielded=false;}return {};}
       if(action==='free'){gpuLease?.release();gpuLease=null;gpuMemoryRelease?.();gpuMemoryRelease=null;return {};}
       throw new EngineError('INVALID_INPUT','Unknown dense GPU request.');
      });gpuTail=request.catch(()=>{});const response=request.then(value=>{const inputs=data.gpuRequest.action==='distance-batch'&&data.gpuRequest.job.reuseGpuTransport===true?denseGpuInputPublication(data.gpuRequest.job):null;task.worker?.postMessage({gpuGrant:{id:data.gpuRequest.id,...value,...(inputs?{inputs}:{})}},inputs?denseGpuResultTransfer(value.result,inputs):value.result?[value.result.buffer]:[]);},error=>{const inputs=data.gpuRequest.action==='distance-batch'&&data.gpuRequest.job.reuseGpuTransport===true?denseGpuInputPublication(data.gpuRequest.job):null;task.worker?.postMessage({gpuGrant:{id:data.gpuRequest.id,error:serializeDenseError(error),...(inputs?{inputs}:{})}},inputs?denseGpuResultTransfer(null,inputs):[]);});track(response);return;
     }
     if(data.cpuRequest){
      const request=(async()=>{try{lease?.release();coordinatorCpuLease?.release();coordinatorCpuLease=null;lease=null;const maximum=Math.max(1,Math.min(this.maxWorkers,data.cpuRequest.maximum??1));
       const wanted=Math.min(DENSE_PAGED_WORKSPACE_BYTES*maximum,Math.max(workspaceBytes,data.cpuRequest.workspaceBytes??minimum*maximum));
       if(wanted>workspaceBytes){const desired=wanted-workspaceBytes;if(this.budget.total()+desired>this.budget.limit)await this.budget.reclaim?.(Math.min(desired,this.budget.limit),{signal,owner:'patchmatch',operation});const extra=Math.max(0,Math.min(desired,this.budget.limit-this.budget.total()));if(extra){workspaceReleases.push(this.budget.reserve(extra));workspaceBytes+=extra;}}
       const kernelBytes=data.cpuRequest.kernelBytes??Math.max(1,((data.cpuRequest.workspaceBytes??minimum*maximum)-poolBytes)/maximum),fixedBytes=Math.max(0,(data.cpuRequest.workspaceBytes??kernelBytes*maximum+poolBytes)-kernelBytes*maximum);
       const overage=Math.max(0,this.budget.total()-this.budget.limit),maxResidentKernels=Math.max(1,Math.floor((workspaceBytes-fixedBytes-overage)/kernelBytes));
       const count=Math.max(1,Math.min(maximum,maxResidentKernels));lease=await scheduler.acquire({cpu:count,minCpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-paged-wavefront'});updateResourceActivity();leaseId=data.cpuRequest.id;checkAbort(signal);
       task.worker.postMessage({cpuGrant:{id:data.cpuRequest.id,cpu:lease.cpu,workspaceBytes,maxResidentKernels,memoryAvailableBytes:Math.max(0,this.budget.limit-this.budget.total())}});
      }catch(error){task.worker?.postMessage({cpuGrant:{id:data.cpuRequest.id,error:serializeDenseError(error)}});if(!signal.aborted)throw error;}})();track(request);return;
     }
     if(data.cpuReturn){if(!signal.aborted&&data.cpuReturn.id===leaseId)lease?.releaseCpu?.(data.cpuReturn.count);return;}
     if(data.cpuRelease){if(!signal.aborted&&data.cpuRelease===leaseId){lease?.release();coordinatorCpuLease?.release();coordinatorCpuLease=null;lease=null;updateResourceActivity();}return;}
     if(data.progress){try{const p=data.progress,key=[p.phase,p.stage,p.iteration??''].join(':');if(Number.isFinite(p.completed)&&p.completed>(usefulProgress.get(key)??0)){usefulProgress.set(key,p.completed);operation?.commit();}this.cache?.rebalance();options.onProgress?.({...data.progress,sharedReadCache:this.cache?.snapshot()??null});}catch(error){controller.abort();reject(error);}return;}
     if(data.error){task.retirementPending=data.retirementPending===true;if(data.sessionState==='retired'&&!task.retirementPending){task.session=null;task.sessionReportedAbsent=true;}reject(deserializeDenseError(data.error));}else if(data.result&&typeof data.result==='object'){
      // A successful native worker explicitly reports whether it ever created
      // a temporary session. Memory-only output has no session to remove.
      // Absence of a result/report (crash or cancellation) remains unknown.
      task.sessionReportedAbsent=Object.hasOwn(data.result,'session')&&data.result.session==null;task.retirementPending=task.cancelRequested===true||data.result.outputRetirement===true;resolve(data.result);
     }else throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected dense field response.');
    },{label:'dense-paged-field',onFailure:error=>{task.unavailable=true;task.retireWaiting?.reject(error);task.retireWaiting=null;task.worker?.terminate();for(const waiting of inputRequests.values())waiting.reject(error);inputRequests.clear();reject(error);}});task.worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event.message||'Dense field worker failed.',{cause:event.error}));
     const {signal:externalSignal,onProgress:progressHook,budget:budgetOption,temporarySession:sessionOption,getTemporarySession:sessionFactoryOption,resourceOperation:operationOption,onRetirementOwner:retirementHook,...settings}=options;
     task.retirementPending=true;protocol.post({input:exported.value,options:{...settings,residentPool:true,residentSiftBounds,pagedSiftBounds:false,workspaceBytes,parallelism:1,maxParallelism:this.maxWorkers},budgetBytes:workspaceBytes+outputReservation,outputStorage,sessionId:task.sessionId},exported.transfer);
     launch();
    });
    checkAbort(signal);inputClosed=true;for(const waiting of inputRequests.values())waiting.resolve();inputRequests.clear();const inputTransports=exported.transports;await inputOwner.dispose();operation?.setState('io',{resource:'output-publication'});task.session??=remote.session;const stores={},ensureDestination=async({signal:migrationSignal}={})=>destinationSession??=await createTemporarySession({budget:this.budget,signal:migrationSignal});
    for(const [name,descriptor] of Object.entries(remote.stores)){
     if(descriptor.kind==='shared'||descriptor.segments){const reservation=releaseOutput.split(descriptor.byteLength),actualBytes=descriptor.segments.reduce((sum,[,bank])=>sum+bank.byteLength,0),reported=remoteBackings.get('array-buffer')?.bytes??0;observeBacking('array-buffer',Math.max(0,reported-actualBytes),{transfer:true});let store;try{store=await adoptSharedSegmentedBytes(descriptor,{budget:this.budget,reservation,owner:'patchmatch',label:'dense-field-output',migrationReserve:bytes=>{const available=workspaceReleases.find(release=>release.bytes>=bytes);if(!available)throw new EngineError('MEMORY_LIMIT','Completed workspace cannot fund migration I/O.');return available.split(bytes);},temporarySession:options.temporarySession,getTemporarySession:options.getTemporarySession??ensureDestination});}catch(error){observeBacking('array-buffer',reported,{transfer:true});reservation();throw error;}store.markCold();owned.push(store);stores[name]=store;continue;}
     const reader=await readByteStore(descriptor,{budget:this.budget,onRetirementOwner:this.onRetirementOwner});owned.push(reader);
     if(descriptor.kind==='broker'){
      // Browser fallback: copy the completed owned plane once in useful bounded
      // chunks before retiring its worker. Never keep an idle large Wasm heap
      // alive merely to answer later result/export reads.
      let release,publicationError,publicationFailed=false;
      try{
       await ensureDestination({signal});
       const store=await createSegmentedBytes(reader.byteLength,{budget:this.budget,storage:'temporary',temporarySession:destinationSession,signal});owned.push(store);const size=Math.min(MiB,reader.byteLength);release=this.budget.reserve(size);
       const buffer=new Uint8Array(size);for(let offset=0;offset<reader.byteLength;offset+=size){checkAbort(signal);const part=buffer.subarray(0,Math.min(size,reader.byteLength-offset));await reader.readInto(part,offset);await store.write(part,offset);}await store.flush();stores[name]=store;
      }catch(error){publicationFailed=true;publicationError=error;throw error;}
      finally{release?.();await cleanupDenseOwners(()=>reader.dispose(),{failed:publicationFailed,primary:publicationError});}
     }else{stores[name]=reader;if(descriptor.kind==='opfs-readonly')adoptedSession=true;}
    }
    // Broker outputs have been copied into their new owner. Close the old
    // worker's pins, arrays and temporary session before termination. A worker
    // termination request is not an IndexedDB connection-closed ACK.
    if(!adoptedSession&&remote.outputRetirement===true)await new Promise((resolve,reject)=>{task.retireWaiting={resolve,reject};try{task.worker.postMessage({retireOutput:{token:1}});}catch(error){task.retireWaiting=null;reject(error);}});
    checkAbort(signal);
    const result={...remote,...stores,allowed:remote.ownsAllowed?stores.allowed:input.mask};delete result.stores;delete result.session;
    const usefulMs=performance.now()-started;this.adaptive.observe(key,{count:concurrency,maximum:this.maxWorkers,milliseconds:usefulMs,units:Math.max(1,Number(result.comparisons))});
    result.dispose=outputOwner.dispose;
    result.metrics={...result.metrics,worker:true,sharedInput:inputTransports.every(kind=>kind==='shared'),inputTransports,workerBudgetBytes:workspaceBytes+outputReservation,usefulMs,scheduling,outputStorage,sharedReadCache:this.cache?.snapshot()??null};delivered=true;return result;
   }catch(error){failed=true;primary=error;throw error;}finally{await cleanupDenseOwners(finalize,{failed,primary});}
  })();
  task.promise=promise;return promise;
 }
 async drain(){await Promise.allSettled([...this.active].map(task=>task.promise));await retireDenseOwners([...this.pendingTaskRetirements]);await retireDenseOwners([...this.pendingInputRetirements]);}
}
