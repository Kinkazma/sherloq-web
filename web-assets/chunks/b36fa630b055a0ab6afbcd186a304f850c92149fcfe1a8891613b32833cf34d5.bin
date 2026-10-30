import "../../runtime-context.js?v=0.30.0";
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,denseConstructionOwner,cleanupDenseOwners,createDenseRetirementLedger} from './dense-owner-retirement.js';
import {allocateBuffer} from './allocation.js';
import {wasmRange,byteView,closeMemoryRanges} from './memory-range.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {Budget} from './cache.js';
import {EngineError} from './errors.js';
import {createDensePagedHeap} from './dense-paged-heap.js';
import {readByteStore} from './portable-byte-store.js';
import {createSharedReadCacheClient} from './shared-read-cache.js';
import {serializeDenseError} from './dense-memory-error.js';
import {DenseWriteBatch,denseWriteBatchBytes} from './dense-write-batch.js';
let writeBatch,commandActive=false,returnedBatch,kernelRetirement,kernelClosing=false,retirementOwners,onRetirementOwner;
let next,queued=[],module,done,stores,heap,release,bootstrapRelease,transportRelease,transportBudget,readCache,gpuTransport;const gpuWaiters=new Map();let gpuSerial=0;let io={reads:0,writes:0,readBytes:0,writeBytes:0};
const readInput=async(store,id)=>{if(!store)return null;let reader,failed=false,primary;const owner=denseConstructionOwner([],{onRetirementOwner},()=>reader?.dispose());try{reader=await readByteStore(store,{budget:transportBudget,onRetirementOwner});const value=readCache&&Number.isInteger(store.cacheStoreId)&&store.cacheStoreId>0&&![3,4,17,18].includes(id)?readCache.wrap(store.cacheStoreId,reader):reader;owner.publish();return value;}catch(error){failed=true;primary=error;throw error;}finally{if(failed)await cleanupDenseOwners(()=>owner.dispose(),{failed,primary});}};
installWorkerMessageProtocol(self,async data=>{
 if(data.retireKernel){const {token}=data.retireKernel;try{if(!kernelRetirement)throw new EngineError('WORKER_MESSAGE_FAILED','Dense kernel retirement owner is unavailable.',{details:{retirementOwnerUnavailable:true}});await kernelRetirement();self.postMessage({kernelRetired:{token}});}catch(error){self.postMessage({kernelRetired:{token,error:serializeDenseError(error)}});}return;}
 if(data.inputControl){const {token,action,ids,entries}=data.inputControl;try{if(action==='detach'){await retireDenseOwners(ids.map(id=>async()=>{const previous=stores[id];await acknowledgeDenseRetirement(()=>previous?.dispose?.());if(stores[id]===previous)stores[id]=null;}));}else if(action==='attach'){if(kernelClosing)throw new EngineError('BUSY','Dense kernel input is retiring.');for(const {id,descriptor} of entries){if(stores[id])throw new EngineError('BUSY','Dense kernel input still has an owner.');const reader=await readInput(descriptor,id);if(kernelClosing){const forget=retirementOwners.hold(reader);await acknowledgeDenseRetirement(()=>reader?.dispose());forget();throw new EngineError('BUSY','Dense kernel retired before input adoption.');}stores[id]=reader;}}else throw new EngineError('INVALID_INPUT','Unknown kernel input transition.');self.postMessage({inputAck:{token}});}catch(error){self.postMessage({inputAck:{token,error:serializeDenseError(error)}});}return;}
 if(data.gpuPrepared){const {id,allowed,error}=data.gpuPrepared,waiting=gpuWaiters.get(id);gpuWaiters.delete(id);error?waiting?.reject(Object.assign(new Error(error.message),{code:error.code})):waiting?.resolve(allowed);return;}
 if(data.gpuResult){const {id,result,error}=data.gpuResult,waiting=gpuWaiters.get(id);gpuWaiters.delete(id);if(gpuTransport)waiting?.resolve(data.gpuResult);else error?waiting?.reject(Object.assign(new Error(error.message),{code:error.code})):waiting?.resolve(result);return;}
 if(data.gpuDrop){const {token,id}=data.gpuDrop;self.postMessage({gpuDropped:{token,retired:gpuTransport?.drop(id)===true}});return;}
 if(data.task){if(kernelClosing)throw new EngineError('BUSY','Dense kernel is closing; no useful task was adopted.');if(data.writeBatch)returnedBatch=data.writeBatch;if(next){const resolve=next;next=null;resolve(data.task);}else queued.push(data.task);return;}
 if(data.workspaceBytes&&module){module.budget.limit=data.workspaceBytes;return;}
 let finishCompute,failed=false,primary,retired=false,finalMetrics;const computeFinished=new Promise(resolve=>finishCompute=resolve),dropCache=onceDenseRetirement(async()=>{const previous=readCache;await acknowledgeDenseRetirement(()=>previous?.dispose());if(readCache===previous)readCache=null;}),dropStores=onceDenseRetirement(()=>retireDenseOwners((stores??[]).map((reader,id)=>async()=>{await acknowledgeDenseRetirement(()=>reader?.dispose?.());if(stores[id]===reader)stores[id]=null;}))),dropNative=onceDenseRetirement(async()=>{await acknowledgeDenseRetirement(()=>gpuTransport?.dispose());closeMemoryRanges(module);await acknowledgeDenseRetirement(()=>heap?.dispose());release?.();release=null;bootstrapRelease?.();bootstrapRelease=null;transportRelease?.();transportRelease=null;});
 const close=onceDenseRetirement(async()=>{await computeFinished;await dropCache();await dropStores();await retirementOwners?.drain();await dropNative();retirementOwners?.release();retired=true;}),stop=()=>{const task=[0,0,0,0,0,0];if(next){const resolve=next;next=null;resolve(task);}else if(!queued.some(value=>value[0]===0))queued.push(task);};kernelRetirement=()=>{kernelClosing=true;stop();return close();};
 try{
  const writeBatchBytes=denseWriteBatchBytes(data.values[11]);
  const budget=new Budget(data.workspaceBytes);retirementOwners=createDenseRetirementLedger(budget);retirementOwners.prepare(3*data.stores.length+16);onRetirementOwner=owner=>retirementOwners.hold(owner);bootstrapRelease=budget.reserve(data.bootstrapStagingBytes??0);transportRelease=budget.reserve((data.transportBudgetBytes??0)+writeBatchBytes);transportBudget=new Budget(data.transportBudgetBytes??data.workspaceBytes);
  writeBatch=new DenseWriteBatch(writeBatchBytes);returnedBatch=allocateBuffer(writeBatchBytes,{label:'dense-command-write-batch'});
  readCache=createSharedReadCacheClient(data.readCache);
  stores=new Array(data.stores.length).fill(null);const reads=await Promise.allSettled(data.stores.map(async(descriptor,id)=>{stores[id]=await readInput(descriptor,id);}));data.stores=null;const refused=reads.find(value=>value.status==='rejected');if(refused)throw refused.reason;
  const heapBytes=data.workspaceBytes-budget.total();release=budget.reserve(heapBytes);heap=createDensePagedHeap(budget,heapBytes);
  const {default:create}=await import('../vendor/dense-paged/dense-paged.js');module=await create({wasmMemory:heap.memory});module.budget=budget;
  module.cacheAllocationFailure=requested=>{io.cacheAllocationFallbacks=(io.cacheAllocationFallbacks??0)+1;io.lastCacheAllocationFailure={requestedPages:requested,...(heap.error?{error:serializeDenseError(heap.error)}:{})};heap.clearError();};
  module.pageIO=(id,offset,length,pointer,write)=>{const bytes=wasmRange(module,pointer,length),transactional=commandActive&&[3,4,17,18].includes(id);if(write){io.writes++;io.writeBytes+=length;return transactional?writeBatch.write(id,bytes,offset):stores[id].write(bytes,offset);}io.reads++;io.readBytes+=length;const result=stores[id].readInto(bytes,offset);if(!transactional)return result;const overlay=()=>writeBatch.overlay(id,bytes,offset);return result&&typeof result.then==='function'?result.then(overlay):overlay();};
  let ready=false,lastProgress=performance.now();module.checkpoint=async()=>{if(!ready&&performance.now()-lastProgress>=100){self.postMessage({progress:module.fieldProgress,heapBytes:module.HEAPU8.byteLength});lastProgress=performance.now();}};module.fieldBoot=data.boot;
  if(data.distanceBatch){
   if(data.reuseGpuTransport!==true){
    module.distanceBatch=async job=>{const ranges=['queryDescriptors','candidateDescriptors','best'].map(key=>wasmRange(module,job[key].byteOffset,job[key].byteLength)),{pairCount,dimensions,distanceDimensions}=job;job=null;const id=++gpuSerial,allowed=await new Promise((resolve,reject)=>{gpuWaiters.set(id,{resolve,reject});self.postMessage({gpuPrepare:{id,bytes:pairCount*(dimensions*8+8)}});});if(!allowed)return null;module.gpuPendingConsumption=id;const [queryDescriptors,candidateDescriptors,best]=ranges.map(range=>{const bytes=byteView(range);return new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4).slice();});return new Promise((resolve,reject)=>{gpuWaiters.set(id,{resolve,reject});self.postMessage({gpuRequest:{id,job:{pairCount,dimensions,distanceDimensions,queryDescriptors,candidateDescriptors,best}}},[queryDescriptors.buffer,candidateDescriptors.buffer,best.buffer]);});};
    module.distanceBatchConsumed=()=>{if(module.gpuPendingConsumption){self.postMessage({gpuConsumed:module.gpuPendingConsumption});module.gpuPendingConsumption=0;}};
   }else{
   const {DenseGpuTransport}=await import('./dense-gpu-transport.js');
   gpuTransport=new DenseGpuTransport({reuse:data.reuseGpuTransport===true,read:byteView,post:value=>self.postMessage(value),request:(kind,value,transfer=[])=>new Promise((resolve,reject)=>{gpuWaiters.set(value.id,{resolve,reject});try{self.postMessage({[kind]:value},transfer);}catch(error){gpuWaiters.delete(value.id);reject(error);}})});
   module.distanceBatch=job=>{const ranges=['queryDescriptors','candidateDescriptors','best'].map(key=>wasmRange(module,job[key].byteOffset,job[key].byteLength)),{pairCount,dimensions,distanceDimensions}=job;return gpuTransport.batch({ranges,pairCount,dimensions,distanceDimensions});};
   module.distanceBatchConsumed=()=>gpuTransport.consumed();
   }
  }

  module.fieldReady=value=>{ready=true;module.fieldBoot=null;data.boot=null;self.postMessage({ready:true,transactional:true,boot:value?.pools?value:undefined,metrics:{...io,heapBytes:module.HEAPU8.byteLength}});module.fieldPools=null;bootstrapRelease?.();bootstrapRelease=null;};
  module.nextFieldTask=async()=>{const task=queued.length?queued.shift():await new Promise(resolve=>{next=resolve;});commandActive=task[0]!==0;if(commandActive){writeBatch.begin(returnedBatch);returnedBatch=null;}return task;};
  module.fieldTaskDone=result=>{const writes=writeBatch.publication();commandActive=false;self.postMessage({done:{...result,writes},metrics:{...io,heapBytes:module.HEAPU8.byteLength,siftBoundRejections:module.siftBoundRejections??0,...(gpuTransport?{gpuTransport:gpuTransport.snapshot()}:{})}},[writes.buffer]);};
  const values=[...data.values],owned=[];
  const allocate=bytes=>{const p=module._malloc(bytes);if(!p)throw heap.error??new EngineError('MEMORY_ALLOCATION','Field kernel allocation failed');owned.push(p);return p;};
  values[13]=allocate(8);values[14]=allocate(1024);values[20]=data.boot?2:1;
  if(data.metadata){values[15]=allocate(data.metadata.byteLength);module.HEAPU8.set(new Uint8Array(data.metadata.buffer),values[15]);values[16]=allocate(data.weights.byteLength);module.HEAPU8.set(new Uint8Array(data.weights.buffer),values[16]);}
  else{values[15]=0;values[16]=0;}
  done=module.ccall('dense_paged_field','number',values.map(()=> 'number'),values,{async:true});const code=await done;
  if(module.ioError)throw module.ioError;if(code&&heap.error)throw heap.error;if(code)throw new EngineError(code===-2?'MEMORY_ALLOCATION':'NUMERIC_RANGE',module.UTF8ToString(values[14]));
  await Promise.all(stores.map(store=>store?.flush?.()));for(const p of owned)module._free(p);
  finalMetrics={...io,heapBytes:module.HEAPU8.byteLength,siftBoundRejections:module.siftBoundRejections??0,...(gpuTransport?{gpuTransport:gpuTransport.snapshot()}:{})};
 }catch(error){failed=true;primary=error;}finally{finishCompute();try{await close();}catch(error){if(!failed){failed=true;primary=error;}else if(primary&&typeof primary==='object')primary.details={...primary.details,denseRetirementPending:true};}}
 if(failed)self.postMessage({error:serializeDenseError(primary),retirementPending:!retired});else self.postMessage({finished:true,metrics:finalMetrics});
},{label:'dense-field-kernel-worker',onFailure:error=>{for(const waiting of gpuWaiters.values())waiting.reject?.(error);gpuWaiters.clear();self.postMessage({error:serializeDenseError(error)});}});
