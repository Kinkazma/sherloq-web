import {allocateBuffer,allocateTypedArray,allocateOwnedTypedArray,readBlobBytes} from './allocation.js';
import {byteRange,byteLength as rangeLength,byteView} from './memory-range.js';
// Lossless shared-budget storage for qualified segmented image adapters.
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {acquireMigrationWorkspace,missingMigrationWorkspaceBytes,migrationWorkspaceBytes} from './migration-workspace.js';
const ADOPT_SHARED=Symbol('owned shared segments'),ALLOCATION_RECOVERY=Symbol('allocation recovery'),REVOKED_MIGRATION=Symbol('quiesced immutable migration');
export async function createSegmentedBytes(byteLength,{budget,chunkBytes=4*1024**2,storage='auto',temporarySession,getTemporarySession,signal,shared=false,migrationReserve,owner='unattributed',label='segmented-bank',[ADOPT_SHARED]:adoption}={}){
 requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0,'Invalid segmented array length.');
 requireValue(budget&&typeof budget.retain==='function'&&typeof budget.reserve==='function','A shared memory budget is required.');
 requireValue(Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&['auto','memory','temporary'].includes(storage)&&typeof shared==='boolean','Invalid segmented storage options.');checkAbort(signal);
 // Source residency and execution layout are independent. Explicit migration
 // happens only at an idle stage boundary, never as an unaccounted eager copy.
 const canMigrate=!!(temporarySession||getTemporarySession),migrationBytes=canMigrate&&temporarySession?.backend!=='opfs'?migrationWorkspaceBytes(byteLength,temporarySession):0;
 let selected=storage==='auto'?(!(canMigrate&&budget.isBackingUnderPressure?.('array-buffer'))&&byteLength+Math.min(chunkBytes,byteLength)+missingMigrationWorkspaceBytes(budget,migrationBytes)<=budget.limit-budget.retained-budget.active?'memory':'temporary'):storage;
 const shareable=shared&&globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function';
 let segments=new Map(),disk,disposed=false,retained=false,residentRelease,disposing,migration,recoveringAllocation=false,pins=0,directPins=0,mutablePins=0,pinsReleased,cold=false,unregisterReclaimer,migrationWorkspace,allocationRecovery=null;
 const pending=new Set(),ioWorkspaces=new Set(),revocableReaders=new Set();let revocation,publicationGate,revocablePublished=false,backings=new Map();
 const registerBank=(index,bytes,owners=backings)=>{const release=budget.registerBacking?.('array-buffer',bytes,{owner,label,reclaimable:cold}),entry={release,unpin:directPins?release?.pin():null};owners.set(index,entry);};
 const pinBanks=()=>{if(directPins!==1)return;for(const entry of backings.values())entry.unpin=entry.release?.pin();};
 const unpinBanks=()=>{if(directPins)return;for(const entry of backings.values()){entry.unpin?.();entry.unpin=null;}};
 const diskWorkspace=()=>migrationWorkspace??ioWorkspaces.values().next().value;
 const sessionFor=async signal=>{const session=temporarySession??await getTemporarySession?.({signal});if(!session)throw new EngineError('STORAGE_UNAVAILABLE','Temporary storage is required for this execution plan.');checkAbort(signal);return session;};
 try{
 if(selected==='memory'&&migrationBytes)migrationWorkspace=acquireMigrationWorkspace(budget,migrationBytes,{reserve:migrationReserve});
 if(adoption){
  requireValue(selected==='memory'&&shareable&&typeof adoption.reservation==='function'&&Array.isArray(adoption.segments),'Invalid owned shared adoption.');
  for(const [index,buffer] of adoption.segments){requireValue(Number.isSafeInteger(index)&&index>=0&&index<Math.ceil(byteLength/chunkBytes)&&!segments.has(index)&&buffer instanceof SharedArrayBuffer&&buffer.byteLength===Math.min(chunkBytes,byteLength-index*chunkBytes),'Invalid adopted shared bank.');segments.set(index,new Uint8Array(buffer));registerBank(index,buffer.byteLength);}
  residentRelease=adoption.reservation;retained=true;
 }else if(selected==='memory'){budget.retain(byteLength);residentRelease=()=>{budget.retained-=byteLength;};retained=true;}
 else disk=await (await sessionFor(signal)).create(byteLength,{signal});
 }catch(error){segments.clear();for(const entry of backings.values()){entry.unpin?.();entry.release?.();}backings.clear();await migrationWorkspace?.release();throw error;}
 function alive(){if(disposed)throw new EngineError('DISPOSED','Segmented array disposed.');}
 function range(offset,length){alive();requireValue(Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=byteLength-length,'Invalid segmented byte range.');}
 function idle(){alive();if(migration||pending.size||pins)throw new EngineError('BUSY','Segmented array has active readers, I/O or migration.');}
 function allocatedBankBytes(){let bytes=0;for(const bank of segments.values())bytes+=bank.byteLength;return bytes;}
 function retireBanks(){const bytes=allocatedBankBytes();segments.clear();for(const entry of backings.values()){entry.unpin?.();entry.release?.();}backings.clear();if(retained){residentRelease();residentRelease=null;retained=false;}if(bytes)budget.notifyBackingRelease?.('array-buffer',bytes);return bytes;}
 function allocate(index,owners=backings){
  const length=Math.min(chunkBytes,byteLength-index*chunkBytes);let data;
  try{data=shareable?new Uint8Array(allocateBuffer(length,{shared:true,label})):allocateTypedArray(Uint8Array,length,{label});}
  catch(cause){if(cause.code==='MEMORY_ALLOCATION')throw new EngineError('MEMORY_ALLOCATION',`A segmented RAM allocation failed: ${length} bytes, bank ${index}, ${byteLength} total bytes, ${allocatedBankBytes()} allocated bank bytes, ${shareable?'shared':'ordinary'} backing; ${cause.cause?.message??cause.message}`,{cause,details:{...cause.details,bankIndex:index,bankBytes:length,totalBytes:byteLength,shared:shareable}});throw cause;}
  registerBank(index,length,owners);return data;
 }
 function track(value){if(!value||typeof value.then!=='function')return value;const task=Promise.resolve(value);pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;}
 function readRam(target,offset,map=segments){const length=rangeLength(target);let done=0;while(done<length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(length-done,chunkBytes-within),source=map.get(index);if(source)byteView(target,done,n).set(source.subarray(within,within+n));else byteView(target,done,n).fill(0);done+=n;}return target;}
 const store={
  byteLength,chunkBytes,
  pinIoWorkspace(){alive();if(!disk?.stagingBytes)return null;const owner=acquireMigrationWorkspace(budget,disk.stagingBytes);ioWorkspaces.add(owner);let closed=false;return {async release(){if(closed)return;closed=true;ioWorkspaces.delete(owner);await owner.release();}};},
  get storage(){return selected;},get shared(){return selected==='memory'&&shareable;},
  // The logical reservation includes sparse zero banks that were never created.
  // Only materialized banks can make backing available when this owner retires.
  get allocatedBackingBytes(){return allocatedBankBytes();},
  get allocationRecovery(){return allocationRecovery?{...allocationRecovery}:null;},
  readInto(target,offset=0,options){const bytes=byteRange(target);range(offset,rangeLength(bytes));if(migration)return migration.then(()=>{byteView(bytes);return store.readInto(target,offset,options);});return disk?track(diskWorkspace()&&disk.stagingBytes&&!options?.reserve?diskWorkspace().run(reserve=>disk.readInto(target,offset,{...options,reserve}),options):disk.readInto(target,offset,options)):(readRam(bytes,offset),target);},
  write(source,offset=0,options){
   const original=source;source=byteRange(source);const length=rangeLength(source);range(offset,length);
   if(migration&&recoveringAllocation)return migration.then(()=>{checkAbort(options?.signal??signal);return store.write(source,offset,options);});
   if(migration||pins>mutablePins)throw new EngineError('BUSY','Cannot modify a migrating or shared read-only array.');
   if(disk)return track(diskWorkspace()&&disk.stagingBytes&&!options?.reserve?diskWorkspace().run(reserve=>disk.write(original,offset,{...options,reserve}),options):disk.write(original,offset,options));
   // Admit every bank touched by this write before changing existing bytes. A
   // failed allocation can then move the old authoritative data transactionally.
   try{for(let index=Math.floor(offset/chunkBytes),end=Math.ceil((offset+length)/chunkBytes);length&&index<end;index++)if(!segments.has(index))segments.set(index,allocate(index));}
   catch(error){return this.recoverAllocation(error,{...options,source,offset});}
   let done=0;while(done<length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(length-done,chunkBytes-within);segments.get(index).set(byteView(source,done,n),within);done+=n;}
  },
  recoverAllocation(error,options={}){
   if(error?.code!=='MEMORY_ALLOCATION'||!canMigrate)throw error;
   allocationRecovery={count:(allocationRecovery?.count??0)+1,status:'copying',bytesPreserved:allocatedBankBytes(),cause:error.message};
   // The caller's narrow write scope may not hold a historical full bank.
   // Use the already-funded migration window for this recovery transaction.
   let operation;try{operation=this.migrate('temporary',{...options,reserve:undefined,signal:options.signal??signal,[ALLOCATION_RECOVERY]:error});}catch(failure){allocationRecovery.status='failed';throw failure;}
   operation.then(()=>{allocationRecovery.status='completed';},()=>{allocationRecovery.status='failed';});return operation;
  },
  async visit(visitor,{signal,offset=0,length=byteLength-offset,blockBytes=chunkBytes}={}){
   range(offset,length);requireValue(Number.isSafeInteger(blockBytes)&&blockBytes>0,'Invalid traversal block size.');let at=offset;const size=Math.min(blockBytes,length),workspace=allocateOwnedTypedArray(Uint8Array,size,{budget,owner,label:label+'-visit'});let buffer;
   try{buffer=workspace.data;while(at<offset+length){await controlCheckpoint(signal);const part=buffer.subarray(0,Math.min(size,offset+length-at));await this.readInto(part,at);await visitor(part,at);checkAbort(signal);at+=part.length;}}finally{workspace.release();}
  },
  flush(){alive();if(migration)throw new EngineError('BUSY','Cannot flush a migrating segmented array.');return disk?track(disk.flush()):undefined;},
  exportSharedReadOnly(){
   alive();if(selected!=='memory'||!shareable)return null;if(migration||pending.size)throw new EngineError('BUSY','Segmented array has active I/O or migration.');pins++;directPins++;pinBanks();
   const descriptor={byteLength,chunkBytes,segments:[...segments].map(([index,data])=>[index,data.buffer])};
   let released=false;return {descriptor,release(){if(released)return;released=true;descriptor.segments.length=0;directPins--;unpinBanks();if(--pins===0){pinsReleased?.();pinsReleased=null;}}};
  },
  exportSharedMutable(){
   alive();if(selected!=='memory'||!shareable)return null;if(migration||pending.size||pins>mutablePins)throw new EngineError('BUSY','Segmented array has active immutable readers or I/O.');
   // Mutable transports must contain zero-filled segments too: later writes
   // cannot publish a newly allocated bank to an already running worker.
   for(let index=0;index<Math.ceil(byteLength/chunkBytes);index++)if(!segments.has(index))segments.set(index,allocate(index));
   pins++;directPins++;pinBanks();mutablePins++;const descriptor={kind:'shared',mutable:true,byteLength,chunkBytes,segments:[...segments].map(([index,data])=>[index,data.buffer])};let released=false,mutable=true;
   return {descriptor,sealReadOnly(){if(released||!mutable)return;mutable=false;mutablePins--;descriptor.mutable=false;},release(){if(released)return;released=true;descriptor.segments.length=0;directPins--;unpinBanks();if(mutable)mutablePins--;if(--pins===0){pinsReleased?.();pinsReleased=null;}}};
  },
  async exportReadOnly({forceBroker=false,revocable}={}){
   requireValue(!revocable||typeof revocable.quiesce==='function'&&typeof revocable.resume==='function','Invalid revocable reader.');
   if(publicationGate)await publicationGate;
   alive();if(migration||mutablePins)throw new EngineError('BUSY','Segmented array has an active writer or migration.');if(pending.size)await Promise.all(pending);
   alive();if(migration||mutablePins)throw new EngineError('BUSY','Segmented array has an active writer or migration.');
   const wrap=pin=>{if(!revocable)return pin;const entry={consumer:revocable};revocableReaders.add(entry);revocablePublished=true;let released=false;return {...pin,release(){if(released)return;released=true;revocableReaders.delete(entry);return pin.release();}};};
   const sharedPin=!forceBroker&&this.exportSharedReadOnly();if(sharedPin)return wrap({...sharedPin,descriptor:{kind:'shared',...sharedPin.descriptor}});
   pins++;let released=false;const release=()=>{if(released)return;released=true;if(--pins===0){pinsReleased?.();pinsReleased=null;}};
   try{return wrap({descriptor:(!forceBroker&&await disk?.exportReadOnly?.())||{kind:'broker',byteLength},release});}catch(error){release();throw error;}
  },
  pinMutable(){alive();if(migration||pins>mutablePins)throw new EngineError('BUSY','Segmented array is immutable or migrating.');pins++;mutablePins++;let released=false,mutable=true;const release=()=>{if(released)return;released=true;if(mutable)mutablePins--;if(--pins===0){pinsReleased?.();pinsReleased=null;}};release.sealReadOnly=()=>{if(released||!mutable)return;mutable=false;mutablePins--;};return release;},
  migrate(target,{signal,reserve,source,offset=0,[ALLOCATION_RECOVERY]:allocationFailure,[REVOKED_MIGRATION]:quiesced}={}){
   requireValue(['memory','temporary'].includes(target),'Invalid migration destination.');
   if(revocation&&!quiesced)throw new EngineError('BUSY','Immutable readers are changing backing.');
   if(allocationFailure){alive();if(migration||pending.size||directPins||pins>mutablePins)throw allocationFailure;}else idle();
   checkAbort(signal);if(target===selected)return Promise.resolve(false);
   // The old backing stays authoritative until all useful bytes are copied and
   // flushed. Failure/cancellation discards only the incomplete destination.
   let acquiredWorkspace=false;
   if(target==='memory'&&!migrationWorkspace&&migrationBytes){migrationWorkspace=acquireMigrationWorkspace(budget,migrationBytes,{reserve:migrationReserve});acquiredWorkspace=true;}
   const execute=async staging=>{
    let candidate,ramReserved=false,committed=false,nextOwners,next;
    try{
     if(target==='temporary'){
      candidate=await (await sessionFor(signal)).create(byteLength,{signal});
      // Borrow already-accounted chunks. Sparse holes remain zero in both stores.
      for(const [index,data] of segments){alive();await controlCheckpoint(signal);await candidate.write(data,index*chunkBytes,{reserve:staging});}
      if(source){alive();checkAbort(signal);await candidate.write(source,offset,{reserve:staging});}
      await candidate.flush?.();alive();checkAbort(signal);
      disk=candidate;candidate=null;selected='temporary';committed=true;retireBanks();
     }else{
      budget.retain(byteLength);ramReserved=true;next=new Map();nextOwners=new Map();
      for(let index=0;index<Math.ceil(byteLength/chunkBytes);index++){alive();await controlCheckpoint(signal);const data=allocate(index,nextOwners);next.set(index,data);await disk.readInto(data,index*chunkBytes,{reserve:staging});}
      alive();checkAbort(signal);const previous=disk;disk=null;segments=next;backings=nextOwners;selected='memory';residentRelease=()=>{budget.retained-=byteLength;};retained=true;ramReserved=false;committed=true;await previous.dispose();
     }
     return true;
    }finally{if(ramReserved)budget.retained-=byteLength;if(!committed){next?.clear();for(const entry of nextOwners?.values()??[]){entry.unpin?.();entry.release?.();}await candidate?.dispose();}}
   };
   const execution=migrationWorkspace&&!reserve?migrationWorkspace.run(execute,{signal}):execute(reserve);
   const operation=execution.catch(async error=>{if(acquiredWorkspace&&selected!=='memory'){const workspace=migrationWorkspace;migrationWorkspace=null;await workspace.release();}throw error;});
   migration=operation;recoveringAllocation=!!allocationFailure;operation.then(()=>{if(migration===operation){migration=null;recoveringAllocation=false;}},()=>{if(migration===operation){migration=null;recoveringAllocation=false;}});return operation;
  },
  spill(options){return this.migrate('temporary',options);},
  async spillReadOnly({signal,immediate=false}={}){
   alive();checkAbort(signal);if(revocation)await revocation;
   if(selected!=='memory')return false;
   // Every live publication must participate. Mutable or unregistered readers
   // cannot be invalidated, even if another field has already stopped reading.
   if(mutablePins||pending.size||migration||pins!==revocableReaders.size)return false;
   const consumers=[...revocableReaders].map(entry=>entry.consumer);if(!consumers.length)return this.spill({signal});
   if(immediate&&consumers.some(consumer=>!consumer.immediateQuiescence))return false;
   let unblocked,completed;revocation=new Promise(resolve=>{completed=resolve;});publicationGate=new Promise(resolve=>{unblocked=resolve;});let failure,changed=false;
   try{
    const paused=await Promise.allSettled(consumers.map(consumer=>consumer.quiesce({immediate})));
    const refused=paused.find(result=>result.status==='rejected');if(refused)throw refused.reason;
    checkAbort(signal);if(!paused.some(result=>result.value===false))changed=await this.migrate('temporary',{signal,[REVOKED_MIGRATION]:true});
   }catch(error){failure=error;}
   finally{
    // Re-publication uses the old authoritative bank after a failed copy, or
    // the committed temporary bank after success. Never leave peers paused.
    publicationGate=null;unblocked();
    const resumed=await Promise.allSettled(consumers.map(consumer=>consumer.resume()));
    failure??=resumed.find(result=>result.status==='rejected')?.reason;
    revocation=null;completed();
   }
   if(failure)throw failure;return changed;
  },
  promote(options){return this.migrate('memory',options);},
  markCold(value=true){alive();cold=!!value;for(const entry of backings.values())entry.release?.setReclaimable(cold);return this;},
  dispose(){
   if(disposing)return disposing;disposed=true;unregisterReclaimer?.();
   disposing=(async()=>{if(migration)await Promise.allSettled([migration]);if(pending.size)await Promise.allSettled([...pending]);if(pins)await new Promise(resolve=>{pinsReleased=resolve;});retireBanks();try{await disk?.dispose();}finally{await migrationWorkspace?.release();migrationWorkspace=null;}})();return disposing;
  }
 };
 // Finished result planes may leave RAM without giving up their ownership or
 // requiring a detector rerun. Active readers/writers are never interrupted.
 if(temporarySession||getTemporarySession)unregisterReclaimer=budget.registerAsyncReclaimer?.(async({signal,reason}={})=>{if(disposed||selected!=='memory'||pending.size||migration||revocation)return 0;const active=reason==='allocation'&&revocablePublished&&pins===revocableReaders.size&&!mutablePins;if(!active&&(!cold||pins))return 0;const bytes=store.allocatedBackingBytes;const changed=active?await store.spillReadOnly({signal,immediate:true}):await store.spill({signal});return changed?bytes:0;},{allocationKind:'array-buffer',owner,label});
 return store;
}

export function adoptSharedSegmentedBytes(descriptor,{reservation,...options}){
 requireValue(descriptor&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>=0&&Number.isSafeInteger(descriptor.chunkBytes)&&descriptor.chunkBytes>0&&typeof reservation==='function','Owned segmented descriptor and reservation required.');
 return createSegmentedBytes(descriptor.byteLength,{...options,chunkBytes:descriptor.chunkBytes,storage:'memory',shared:true,[ADOPT_SHARED]:{segments:descriptor.segments,reservation}});
}

export function markColdStoredResults(value){
 const seen=new Set(),visit=item=>{if(!item||typeof item!=='object'||seen.has(item)||ArrayBuffer.isView(item)||item instanceof ArrayBuffer||(typeof SharedArrayBuffer==='function'&&item instanceof SharedArrayBuffer))return;seen.add(item);if(typeof item.markCold==='function'){item.markCold();return;}for(const child of Object.values(item))visit(child);};visit(value);
}
export async function copyBlobToSegments(blob,store,{budget,signal,onProgress}={}){
 requireValue(blob instanceof Blob&&blob.size===store.byteLength,'Blob and storage lengths differ.');
 const size=Math.min(store.chunkBytes,blob.size),release=budget.reserve(size);
 try{for(let offset=0;offset<blob.size;offset+=size){checkAbort(signal);const bytes=await readBlobBytes(blob.slice(offset,offset+size));checkAbort(signal);await store.write(bytes,offset);onProgress?.((offset+bytes.length)/blob.size);}}finally{release();}
}
