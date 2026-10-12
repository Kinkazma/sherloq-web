import {createSHA256} from '../../vendor/hash-wasm/hashes.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError} from '../../src/errors.js';
import {withD2prlActivity} from './resource-activity.js';
import {createParameterSpill} from './parameter-spill.js';
import {publishD2prlParameter} from './parameter-ownership.js';
const RANGE_BYTES=4*1024**2,COPY_BYTES=256*1024,HASH_WORKSPACE=1024*1024;
// The pinned SHA256 Wasm binary declares initial=maximum=2 pages. Admission
// additionally covers its small saved states, JS wrapper and compile workspace.
const HASH_MEMORY_BYTES=2*65536;
const resumable=error=>['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY','NETWORK_TRANSIENT','WORKER_MESSAGE_FAILED'].includes(error?.code);
function networkError(error,details,signal){checkAbort(signal);const normalized=normalizeResourceError(error);if(normalized!==error||typeof normalized?.code==='string')return normalized;return new EngineError('NETWORK_TRANSIENT','Model stream interrupted',{cause:error,details});}

// A published parameter is a lease on one fixed Wasm bank, with an explicit
// extent. Never transfer its buffer: it can also contain other live parameters.
// Consumers borrow immutable bytes; they must not write through the view.
// Streaming resumes at the last hashed byte; a server ignoring Range is read
// and discarded up to that offset without concatenating the response.
export function createParameterStore({budget,assetBaseUrl,operation=(_label,work)=>work(),fetchAsset=globalThis.fetch,hasherFactory=createSHA256,arena:sharedArena,spill=false,spillWindowBytes,temporarySessionFactory}={}){
 requireValue(typeof spill==='boolean','Explicit parameter spill policy');
 const spillOwner=spill?createParameterSpill({budget,windowBytes:spillWindowBytes,temporarySessionFactory}):null,lifetime=new AbortController(),cleanups=new Set();
 const arena=sharedArena??createWasmTensorArena({budget}),entries=new Map(),hashers=new Set();let disposed=false,reads=0,networkBytes=0,committedBytes=0,cacheHits=0,cacheHitBytes=0,evictedEntries=0,hashInstances=0,peakNetworkChunkBytes=0;
 let storageFallbacks=0,lastStorageFallback=null,cleanupFailure,disposing;
 const cleanup=task=>{if(!task?.then)return;cleanups.add(task);task.then(()=>cleanups.delete(task),error=>{cleanupFailure??=error;cleanups.delete(task);});return task;};
 const returnHasher=entry=>{const slot=entry.hashSlot;if(!slot)return;entry.hasher=null;entry.hashSlot=null;slot.inUse=false;slot.unpin?.();slot.unpin=null;slot.backing?.setReclaimable(true);};
 const retireHasher=slot=>{if(slot.inUse||!hashers.delete(slot))return 0;slot.value=null;slot.backing?.();slot.release();budget.notifyBackingRelease?.('wasm',HASH_MEMORY_BYTES);return HASH_MEMORY_BYTES;};
 const publishTensor=entry=>{if(entry.Type===Float32Array)entry.revokeParameter??=publishD2prlParameter(entry.tensor.data);};
 const releaseTensor=entry=>{if(!entry.tensor)return;try{entry.revokeParameter?.();}finally{entry.revokeParameter=null;try{entry.tensor.release();}finally{entry.tensor=null;}}};
 const remove=(entry,fromLoad=false)=>{if(entry.refs)return;if(entry.loading&&!fromLoad||entry.migration){entry.dropRequested=true;return;}entries.delete(entry.key);releaseTensor(entry);returnHasher(entry);if(entry.spill){cleanup(spillOwner.discard(entry.spill));entry.spill=null;}};
 const evict=(bytes,{force=false}={})=>{let freed=0;for(const entry of [...entries.values()]){if(entry.refs||entry.loading||entry.migration||!entry.verified||!entry.tensor)continue;if(spillOwner&&!force){if(!entry.spill)continue;releaseTensor(entry);}else{remove(entry);evictedEntries++;}freed+=arena.reclaimIdle(bytes-freed);if(freed>=bytes)break;}if(freed<bytes)for(const slot of [...hashers]){freed+=retireHasher(slot);if(freed>=bytes)break;}return freed;};
 const fallback=(phase,error,entry)=>{storageFallbacks++;lastStorageFallback={phase,asset:entry?.spec.file??null,bytes:entry?.spec.bytes??0,code:error.code??'STORAGE_IO',message:error.message};};
 const storageFailure=error=>['STORAGE_UNAVAILABLE','STORAGE_IO','STORAGE_QUOTA','STORAGE_BUSY','STORAGE_INTEGRITY'].includes(error?.code);
 const spillIdle=async({shortfallBytes,bytes,signal,reason,operation:resourceOperation}={})=>{
  const requested=Math.max(1,shortfallBytes??bytes??1);if(!spillOwner||!budget.recovering&&reason!=='allocation')return evict(requested,{force:true});
  let freed=0;
  for(const entry of [...entries.values()]){
   checkAbort(signal);if(disposed||entry.refs||entry.loading||entry.migration||!entry.verified||!entry.tensor)continue;
   const migrate=Promise.resolve().then(async()=>{try{entry.spill??=await spillOwner.save(entry.tensor,entry.spec,{signal,resourceOperation});checkAbort(signal);releaseTensor(entry);}finally{if(entry.migration===migrate)entry.migration=null;if(entry.dropRequested)remove(entry);}});entry.migration=migrate;
   try{await migrate;}catch(error){if(!storageFailure(error))throw error;fallback('spill',error,entry);return freed+evict(requested-freed,{force:true});}
   if(entry.dropRequested)remove(entry);freed+=arena.reclaimIdle(requested-freed);if(freed>=requested)break;
  }
  return freed;
 };
 const unregister=budget.registerReclaimer?.(bytes=>{const shortfall=budget.total()+bytes-budget.limit;if(shortfall>0)evict(shortfall);});
 const unregisterAsync=budget.registerAsyncReclaimer?.(spillIdle,{allocationKind:'wasm',owner:'d2prl',label:'verified-parameters',priority:110});
 async function initializeHasher(entry,signal){
  if(entry.hasher)return;
  let slot=[...hashers].find(value=>!value.inUse);
  if(!slot){const release=await operation('parameter:hash-admission',()=>budget.reserve(HASH_WORKSPACE));try{const value=await operation('parameter:hash-create',({resourceOperation}={})=>withD2prlActivity(budget,'parameter:hash-initialization','compute',hasherFactory,{parent:resourceOperation}));slot={value,release,inUse:false,backing:budget.registerBacking?.('wasm',HASH_MEMORY_BYTES,{owner:'d2prl',label:'incremental-sha256',reclaimable:true})};hashers.add(slot);hashInstances++;}catch(error){release();throw error;}}
  checkAbort(signal);slot.inUse=true;slot.backing?.setReclaimable(false);slot.unpin=slot.backing?.pin();entry.hashSlot=slot;entry.hasher=slot.value;entry.hasher.init();
 }
 async function load(entry,signal){
  let reader,pending,pendingRelease,pendingExtra,pendingBacking,skip=0,responseEnd=entry.spec.bytes-1;
  const close=async()=>{if(reader){try{await reader.cancel();}catch{}reader.releaseLock();reader=null;}};
  const clearChunk=()=>{const bytes=pending?.buffer.byteLength??0;pending=null;pendingBacking?.();pendingBacking=null;pendingExtra?.();pendingExtra=null;pendingRelease?.();pendingRelease=null;if(bytes)budget.notifyBackingRelease?.('array-buffer',bytes);};
  const details=()=>({asset:entry.spec.file,offset:entry.at,requestedBytes:Math.min(COPY_BYTES,entry.spec.bytes-entry.at)});
  try{
   if(!entry.tensor)entry.tensor=await operation('parameter:allocate:'+entry.spec.file,()=>arena.allocate(entry.Type,entry.spec.bytes/entry.Type.BYTES_PER_ELEMENT,{signal,zero:false,label:'parameter:'+entry.spec.file}),{bytes:entry.spec.bytes});
   await initializeHasher(entry,signal);
   while(true){
    checkAbort(signal);
    pendingRelease=await operation('parameter:stream-admission',()=>budget.reserve(COPY_BYTES),{bytes:COPY_BYTES});
    let item=await operation('parameter:stream:'+entry.spec.file,async({resourceOperation}={})=>{
     resourceOperation?.setState('io');try{
      if(!reader){
       const offset=Math.min(entry.at,entry.spec.bytes-1),end=offset?Math.min(entry.spec.bytes-1,offset+RANGE_BYTES-1):entry.spec.bytes-1;
       const response=await fetchAsset(new URL(entry.spec.file,assetBaseUrl).href,{signal,...(offset?{headers:{Range:`bytes=${offset}-${end}`}}:{})});
       if([408,425,429,500,502,503,504].includes(response.status)){await response.body?.cancel().catch(()=>{});throw new EngineError('NETWORK_TRANSIENT','Transient model HTTP failure',{details:{...details(),status:response.status}});}
       if(!response.ok||!response.body)throw new EngineError('MODEL_UNAVAILABLE','Model asset unavailable',{details:{...details(),status:response.status}});
       if(response.status===206){const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')??'');if(!range||+range[1]!==offset||+range[2]!==end||+range[3]!==entry.spec.bytes){await response.body.cancel().catch(()=>{});throw new EngineError('MODEL_IDENTITY','Model response range differs',{details:details()});}skip=entry.at-offset;responseEnd=end;}
       else if(response.status===200){skip=entry.at;responseEnd=entry.spec.bytes-1;}
       else{await response.body.cancel().catch(()=>{});throw new EngineError('MODEL_IDENTITY','Unexpected model response status',{details:details()});}
       reader=response.body.getReader();reads++;
      }
      return await reader.read();
     }catch(error){await close();throw networkError(error,details(),signal);}finally{resourceOperation?.setState('waiting-child');}
    });
    checkAbort(signal);if(item.done){if(!skip&&entry.at===responseEnd+1&&entry.at<entry.spec.bytes){await close();clearChunk();continue;}if(entry.at!==entry.spec.bytes||skip)throw new EngineError('MODEL_IDENTITY','Model asset is truncated',{details:details()});break;}
    pending=item.value;item=null;requireValue(pending instanceof Uint8Array,'Byte model stream required');networkBytes+=pending.byteLength;peakNetworkChunkBytes=Math.max(peakNetworkChunkBytes,pending.buffer.byteLength);
    pendingBacking=budget.registerBacking?.('array-buffer',pending.buffer.byteLength,{owner:'d2prl',label:'model-network-chunk'});
    if(pending.buffer.byteLength>COPY_BYTES)pendingExtra=await operation('parameter:chunk-admission',()=>budget.reserve(pending.buffer.byteLength-COPY_BYTES),{bytes:pending.buffer.byteLength});
    let start=Math.min(skip,pending.byteLength);skip-=start;
    if(entry.at+pending.byteLength-start>responseEnd+1)throw new EngineError('MODEL_IDENTITY','Model asset exceeds pinned size',{details:details()});
    while(start<pending.byteLength){
     const length=Math.min(COPY_BYTES,pending.byteLength-start),offset=entry.at;
     const state=await operation('parameter:hash-checkpoint',()=>entry.hasher.save());
     await operation('parameter:chunk:'+entry.spec.file,()=>{checkAbort(signal);entry.hasher.load(state);const target=new Uint8Array(entry.tensor.data.buffer,entry.tensor.data.byteOffset+offset,length);target.set(pending.subarray(start,start+length));entry.hasher.update(target);},{bytes:length});
     entry.at+=length;start+=length;committedBytes+=length;
    }
    clearChunk();
   }
   const hashState=await operation('parameter:hash-checkpoint',()=>entry.hasher.save());const digest=await operation('parameter:digest',()=>{entry.hasher.load(hashState);return entry.hasher.digest('hex');});if(digest!==entry.spec.sha256)throw new EngineError('MODEL_IDENTITY','Model asset digest differs',{details:details()});
   entry.verified=true;publishTensor(entry);returnHasher(entry);
  }finally{clearChunk();await close();}
 }
 return{
  async acquire(spec,{signal,retain=false}={}){
   requireValue(!disposed&&Number.isSafeInteger(spec.bytes)&&spec.bytes>0&&spec.bytes<=256*1024**2&&/^[0-9a-f]{64}$/.test(spec.sha256)&&['float32','int64','uint8'].includes(spec.dtype),'Pinned parameter identity');
   signal=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
   const Type=spec.dtype==='int64'?BigInt64Array:spec.dtype==='uint8'?Uint8Array:Float32Array;requireValue(spec.bytes%Type.BYTES_PER_ELEMENT===0,'Aligned parameter extent');checkAbort(signal);
   const key=[spec.file,spec.sha256,spec.bytes,spec.dtype].join(':');let entry=entries.get(key);if(!entry){entry={key,spec,Type,at:0,refs:0,loading:false,verified:false,retain:false};entries.set(key,entry);}
   requireValue(!entry.loading,'Concurrent acquisition of one model parameter');entry.loading=true;let loadingDone;entry.loadingDone=new Promise(resolve=>loadingDone=resolve);
   try{
    if(spillOwner&&retain)await operation('parameter:spill-window-admission',()=>spillOwner.prepare());
    if(entry.migration)await entry.migration.catch(error=>{checkAbort(signal);if(!entry.tensor)throw error;});
    checkAbort(signal);
    if(entry.verified&&!entry.tensor){
     requireValue(entry.spill,'Verified parameter backing is missing');await initializeHasher(entry,signal);
     try{entry.tensor=await spillOwner.restore(entry.spill,spec,{signal,hasher:entry.hasher,allocate:()=>operation('parameter:rehydrate-allocation:'+spec.file,()=>arena.allocate(Type,spec.bytes/Type.BYTES_PER_ELEMENT,{signal,zero:false,label:'parameter:'+spec.file}),{bytes:spec.bytes})});publishTensor(entry);}
     catch(error){if(!storageFailure(error))throw error;fallback('rehydrate',error,entry);await spillOwner.discard(entry.spill);entry.spill=null;entry.verified=false;entry.at=0;returnHasher(entry);}
     finally{returnHasher(entry);}
    }
    if(!entry.verified)await load(entry,signal);else{cacheHits++;cacheHitBytes+=spec.bytes;}checkAbort(signal);entry.refs++;entry.retain ||= retain;let live=true;
    return{get data(){requireValue(live,'Released parameter');return entry.tensor.data;},get byteOffset(){return this.data.byteOffset;},byteLength:spec.bytes,shape:spec.shape,release(){if(!live)return;live=false;entry.refs--;if(disposed||!entry.retain||entry.dropRequested)remove(entry);else if(!entry.refs)budget.notifyReclaimable?.();}};
   }catch(error){if(signal?.aborted&&entry.verified&&!disposed&&!entry.dropRequested)returnHasher(entry);else if(signal?.aborted||!resumable(error))remove(entry,true);throw error;}finally{entry.loading=false;loadingDone();entry.loadingDone=null;if(entry.dropRequested&&!entry.refs)remove(entry);}
  },
  clearRetained(){for(const entry of [...entries.values()])if(entry.retain){entry.retain=false;remove(entry);}},
  // Abandon an inference checkpoint without invalidating verified immutable
  // weights used by future passes. A loading or live lease remains its owner's.
  clearIncomplete(){for(const entry of [...entries.values()])if(!entry.verified&&!entry.loading)remove(entry);},
  clear(){for(const entry of [...entries.values()]){entry.retain=false;remove(entry);}},
  snapshot(){let verifiedEntries=0,idleVerifiedEntries=0,liveLeaseCount=0,verifiedTensorBytes=0,idleVerifiedTensorBytes=0,incompleteTensorBytes=0,spilledEntries=0;for(const entry of entries.values()){liveLeaseCount+=entry.refs;if(entry.verified){verifiedEntries++;if(entry.tensor)verifiedTensorBytes+=entry.spec.bytes;if(entry.spill)spilledEntries++;if(!entry.refs&&!entry.loading){idleVerifiedEntries++;if(entry.tensor)idleVerifiedTensorBytes+=entry.spec.bytes;}}else if(entry.tensor)incompleteTensorBytes+=entry.spec.bytes;}return{entries:entries.size,reads,networkBytes,committedBytes,cacheHits,cacheHitBytes,evictedEntries,verifiedEntries,idleVerifiedEntries,liveLeaseCount,verifiedTensorBytes,idleVerifiedTensorBytes,incompleteTensorBytes,spilledEntries,storageFallbacks,lastStorageFallback,spill:spillOwner?.snapshot()??null,hashInstances,peakNetworkChunkBytes,...arena.snapshot()};},
  dispose(){if(disposed)return disposing;disposed=true;lifetime.abort();unregister?.();unregisterAsync?.();this.clear();for(const slot of [...hashers])retireHasher(slot);if(!sharedArena)arena.dispose();const loads=[...entries.values()].map(entry=>entry.loadingDone??entry.migration).filter(Boolean),spillDisposal=spillOwner?.dispose();if(loads.length||cleanups.size||spillDisposal?.then){disposing=(async()=>{await Promise.allSettled(loads);await Promise.allSettled([...cleanups]);await spillDisposal;for(const slot of [...hashers])retireHasher(slot);if(cleanupFailure)throw cleanupFailure;})();return disposing;}if(cleanupFailure)throw cleanupFailure;}
 };
}
