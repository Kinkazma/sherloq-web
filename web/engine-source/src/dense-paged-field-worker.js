import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,cleanupDenseOwners,createDenseRetirementLedger} from './dense-owner-retirement.js';
import {runWithResourceRecovery} from './resource-recovery.js';
import {serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {Budget} from './cache.js';
import {readPortableDenseInput} from './dense-shared-field.js';
import {exportByteStore} from './portable-byte-store.js';
import {runPagedDenseField} from './dense-paged.js';
import {createTemporarySession} from './temporary-storage.js';
import {EngineError,checkAbort} from './errors.js';
import {deserializeDenseError,serializeDenseError} from './dense-memory-error.js';
import {createDenseInputBarrier} from './dense-input-barrier.js';

const cpuWaiters=new Map(),gpuWaiters=new Map(),memoryWaiters=new Map(),gpuRetireOwners=new Map();let cpuSerial=0,gpuSerial=0,memorySerial=0,inputBarrier,retireOutput,denseGpuInputTransfer,restoreDenseGpuInputs;
let jobController,jobStarted=false,jobClosed=false,jobSessionId,jobDone=Promise.resolve(),pendingCancel=false;
installWorkerMessageProtocol(self,async data=>{
 if(data.cancelDense){if(jobStarted&&data.cancelDense.sessionId!==jobSessionId)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected Dense cancellation identity.');pendingCancel=true;jobController?.abort();return;}
 if(data.retireOutput){const {token}=data.retireOutput;if(!jobStarted){jobClosed=true;self.postMessage({outputRetired:{token,sessionState:'retired'},backing:{arrayBufferBytes:0,wasmBytes:0}});return;}try{await jobDone;if(!retireOutput)throw new EngineError('WORKER_MESSAGE_FAILED','No completed Dense output owner is available.');await retireOutput();self.postMessage({outputRetired:{token,sessionState:'retired'},backing:{arrayBufferBytes:0,wasmBytes:0}});}catch(error){self.postMessage({outputRetired:{token,error:serializeDenseError(error)}});}return;}
 if(data.inputControl){const {token,action,id,descriptor,immediate}=data.inputControl;try{let paused;if(action==='detach'){if(immediate)paused=await inputBarrier.tryPause(id,[id]);else{await inputBarrier.pause(id,[id]);paused=true;}}else if(action==='attach')await inputBarrier.resume(id,[{id,descriptor}]);else throw new EngineError('INVALID_INPUT','Unknown dense input transition.');self.postMessage({inputAck:{token,paused}});}catch(error){self.postMessage({inputAck:{token,error:serializeDenseError(error)}});}return;}
 if(data.cpuGrant){const task=cpuWaiters.get(data.cpuGrant.id);if(task){cpuWaiters.delete(data.cpuGrant.id);data.cpuGrant.error?task.reject(deserializeDenseError(data.cpuGrant.error)):task.resolve(data.cpuGrant);}return;}
 if(data.memoryGrant){const task=memoryWaiters.get(data.memoryGrant.id);if(task){memoryWaiters.delete(data.memoryGrant.id);data.memoryGrant.error?task.reject(deserializeDenseError(data.memoryGrant.error)):task.resolve(data.memoryGrant);}return;}
 if(data.gpuGrant){const task=gpuWaiters.get(data.gpuGrant.id);if(task){gpuWaiters.delete(data.gpuGrant.id);try{if(task.job&&data.gpuGrant.inputs)restoreDenseGpuInputs(task.job,data.gpuGrant.inputs);data.gpuGrant.error?task.reject(deserializeDenseError(data.gpuGrant.error)):task.resolve(data.gpuGrant);}catch(error){task.reject(error);}}return;}
 if(data.gpuRetire){const {token,requestId}=data.gpuRetire;let retired=false;try{retired=await gpuRetireOwners.get(requestId)?.()===true;}finally{self.postMessage({gpuRetired:{token,retired}});}return;}
 if(!data.input)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected dense field command.');
 if(jobStarted||jobClosed)throw new EngineError('WORKER_MESSAGE_FAILED','Concurrent Dense native job.');jobStarted=true;jobSessionId=data.sessionId;jobController=new AbortController();if(pendingCancel)jobController.abort();const signal=jobController.signal;let finishJob;jobDone=new Promise(resolve=>finishJob=resolve);
 try{
 if(data.options.reuseGpuTransport===true&&data.options.enableDenseGpu===true)({denseGpuInputTransfer,restoreDenseGpuInputs}=await import('./dense-gpu-transport.js'));
 const budget=new Budget(data.budgetBytes),inputTransportBytes=data.input.stores.reduce((bytes,store)=>bytes+2*Math.min(64*1024,store.byteLength),0),inputTransportBudget=new Budget(inputTransportBytes);inputBarrier=createDenseInputBarrier();let inputTransportRelease,input,result,session,sessionPromise,gpuMetrics,gpuAllowance=0,stagingAllowance=0,gpuUnavailable=false,gpuFallback;const pins=[],gpuReleases=[];
 let nativeHeapBytes=0;
 const backing=()=>({arrayBufferBytes:budget.resourceSnapshot().domains['array-buffer'].materializedBytes,wasmBytes:nativeHeapBytes});
 const gpuRequest=(action,settings={},transfer=[],onId)=>new Promise((resolve,reject)=>{const id=++gpuSerial;gpuWaiters.set(id,{resolve,reject,job:settings.job});onId?.(id);try{self.postMessage({gpuRequest:{id,action,...settings}},transfer);}catch(error){gpuWaiters.delete(id);gpuRetireOwners.delete(id);reject(error);}});
 const closeGpu=async()=>{await Promise.all(gpuReleases.splice(0));};
 let outputRetired=false;const retirementOwners=createDenseRetirementLedger(budget);retirementOwners.prepare(3*data.input.stores.length+16);const onRetirementOwner=owner=>retirementOwners.hold(owner);
 const closeInputs=onceDenseRetirement(async()=>{await retirementOwners.drain();await acknowledgeDenseRetirement(()=>input?.dispose());await retirementOwners.drain();input=null;inputTransportRelease?.();}),closePins=onceDenseRetirement(async()=>{const outcomes=await Promise.allSettled(pins.map(async(pin,index)=>{if(!pin)return;await acknowledgeDenseRetirement(()=>pin.release());if(pins[index]===pin)pins[index]=null;}));const failure=outcomes.find(value=>value.status==='rejected');if(failure)throw failure.reason;pins.length=0;}),closeResult=onceDenseRetirement(async()=>{const previous=result;await acknowledgeDenseRetirement(()=>previous?.dispose());if(result===previous)result=null;}),closeSession=onceDenseRetirement(async()=>{const previous=session;await acknowledgeDenseRetirement(()=>previous?.dispose());if(session===previous)session=null;});
 retireOutput=onceDenseRetirement(async()=>{await closeInputs();await closePins();await closeResult();await closeSession();await retirementOwners.drain();retirementOwners.release();outputRetired=true;});
 try{
  inputTransportRelease=budget.reserve(inputTransportBytes);
  input=await readPortableDenseInput(data.input,{budget:inputTransportBudget,onRetirementOwner});
  const getTemporarySession=()=>sessionPromise??=(async()=>{session=await createTemporarySession({budget,id:data.sessionId});self.postMessage({temporarySession:{id:session.id,backend:session.backend}});return session;})();
  const outputReservation=data.budgetBytes-data.options.workspaceBytes;
  const recoverMemory=({bytes,error})=>new Promise((resolve,reject)=>{const id=++memorySerial;memoryWaiters.set(id,{resolve,reject});self.postMessage({memoryRequest:{id,bytes,error}});});
  const releaseWorkspace=async bytes=>{const id=++memorySerial;await new Promise((resolve,reject)=>{memoryWaiters.set(id,{resolve,reject});self.postMessage({memoryRequest:{id,bytes,action:'release-unused'}});});budget.limit-=bytes;};
  const acquireCpu=async({maximum,minimum=1,requiredWorkspaceBytes,requiredBudgetBytes,kernelBytes}={})=>{const id=++cpuSerial,grant=await new Promise((resolve,reject)=>{cpuWaiters.set(id,{resolve,reject});self.postMessage({cpuRequest:{id,maximum,minimum,workspaceBytes:requiredBudgetBytes===undefined?requiredWorkspaceBytes:Math.max(0,requiredBudgetBytes-outputReservation-gpuAllowance-stagingAllowance),kernelBytes}});});budget.limit=grant.workspaceBytes+outputReservation+gpuAllowance+stagingAllowance;let released=false,cpu=grant.cpu;return {...grant,get cpu(){return cpu;},releaseCpu(count){if(released||count<1||count>cpu)return;cpu-=count;self.postMessage({cpuReturn:{id,count}});},release(){if(released)return;released=true;self.postMessage({cpuRelease:id});}};};
  const reserveGpuStaging=async(bytes,{retire,reusable=false}={})=>{let release,grant,released=false;const free=async(remote=true)=>{if(released||!grant)return;released=true;gpuRetireOwners.delete(grant.token);release?.();stagingAllowance-=grant.bytes;budget.limit-=grant.bytes;if(remote)await gpuRequest('staging-free',{token:grant.token});};try{grant=await gpuRequest('staging-reserve',{bytes,reusable},[],id=>{if(reusable)gpuRetireOwners.set(id,async()=>{if(released||!grant||!await retire?.())return false;await free(false);return true;});});stagingAllowance+=grant.bytes;budget.limit+=grant.bytes;release=budget.reserve(grant.bytes);free.token=grant.token;return free;}catch(error){if(grant)await free();throw error;}};
  const distanceBatch=async job=>{
   if(gpuUnavailable){job.gpuTransportRetain=false;return null;}
   try{
    const grant=await gpuRequest('distance-batch',{job},job.reuseGpuTransport===true?denseGpuInputTransfer(job):[job.queryDescriptors.buffer,job.candidateDescriptors.buffer,job.best.buffer]);gpuMetrics=grant.metrics;return grant.result;
   }catch(error){job.gpuTransportRetain=false;if(error.code==='CANCELLED')throw error;gpuFallback=serializeEngineError(error,'GPU_FAILED');gpuUnavailable=true;await closeGpu();return null;}
   finally{await Promise.all(gpuReleases.splice(0));}
  };
  checkAbort(signal);result=await runPagedDenseField(input,{...data.options,signal,budget,getTemporarySession,acquireCpu,recoverMemory,releaseWorkspace,distanceBatch:data.options.enableDenseGpu===true?distanceBatch:undefined,reserveGpuStaging:data.options.enableDenseGpu===true?reserveGpuStaging:undefined,readCache:input.readCache,inputBarrier,inputReaders:input,storage:data.outputStorage??'memory',onRetirementOwner,onProgress:progress=>{nativeHeapBytes=progress.parallel?.heapBytes??progress.nativeHeapBytes??nativeHeapBytes;self.postMessage({progress,backing:backing()});}});nativeHeapBytes=0;
  result.metrics.denseDistanceGpu=gpuMetrics??{batches:0,preflightExecutions:0,enabled:data.options.enableDenseGpu===true,...(gpuFallback?{fallback:gpuFallback}:{})};await closeGpu();
  self.postMessage({progress:{phase:'global-patchmatch',stage:'field-computed',completed:input.width*input.height,total:input.width*input.height},backing:backing()});
  checkAbort(signal);const publicationRecovery={budget,signal,operation:'dense-field-publication',reclaim:async({error})=>(await recoverMemory({bytes:error.details?.requestedBytes??1024**2,error:serializeDenseError(error)})).releasedBytes,onRecovery:progress=>self.postMessage({progress,backing:backing()})};
  const owned=['targets','distancesSquared',...(result.ownsAllowed?['allowed']:[])],stores={},transfer=[];
  for(const key of owned){checkAbort(signal);const pin=await runWithResourceRecovery(()=>exportByteStore(result[key],{budget,onRetirementOwner}),publicationRecovery);pins.push(pin);stores[key]=pin.descriptor;transfer.push(...pin.transfer);}
  await closeInputs();checkAbort(signal);
  // Successful OPFS outputs are adopted by the parent. Keep broker-only output
  // owners alive until the parent finishes bounded transfer and terminates us.
  self.postMessage({result:{width:result.width,height:result.height,comparisons:result.comparisons,metrics:result.metrics,descriptorStorage:result.descriptorStorage,outputRetirement:!!session,ownsAllowed:result.ownsAllowed,session:session&&{id:session.id,backend:session.backend},stores},backing:backing()},transfer);
 }catch(error){
  await cleanupDenseOwners(async()=>{await closeGpu();await retireOutput();},{failed:true,primary:error});self.postMessage({error:serializeDenseError(error),retirementPending:!outputRetired,...(outputRetired?{sessionState:'retired'}:{}),backing:outputRetired?{arrayBufferBytes:0,wasmBytes:0}:backing()});
 }
 }finally{finishJob();}
},{label:'dense-paged-field-worker',onFailure:error=>{for(const waiting of cpuWaiters.values())waiting.reject?.(error);cpuWaiters.clear();for(const waiting of gpuWaiters.values())waiting.reject?.(error);gpuWaiters.clear();for(const waiting of memoryWaiters.values())waiting.reject?.(error);memoryWaiters.clear();self.postMessage({error:serializeDenseError(error)});}});
