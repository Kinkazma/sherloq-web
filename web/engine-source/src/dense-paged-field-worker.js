import {runWithResourceRecovery} from './resource-recovery.js';
import {serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {Budget} from './cache.js';
import {readPortableDenseInput} from './dense-shared-field.js';
import {exportByteStore} from './portable-byte-store.js';
import {runPagedDenseField} from './dense-paged.js';
import {createTemporarySession} from './temporary-storage.js';
import {EngineError} from './errors.js';
import {deserializeDenseError,serializeDenseError} from './dense-memory-error.js';
import {createDenseInputBarrier} from './dense-input-barrier.js';

const cpuWaiters=new Map(),gpuWaiters=new Map(),memoryWaiters=new Map();let cpuSerial=0,gpuSerial=0,memorySerial=0,inputBarrier;
installWorkerMessageProtocol(self,async data=>{
 if(data.inputControl){const {token,action,id,descriptor,immediate}=data.inputControl;try{let paused;if(action==='detach'){if(immediate)paused=await inputBarrier.tryPause(id,[id]);else{await inputBarrier.pause(id,[id]);paused=true;}}else if(action==='attach')await inputBarrier.resume(id,[{id,descriptor}]);else throw new EngineError('INVALID_INPUT','Unknown dense input transition.');self.postMessage({inputAck:{token,paused}});}catch(error){self.postMessage({inputAck:{token,error:serializeDenseError(error)}});}return;}
 if(data.cpuGrant){const task=cpuWaiters.get(data.cpuGrant.id);if(task){cpuWaiters.delete(data.cpuGrant.id);task(data.cpuGrant);}return;}
 if(data.memoryGrant){const task=memoryWaiters.get(data.memoryGrant.id);if(task){memoryWaiters.delete(data.memoryGrant.id);data.memoryGrant.error?task.reject(deserializeDenseError(data.memoryGrant.error)):task.resolve(data.memoryGrant);}return;}
 if(data.gpuGrant){const task=gpuWaiters.get(data.gpuGrant.id);if(task){gpuWaiters.delete(data.gpuGrant.id);data.gpuGrant.error?task.reject(deserializeDenseError(data.gpuGrant.error)):task.resolve(data.gpuGrant);}return;}
 if(!data.input)throw new EngineError('WORKER_MESSAGE_FAILED','Unexpected dense field command.');
 const budget=new Budget(data.budgetBytes),inputTransportBytes=data.input.stores.reduce((bytes,store)=>bytes+2*Math.min(64*1024,store.byteLength),0),inputTransportBudget=new Budget(inputTransportBytes);inputBarrier=createDenseInputBarrier();let inputTransportRelease,input,result,session,sessionPromise,gpuMetrics,gpuAllowance=0,stagingAllowance=0,gpuUnavailable=false,gpuFallback;const pins=[],gpuReleases=[];
 let nativeHeapBytes=0;
 const backing=()=>({arrayBufferBytes:budget.resourceSnapshot().domains['array-buffer'].materializedBytes,wasmBytes:nativeHeapBytes});
 const gpuRequest=(action,settings={},transfer=[])=>new Promise((resolve,reject)=>{const id=++gpuSerial;gpuWaiters.set(id,{resolve,reject});self.postMessage({gpuRequest:{id,action,...settings}},transfer);});
 const closeGpu=async()=>{await Promise.all(gpuReleases.splice(0));};
 try{
  inputTransportRelease=budget.reserve(inputTransportBytes);
  input=await readPortableDenseInput(data.input,{budget:inputTransportBudget});
  const getTemporarySession=()=>sessionPromise??=(async()=>{session=await createTemporarySession({budget,id:data.sessionId});self.postMessage({temporarySession:{id:session.id,backend:session.backend}});return session;})();
  const outputReservation=data.budgetBytes-data.options.workspaceBytes;
  const recoverMemory=({bytes,error})=>new Promise((resolve,reject)=>{const id=++memorySerial;memoryWaiters.set(id,{resolve,reject});self.postMessage({memoryRequest:{id,bytes,error}});});
  const releaseWorkspace=async bytes=>{const id=++memorySerial;await new Promise((resolve,reject)=>{memoryWaiters.set(id,{resolve,reject});self.postMessage({memoryRequest:{id,bytes,action:'release-unused'}});});budget.limit-=bytes;};
  const acquireCpu=async({maximum,minimum=1,requiredWorkspaceBytes,requiredBudgetBytes,kernelBytes}={})=>{const id=++cpuSerial,grant=await new Promise(resolve=>{cpuWaiters.set(id,resolve);self.postMessage({cpuRequest:{id,maximum,minimum,workspaceBytes:requiredBudgetBytes===undefined?requiredWorkspaceBytes:Math.max(0,requiredBudgetBytes-outputReservation-gpuAllowance-stagingAllowance),kernelBytes}});});budget.limit=grant.workspaceBytes+outputReservation+gpuAllowance+stagingAllowance;let released=false,cpu=grant.cpu;return {...grant,get cpu(){return cpu;},releaseCpu(count){if(released||count<1||count>cpu)return;cpu-=count;self.postMessage({cpuReturn:{id,count}});},release(){if(released)return;released=true;self.postMessage({cpuRelease:id});}};};
  const reserveGpuStaging=async bytes=>{const grant=await gpuRequest('staging-reserve',{bytes});stagingAllowance+=grant.bytes;budget.limit+=grant.bytes;const release=budget.reserve(grant.bytes);let released=false;return async()=>{if(released)return;released=true;release();stagingAllowance-=grant.bytes;budget.limit-=grant.bytes;await gpuRequest('staging-free',{token:grant.token});};};
  const distanceBatch=async job=>{
   if(gpuUnavailable)return null;
   try{
    const grant=await gpuRequest('distance-batch',{job},[job.queryDescriptors.buffer,job.candidateDescriptors.buffer,job.best.buffer]);gpuMetrics=grant.metrics;return grant.result;
   }catch(error){if(error.code==='CANCELLED')throw error;gpuFallback=serializeEngineError(error,'GPU_FAILED');gpuUnavailable=true;await closeGpu();return null;}
   finally{await Promise.all(gpuReleases.splice(0));}
  };
  result=await runPagedDenseField(input,{...data.options,budget,getTemporarySession,acquireCpu,recoverMemory,releaseWorkspace,distanceBatch:data.options.enableDenseGpu===true?distanceBatch:undefined,reserveGpuStaging:data.options.enableDenseGpu===true?reserveGpuStaging:undefined,readCache:input.readCache,inputBarrier,inputReaders:input,storage:data.outputStorage??'memory',onProgress:progress=>{nativeHeapBytes=progress.parallel?.heapBytes??progress.nativeHeapBytes??nativeHeapBytes;self.postMessage({progress,backing:backing()});}});nativeHeapBytes=0;
  result.metrics.denseDistanceGpu=gpuMetrics??{batches:0,preflightExecutions:0,enabled:data.options.enableDenseGpu===true,...(gpuFallback?{fallback:gpuFallback}:{})};await closeGpu();
  self.postMessage({progress:{phase:'global-patchmatch',stage:'field-computed',completed:input.width*input.height,total:input.width*input.height},backing:backing()});
  const publicationRecovery={budget,operation:'dense-field-publication',reclaim:async({error})=>(await recoverMemory({bytes:error.details?.requestedBytes??1024**2,error:serializeDenseError(error)})).releasedBytes,onRecovery:progress=>self.postMessage({progress,backing:backing()})};
  const owned=['targets','distancesSquared',...(result.ownsAllowed?['allowed']:[])],stores={},transfer=[];
  for(const key of owned){const pin=await runWithResourceRecovery(()=>exportByteStore(result[key],{budget}),publicationRecovery);pins.push(pin);stores[key]=pin.descriptor;transfer.push(...pin.transfer);}
  await input.dispose();input=null;inputTransportRelease();
  // Successful OPFS outputs are adopted by the parent. Keep broker-only output
  // owners alive until the parent finishes bounded transfer and terminates us.
  self.postMessage({result:{width:result.width,height:result.height,comparisons:result.comparisons,metrics:result.metrics,descriptorStorage:result.descriptorStorage,ownsAllowed:result.ownsAllowed,session:session&&{id:session.id,backend:session.backend},stores},backing:backing()},transfer);
 }catch(error){
  await closeGpu();await Promise.allSettled(pins.map(pin=>pin.release()));await input?.dispose();inputTransportRelease?.();await result?.dispose();await session?.dispose();self.postMessage({error:serializeDenseError(error)});
 }
},{label:'dense-paged-field-worker',onFailure:error=>{for(const waiting of gpuWaiters.values())waiting.reject?.(error);gpuWaiters.clear();for(const waiting of memoryWaiters.values())waiting.reject?.(error);memoryWaiters.clear();self.postMessage({error:serializeDenseError(error)});}});
