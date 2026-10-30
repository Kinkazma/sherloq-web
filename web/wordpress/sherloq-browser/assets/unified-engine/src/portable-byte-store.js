import "../../runtime-context.js?v=0.30.0";
import {acknowledgeDenseRetirement,onceDenseRetirement,cleanupDenseOwners} from './dense-owner-retirement.js';
import {byteRange,byteLength as rangeLength,byteView} from './memory-range.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
import {EngineError,requireValue,checkAbort,serializeEngineError,deserializeEngineError} from './errors.js';
import {sharedSegmentedReader} from './shared-segmented-reader.js';
import {allocateTypedArray} from './allocation.js';
const BLOCK=64*1024;
const encode=error=>serializeEngineError(error,'STORAGE_IO');
const decode=deserializeEngineError;

// A port belongs to one reader/writer. Requests contain complete useful byte
// ranges, never one RPC per scalar descriptor component. Mutable transports
// have a single storage owner; the task graph owns disjoint write ranges.
export async function exportByteStore(store,{writable=false,signal,budget,forceBroker=false,revocable,onRetirementOwner}={}){
 checkAbort(signal);requireValue(store&&Number.isSafeInteger(store.byteLength)&&typeof store.readInto==='function','Byte store required.');
 let pin,ioPin,releaseRead,channel,protocol,stop,detachListeners,finish,forget,published=false;const construction=new Promise(resolve=>finish=resolve),retireIo=onceDenseRetirement(()=>ioPin?.release()),retirePin=onceDenseRetirement(()=>pin?.release?pin.release():releasePin()),retireRead=onceDenseRetirement(()=>releaseRead?.()),retireProtocol=onceDenseRetirement(()=>protocol?.dispose()),retireListeners=onceDenseRetirement(()=>detachListeners?.());let releasePin=()=>{};
 const close=onceDenseRetirement(async()=>{await construction;stop?.();if(tail)await tail;await retireProtocol();await retireListeners();await retireIo();await retirePin();await retireRead();forget?.();forget=null;}),owner={dispose(){stop?.();return close();}};let tail;
 try{forget=onRetirementOwner?.(owner);try{pin=writable?(!forceBroker&&store.exportSharedMutable?.()):await store.exportReadOnly?.({forceBroker,revocable});}
 catch(error){
  // A mutable SAB export must materialize its useful zero banks. If a real
  // allocation fails before publication, preserve them on the storage owner
  // and transport the same output through the existing parallel broker path.
  if(!writable||error.code!=='MEMORY_ALLOCATION'||!store.recoverAllocation)throw error;
  await store.recoverAllocation(error,{signal});checkAbort(signal);
 }
 if(!forceBroker&&pin?.descriptor&&pin.descriptor.kind!=='broker'){forget?.();forget=null;return {descriptor:pin.descriptor,transfer:pin.transfer??[],release:pin.release,sealReadOnly:pin.sealReadOnly};}
 releasePin=pin?.release??(writable?store.pinMutable?.():undefined)??(()=>{});
 ioPin=store.pinIoWorkspace?.();releaseRead=budget?.reserve(Math.min(BLOCK,store.byteLength));channel=new MessageChannel();let closed=false,lastId=0;tail=Promise.resolve();
 const stopped=()=>new EngineError('CANCELLED','Byte broker owner closed.');
 stop=error=>{if(closed)return;closed=true;try{channel.port1.postMessage({terminal:encode(error??stopped())});}catch{}channel.port1.close();};
 protocol=installWorkerMessageProtocol(channel.port1,data=>{
  if(data.closed===true){stop();return;}
  if(!Number.isSafeInteger(data.id)||data.id<=lastId||!['read','write','flush'].includes(data.op)||!Number.isSafeInteger(data.offset)||!Number.isSafeInteger(data.length)||data.offset<0||data.length<0||data.length>BLOCK||data.offset>store.byteLength-data.length||(data.op==='write'&&(!writable||!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength!==data.length))||(data.op==='flush'&&!writable))throw workerMessageFailure('byte-broker-owner','message','invalid-request');
  lastId=data.id;
  const operation=tail.then(async()=>{
   if(closed)return;
   try{
    checkAbort(signal);const {id,op,offset,length}=data;
    if(op==='flush'){await store.flush?.();if(!closed)protocol.post({id});return;}
    if(op==='write'){await store.write(new Uint8Array(data.buffer),offset);if(!closed)protocol.post({id});return;}
    const bytes=allocateTypedArray(Uint8Array,length,{label:'byte-broker-read'});await store.readInto(bytes,offset);if(!closed)protocol.post({id,buffer:bytes.buffer},[bytes.buffer]);
   }catch(error){if(!closed)protocol.post({id:data.id,error:encode(error)});}
  });
  tail=operation.catch(error=>protocol.fail(error));return operation;
 },{label:'byte-broker-owner',onFailure:stop});
 const abort=()=>stop(new EngineError('CANCELLED','Byte broker owner cancelled.'));
 const peerClosed=()=>stop();detachListeners=()=>{signal?.removeEventListener('abort',abort);channel.port1.removeEventListener?.('close',peerClosed);};channel.port1.addEventListener?.('close',peerClosed);signal?.addEventListener('abort',abort,{once:true});channel.port1.start();if(signal?.aborted)abort();
 const publication={descriptor:{kind:'broker',byteLength:store.byteLength,storage:store.storage??'temporary',cacheStoreId:store.cacheStoreId,writable,blockBytes:BLOCK,port:channel.port2},transfer:[channel.port2],sealReadOnly:()=>pin?.sealReadOnly?.()??releasePin.sealReadOnly?.(),release:owner.dispose};published=true;return publication;
 }catch(error){finish();await cleanupDenseOwners(()=>owner.dispose(),{failed:true,primary:error});throw error;}finally{finish();if(published){forget?.();forget=null;}}
}

export async function readByteStore(descriptor,{budget,onRetirementOwner}={}){
 requireValue(descriptor&&Number.isSafeInteger(descriptor.byteLength)&&descriptor.byteLength>=0,'Invalid transported byte store.');
 if(descriptor.kind==='shared'||descriptor.segments){
  const {byteLength,chunkBytes,mutable,cacheStoreId}=descriptor,publication={...descriptor,segments:descriptor.segments.map(pair=>[...pair])},immutable={...publication,mutable:false},base=sharedSegmentedReader(publication);descriptor=null;
  let disposed=false;
  const reader={...base,cacheStoreId,exportReadOnly:async()=>({descriptor:immutable,release(){}}),exportSharedReadOnly:()=>({descriptor:immutable,release(){}}),async dispose(){if(disposed)return;disposed=true;await base.dispose();publication.segments.length=0;immutable.segments.length=0;}};if(!mutable)return reader;
  const banks=new Map(publication.segments.map(([index,buffer])=>[index,new Uint8Array(buffer)]));
  return {...reader,exportSharedMutable:()=>({descriptor:publication,release(){}}),write(source,offset=0){if(disposed)throw new EngineError('DISPOSED','Shared mutable reader closed.');source=byteRange(source);const length=rangeLength(source);requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-length,'Invalid shared write.');let done=0;while(done<length){const at=offset+done,index=Math.floor(at/chunkBytes),within=at%chunkBytes,n=Math.min(length-done,chunkBytes-within),bank=banks.get(index);requireValue(bank,'Mutable shared segment missing.');bank.set(byteView(source,done,n),within);done+=n;}},flush(){},async dispose(){banks.clear();await reader.dispose();}};
 }
 if(descriptor.kind==='opfs-readonly'){
  const handles=[];let disposed=false,closed=false,disposing,finish,forget,ready=false,failed=false,primary;const construction=new Promise(resolve=>finish=resolve);
  const dispose=()=>{if(closed)return;if(disposing)return disposing;const task=Promise.resolve().then(async()=>{await construction;let refused=false,first;for(let index=0;index<handles.length;index++){const handle=handles[index];if(!handle)continue;try{const answer=handle.close();if(answer===0||answer===false)throw answer;handles[index]=null;}catch(error){if(!refused){refused=true;first=error;}}}if(refused)throw first;handles.length=0;disposed=true;closed=true;forget?.();forget=null;});disposing=task;void task.catch(()=>{if(disposing===task)disposing=null;});return task;};
  try{
   forget=onRetirementOwner?.({dispose});for(const file of descriptor.files)handles.push(await file.createSyncAccessHandle({mode:'read-only'}));
   const reader={byteLength:descriptor.byteLength,storage:'temporary',transport:'opfs-readonly',exportReadOnly:async()=>({descriptor,release(){}}),
    readInto(target,offset=0){if(disposed)throw new EngineError('DISPOSED','OPFS reader closed.');const original=target;target=byteRange(target);const length=rangeLength(target);requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=descriptor.byteLength-length,'Invalid OPFS read range.');let done=0;while(done<length){const at=offset+done,index=Math.floor(at/descriptor.fileBytes),within=at%descriptor.fileBytes,n=Math.min(length-done,descriptor.fileBytes-within),count=handles[index].read(byteView(target,done,n),{at:within});if(count<=0||count>n)throw new EngineError('STORAGE_IO','Incomplete immutable OPFS read.');done+=count;}return original;},dispose};
   ready=true;return reader;
  }catch(error){failed=true;primary=error===0||error===false?error:new EngineError('STORAGE_TRANSPORT','Concurrent OPFS readers are unavailable: '+error.message,{cause:error});throw primary;}
  finally{finish();if(ready){forget?.();forget=null;}else try{await dispose();}catch(error){if(!failed)throw error;if(primary&&typeof primary==='object')primary.details={...primary.details,readOnlyHandlesAwaitingAck:true};}}
 }
 requireValue(descriptor.kind==='broker'&&descriptor.port&&Number.isSafeInteger(descriptor.blockBytes)&&descriptor.blockBytes>0&&descriptor.blockBytes<=BLOCK,'Invalid byte broker transport.');
 const port=descriptor.port,pending=new Map(),releaseStaging=budget?.reserve(Math.min(descriptor.blockBytes,descriptor.byteLength)*2);let serial=0,closed=false,cached=null,cachedOffset=-1,terminal;
 const fail=error=>{if(closed)return;closed=true;terminal=error;for(const task of pending.values())task.reject(error);pending.clear();cached=null;try{port.postMessage({closed:true});}catch{}port.close();};
 const protocol=installWorkerMessageProtocol(port,data=>{
  if(data.terminal){if(typeof data.terminal.code!=='string'||typeof data.terminal.message!=='string')throw workerMessageFailure('byte-broker-reader','message','invalid-terminal');fail(decode(data.terminal));return;}
  if(!Number.isSafeInteger(data.id)||!pending.has(data.id))throw workerMessageFailure('byte-broker-reader','message','unexpected-response-id');
  const task=pending.get(data.id);
  if(data.error){if(typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('byte-broker-reader','message','invalid-error');pending.delete(data.id);task.reject(decode(data.error));return;}
  if(task.op==='read'?!(data.buffer instanceof ArrayBuffer&&data.buffer.byteLength===task.length):data.buffer!==undefined)throw workerMessageFailure('byte-broker-reader','message','invalid-response-length');
  pending.delete(data.id);task.resolve(data.buffer);
 },{label:'byte-broker-reader',onFailure:fail});
 const peerClosed=()=>fail(new EngineError('CANCELLED','Byte broker owner closed.'));port.addEventListener?.('close',peerClosed);port.start();
 const request=(op,offset,length,buffer)=>new Promise((resolve,reject)=>{if(closed){reject(terminal??new EngineError('DISPOSED','Byte broker reader closed.'));return;}const id=++serial;pending.set(id,{resolve,reject,op,length});try{protocol.post({id,op,offset,length,buffer},buffer?[buffer]:[]);}catch(error){protocol.fail(error);}});
 const range=(bytes,offset)=>{const value=byteRange(bytes);requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=descriptor.byteLength-rangeLength(value),'Invalid broker range.');return value;};
 let disposed=false;
 return {byteLength:descriptor.byteLength,storage:descriptor.storage,transport:'broker',
  async readInto(target,offset=0){if(closed)throw terminal;const original=target;target=range(target,offset);const length=rangeLength(target);for(let done=0;done<length;){const at=offset+done;
   if(descriptor.writable){const n=Math.min(descriptor.blockBytes,length-done),buffer=await request('read',at,n);if(closed)throw terminal;byteView(target,done,n).set(new Uint8Array(buffer));done+=n;continue;}
   const block=Math.floor(at/descriptor.blockBytes)*descriptor.blockBytes;if(block!==cachedOffset){const buffer=await request('read',block,Math.min(descriptor.blockBytes,descriptor.byteLength-block));if(closed)throw terminal;cached=new Uint8Array(buffer);cachedOffset=block;}
   const within=at-block,n=Math.min(length-done,cached.length-within);byteView(target,done,n).set(cached.subarray(within,within+n));done+=n;
  }return original;},
  ...(descriptor.writable?{async write(source,offset=0){if(closed)throw terminal;source=range(source,offset);const length=rangeLength(source);for(let done=0;done<length;){const n=Math.min(descriptor.blockBytes,length-done),part=allocateTypedArray(Uint8Array,n,{label:'byte-broker-write'});part.set(byteView(source,done,n));await request('write',offset+done,n,part.buffer);done+=n;}},flush:()=>request('flush',0,0)}:{}),
  async dispose(){if(disposed)return;disposed=true;fail(new EngineError('CANCELLED','Byte broker reader stopped.'));protocol.dispose();port.removeEventListener?.('close',peerClosed);releaseStaging?.();}};
}
