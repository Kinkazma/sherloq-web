import {createExportSink} from './export-sink.js?v=0.23.0';
import {resolveComputeProfile} from './resource-policy.js?v=0.23.0';
import {withLocalActivity,localActivityFrozen} from './local-activity.js?v=0.23.0';

const CHUNK_BYTES=1024**2;
let sequence=0;
const MIME={png:'image/png',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',tif:'image/tiff',tiff:'image/tiff',avif:'image/avif',heic:'image/heic',heif:'image/heif',jxl:'image/jxl',jp2:'image/jp2',pdf:'application/pdf',npz:'application/zip',zip:'application/zip',json:'application/json',csv:'text/csv',h5:'application/x-hdf5'};
const failure=(code,message,details)=>Object.assign(new Error(message),{code,details});
const cancelled=()=>failure('CANCELLED','Download preparation cancelled.');
const once=callback=>{let task;return ()=>task??=Promise.resolve().then(()=>callback?.());};

// A dispatched anchor is not an acknowledgement from the browser download host.
// Keep its URL and backing file together until explicit release or disposal.
export function createDownloadManager({document=globalThis.document,urlAPI=globalThis.URL,onChange,onError,memoryBudgetBytes=Math.floor(resolveComputeProfile().memoryBudgetBytes/3),sinkFactory=createExportSink,showSaveFilePicker}={}){
 if(!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<=0)throw new TypeError('A positive download memory budget is required.');
 const records=new Map(),preparations=new Map();let memoryBytes=0,disposed=false,disposal;
 const report=error=>{try{onError?.(error);}catch{}};
 const nativePicker=()=>{const owner=document?.defaultView??globalThis,picker=showSaveFilePicker??owner.showSaveFilePicker??globalThis.showSaveFilePicker;return typeof picker==='function'?{owner,picker}:null;};
 const describe=record=>({id:record.id,url:record.url,filename:record.filename,mime:record.mime,size:record.size,storage:record.storage,state:record.state,attempts:record.attempts,nativeSaveSupported:!!nativePicker(),saving:!!record.saveTask,...(record.saveState?{saveState:record.saveState}:{}),...(record.savedAt?{savedAt:record.savedAt}:{}),...(record.error?{error:{code:record.error.code??record.error.name,message:record.error.message}}:{})});
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
  record.state='releasing';record.saveController?.abort();urlAPI.revokeObjectURL(record.url);publish();
  record.releaseTask=Promise.resolve(record.saveTask).catch(()=>{}).then(()=>record.cleanup()).finally(()=>{record.freeMemory?.();record.blob=null;records.delete(record.id);publish();});
  record.releaseTask.catch(report);return record.releaseTask;
 }
 function dispatch(id){
  assertOpen();const record=records.get(typeof id==='object'?id.id:id);
  if(!record||record.releaseTask)throw failure('DOWNLOAD_RELEASED','The prepared file has been released.');
  let anchor;
  try{
   anchor=document.createElement('a');anchor.href=record.url;anchor.download=record.filename;anchor.rel='noopener';anchor.hidden=true;document.body.append(anchor);anchor.click();
   record.state='dispatched';record.attempts++;record.error=null;publish();return record.lease;
  }catch(error){
   record.state='ready';record.error=error;publish();
   error.downloadLease=record.lease;error.downloadOwnershipTransferred=true;throw error;
  }finally{anchor?.remove?.();}
 }
 function save(id,{signal}={}){
  let record,controller,abort;
  const attach=error=>{if(record){error.downloadLease=record.lease;error.downloadOwnershipTransferred=true;}return error;};
  try{
   assertOpen();record=records.get(typeof id==='object'?id.id:id);if(!record||record.releaseTask)throw failure('DOWNLOAD_RELEASED','The prepared file has been released.');
   if(record.saveTask)return record.saveTask;
   const capability=nativePicker();if(!capability)throw failure('NATIVE_SAVE_UNAVAILABLE','This browser does not provide a native Save As file writer. The prepared download link is retained.');
   if(localActivityFrozen())throw failure('LOCAL_FROZEN','A local change is being activated; retry after it finishes.');
   controller=new AbortController();abort=()=>controller.abort(signal?.reason);if(signal?.aborted)throw cancelled();signal?.addEventListener('abort',abort,{once:true});
   const extension=record.filename.match(/\.[A-Za-z0-9][A-Za-z0-9_-]{0,14}$/)?.[0],mime=record.mime.split(';')[0];
   const pickerOptions={suggestedName:record.filename};
   if(extension&&/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mime))pickerOptions.types=[{description:record.filename,accept:{[mime]:[extension]}}];
   // Calling the picker before the first await preserves the user's gesture.
   const selection=capability.picker.call(capability.owner,pickerOptions);
   record.saveController=controller;record.saveState='picking';record.state='saving';record.savedAt=undefined;record.error=null;
   const check=()=>{if(controller.signal.aborted||disposed||record.releaseTask)throw cancelled();};
   const task=withLocalActivity(async()=>{
    let writer,closed=false;
    try{
     const handle=await selection;check();writer=await handle.createWritable({keepExistingData:false});check();record.saveState='writing';publish();
     for(let offset=0;offset<record.size;offset+=CHUNK_BYTES){check();const bytes=new Uint8Array(await record.blob.slice(offset,offset+CHUNK_BYTES).arrayBuffer());check();await writer.write(bytes);check();}
     record.saveState='closing';publish();check();await writer.close();closed=true;
     record.savedAt=new Date().toISOString();record.saveState='saved';if(!record.releaseTask)record.state='saved';record.error=null;publish();
     return {schema:'sherloq.native-file-save/1',confirmed:true,id:record.id,filename:record.filename,mime:record.mime,size:record.size,savedAt:record.savedAt};
    }catch(error){
     if(writer&&!closed)try{await writer.abort();}catch(cleanupError){report(cleanupError);}
     record.saveState=error.code==='CANCELLED'||error.name==='AbortError'?'cancelled':'failed';if(!record.releaseTask)record.state='ready';record.error=error;publish();throw attach(error);
    }
   });
   record.saveTask=task;publish();
   const settle=()=>{signal?.removeEventListener('abort',abort);if(record.saveTask===task){record.saveTask=null;record.saveController=null;publish();}};
   task.then(settle,settle);return task;
  }catch(error){
   signal?.removeEventListener('abort',abort);if(record){record.saveState=error.code==='CANCELLED'||error.name==='AbortError'?'cancelled':'failed';record.error=error;publish();}return Promise.reject(attach(error));
  }
 }
 async function prepare(value,filename,options,controller){
  let artifact,freeMemory,owned=false,accepted=false;
  const incoming=value?.blob instanceof Blob?value:{blob:value instanceof Blob?value:new Blob([JSON.stringify(value,null,2)],{type:'application/json'})};
  const incomingCleanup=once(options.cleanup??incoming.cleanup);
  const signal=controller.signal;
  const check=()=>{assertOpen();if(signal.aborted)throw cancelled();};
  try{
   check();if(typeof filename!=='string'||!filename.trim()||/[\0\r\n]/.test(filename))throw new TypeError('A download filename is required.');
   const mime=options.mime??(incoming.blob.type&&incoming.blob.type!=='application/octet-stream'?incoming.blob.type:MIME[filename.split('.').at(-1).toLowerCase()]||incoming.blob.type||'application/octet-stream');
   const storage=options.storage??incoming.storage;
   if(storage==='opfs')artifact={blob:incoming.blob,storage,cleanup:incomingCleanup};
   else{
    let sink;try{
     sink=await sinkFactory({memoryBudgetBytes,signal,mime});check();
     if(sink.storage==='memory'){
      // With no OPFS, retain the existing Blob instead of copying its payload.
      await sink.abort();sink=null;check();freeMemory=reserveMemory(incoming.blob.size);artifact={blob:incoming.blob,storage:'memory',cleanup:incomingCleanup};
     }else if(sink.storage==='opfs'){
      for(let offset=0;offset<incoming.blob.size;offset+=CHUNK_BYTES){check();const bytes=new Uint8Array(await incoming.blob.slice(offset,offset+CHUNK_BYTES).arrayBuffer());check();await sink.write(bytes);}
      check();artifact=await sink.finish();sink=null;owned=true;if(artifact.storage!=='opfs')throw failure('DOWNLOAD_STORAGE_INVALID','The download sink did not retain its disk storage identity.');
      await incomingCleanup();
     }else throw failure('DOWNLOAD_STORAGE_INVALID','The download sink must identify its storage backend.');
    }catch(error){await sink?.abort().catch(report);throw error;}
   }
   check();
   if(artifact.blob.type!==mime)artifact.blob=new Blob([artifact.blob],{type:mime});
   const id='download-'+(++sequence),record={id,filename,mime,size:artifact.blob.size,blob:artifact.blob,storage:artifact.storage,cleanup:once(artifact.cleanup),freeMemory,state:'ready',attempts:0,error:null};
   record.url=urlAPI.createObjectURL(record.blob);
   const lease={schema:'sherloq.download-lease/1',ownsTemporaryFile:true,id,filename,mime,size:record.size,storage:record.storage,can:{get nativeSaveSupported(){return !!nativePicker();}},get url(){return record.url;},get state(){return record.state;},get savedAt(){return record.savedAt;},dispatch:()=>dispatch(id),save:options=>save(id,options),release:()=>release(id),toJSON:()=>describe(record)};
   record.lease=lease;records.set(id,record);accepted=true;publish();
   if(signal.aborted){await release(id);throw cancelled();}
   if(options.autoDispatch!==false)dispatch(id);
   return lease;
  }catch(error){
   if(!accepted){freeMemory?.();if(owned)await once(artifact?.cleanup)().catch(report);await incomingCleanup().catch(report);}
   error.downloadOwnershipTransferred=true;
   throw error;
  }
 }
 function download(value,filename,options={}){
  const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  let started=false;
  const task=withLocalActivity(()=>{started=true;return prepare(value,filename,options,controller);}).catch(async error=>{if(!started){await once(options.cleanup??value?.cleanup)().catch(report);error.downloadOwnershipTransferred=true;}throw error;});preparations.set(task,controller);
  task.then(()=>{preparations.delete(task);options.signal?.removeEventListener('abort',abort);},()=>{preparations.delete(task);options.signal?.removeEventListener('abort',abort);});
  return task;
 }
 async function clear(){const results=await Promise.allSettled([...records.keys()].map(release));const errors=results.filter(value=>value.status==='rejected').map(value=>value.reason);if(errors.length)throw new AggregateError(errors,'Prepared download cleanup failed.');}
 function dispose(){
  if(disposal)return disposal;disposed=true;for(const controller of preparations.values())controller.abort();
  disposal=(async()=>{await Promise.allSettled([...preparations.keys()]);await clear();})();return disposal;
 }
 return {download,snapshot,dispatch,save,release,clear,dispose,get nativeSaveSupported(){return !!nativePicker();},get retainedMemoryBytes(){return memoryBytes;},get retainedFiles(){return records.size;}};
}
