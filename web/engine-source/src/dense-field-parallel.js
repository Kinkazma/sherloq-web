import {serializeEngineError,isRecoverableResourceError} from './errors.js';
import {runWithResourceRecovery,ResourceRecoveryController} from './resource-recovery.js';
import {commitDenseWriteBatch,denseWriteBatchBytes} from './dense-write-batch.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {Budget} from './cache.js';
import {EngineError,checkAbort} from './errors.js';
import {DenseWavefront} from './dense-wavefront.js';
import {exportByteStore} from './portable-byte-store.js';
import {deserializeDenseError,serializeDenseError} from './dense-memory-error.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};};
// The parent owns the CPU grant. No nested scheduler admission occurs here.
// Native contexts remain alive while their task queues are idle.
export async function runParallelDenseField({values,stores,metadata,weights,distanceBatch,reserveGpuStaging,gpuBatchPixels,transportBytesPerKernel=0,bootstrapStaging=0,budget,kernelBytes,initialWorkers,maximum,acquireCpu,recoverMemory,releaseInitialWorkspace,releaseWorkspace,signal,onProgress,readCache,inputBarrier,inputReaders,validateCachePages,workerFactory=()=>new Worker(new URL('./dense-field-kernel-worker.js',import.meta.url),{type:'module'}),cachePages,bootBytes}){
 const writeBatchBytes=denseWriteBatchBytes(values[11]||4096),width=values[0],height=values[1],n=width*height,iterations=values[6],endpoints=[];let currentCachePages=cachePages;let failure,boot,releaseBootBacking,closing=false,peak=0,tasks=0,chunk=1024,active=0,reservedWorkers=initialWorkers;const growthReservations=[];let retiredComparisons=0n;const recoveryController=new ResourceRecoveryController(),creationRecovery=new ResourceRecoveryController();
 const metrics={coordinator:'control-and-storage-only',workers:0,peakActiveKernels:0,tasks:0,cpuGrants:[],cpuGrantChanges:0,wavefront:'ordered-row-segments',reverse:'parallel-proposals-ordered-commit',cacheReconfigurations:0,allocationRecoveries:0,commandRecoveries:0,committedTasks:0,writeBatchBytesPerKernel:writeBatchBytes};let growthBlocked=null,cacheBlocked=null,cacheEpoch=0,returnedWorkspaceTotal=0;
 // Returning a reservation for an uncreated heap is not a physical memory
 // recovery. Exclude our own returns from both parent and local headroom so
 // they cannot immediately retry the same refused allocation.
 const memoryAvailable=(lease,returnedAtGrant)=>(lease?.memoryAvailableBytes??0)-(releaseWorkspace?returnedAtGrant:0)+Math.max(0,budget.limit-budget.total())-(releaseWorkspace?0:returnedWorkspaceTotal);
 const recover=async error=>{checkAbort(signal);const details=error.details,bytes=Math.max(1,Number.isFinite(details?.requestedBytes)?details.requestedBytes-(details.currentBytes??0):kernelBytes);const reclaim=async()=>recoverMemory?(await recoverMemory({bytes,error:serializeDenseError(error)}))?.releasedBytes??0:await budget.reclaim(Math.min(budget.limit,Math.max(0,budget.limit-budget.total())+bytes),{signal,owner:'patchmatch'});const releasedBytes=inputBarrier?await inputBarrier.waitAtBoundary(reclaim):await reclaim();checkAbort(signal);metrics.lastAllocationFailure=serializeDenseError(error);if(releasedBytes>0)metrics.allocationRecoveries++;return {releasedBytes,bytes};};
 const recoverCreation=async error=>{const decision=creationRecovery.fail(error,{operation:'dense-kernel-allocation',checkpoint:metrics.committedTasks,memory:budget.snapshot()});metrics.lastAllocationFailure=serializeDenseError(decision.error);if(!decision.retry)return {releasedBytes:0,bytes:Math.max(1,error.details?.requestedBytes??kernelBytes)};return recover(decision.error);};
 const releaseUncreated=async()=>{const bytes=(reservedWorkers-endpoints.length)*kernelBytes;if(!bytes)return;let remaining=bytes;for(const release of [...growthReservations].reverse()){const part=Math.min(remaining,release.bytes);if(part){release.split(part)();remaining-=part;}}if(remaining)releaseInitialWorkspace?.(remaining);reservedWorkers=endpoints.length;await releaseWorkspace?.(bytes);returnedWorkspaceTotal+=bytes;};
 const fail=error=>{failure??=error;for(const endpoint of endpoints)endpoint.fail?.(error);};
 const abort=()=>fail(new EngineError('CANCELLED','Parallel dense field cancelled.'));
 async function addWorker(){
  // This sub-budget partitions the already reserved kernel envelope; it does
  // not create a second reservation against the parent field budget.
  const release=()=>{},exported=[],ownerTransportBytes=transportBytesPerKernel/3,ioBudget=new Budget(ownerTransportBytes),first=!boot;let worker,endpoint,cacheConnection;
  try{
   for(let id=0;id<stores.length;id++)exported.push(stores[id]?await exportByteStore(stores[id],{writable:[3,4,17,18].includes(id)||(first&&id===2&&!!metadata&&(metadata[6]||metadata[14])),signal,budget:ioBudget}):null);
   checkAbort(signal);cacheConnection=readCache?.exportConnection?.();worker=workerFactory();const started=deferred(),finished=deferred(),gpuStaging=new Map(),gpuPending=new Set(),inputWaiters=new Map();let pending,ready=false,inputSerial=0;
   endpoint={worker,cacheConnection,gpuStaging,gpuPending,ioBudget,comparisons:0n,release,exported,metrics:null,fail(error){started.reject(error);pending?.reject(error);finished.reject(error);for(const waiting of inputWaiters.values())waiting.reject(error);inputWaiters.clear();},retireControls(){for(const waiting of inputWaiters.values())waiting.resolve();inputWaiters.clear();},inputControl(value,transfer=[]){const token=++inputSerial,waiting=deferred();inputWaiters.set(token,waiting);if(failure){waiting.reject(failure);return waiting.promise;}protocol.post({inputControl:{...value,token}},transfer);return waiting.promise;},run(task){pending=deferred();const writeBatch=endpoint.writeBatch;endpoint.writeBatch=null;protocol.post({task,writeBatch},writeBatch?[writeBatch]:[]);return pending.promise.then(async result=>{if(endpoint.transactional){endpoint.publication=result;await runWithResourceRecovery(()=>commitDenseWriteBatch(result.writes,stores),{budget,signal,operation:'dense-command-publication',reclaim:async({error})=>(await recover(error)).releasedBytes});endpoint.writeBatch=result.writes.buffer;endpoint.publication=null;}endpoint.comparisons=result.comparisons;return result;});},async close(){protocol.post({task:[0,0,0,0,0,0]});await finished.promise;}};
   const kernelFailure=error=>{endpoint.failed=error;endpoint.fail(error);if(ready?!(endpoint.transactional&&isRecoverableResourceError(error)):error.code!=='MEMORY_ALLOCATION')fail(error);};
   const trackGpu=promise=>{const tracked=Promise.resolve(promise).catch(error=>{if(closing)failure??=error;else fail(error);});gpuPending.add(tracked);tracked.then(()=>gpuPending.delete(tracked));};
   const protocol=installWorkerMessageProtocol(worker,data=>{
    if(data.inputAck){const waiting=inputWaiters.get(data.inputAck.token);inputWaiters.delete(data.inputAck.token);data.inputAck.error?waiting?.reject(deserializeDenseError(data.inputAck.error)):waiting?.resolve();return;}
    if(data.gpuPrepare){const {id,bytes}=data.gpuPrepare;trackGpu((async()=>{let release;try{release=await (reserveGpuStaging?reserveGpuStaging(bytes):budget.reserve(bytes));if(closing||failure||signal?.aborted){await release();return;}gpuStaging.set(id,release);worker.postMessage({gpuPrepared:{id,allowed:true}});}catch(error){worker.postMessage({gpuPrepared:{id,allowed:false,...(error.code==='MEMORY_LIMIT'?{}:{error:serializeEngineError(error,'GPU_FAILED')})}});}})());return;}
    if(data.gpuConsumed){const release=gpuStaging.get(data.gpuConsumed);gpuStaging.delete(data.gpuConsumed);trackGpu(Promise.resolve().then(()=>release?.()));return;}
    if(data.gpuRequest){const {id,job}=data.gpuRequest;trackGpu(Promise.resolve().then(()=>distanceBatch(job)).then(result=>{if(!closing)worker.postMessage({gpuResult:{id,result}},result?[result.buffer]:[]);},error=>{if(!closing)worker.postMessage({gpuResult:{id,error:serializeEngineError(error,'GPU_FAILED')}});}));return;}
    if(data.progress){endpoint.metrics={...endpoint.metrics,heapBytes:data.heapBytes??endpoint.metrics?.heapBytes??0};try{onProgress?.({phase:'global-patchmatch',stage:'bootstrap',workers:1,...data.progress,nativeHeapBytes:endpoints.reduce((bytes,value)=>bytes+(value.metrics?.heapBytes??0),0)});}catch(error){fail(error);}return;}if(data.error){const error=deserializeDenseError(data.error);kernelFailure(error);}else if(data.ready){ready=true;endpoint.transactional=data.transactional===true;if(endpoint.transactional)endpoint.batchBacking=budget.registerBacking?.('array-buffer',writeBatchBytes,{owner:'patchmatch',label:'dense-command-batch'});endpoint.metrics=data.metrics;if(data.boot){boot=data.boot;const bytes=boot.pools?.reduce((sum,pool)=>sum+(pool.bits?.byteLength??0)+(pool.prefix?.byteLength??0),0)??0;releaseBootBacking=budget.registerBacking?.('array-buffer',bytes,{owner:'patchmatch',label:'candidate-pool'});}started.resolve();}else if(data.done){endpoint.metrics=data.metrics;const task=pending;pending=null;task?.resolve(data.done);}else if(data.finished){endpoint.metrics=data.metrics;finished.resolve();}else throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected dense kernel response.');},{label:'dense-kernel',onFailure:error=>{worker.terminate();kernelFailure(error);}});
   worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event.message||'Dense kernel worker failed.',{cause:event.error}));
   endpoints.push(endpoint);protocol.post({stores:exported.map(pin=>pin?.descriptor??null),boot,values,metadata,weights,workspaceBytes:kernelBytes-ownerTransportBytes,transportBudgetBytes:ownerTransportBytes*2,bootstrapStagingBytes:bootstrapStaging,readCache:cacheConnection?.descriptor,distanceBatch:first&&typeof distanceBatch==='function'},[...exported.flatMap(pin=>pin?.transfer??[]),...(cacheConnection?.transfer??[])]);
   await started.promise;if(first&&metadata&&(metadata[6]||metadata[14]))await exported[2]?.sealReadOnly?.();metrics.workers=endpoints.length;return endpoint;
  }catch(error){if(endpoint){endpoints.splice(endpoints.indexOf(endpoint),1);}worker?.terminate();cacheConnection?.release();await Promise.allSettled(exported.map(pin=>pin?.release()));release();throw error;}
 }
 inputBarrier?.install({
  async detach(ids){
   const slots=stores.flatMap((store,id)=>store&&ids.includes(store.portableStoreId)?[id]:[]);
   if(!closing)await Promise.all(endpoints.map(async endpoint=>{await endpoint.inputControl({action:'detach',ids:slots});await Promise.all(slots.map(async id=>{await endpoint.exported[id]?.release();endpoint.exported[id]=null;}));}));
   await inputReaders.detach(ids);
  },
  async attach(entries){
   await inputReaders.attach(entries);
   if(closing)return;
   const ids=entries.map(entry=>entry.id),slots=stores.flatMap((store,id)=>store&&ids.includes(store.portableStoreId)?[id]:[]);
   await Promise.all(endpoints.map(async endpoint=>{const published=[],transfer=[];for(const id of slots){const pin=await exportByteStore(stores[id],{signal,budget:endpoint.ioBudget});endpoint.exported[id]=pin;published.push({id,descriptor:pin.descriptor});transfer.push(...pin.transfer);}await endpoint.inputControl({action:'attach',entries:published},transfer);}));
  },
 });
 const requestCpu=maximum=>({maximum,minimum:1,kernelBytes,requiredWorkspaceBytes:kernelBytes*maximum+bootBytes,requiredBudgetBytes:budget.total()+Math.max(0,maximum-reservedWorkers)*kernelBytes});
 async function retireEndpoint(endpoint){
  endpoint.worker.terminate();endpoint.retireControls();await Promise.allSettled(endpoint.exported.map(pin=>pin?.release()));endpoint.cacheConnection?.release();await Promise.allSettled(endpoint.gpuPending);await Promise.allSettled([...endpoint.gpuStaging.values()].map(release=>release()));endpoint.gpuStaging.clear();endpoint.release();endpoint.batchBacking?.();retiredComparisons+=endpoint.comparisons;endpoints.splice(endpoints.indexOf(endpoint),1);endpoint.writeBatch=null;
 }
 async function phase(phase,iteration,queue){
  if(!endpoints[0]?.transactional)return runPhase(phase,iteration,queue);
  return runWithResourceRecovery(()=>runPhase(phase,iteration,queue),{controller:recoveryController,budget,signal,operation:'dense-field-command',phase:()=>phase+':'+iteration,checkpoint:()=>metrics.committedTasks,reclaim:async({error})=>(await recover(error)).releasedBytes,onRecovery:event=>{metrics.commandRecoveries++;onProgress?.({...event,parallel:{...metrics},checkpoint:{phase,iteration,completed:queue.completed??queue.start??0},rng:'seed + pixel + iteration; command-boundary restart'});}});
 }
 async function runPhase(phase,iteration,queue){
  let completed=queue.completed??queue.start??0;
  while(!queue.done){
   checkAbort(signal);if(failure)throw failure;
   const requested=phase===3?1:maximum;
   const admission=growthBlocked?Math.max(1,Math.min(requested,endpoints.length)):requested;
   const acquire=()=>acquireCpu?acquireCpu(requestCpu(admission)):{cpu:admission,release(){}};
   const lease=inputBarrier?await inputBarrier.admit(acquire):await acquire();const returnedAtGrant=returnedWorkspaceTotal,headroom=()=>memoryAvailable(lease,returnedAtGrant);
   try{
    checkAbort(signal);if(failure)throw failure;let count=Math.max(1,Math.min(requested,lease.cpu??1));
    // A falling host target retires only idle kernels at this committed work
    // boundary. Fields remain parallel and their output planes are untouched.
    if(Number.isInteger(lease.maxResidentKernels)&&lease.maxResidentKernels>=1&&endpoints.length>lease.maxResidentKernels){while(endpoints.length>lease.maxResidentKernels)await retireEndpoint(endpoints.at(-1));await releaseUncreated();metrics.memoryTrims=(metrics.memoryTrims??0)+1;count=Math.min(count,endpoints.length);}
    if(count>reservedWorkers){const additional=Math.min(count-reservedWorkers,Math.max(0,Math.floor((budget.limit-budget.total())/kernelBytes)));if(additional)try{growthReservations.push(budget.reserve(additional*kernelBytes));reservedWorkers+=additional;}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}count=Math.min(count,reservedWorkers);}
    if(phase!==1&&Number.isInteger(lease.cachePages)&&lease.cachePages!==currentCachePages){validateCachePages?.(lease.cachePages);currentCachePages=lease.cachePages;metrics.cacheReconfigurations++;}
    if(growthBlocked&&headroom()>=growthBlocked.availableBytes+growthBlocked.bytes)growthBlocked=null;
    if(cacheBlocked&&headroom()>=cacheBlocked.availableBytes+cacheBlocked.bytes){cacheBlocked=null;cacheEpoch++;}
    // Admission includes every retained heap, also when a reduced CPU grant
    // leaves some workers idle. Their reservations are not returned early.
    while(endpoints.length<count){try{await addWorker();}catch(error){if(failure||error.code!=='MEMORY_ALLOCATION')throw error;const recovery=await recoverCreation(error);if(recovery.releasedBytes>0)continue;await releaseUncreated();growthBlocked={availableBytes:headroom(),bytes:recovery.bytes};count=endpoints.length;break;}}
    if(!count)throw deserializeDenseError(metrics.lastAllocationFailure);
    if((lease.cpu??count)>count)lease.releaseCpu?.(lease.cpu-count);
    if(metrics.cpuGrants.at(-1)!==count){metrics.cpuGrantChanges++;metrics.cpuGrants.push(count);if(metrics.cpuGrants.length>32)metrics.cpuGrants.shift();}
    const selected=endpoints.slice(0,count),running=new Map(),deadline=performance.now()+50;let roundError;
    for(;;){
     if(!roundError&&(performance.now()<deadline||!running.size)){for(const endpoint of selected){if(running.has(endpoint))continue;const job=queue.take(phase===2?Math.max(1,Math.min(chunk,Math.ceil(width/(count*2)))):phase===4?Math.min(chunk,Math.ceil(queue.length/count),gpuBatchPixels||Infinity):phase===3?Math.min(chunk,Math.max(1,Math.floor(writeBatchBytes/(2*values[11])))):chunk);if(!job)continue;const started=performance.now();active++;peak=Math.max(peak,active);tasks++;
       const task=endpoint.run([phase,job.begin,job.end,iteration,phase===1?values[12]:currentCachePages,queue.start??0,cacheEpoch]).then(()=>{queue.finish(job);metrics.committedTasks++;completed+=job.end-job.begin;const elapsed=performance.now()-started;if(phase!==3&&elapsed>0)chunk=Math.max(64,Math.min(16384,Math.round(chunk*.75+(job.end-job.begin)*25/elapsed*.25)));}).catch(error=>{roundError??=error;if(endpoint.transactional&&!endpoint.publication){endpoint.failed=error;queue.retry(job);if(error.details?.boundedCommand)chunk=Math.max(1,Math.floor((job.end-job.begin)/2));}else fail(error);}).finally(()=>{active--;running.delete(endpoint);});running.set(endpoint,task);}}
     if(!running.size)break;
     if(roundError||performance.now()>=deadline){await Promise.all(running.values());break;}
     await Promise.race(running.values());checkAbort(signal);if(failure)throw failure;
    }
    if(roundError){for(const endpoint of [...endpoints])if(endpoint.failed)await retireEndpoint(endpoint);throw roundError;}
    metrics.peakActiveKernels=peak;metrics.tasks=tasks;metrics.heapBytes=endpoints.reduce((bytes,value)=>bytes+(value.metrics?.heapBytes??0),0);
    let cacheFailure;for(const endpoint of endpoints){const count=endpoint.metrics?.cacheAllocationFallbacks??0;if(count>(endpoint.cacheFailuresObserved??0)){endpoint.cacheFailuresObserved=count;cacheFailure=endpoint.metrics.lastCacheAllocationFailure?.error??{code:'MEMORY_ALLOCATION',message:'Native cache allocation refused.'};}}
    if(cacheFailure){const recovery=await recover(deserializeDenseError(cacheFailure));if(recovery.releasedBytes>0){cacheBlocked=null;cacheEpoch++;}else cacheBlocked={availableBytes:headroom(),bytes:recovery.bytes};}
    onProgress?.({phase:'global-patchmatch',stage:phase===1?'initialization':phase===2?'propagation':phase===4?'reverse-distances':'reverse',iteration:phase===1?null:iteration,completed,total:n,parallel:{...metrics},workers:count});
   }finally{await lease.release?.();await inputBarrier?.checkpoint();}
  }
 }
 const linear=(start=0,end=n)=>{let next=start,complete=start;const retries=[];return {start,length:end-start,get completed(){return complete;},get done(){return complete===end;},take(size){if(retries.length){const job=retries.shift(),stop=Math.min(job.end,job.begin+size);if(stop<job.end)retries.unshift({begin:stop,end:job.end});return {begin:job.begin,end:stop};}if(next===end)return null;const begin=next;next=Math.min(end,next+size);return {begin,end:next};},retry(job){retries.push(job);},finish(job){complete+=job.end-job.begin;}};};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  await inputBarrier?.checkpoint();
  const bootstrapAcquire=()=>acquireCpu?acquireCpu(requestCpu(1)):{release(){}};
  const bootstrapLease=inputBarrier?await inputBarrier.admit(bootstrapAcquire):await bootstrapAcquire();
  try{for(;;){try{await addWorker();break;}catch(error){if(failure||error.code!=='MEMORY_ALLOCATION')throw error;const recovery=await recoverCreation(error);if(!recovery.releasedBytes)throw error;}}}finally{await bootstrapLease?.release?.();}
  checkAbort(signal);if(failure)throw failure;
  await phase(1,0,linear());
  for(let iteration=0;iteration<iterations;iteration++){await phase(2,iteration,new DenseWavefront(width,height));for(let start=0;start<n;start+=values[21]){const end=Math.min(n,start+values[21]);await phase(4,iteration,linear(start,end));await phase(3,iteration,linear(start,end));}}
  await Promise.all(endpoints.map(endpoint=>endpoint.close()));
  if(failure)throw failure;checkAbort(signal);
  metrics.reservedWorkspaceBytes=kernelBytes*reservedWorkers+bootBytes;metrics.comparisons=endpoints.reduce((sum,endpoint)=>sum+endpoint.comparisons,retiredComparisons);metrics.kernels=endpoints.map(endpoint=>endpoint.metrics);return metrics;
 }finally{
  closing=true;signal?.removeEventListener('abort',abort);for(const endpoint of endpoints){endpoint.worker?.terminate();endpoint.retireControls();}
  for(const endpoint of endpoints){await Promise.allSettled(endpoint.exported.map(pin=>pin?.release()));endpoint.cacheConnection?.release();await Promise.allSettled(endpoint.gpuPending);await Promise.allSettled([...endpoint.gpuStaging.values()].map(release=>release()));endpoint.gpuStaging.clear();endpoint.release();endpoint.batchBacking?.();}
  try{await inputBarrier?.finish();}finally{boot=null;releaseBootBacking?.();for(const release of growthReservations)release();}
  if(failure)throw failure;

 }
}
