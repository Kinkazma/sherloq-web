import {createSHA256} from '../../vendor/hash-wasm/hashes.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError} from '../../src/errors.js';
import {withD2prlActivity} from './resource-activity.js';
const RANGE_BYTES=4*1024**2,COPY_BYTES=256*1024,HASH_WORKSPACE=1024*1024;
// The pinned SHA256 Wasm binary declares initial=maximum=2 pages. Admission
// additionally covers its small saved states, JS wrapper and compile workspace.
const HASH_MEMORY_BYTES=2*65536;
const resumable=error=>['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY','NETWORK_TRANSIENT','WORKER_MESSAGE_FAILED'].includes(error?.code);
function networkError(error,details,signal){checkAbort(signal);const normalized=normalizeResourceError(error);if(normalized!==error||typeof normalized?.code==='string')return normalized;return new EngineError('NETWORK_TRANSIENT','Model stream interrupted',{cause:error,details});}

// A published parameter is a lease on one fixed Wasm bank, with an explicit
// extent. Never transfer its buffer: it can also contain other live parameters.
// Streaming resumes at the last hashed byte; a server ignoring Range is read
// and discarded up to that offset without concatenating the response.
export function createParameterStore({budget,assetBaseUrl,operation=(_label,work)=>work(),fetchAsset=globalThis.fetch,hasherFactory=createSHA256,arena:sharedArena}={}){
 const arena=sharedArena??createWasmTensorArena({budget}),entries=new Map(),hashers=new Set();let disposed=false,reads=0,networkBytes=0,committedBytes=0,cacheHits=0,hashInstances=0,peakNetworkChunkBytes=0;
 const returnHasher=entry=>{const slot=entry.hashSlot;if(!slot)return;entry.hasher=null;entry.hashSlot=null;slot.inUse=false;slot.unpin?.();slot.unpin=null;slot.backing?.setReclaimable(true);};
 const retireHasher=slot=>{if(slot.inUse||!hashers.delete(slot))return 0;slot.value=null;slot.backing?.();slot.release();budget.notifyBackingRelease?.('wasm',HASH_MEMORY_BYTES);return HASH_MEMORY_BYTES;};
 const remove=entry=>{if(entry.refs)return;entries.delete(entry.key);entry.tensor?.release();entry.tensor=null;returnHasher(entry);};
 const evict=bytes=>{let freed=0;for(const entry of [...entries.values()]){if(entry.refs||entry.loading||!entry.verified)continue;remove(entry);freed+=arena.reclaimIdle(bytes-freed);if(freed>=bytes)break;}if(freed<bytes)for(const slot of [...hashers]){freed+=retireHasher(slot);if(freed>=bytes)break;}return freed;};
 const unregister=budget.registerReclaimer?.(bytes=>{const shortfall=budget.total()+bytes-budget.limit;if(shortfall>0)evict(shortfall);});
 const unregisterAsync=budget.registerAsyncReclaimer?.(({shortfallBytes})=>evict(shortfallBytes),{allocationKind:'wasm',owner:'d2prl',label:'verified-parameters',priority:110});
 async function load(entry,signal){
  let reader,pending,pendingRelease,pendingExtra,pendingBacking,skip=0,responseEnd=entry.spec.bytes-1;
  const close=async()=>{if(reader){try{await reader.cancel();}catch{}reader.releaseLock();reader=null;}};
  const clearChunk=()=>{const bytes=pending?.buffer.byteLength??0;pending=null;pendingBacking?.();pendingBacking=null;pendingExtra?.();pendingExtra=null;pendingRelease?.();pendingRelease=null;if(bytes)budget.notifyBackingRelease?.('array-buffer',bytes);};
  const details=()=>({asset:entry.spec.file,offset:entry.at,requestedBytes:Math.min(COPY_BYTES,entry.spec.bytes-entry.at)});
  try{
   if(!entry.tensor)entry.tensor=await operation('parameter:allocate:'+entry.spec.file,()=>arena.allocate(entry.Type,entry.spec.bytes/entry.Type.BYTES_PER_ELEMENT,{signal,zero:false,label:'parameter:'+entry.spec.file}),{bytes:entry.spec.bytes});
   if(!entry.hasher){
    let slot=[...hashers].find(value=>!value.inUse);
    if(!slot){const release=await operation('parameter:hash-admission',()=>budget.reserve(HASH_WORKSPACE));try{const value=await operation('parameter:hash-create',({resourceOperation}={})=>withD2prlActivity(budget,'parameter:hash-initialization','compute',hasherFactory,{parent:resourceOperation}));slot={value,release,inUse:false,backing:budget.registerBacking?.('wasm',HASH_MEMORY_BYTES,{owner:'d2prl',label:'incremental-sha256',reclaimable:true})};hashers.add(slot);hashInstances++;}catch(error){release();throw error;}}
    slot.inUse=true;slot.backing?.setReclaimable(false);slot.unpin=slot.backing?.pin();entry.hashSlot=slot;entry.hasher=slot.value;entry.hasher.init();
   }
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
   entry.verified=true;returnHasher(entry);
  }finally{clearChunk();await close();}
 }
 return{
  async acquire(spec,{signal,retain=false}={}){
   requireValue(!disposed&&Number.isSafeInteger(spec.bytes)&&spec.bytes>0&&spec.bytes<=256*1024**2&&/^[0-9a-f]{64}$/.test(spec.sha256)&&['float32','int64','uint8'].includes(spec.dtype),'Pinned parameter identity');
   const Type=spec.dtype==='int64'?BigInt64Array:spec.dtype==='uint8'?Uint8Array:Float32Array;requireValue(spec.bytes%Type.BYTES_PER_ELEMENT===0,'Aligned parameter extent');checkAbort(signal);
   const key=[spec.file,spec.sha256,spec.bytes,spec.dtype].join(':');let entry=entries.get(key);if(!entry){entry={key,spec,Type,at:0,refs:0,loading:false,verified:false,retain:false};entries.set(key,entry);}
   requireValue(!entry.loading,'Concurrent acquisition of one model parameter');entry.loading=true;
   try{if(!entry.verified)await load(entry,signal);else cacheHits++;checkAbort(signal);entry.refs++;entry.retain ||= retain;let live=true;
    return{get data(){requireValue(live,'Released parameter');return entry.tensor.data;},get byteOffset(){return this.data.byteOffset;},byteLength:spec.bytes,shape:spec.shape,release(){if(!live)return;live=false;entry.refs--;if(disposed||!entry.retain)remove(entry);}};
   }catch(error){if(signal?.aborted||!resumable(error))remove(entry);throw error;}finally{entry.loading=false;}
  },
  clearRetained(){for(const entry of [...entries.values()])if(entry.retain){entry.retain=false;remove(entry);}},
  clear(){for(const entry of [...entries.values()]){entry.retain=false;remove(entry);}},
  snapshot(){return{entries:entries.size,reads,networkBytes,committedBytes,cacheHits,hashInstances,peakNetworkChunkBytes,...arena.snapshot()};},
  dispose(){if(disposed)return;disposed=true;unregister?.();unregisterAsync?.();this.clear();for(const slot of [...hashers])retireHasher(slot);if(!sharedArena)arena.dispose();}
 };
}
