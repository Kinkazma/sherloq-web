// Job-scoped origin-private storage. Requires a dedicated worker for sync I/O.
// No user-visible file picker, persistence request, remote endpoint or native mmap.
import {EngineError,requireValue,checkAbort} from './errors.js';
const ROOT_NAME='sherloq-temporary-v1',validId=id=>/^job-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
function storageError(error){if(error instanceof EngineError)return error;return new EngineError(error?.name==='QuotaExceededError'?'STORAGE_QUOTA':error?.name==='NotSupportedError'?'STORAGE_UNAVAILABLE':'STORAGE_IO','Temporary browser storage failed ('+(error?.name??'unknown')+').');}
export async function temporaryStorageCapabilities(){
 const storage=globalThis.navigator?.storage;if(!storage?.getDirectory)return {available:false,reason:'Origin-private file storage unavailable',quotaBytes:null,usageBytes:null};
 let estimate={};try{estimate=await storage.estimate();}catch{}
 return {available:typeof FileSystemFileHandle!=='undefined'&&typeof FileSystemFileHandle.prototype.createSyncAccessHandle==='function',requiresDedicatedWorker:true,quotaBytes:Number.isFinite(estimate.quota)?estimate.quota:null,usageBytes:Number.isFinite(estimate.usage)?estimate.usage:null,estimateIsReservation:false};
}
export async function createTemporarySession({signal,maximumBytes=Infinity,id:requestedId}={}){
 checkAbort(signal);requireValue(maximumBytes===Infinity||Number.isSafeInteger(maximumBytes)&&maximumBytes>=0,'Invalid storage allowance.');
 const capability=await temporaryStorageCapabilities();if(!capability.available)throw new EngineError('STORAGE_UNAVAILABLE','Origin-private synchronous file access is unavailable in this context.');
 let parent,directory;const id=requestedId??'job-'+crypto.randomUUID();requireValue(validId(id),'Invalid owned temporary session ID.');
 try{const root=await navigator.storage.getDirectory();parent=await root.getDirectoryHandle(ROOT_NAME,{create:true});try{await parent.getDirectoryHandle(id);throw new EngineError('STORAGE_BUSY','Temporary session ID already exists.');}catch(e){if(e.name!=='NotFoundError')throw e;}directory=await parent.getDirectoryHandle(id,{create:true});checkAbort(signal);}catch(error){if(directory)try{await parent.removeEntry(id,{recursive:true});}catch{}throw storageError(error);}
 // Usage estimates may remain high after deleted jobs; free-space estimates are
 // advisory. Explicit allowances and the total origin quota bound logical arrays;
 // real I/O quota failures remain authoritative and are never hidden.
 const estimatedAvailable=capability.quotaBytes===null||capability.usageBytes===null?Infinity:Math.max(0,capability.quotaBytes-capability.usageBytes),limit=Math.min(maximumBytes,capability.quotaBytes??Infinity),files=new Map(),pending=new Set();let reserved=0,peak=0,serial=0,disposed=false,disposing;
 function alive(){if(disposed)throw new EngineError('DISPOSED','Temporary session disposed.');}
 function remove(record){if(record.removing)return record.removing;if(!files.has(record.id))return Promise.resolve();record.removing=(async()=>{try{record.handle.close();record.closed=true;await directory.removeEntry(record.id);files.delete(record.id);reserved-=record.byteLength;}catch(error){throw storageError(error);}})();return record.removing;}
 return {
  id,capability,
  snapshot:()=>({reservedBytes:reserved,peakReservedBytes:peak,estimatedAvailableBytes:Number.isFinite(estimatedAvailable)?estimatedAvailable:null,estimateIsAdmissionLimit:false,logicalLimitBytes:Number.isFinite(limit)?limit:null,openFiles:files.size}),
  async create(byteLength,{signal}={}){
   alive();checkAbort(signal);requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0,'Invalid temporary array length.');if(byteLength>limit-reserved)throw new EngineError('STORAGE_QUOTA','Planned temporary arrays exceed the origin quota estimate or explicit allowance.');
   reserved+=byteLength;peak=Math.max(peak,reserved);const name='array-'+(++serial);
   const operation=(async()=>{let handle,created=false;
   try{const file=await directory.getFileHandle(name,{create:true});created=true;handle=await file.createSyncAccessHandle();alive();checkAbort(signal);handle.truncate(byteLength);const record={id:name,handle,byteLength,closed:false};files.set(name,record);return {
    byteLength,
    readInto(target,offset){alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-target.length,'Invalid temporary read range.');try{let done=0;while(done<target.length){const n=handle.read(target.subarray(done),{at:offset+done});if(!Number.isSafeInteger(n)||n<=0)throw new EngineError('STORAGE_IO','Unexpected end of temporary array.');done+=n;}return target;}catch(e){throw storageError(e);}},
    write(source,offset){alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');requireValue(source instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-source.length,'Invalid temporary write range.');try{let done=0;while(done<source.length){const n=handle.write(source.subarray(done),{at:offset+done});if(!Number.isSafeInteger(n)||n<=0)throw new EngineError('STORAGE_IO','Incomplete temporary array write.');done+=n;}}catch(e){throw storageError(e);}},
    flush(){alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');try{handle.flush();}catch(e){throw storageError(e);}},
    dispose:()=>remove(record)
   };}catch(error){try{handle?.close();}catch{}if(created)try{await directory.removeEntry(name);}catch{}reserved-=byteLength;throw storageError(error);}})();pending.add(operation);operation.then(()=>pending.delete(operation),()=>pending.delete(operation));return operation;
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=(async()=>{await Promise.allSettled([...pending]);await Promise.allSettled([...files.values()].map(r=>r.removing).filter(Boolean));let first;for(const r of files.values())if(!r.closed)try{r.handle.close();r.closed=true;}catch(e){first??=e;}try{await parent.removeEntry(id,{recursive:true});files.clear();reserved=0;}catch(e){first??=e;}if(first)throw storageError(first);})();return disposing;}
 };
}
export async function removeTerminatedTemporarySession(id){
 requireValue(typeof id==='string'&&validId(id),'Invalid owned temporary session ID.');
 const root=await navigator.storage.getDirectory();let parent;try{parent=await root.getDirectoryHandle(ROOT_NAME);}catch(e){if(e.name==='NotFoundError')return;throw storageError(e);}
 // A terminated worker may release its file lock asynchronously. Never remove
 // the entire namespace or another session as a cleanup shortcut.
 for(let attempt=0;attempt<9;attempt++)try{await parent.removeEntry(id,{recursive:true});return;}catch(e){if(e.name==='NotFoundError')return;if(attempt===8||!['NoModificationAllowedError','InvalidStateError'].includes(e.name))throw storageError(e);await new Promise(resolve=>setTimeout(resolve,Math.min(250,10*2**attempt)));}
}
