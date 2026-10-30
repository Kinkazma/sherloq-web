import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
const blockBytes=4*1024**2;
const ack=async work=>{const value=await work();if(value===0||value===false)throw value;};
/** One bounded write-back byte block per temporary D2 tensor. All operations
 * are serialized so flat/rectangular reads and writes observe the same bytes.
 * No tensor coordinate, conversion or arithmetic is evaluated by this layer.
 * A parent adopts this owner before its policy fee or byte buffer is acquired. */
export function createD2prlPagedBlockCache(store,{budget,onOwner,workspaceFactory=allocateOwnedTypedArray}={}){
 requireValue(store?.readInto&&store?.write&&store?.dispose&&Number.isSafeInteger(store.byteLength)&&budget?.reserve&&typeof onOwner==='function','Pre-owned lossless native temporary store required');
 const life=new AbortController(),pending=new Set();let metadata,workspace,index=-1,validBytes=0,dirty=false,closed=false,retired=false,closing,storeRetired=false,unregister,workspaceRetiring=false,tail=Promise.resolve();
 const stats={reads:0,writes:0,readBytes:0,writeBytes:0,hits:0,misses:0,evictions:0};
 // A rectangle already passes the same composed signal for every row.
 // Reuse only its cancellation composition; the FIFO and every alive check
 // still run for each admitted byte operation. Weak keys retain no caller.
 const ioSignals=new WeakMap();
 const combined=signal=>{if(!signal)return AbortSignal.any([life.signal]);let value=ioSignals.get(signal);if(!value){value=AbortSignal.any([life.signal,signal]);ioSignals.set(signal,value);}return value;};
 const alive=signal=>{checkAbort(signal);checkAbort(life.signal);if(closed)throw new EngineError('DISPOSED','Native block cache closed');};
 const range=(offset,length)=>requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=store.byteLength,'Exact native byte range required');
 const ensure=()=>{metadata??=budget.reserve(1024);workspace??=workspaceFactory(Uint8Array,Math.min(blockBytes,store.byteLength),{budget,owner:'d2prl',label:'paged-native-block-cache'});};
 const retireWorkspace=()=>{if(!workspace)return 0;const bytes=workspace.data?.byteLength??0;workspaceRetiring=true;const result=workspace.release();if(result===0||result===false)throw result;if(result?.then){void result.catch?.(()=>{});throw new EngineError('RESOURCE_ACK_PENDING','Cache byte workspace requires the synchronous owned-array retirement contract');}workspace=null;workspaceRetiring=false;index=-1;validBytes=0;return bytes;};
 const evictClean=()=>{if(closed||dirty||pending.size||!workspace)return 0;const bytes=retireWorkspace();stats.evictions++;return bytes;};
 const flushBlock=async signal=>{if(!dirty)return;await store.write(workspace.data.subarray(0,validBytes),index*blockBytes,{signal});stats.writes++;stats.writeBytes+=validBytes;dirty=false;};
 const load=async(next,signal)=>{
  if(workspaceRetiring)retireWorkspace();if(index===next){stats.hits++;return;}stats.misses++;ensure();await flushBlock(signal);alive(signal);index=-1;validBytes=Math.min(blockBytes,store.byteLength-next*blockBytes);
  await store.readInto(workspace.data.subarray(0,validBytes),next*blockBytes,{signal});stats.reads++;stats.readBytes+=validBytes;index=next;
 };
 const enqueue=(work,signal)=>{alive(signal);const ioSignal=combined(signal),promise=tail.then(()=>{alive(ioSignal);return work(ioSignal);});tail=promise.catch(()=>{});pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;};
 const actor={
  byteLength:store.byteLength,get storage(){return store.storage;},
  readInto(target,offset=0,{signal}={}){requireValue(target instanceof Uint8Array,'Caller-owned byte destination required');range(offset,target.byteLength);return enqueue(async ioSignal=>{for(let at=0;at<target.byteLength;){alive(ioSignal);const position=offset+at,next=Math.floor(position/blockBytes),within=position%blockBytes;await load(next,ioSignal);alive(ioSignal);const count=Math.min(target.byteLength-at,validBytes-within);target.set(workspace.data.subarray(within,within+count),at);at+=count;}return target;},signal);},
  write(source,offset=0,{signal}={}){requireValue(source instanceof Uint8Array,'Caller-owned native bytes required');range(offset,source.byteLength);return enqueue(async ioSignal=>{for(let at=0;at<source.byteLength;){alive(ioSignal);const position=offset+at,next=Math.floor(position/blockBytes),within=position%blockBytes;await load(next,ioSignal);alive(ioSignal);const count=Math.min(source.byteLength-at,validBytes-within);workspace.data.set(source.subarray(at,at+count),within);dirty=true;at+=count;}},signal);},
  flush({signal}={}){return enqueue(async ioSignal=>{await flushBlock(ioSignal);alive(ioSignal);await store.flush();alive(ioSignal);},signal);},
  visit(visitor,{signal,...options}={}){return enqueue(async ioSignal=>{await flushBlock(ioSignal);alive(ioSignal);await store.flush();alive(ioSignal);const result=await store.visit(visitor,{...options,signal:ioSignal});alive(ioSignal);return result;},signal);},
  markCold(){return store.markCold?.();},
  evictClean,
  snapshot(){return{closed,retired,dirty,index,validBytes,pending:pending.size,workspaceRetiring,workspaceBytes:workspace?.data?.byteLength??0,storeRetired,stats:{...stats}};},
  dispose(){if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();unregister?.();unregister=null;closing=(async()=>{await Promise.allSettled([...pending]);if(!storeRetired){await ack(()=>store.dispose());storeRetired=true;}if(workspace)retireWorkspace();if(metadata){await ack(metadata);metadata=null;}retired=true;})();void closing.catch(()=>{closing=null;});return closing;}
 };onOwner(actor);alive();metadata=budget.reserve(1024);unregister=budget.registerReclaimer?.(evictClean,{owner:'d2prl',allocationKind:'array-buffer',label:'paged-native-clean-block'});return actor;
}
