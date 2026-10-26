import {createExportSink} from './export-sink.js?v=0.25.0';
import {resolveComputeProfile} from './resource-policy.js?v=0.25.0';
import {withLocalActivity,localActivityFrozen} from './local-activity.js?v=0.25.0';

const CHUNK_BYTES=1024**2,JSON_COPY_MAX_BYTES=16*1024**2;
const jsonRecord=record=>record.mime.split(';')[0].trim().toLowerCase()==='application/json';
let sequence=0;
const MIME={png:'image/png',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',tif:'image/tiff',tiff:'image/tiff',avif:'image/avif',heic:'image/heic',heif:'image/heif',jxl:'image/jxl',jp2:'image/jp2',pdf:'application/pdf',npz:'application/zip',zip:'application/zip',json:'application/json',csv:'text/csv',h5:'application/x-hdf5'};
const failure=(code,message,details)=>Object.assign(new Error(message),{code,details});
const cancelled=()=>failure('CANCELLED','Download preparation cancelled.');
const once=callback=>{let task;return ()=>{if(task)return task;return task=Promise.resolve().then(()=>callback?.()).catch(error=>{task=null;throw error;});};};
const errorObject=value=>value!==null&&(typeof value==='object'||typeof value==='function');
// Ownership/secondary metadata cannot be written on a primitive. Keep it as an
// own cause instead of replacing it with a property-access TypeError.
export function withDownloadFailure(primary,fields){
 let error=errorObject(primary)&&Object.isExtensible(primary)?primary:new Error('Export failed: '+String(primary),{cause:primary});
 try{for(const [key,value]of Object.entries(fields))Object.defineProperty(error,key,{value,writable:true,configurable:true,enumerable:true});}
 catch{error=Object.assign(new Error('Export failed.',{cause:primary}),fields);}
 return error;
}
export function withDownloadCleanupFailure(primary,secondary,fields={}){return withDownloadFailure(primary,{...fields,downloadCleanupErrors:[...(Array.isArray(primary?.downloadCleanupErrors)?primary.downloadCleanupErrors:[]),secondary]});}

// A dispatched anchor is not an acknowledgement from the browser download host.
// Keep its URL and backing file together until explicit release or disposal.
export function createDownloadManager({document=globalThis.document,urlAPI=globalThis.URL,onChange,onError,memoryBudgetBytes=Math.floor(resolveComputeProfile().memoryBudgetBytes/3),sinkFactory=createExportSink,showSaveFilePicker,clipboard}={}){
 if(!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<=0)throw new TypeError('A positive download memory budget is required.');
 const records=new Map(),preparations=new Map(),retirements=new Set();let memoryBytes=0,disposed=false,disposal;
 const report=error=>{try{onError?.(error);}catch{}};
 const nativePicker=()=>{const owner=document?.defaultView??globalThis,picker=showSaveFilePicker??owner.showSaveFilePicker??globalThis.showSaveFilePicker;return typeof picker==='function'?{owner,picker}:null;};
 const describe=record=>({id:record.id,url:record.url,filename:record.filename,mime:record.mime,size:record.size,storage:record.storage,state:record.state,attempts:record.attempts,nativeSaveSupported:!!nativePicker(),saving:!!record.saveTask,releasing:!!record.retiring,jsonCopyEligible:jsonRecord(record),copying:!!record.copyTask,...(record.copyState?{copyState:record.copyState}:{}),...(record.copiedAt?{copiedAt:record.copiedAt}:{}),...(record.copyError?{copyError:record.copyError}:{}),...(record.releaseError?{releaseError:record.releaseError}:{}),...(record.saveState?{saveState:record.saveState}:{}),...(record.savedAt?{savedAt:record.savedAt}:{}),...(record.errorSet?{error:{code:record.error?.code??record.error?.name??'EXPORT_FAILED',message:record.error?.message??String(record.error)}}:{})});
 const snapshot=()=>Array.from(records.values(),describe);
 const publish=()=>{try{onChange?.(snapshot());}catch(error){report(error);}};
 const assertOpen=()=>{if(disposed)throw failure('DOWNLOAD_MANAGER_DISPOSED','The download manager is closed.');};
 function reserveMemory(size){
  if(size>memoryBudgetBytes-memoryBytes)throw failure('STORAGE_UNAVAILABLE','Temporary file storage is unavailable and the prepared files exceed the available download memory. Release a prepared file and retry.',{memoryBudgetBytes,retainedBytes:memoryBytes,requestedBytes:size});
  memoryBytes+=size;let released=false;return ()=>{if(!released){released=true;memoryBytes-=size;}};
 }
 function release(id){
  const record=records.get(typeof id==='object'?id.id:id);if(!record)return Promise.resolve();
  if(record.releaseTask)return record.releaseTask;
  record.retiring=true;record.state='releasing';record.releaseError=null;record.saveController?.abort();if(!record.urlRevoked){urlAPI.revokeObjectURL(record.url);record.urlRevoked=true;}publish();
  const task=Promise.allSettled([record.saveTask,record.copyTask]).then(()=>record.writerRetirement?.()).then(()=>record.cleanup()).then(()=>{record.freeMemory?.();record.blob=null;records.delete(record.id);}).catch(error=>{record.state='release-failed';record.releaseError={code:error?.code??error?.name??'DOWNLOAD_CLEANUP_FAILED',message:error?.message??String(error)};throw error;}).finally(()=>{if(record.releaseTask===task)record.releaseTask=null;publish();});
  record.releaseTask=task;task.catch(report);return task;
 }
 function dispatch(id){
  assertOpen();const record=records.get(typeof id==='object'?id.id:id);
  if(!record||record.retiring||record.releaseTask)throw failure('DOWNLOAD_RELEASED','The prepared file has been released.');
  if(record.copyTask)throw failure('DOWNLOAD_BUSY','Wait for the JSON copy to finish before dispatching.');
  let anchor;
  try{
   anchor=document.createElement('a');anchor.href=record.url;anchor.download=record.filename;anchor.rel='noopener';anchor.hidden=true;document.body.append(anchor);anchor.click();
   record.state='dispatched';record.attempts++;record.error=null;record.errorSet=false;publish();return record.lease;
  }catch(error){
   record.state='ready';record.error=error;record.errorSet=true;publish();
   throw withDownloadFailure(error,{downloadLease:record.lease,downloadOwnershipTransferred:true});
  }finally{anchor?.remove?.();}
 }
 function save(id,{signal}={}){
  let record,controller,abort;
  const attach=error=>record&&errorObject(error)?withDownloadFailure(error,{downloadLease:record.lease,downloadOwnershipTransferred:true}):error;
  try{
   assertOpen();record=records.get(typeof id==='object'?id.id:id);if(!record||record.retiring||record.releaseTask)throw failure('DOWNLOAD_RELEASED','The prepared file has been released.');
   if(record.saveTask)return record.saveTask;if(record.writerRetirement)throw failure('DOWNLOAD_CLEANUP_PENDING','The previous file writer has not acknowledged its cleanup. Release the prepared file and retry cleanup.');if(record.copyTask)return Promise.reject(failure('DOWNLOAD_BUSY','Wait for the JSON copy to finish before saving.'));
   const capability=nativePicker();if(!capability)throw failure('NATIVE_SAVE_UNAVAILABLE','This browser does not provide a native Save As file writer. The prepared download link is retained.');
   if(localActivityFrozen())throw failure('LOCAL_FROZEN','A local change is being activated; retry after it finishes.');
   controller=new AbortController();abort=()=>controller.abort(signal?.reason);if(signal?.aborted)throw cancelled();signal?.addEventListener('abort',abort,{once:true});
   const extension=record.filename.match(/\.[A-Za-z0-9][A-Za-z0-9_-]{0,14}$/)?.[0],mime=record.mime.split(';')[0];
   const pickerOptions={suggestedName:record.filename};
   if(extension&&/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mime))pickerOptions.types=[{description:record.filename,accept:{[mime]:[extension]}}];
   // Calling the picker before the first await preserves the user's gesture.
   const selection=capability.picker.call(capability.owner,pickerOptions);
   record.saveController=controller;record.saveState='picking';record.state='saving';record.savedAt=undefined;record.error=null;record.errorSet=false;
   const check=()=>{if(controller.signal.aborted||disposed||record.releaseTask)throw cancelled();};
   const task=withLocalActivity(async()=>{
    let writer,closed=false;
    try{
     const handle=await selection;check();writer=await handle.createWritable({keepExistingData:false});check();record.saveState='writing';publish();
     for(let offset=0;offset<record.size;offset+=CHUNK_BYTES){check();const bytes=new Uint8Array(await record.blob.slice(offset,offset+CHUNK_BYTES).arrayBuffer());check();await writer.write(bytes);check();}
     record.saveState='closing';publish();check();await writer.close();closed=true;
     record.savedAt=new Date().toISOString();record.saveState='saved';if(!record.releaseTask)record.state='saved';record.error=null;record.errorSet=false;publish();
     return {schema:'sherloq.native-file-save/1',confirmed:true,id:record.id,filename:record.filename,mime:record.mime,size:record.size,savedAt:record.savedAt};
    }catch(error){
     if(writer&&!closed){const retire=once(async()=>{await writer.abort();if(record.writerRetirement===retire)record.writerRetirement=null;});try{await retire();}catch(cleanupError){record.writerRetirement=retire;report(cleanupError);error=withDownloadCleanupFailure(error,cleanupError,{downloadCleanupPending:true});}}
     record.saveState=error?.code==='CANCELLED'||error?.name==='AbortError'?'cancelled':'failed';if(!record.releaseTask)record.state='ready';record.error=error;record.errorSet=true;publish();throw attach(error);
    }
   });
   record.saveTask=task;publish();
   const settle=()=>{signal?.removeEventListener('abort',abort);if(record.saveTask===task){record.saveTask=null;record.saveController=null;publish();}};
   task.then(settle,settle);return task;
  }catch(error){
   signal?.removeEventListener('abort',abort);if(record){record.saveState=error?.code==='CANCELLED'||error?.name==='AbortError'?'cancelled':'failed';record.error=error;record.errorSet=true;publish();}return Promise.reject(attach(error));
  }
 }
 function copyText(id){
  let record,freeScratch;
  try{
   assertOpen();record=records.get(typeof id==='object'?id.id:id);if(!record||record.retiring||record.releaseTask)throw failure('DOWNLOAD_RELEASED','The prepared file has been released.');
   if(record.copyTask)return record.copyTask;
   if(!jsonRecord(record))throw failure('JSON_COPY_UNAVAILABLE','Only an already prepared JSON file can be copied.');
   if(record.saveTask)throw failure('DOWNLOAD_BUSY','Wait for the prepared file save to finish before copying.');
   if(localActivityFrozen())throw failure('LOCAL_FROZEN','A local change is being activated; retry after it finishes.');
   const api=clipboard!==undefined?clipboard:(document?.defaultView?.navigator?.clipboard??globalThis.navigator?.clipboard);
   if(typeof api?.writeText!=='function')throw failure('CLIPBOARD_UNAVAILABLE','This browser cannot copy text here. The prepared file is retained.');
   if(record.size>JSON_COPY_MAX_BYTES)throw failure('JSON_COPY_LIMIT','This JSON exceeds the 16 MiB copy limit. Save the complete prepared file instead.',{bytes:record.size,maximumBytes:JSON_COPY_MAX_BYTES});
   const scratchBytes=5*record.size+65536;
   if(scratchBytes>memoryBudgetBytes-memoryBytes)throw failure('JSON_COPY_MEMORY_LIMIT','Not enough admitted memory to copy this JSON. The complete prepared file is retained.',{memoryBudgetBytes,retainedBytes:memoryBytes,requestedBytes:scratchBytes});
   freeScratch=reserveMemory(scratchBytes);const blob=record.blob;record.copyState='reading';record.copyError=null;record.copiedAt=undefined;
   const task=withLocalActivity(async()=>{
    try{
     const bytes=await blob.arrayBuffer();if(disposed||record.retiring||record.releaseTask)throw failure('CANCELLED','JSON copy cancelled before clipboard write.');
     let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch(cause){throw Object.assign(failure('JSON_COPY_UTF8','The prepared JSON is not valid UTF-8; its copy was refused without changing the file.'),{cause});}
     record.copyState='copying';publish();await api.writeText(text);
     record.copiedAt=new Date().toISOString();record.copyState='copied';record.copyError=null;
     return{schema:'sherloq.json-clipboard-copy/1',confirmed:true,id:record.id,filename:record.filename,bytes:record.size,copiedAt:record.copiedAt,decodedUTF8:true};
    }catch(error){record.copyState='failed';record.copyError={code:error?.code??error?.name??'JSON_COPY_FAILED',message:error?.message??String(error)};throw error;}
    finally{freeScratch();}
   });
   record.copyTask=task;publish();const settle=()=>{if(record.copyTask===task){record.copyTask=null;publish();}};task.then(settle,settle);return task;
  }catch(error){freeScratch?.();if(record){record.copyState='failed';record.copyError={code:error?.code??error?.name??'JSON_COPY_FAILED',message:error?.message??String(error)};publish();}return Promise.reject(error);}
 }
 async function prepare(value,filename,options,controller){
  let artifact,sink,freeMemory,owned=false,accepted=false,retirementBlocked=false;
  const incoming=value?.blob instanceof Blob?value:{blob:value instanceof Blob?value:new Blob([JSON.stringify(value,null,2)],{type:'application/json'})};
  const incomingCleanup=once(options.cleanup??incoming.cleanup);
  const signal=controller.signal;
  const check=()=>{assertOpen();if(signal.aborted)throw cancelled();};
  try{
   check();if(typeof filename!=='string'||!filename.trim()||/[\0\r\n]/.test(filename))throw new TypeError('A download filename is required.');
   const mime=options.mime??(incoming.blob.type&&incoming.blob.type!=='application/octet-stream'?incoming.blob.type:MIME[filename.split('.').at(-1).toLowerCase()]||incoming.blob.type||'application/octet-stream');
   const storage=options.storage??incoming.storage;
   if(storage==='opfs'||storage==='indexeddb')artifact={blob:incoming.blob,storage,cleanup:incomingCleanup};
   else{
    try{
     sink=await sinkFactory({memoryBudgetBytes,signal,mime,onOwner:owner=>{sink=owner;}});await sink.ready?.();check();
     if(sink.storage==='memory'){
      // With no OPFS, retain the existing Blob instead of copying its payload.
      try{await sink.abort();}catch(error){retirementBlocked=true;throw error;}sink=null;check();freeMemory=reserveMemory(incoming.blob.size);artifact={blob:incoming.blob,storage:'memory',cleanup:incomingCleanup};
     }else if(sink.storage==='opfs'){
      for(let offset=0;offset<incoming.blob.size;offset+=CHUNK_BYTES){check();const bytes=new Uint8Array(await incoming.blob.slice(offset,offset+CHUNK_BYTES).arrayBuffer());check();await sink.write(bytes);}
      check();artifact=await sink.finish();sink=null;owned=true;if(artifact.storage!=='opfs')throw failure('DOWNLOAD_STORAGE_INVALID','The download sink did not retain its disk storage identity.');
      try{await incomingCleanup();}catch(error){retirementBlocked=true;throw error;}
     }else throw failure('DOWNLOAD_STORAGE_INVALID','The download sink must identify its storage backend.');
    }catch(error){throw error;}
   }
   check();
   // The manager now owns the complete finished backing and, for memory,
   // its actual Blob credit. Only then may the copied native producer retire.
   await incoming.adoptPreparedFile?.({schema:'sherloq.prepared-file-adoption/1',bytes:artifact.blob.size,storage:artifact.storage,memoryCreditBytes:freeMemory?artifact.blob.size:0,backingOwned:true});
   check();
   if(artifact.blob.type!==mime)artifact.blob=new Blob([artifact.blob],{type:mime});
   const id='download-'+(++sequence),record={id,filename,mime,size:artifact.blob.size,blob:artifact.blob,storage:artifact.storage,cleanup:once(artifact.cleanup),freeMemory,state:'ready',attempts:0,error:null,errorSet:false};
   record.url=urlAPI.createObjectURL(record.blob);
   const lease={schema:'sherloq.download-lease/1',ownsTemporaryFile:true,id,filename,mime,size:record.size,storage:record.storage,can:{get nativeSaveSupported(){return !!nativePicker();}},get url(){return record.url;},get state(){return record.state;},get savedAt(){return record.savedAt;},dispatch:()=>dispatch(id),save:options=>save(id,options),copyText:()=>copyText(id),release:()=>release(id),toJSON:()=>describe(record)};
   record.lease=lease;records.set(id,record);accepted=true;publish();
   if(signal.aborted){await release(id);throw cancelled();}
   // A native Save As writer needs a fresh user gesture after preparation.
   // Keep the ready file in the shelf until its existing Save As button is used.
   if(options.autoDispatch===true||options.autoDispatch!==false&&!nativePicker())dispatch(id);
   return lease;
  }catch(error){
   if(!accepted){
    const retire=once(async()=>{if(sink){await sink.abort();sink=null;}if(owned){await artifact?.cleanup?.();owned=false;}await incomingCleanup();freeMemory?.();freeMemory=null;retirements.delete(retire);});
    if(retirementBlocked)retirements.add(retire);
    else try{await retire();}catch(cleanupError){retirements.add(retire);report(cleanupError);error=withDownloadCleanupFailure(error,cleanupError);}
   }
   throw withDownloadFailure(error,{downloadOwnershipTransferred:true,...(retirements.size?{downloadCleanupPending:true}:{})});
  }
 }
 function download(value,filename,options={}){
  const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  let started=false;
  const task=withLocalActivity(()=>{started=true;return prepare(value,filename,options,controller);}).catch(async error=>{if(!started){const retire=once(async()=>{await (options.cleanup??value?.cleanup)?.();retirements.delete(retire);});try{await retire();}catch(cleanupError){retirements.add(retire);report(cleanupError);error=withDownloadCleanupFailure(error,cleanupError);}error=withDownloadFailure(error,{downloadOwnershipTransferred:true,...(retirements.size?{downloadCleanupPending:true}:{})});}throw error;});preparations.set(task,controller);
  task.then(()=>{preparations.delete(task);options.signal?.removeEventListener('abort',abort);},()=>{preparations.delete(task);options.signal?.removeEventListener('abort',abort);});
  return task;
 }
 async function clear(){const results=await Promise.allSettled([...records.keys()].map(release).concat([...retirements].map(retire=>retire())));const errors=results.filter(value=>value.status==='rejected').map(value=>value.reason);if(errors.length)throw new AggregateError(errors,'Prepared download cleanup failed.');}
 function dispose(){
  if(disposal)return disposal;disposed=true;for(const controller of preparations.values())controller.abort();
  disposal=(async()=>{await Promise.allSettled([...preparations.keys()]);await clear();})().catch(error=>{disposal=null;throw error;});return disposal;
 }
 return {download,snapshot,dispatch,save,copyText,release,clear,dispose,get nativeSaveSupported(){return !!nativePicker();},get retainedMemoryBytes(){return memoryBytes;},get retainedFiles(){return records.size;},get pendingCleanupCount(){return retirements.size;}};
}
