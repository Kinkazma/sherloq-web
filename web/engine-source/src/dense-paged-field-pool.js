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
 constructor(budget,{maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-paged-field-worker.js',import.meta.url),{type:'module'}),forceBroker=false}={}){this.budget=budget;this.maxWorkers=maxWorkers;this.workerFactory=workerFactory;this.forceBroker=forceBroker;this.active=new Set();this.peakWorkers=0;this.jobs=0;this.adaptive=new AdaptiveConcurrency();this.cache=getSharedReadCache(budget);}
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
  let workspaceBytes=Math.min(cap,Math.max(minimum,plan.workspaceBytes+4*MiB)),releaseOutput;const workspaceReleases=[];
  try{releaseOutput=this.budget.reserve(outputReservation);workspaceReleases.push(this.budget.reserve(workspaceBytes));}catch(error){releaseOutput?.();if(error.code==='MEMORY_LIMIT')return null;throw error;}
  const task={worker:null,reject:null,sessionId:'job-'+crypto.randomUUID(),session:null};const operation=this.budget.beginOperation?.({owner:'patchmatch',id:'field:'+task.sessionId,parent:options.resourceOperation});this.active.add(task);this.peakWorkers=Math.max(this.peakWorkers,this.active.size);this.jobs++;
  const promise=(async()=>{let lease,leaseId=0,gpuLease,gpuMemoryRelease,coordinatorCpuLease,coordinatorYielded=false,exported,delivered=false,adoptedSession=false,destinationSession,gpuTail=Promise.resolve();const owned=[],requests=new Set(),gpuStaging=new Map(),controller=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal,scheduler=getExecutionScheduler(this.budget,{maxWorkers:this.maxWorkers}),abort=()=>{resumeStartup?.();resumeStartup=null;task.worker?.terminate();task.reject?.(new EngineError('CANCELLED','Dense field worker stopped.'));};
   let inputSerial=0,inputClosed=false,launch,resumeStartup;const suspendedInputs=new Set(),usefulProgress=new Map();const launched=new Promise(resolve=>{launch=resolve;}),inputRequests=new Map();
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
   const cleanupSession=async()=>{if(task.session){await removeTerminatedTemporarySession(task.session.id,task.session.backend);return;}await Promise.allSettled(['opfs','indexeddb'].map(backend=>removeTerminatedTemporarySession(task.sessionId,backend)));};
   try{
    if(options.enableDenseGpu===true)try{sharedGpu=borrowDenseGpuService(this.budget);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
    operation?.setState('io',{resource:'input-publication'});exported=await exportPortableDenseInput(input,{budget:this.budget,signal,forceBroker:this.forceBroker,cache:this.cache,control:controlInput,immediateControl:true});checkAbort(signal);
    for(;;){lease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-paged-field'});checkAbort(signal);if(!suspendedInputs.size)break;lease.release();lease=null;await new Promise(resolve=>{resumeStartup=resolve;});checkAbort(signal);}task.worker=this.workerFactory();const started=performance.now(),concurrency=this.active.size;
    const remote=await new Promise((resolve,reject)=>{task.reject=reject;const protocol=installWorkerMessageProtocol(task.worker,data=>{
     if(data.backing){try{observeBacking('array-buffer',data.backing.arrayBufferBytes);observeBacking('wasm',data.backing.wasmBytes);}catch(error){reject(error);return;}}
     if(data.inputAck){const waiting=inputRequests.get(data.inputAck.token);inputRequests.delete(data.inputAck.token);if(data.inputAck.error){const error=deserializeDenseError(data.inputAck.error);waiting?.reject(error);reject(error);}else waiting?.resolve(data.inputAck);return;}
     if(data.temporarySession){task.session=data.temporarySession;return;}
     const track=request=>{requests.add(request);request.then(()=>requests.delete(request),error=>{requests.delete(request);reject(error);});};
     if(data.memoryRequest){const request=whileResourceBlocked(async()=>{const {id,bytes}=data.memoryRequest;if(!Number.isSafeInteger(bytes)||bytes<0)throw new EngineError('INVALID_INPUT','Invalid allocation recovery request.');if(data.memoryRequest.action==='release-unused'){if(bytes>workspaceBytes)throw new EngineError('INVALID_INPUT','Unused workspace exceeds field reservation.');let remaining=bytes;for(const release of [...workspaceReleases].reverse()){const part=Math.min(remaining,release.bytes);if(part){release.split(part)();remaining-=part;}}workspaceBytes-=bytes;task.worker?.postMessage({memoryGrant:{id,releasedBytes:bytes}});return;}const failure=data.memoryRequest.error?deserializeDenseError(data.memoryRequest.error):new EngineError('MEMORY_LIMIT','Legacy field workspace request.',{details:{requestedBytes:bytes}});const releasedBytes=await reclaimForResourceRecovery(this.budget,failure,{signal,owner:'patchmatch',resourceOperation:operation,onReclaim:reclamation=>options.onProgress?.({phase:'resource-reclaimed',operation:'dense-field',reclamation})});task.worker?.postMessage({memoryGrant:{id,releasedBytes}});});track(request);return;}
     if(data.gpuRequest){
      const request=gpuTail.then(async()=>{const {id,action}=data.gpuRequest;checkAbort(signal);
       if(action==='distance-batch'){
        if(coordinatorCpuLease){coordinatorCpuLease.release();coordinatorCpuLease=null;coordinatorYielded=true;}else if(lease?.releaseCpu&&lease.cpu){lease.releaseCpu(1);coordinatorYielded=true;}
        try{sharedGpu??=borrowDenseGpuService(this.budget);return await sharedGpu.batch({...data.gpuRequest.job,signal});}
        finally{if(coordinatorYielded&&!signal.aborted){coordinatorCpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-native-refinement'});updateResourceActivity();coordinatorYielded=false;}}
       }
       if(action==='staging-reserve'){const bytes=data.gpuRequest.bytes;if(!Number.isSafeInteger(bytes)||bytes<0)throw new EngineError('INVALID_INPUT','Invalid GPU staging reservation.');await whileResourceBlocked(async()=>{if(this.budget.total()+bytes>this.budget.limit)await this.budget.reclaim?.(bytes,{signal,owner:'patchmatch',operation});const admission=await scheduler.acquire({cpu:0,bytes,domains:{'array-buffer':bytes},signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-staging'});try{gpuStaging.set(id,admission.retainMemory(bytes));}finally{admission.release();}});return {bytes,token:id};}
       if(action==='staging-free'){gpuStaging.get(data.gpuRequest.token)?.();gpuStaging.delete(data.gpuRequest.token);return {};}
       if(action==='reserve'){if(!gpuMemoryRelease){await whileResourceBlocked(async()=>{if(this.budget.total()+25*MiB>this.budget.limit)await this.budget.reclaim?.(25*MiB,{signal,owner:'patchmatch',operation});const admission=await scheduler.acquire({cpu:0,bytes:25*MiB,domains:{gpu:25*MiB},signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-resident'});try{gpuMemoryRelease=admission.retainMemory(25*MiB);}finally{admission.release();}});}return {bytes:25*MiB};}
       if(action==='acquire'){
        if(coordinatorCpuLease){coordinatorCpuLease.release();coordinatorCpuLease=null;coordinatorYielded=true;}else if(lease?.releaseCpu&&lease.cpu){lease.releaseCpu(1);coordinatorYielded=true;}
        gpuLease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-distance-gpu'});updateResourceActivity();return {};
       }
       if(action==='release'){gpuLease?.release();gpuLease=null;if(coordinatorYielded){coordinatorCpuLease=await scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-gpu-native-refinement'});updateResourceActivity();coordinatorYielded=false;}return {};}
       if(action==='free'){gpuLease?.release();gpuLease=null;gpuMemoryRelease?.();gpuMemoryRelease=null;return {};}
       throw new EngineError('INVALID_INPUT','Unknown dense GPU request.');
      });gpuTail=request.catch(()=>{});const response=request.then(value=>task.worker?.postMessage({gpuGrant:{id:data.gpuRequest.id,...value}},value.result?[value.result.buffer]:[]),error=>task.worker?.postMessage({gpuGrant:{id:data.gpuRequest.id,error:serializeDenseError(error)}}));track(response);return;
     }
     if(data.cpuRequest){
      const request=(async()=>{lease?.release();coordinatorCpuLease?.release();coordinatorCpuLease=null;lease=null;const maximum=Math.max(1,Math.min(this.maxWorkers,data.cpuRequest.maximum??1));
       const wanted=Math.min(DENSE_PAGED_WORKSPACE_BYTES*maximum,Math.max(workspaceBytes,data.cpuRequest.workspaceBytes??minimum*maximum));
       if(wanted>workspaceBytes){const desired=wanted-workspaceBytes;if(this.budget.total()+desired>this.budget.limit)await this.budget.reclaim?.(Math.min(desired,this.budget.limit),{signal,owner:'patchmatch',operation});const extra=Math.max(0,Math.min(desired,this.budget.limit-this.budget.total()));if(extra){workspaceReleases.push(this.budget.reserve(extra));workspaceBytes+=extra;}}
       const kernelBytes=data.cpuRequest.kernelBytes??Math.max(1,((data.cpuRequest.workspaceBytes??minimum*maximum)-poolBytes)/maximum),fixedBytes=Math.max(0,(data.cpuRequest.workspaceBytes??kernelBytes*maximum+poolBytes)-kernelBytes*maximum);
       const overage=Math.max(0,this.budget.total()-this.budget.limit),maxResidentKernels=Math.max(1,Math.floor((workspaceBytes-fixedBytes-overage)/kernelBytes));
       const count=Math.max(1,Math.min(maximum,maxResidentKernels));lease=await scheduler.acquire({cpu:count,minCpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-paged-wavefront'});updateResourceActivity();leaseId=data.cpuRequest.id;checkAbort(signal);
       task.worker.postMessage({cpuGrant:{id:data.cpuRequest.id,cpu:lease.cpu,workspaceBytes,maxResidentKernels,memoryAvailableBytes:Math.max(0,this.budget.limit-this.budget.total())}});
      })();track(request);return;
     }
     if(data.cpuReturn){if(data.cpuReturn.id===leaseId)lease?.releaseCpu?.(data.cpuReturn.count);return;}
     if(data.cpuRelease){if(data.cpuRelease===leaseId){lease?.release();coordinatorCpuLease?.release();coordinatorCpuLease=null;lease=null;updateResourceActivity();}return;}
     if(data.progress){try{const p=data.progress,key=[p.phase,p.stage,p.iteration??''].join(':');if(Number.isFinite(p.completed)&&p.completed>(usefulProgress.get(key)??0)){usefulProgress.set(key,p.completed);operation?.commit();}this.cache?.rebalance();options.onProgress?.({...data.progress,sharedReadCache:this.cache?.snapshot()??null});}catch(error){reject(error);}return;}
     if(data.error)reject(deserializeDenseError(data.error));else if(data.result&&typeof data.result==='object')resolve(data.result);else throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected dense field response.');
    },{label:'dense-paged-field',onFailure:error=>{task.worker?.terminate();for(const waiting of inputRequests.values())waiting.reject(error);inputRequests.clear();reject(error);}});task.worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event.message||'Dense field worker failed.',{cause:event.error}));
     const {signal:externalSignal,onProgress:progressHook,budget:budgetOption,temporarySession:sessionOption,getTemporarySession:sessionFactoryOption,resourceOperation:operationOption,...settings}=options;
     protocol.post({input:exported.value,options:{...settings,residentPool:true,residentSiftBounds,pagedSiftBounds:false,workspaceBytes,parallelism:1,maxParallelism:this.maxWorkers},budgetBytes:workspaceBytes+outputReservation,outputStorage,sessionId:task.sessionId},exported.transfer);
     launch();
    });
    checkAbort(signal);inputClosed=true;for(const waiting of inputRequests.values())waiting.resolve();inputRequests.clear();const inputTransports=exported.transports;await exported.release();operation?.setState('io',{resource:'output-publication'});task.session??=remote.session;const stores={},ensureDestination=async({signal:migrationSignal}={})=>destinationSession??=await createTemporarySession({budget:this.budget,signal:migrationSignal});
    for(const [name,descriptor] of Object.entries(remote.stores)){
     if(descriptor.kind==='shared'||descriptor.segments){const reservation=releaseOutput.split(descriptor.byteLength),actualBytes=descriptor.segments.reduce((sum,[,bank])=>sum+bank.byteLength,0),reported=remoteBackings.get('array-buffer')?.bytes??0;observeBacking('array-buffer',Math.max(0,reported-actualBytes),{transfer:true});let store;try{store=await adoptSharedSegmentedBytes(descriptor,{budget:this.budget,reservation,owner:'patchmatch',label:'dense-field-output',migrationReserve:bytes=>{const available=workspaceReleases.find(release=>release.bytes>=bytes);if(!available)throw new EngineError('MEMORY_LIMIT','Completed workspace cannot fund migration I/O.');return available.split(bytes);},temporarySession:options.temporarySession,getTemporarySession:options.getTemporarySession??ensureDestination});}catch(error){observeBacking('array-buffer',reported,{transfer:true});reservation();throw error;}store.markCold();owned.push(store);stores[name]=store;continue;}
     const reader=await readByteStore(descriptor,{budget:this.budget});
     if(descriptor.kind==='broker'){
      // Browser fallback: copy the completed owned plane once in useful bounded
      // chunks before retiring its worker. Never keep an idle large Wasm heap
      // alive merely to answer later result/export reads.
      let release,publicationError;
      try{
       await ensureDestination({signal});
       const store=await createSegmentedBytes(reader.byteLength,{budget:this.budget,storage:'temporary',temporarySession:destinationSession,signal});owned.push(store);const size=Math.min(MiB,reader.byteLength);release=this.budget.reserve(size);
       const buffer=new Uint8Array(size);for(let offset=0;offset<reader.byteLength;offset+=size){checkAbort(signal);const part=buffer.subarray(0,Math.min(size,reader.byteLength-offset));await reader.readInto(part,offset);await store.write(part,offset);}await store.flush();stores[name]=store;
      }catch(error){publicationError=error;throw error;}
      finally{
       let cleanupError;try{release?.();}catch(error){cleanupError=error;}try{await reader.dispose();}catch(error){cleanupError??=error;}
       if(!publicationError&&cleanupError)throw cleanupError;
      }
     }else{owned.push(reader);stores[name]=reader;if(descriptor.kind==='opfs-readonly')adoptedSession=true;}
    }
    const result={...remote,...stores,allowed:remote.ownsAllowed?stores.allowed:input.mask};delete result.stores;delete result.session;
    const usefulMs=performance.now()-started;this.adaptive.observe(key,{count:concurrency,maximum:this.maxWorkers,milliseconds:usefulMs,units:Math.max(1,Number(result.comparisons))});
    let disposed=false;result.dispose=async()=>{if(disposed)return;disposed=true;try{await Promise.all(owned.map(store=>store.dispose()));await destinationSession?.dispose();if(adoptedSession)await cleanupSession();}finally{releaseOutput();}};
    result.metrics={...result.metrics,worker:true,sharedInput:inputTransports.every(kind=>kind==='shared'),inputTransports,workerBudgetBytes:workspaceBytes+outputReservation,usefulMs,scheduling,outputStorage,sharedReadCache:this.cache?.snapshot()??null};delivered=true;return result;
   }finally{
    controller.abort();signal?.removeEventListener('abort',abort);task.worker?.terminate();for(const kind of [...remoteBackings.keys()])observeBacking(kind,0);inputClosed=true;resumeStartup?.();resumeStartup=null;launch();for(const waiting of inputRequests.values())waiting.resolve();inputRequests.clear();await exported?.release();await Promise.allSettled([...requests]);gpuLease?.release();gpuMemoryRelease?.();for(const release of gpuStaging.values())release();gpuStaging.clear();coordinatorCpuLease?.release();for(const release of workspaceReleases)release();lease?.release();this.active.delete(task);
    if(!delivered){await Promise.allSettled(owned.map(store=>store.dispose()));await destinationSession?.dispose();}
    // Shared outputs already own split reservations. Broker/temporary outputs
    // no longer occupy their worker RAM after copying and terminating it.
    releaseOutput();
    try{if(!delivered||!adoptedSession)await cleanupSession();}finally{sharedGpu?.release();operation?.release();}
   }
  })();
  task.promise=promise;return promise;
 }
 async drain(){await Promise.allSettled([...this.active].map(task=>task.promise));}
}
