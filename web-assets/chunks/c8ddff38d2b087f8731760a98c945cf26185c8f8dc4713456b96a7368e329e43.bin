// Job-scoped origin-private storage. Requires a dedicated worker for sync I/O.
// No user-visible file picker, persistence request, remote endpoint or native mmap.
import {EngineError,requireValue,checkAbort} from './errors.js';
// Keep physical files below browser sync-handle signed-size limits. Logical
// arrays and callers retain safe-integer offsets across these exact byte shards.
const FILE_BYTES=1024**3;
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
 // advisory, including quota (Chromium can report usage +10GiB for privacy).
 // Only an explicit caller allowance bounds logical arrays;
 // real I/O quota failures remain authoritative and are never hidden.
 const estimatedAvailable=capability.quotaBytes===null||capability.usageBytes===null?Infinity:Math.max(0,capability.quotaBytes-capability.usageBytes),limit=maximumBytes,files=new Map(),pending=new Set();let reserved=0,peak=0,serial=0,disposed=false,disposing;
 function alive(){if(disposed)throw new EngineError('DISPOSED','Temporary session disposed.');}
 function close(record){let first;for(const part of record.parts)if(!part.closed)try{part.handle.close();part.closed=true;}catch(error){first??=error;}if(first)throw first;record.closed=true;}
 function remove(record){if(record.removing)return record.removing;if(!files.has(record.id))return Promise.resolve();record.removing=(async()=>{try{close(record);for(const part of record.parts)await directory.removeEntry(part.name);files.delete(record.id);reserved-=record.byteLength;}catch(error){throw storageError(error);}})();return record.removing;}
 return {
  id,capability,
  snapshot:()=>({reservedBytes:reserved,peakReservedBytes:peak,estimatedAvailableBytes:Number.isFinite(estimatedAvailable)?estimatedAvailable:null,estimateIsAdmissionLimit:false,logicalLimitBytes:Number.isFinite(limit)?limit:null,openFiles:files.size,physicalFiles:[...files.values()].reduce((n,r)=>n+r.parts.filter(p=>!p.closed).length,0),maximumPhysicalFileBytes:FILE_BYTES}),
  async create(byteLength,{signal}={}){
   alive();checkAbort(signal);requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0,'Invalid temporary array length.');if(byteLength>limit-reserved)throw new EngineError('STORAGE_QUOTA','Planned temporary arrays exceed the explicit storage allowance.');
   reserved+=byteLength;peak=Math.max(peak,reserved);const name='array-'+(++serial);
   const operation=(async()=>{const parts=[];
   try{
    for(let index=0;index<Math.max(1,Math.ceil(byteLength/FILE_BYTES));index++){
     alive();checkAbort(signal);const part={name:index?name+'-'+index:name,handle:null,closed:false};
     const file=await directory.getFileHandle(part.name,{create:true});parts.push(part);
     part.handle=await file.createSyncAccessHandle();alive();checkAbort(signal);
     const length=Math.min(FILE_BYTES,byteLength-index*FILE_BYTES);part.handle.truncate(length);
     const actual=part.handle.getSize();if(actual!==length)throw new EngineError('STORAGE_IO','Temporary file size differs after allocation: requested '+length+', actual '+actual+', logical array '+byteLength+', reserved '+reserved+'.');
    }
    const record={id:name,parts,byteLength,closed:false};files.set(name,record);
    function transfer(bytes,offset,writing){
     alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');
     requireValue(bytes instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-bytes.length,'Invalid temporary byte range.');
     try{let done=0;while(done<bytes.length){const at=offset+done,index=Math.floor(at/FILE_BYTES),within=at%FILE_BYTES,length=Math.min(bytes.length-done,FILE_BYTES-within),part=bytes.subarray(done,done+length),handle=parts[index].handle;
      const count=writing?handle.write(part,{at:within}):handle.read(part,{at:within});
      if(!Number.isSafeInteger(count)||count<=0||count>length)throw new EngineError('STORAGE_IO',writing?'Incomplete temporary array write.':'Unexpected end of temporary array.');
      done+=count;
     }return writing?undefined:bytes;}catch(error){throw storageError(error);}
    }
    return {byteLength,readInto:(target,offset)=>transfer(target,offset,false),write:(source,offset)=>transfer(source,offset,true),
     flush(){alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');try{for(const part of parts)part.handle.flush();}catch(error){throw storageError(error);}},
     dispose:()=>remove(record)};
   }catch(error){for(const part of parts){try{if(part.handle&&!part.closed){part.handle.close();part.closed=true;}}catch{}try{await directory.removeEntry(part.name);}catch{}}reserved-=byteLength;throw storageError(error);}})();pending.add(operation);operation.then(()=>pending.delete(operation),()=>pending.delete(operation));return operation;
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=(async()=>{await Promise.allSettled([...pending]);await Promise.allSettled([...files.values()].map(r=>r.removing).filter(Boolean));let first;for(const r of files.values())if(!r.closed)try{close(r);}catch(e){first??=e;}try{await parent.removeEntry(id,{recursive:true});files.clear();reserved=0;}catch(e){first??=e;}if(first)throw storageError(first);})();return disposing;}
 };
}
export async function removeTerminatedTemporarySession(id){
 requireValue(typeof id==='string'&&validId(id),'Invalid owned temporary session ID.');
 const root=await navigator.storage.getDirectory();let parent;try{parent=await root.getDirectoryHandle(ROOT_NAME);}catch(e){if(e.name==='NotFoundError')return;throw storageError(e);}
 // A terminated worker may release its file lock asynchronously. Never remove
 // the entire namespace or another session as a cleanup shortcut.
 for(let attempt=0;attempt<9;attempt++)try{await parent.removeEntry(id,{recursive:true});return;}catch(e){if(e.name==='NotFoundError')return;if(attempt===8||!['NoModificationAllowedError','InvalidStateError'].includes(e.name))throw storageError(e);await new Promise(resolve=>setTimeout(resolve,Math.min(250,10*2**attempt)));}
}
