import "../../runtime-context.js?v=0.14.5";
import {removeTerminatedTemporarySession} from './temporary-storage.js';
import {resolveComputeProfile} from './profiles.js';
import {EngineError,checkAbort} from './errors.js';
// One main worker, one internal codec thread. Storage jobs close owned handles
// cooperatively before termination, with a bounded forced-stop watchdog.
// D2PRL cooperatively cancels to preserve completed raw-grid caches. Its bounded
// fallback, storage jobs and other hard cancellations report cleared images.
export function createWorkerEngine(options={}) {
 const profile=resolveComputeProfile(options.computeProfile??'aggressive',options.resourceHints);
 options={...options,memoryBudgetBytes:options.memoryBudgetBytes??profile.memoryBudgetBytes,resourceHints:profile.hints};
 let worker,serial=0,disposed=false,active=false,ready,cancellationTimer,cancellationError;
 const pending=new Map(),storageOwners=new Map(),shutdownWaiters=[];let cleanupPending=Promise.resolve();
 async function cleanOwners(owners){const failures=[];for(const [id,record] of owners)for(const backend of record.backend?[record.backend]:['opfs','indexeddb'])try{await removeTerminatedTemporarySession(id,backend);}catch(e){failures.push({id,backend,code:e.code??e.name,message:e.message});}return failures;}
 function reset(error,{storageClosed=false}={}) {
  clearTimeout(cancellationTimer);cancellationError=null;
  worker?.terminate();worker=null;ready=null;
  const waiting=[...pending.values()],owners=storageClosed?[]:[...storageOwners];pending.clear();storageOwners.clear();active=false;
  const rejectAll=failures=>{if(failures?.length)error.temporaryCleanupFailures=failures;for(const p of waiting){p.cleanup();p.reject(error);}for(const resolve of shutdownWaiters.splice(0))resolve(failures??[]);};
  if(owners.length){cleanupPending=cleanupPending.then(()=>cleanOwners(owners));cleanupPending.then(rejectAll);}
  else rejectAll();return cleanupPending;
 }

 function stopWithStorageClose(error){
  const done=new Promise(resolve=>shutdownWaiters.push(resolve));
  if(!cancellationError){cancellationError=error;try{worker.postMessage({method:'cancel-and-close'});cancellationTimer=setTimeout(()=>{error.cancellationMode='forced-after-storage-close-timeout';reset(error);},1000);}catch{reset(error);}}
  return done;
 }

 function send(method,args=[],{signal,onProgress}={}) {
  checkAbort(signal);
  if(disposed)return Promise.reject(new EngineError('DISPOSED','Engine disposed.'));
  const sequence=++serial;
  return new Promise((resolve,reject)=>{
   let cooperativeTimer;
   const abort=()=>{
    if(method==='run'&&['analysis.complete','analysis.clones','ai.clones.d2prl','ai.clones.segmentation','tampering.copyMove.sparse','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(args[0]?.operation)&&!storageOwners.size&&worker){
     const error=new EngineError('CANCELLED','Model task cancelled; completed source and raw-grid caches retained.');error.imagesCleared=false;const entry=pending.get(sequence);if(!entry)return;entry.cancelled=error;
     try{worker.postMessage({method:'cancel-task',sequence});cooperativeTimer=setTimeout(()=>{const forced=new EngineError('CANCELLED','Cancellation timed out; reload sources and model manifest.');forced.imagesCleared=true;reset(forced);},5000);}catch{error.imagesCleared=true;reset(error);}return;
    }
    const error=new EngineError('CANCELLED','Task cancelled; reload image before the next run.');error.imagesCleared=true;if(storageOwners.size&&worker)stopWithStorageClose(error);else reset(error);
   };
   const cleanup=()=>{clearTimeout(cooperativeTimer);signal?.removeEventListener('abort',abort);};
   pending.set(sequence,{resolve,reject,cleanup,onProgress});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({sequence,method,args,options:method==='init'?options:undefined});}catch(e){pending.delete(sequence);cleanup();reject(e);}
  });
 }
 function ensure() {
  if(disposed)throw new EngineError('DISPOSED','Engine disposed.');
  if(!worker){
   worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});const created=worker;
   worker.onmessage=({data})=>{if(worker!==created)return;if(data.shutdownPhase){if(cancellationError)(cancellationError.cancellationPhases??=[]).push(data.shutdownPhase);return;}if(Object.hasOwn(data,'storageClosed')){if(cancellationError){const error=cancellationError;error.cancellationMode=data.storageClosed?'storage-closed-before-worker-termination':'forced-after-storage-close-failure';reset(error,{storageClosed:data.storageClosed});}return;}if(data.storageSession){let owner=storageOwners.get(data.storageSession.id);if(!owner){owner={dynamic:true};storageOwners.set(data.storageSession.id,owner);}owner.backend=data.storageSession.backend;return;}if(cancellationError)return;const p=pending.get(data.sequence);if(!p)return;if(data.progress){p.onProgress?.(data.progress);return;}pending.delete(data.sequence);p.cleanup();if(p.cancelled){p.reject(p.cancelled);return;}data.error?p.reject(new EngineError(data.error.code,data.error.message)):p.resolve(data.result);};
   worker.onerror=()=>{if(worker===created)reset(new EngineError('WORKER_FAILED','Worker stopped; reload image.'));};
   ready=send('init');
  }
  return ready;
 }
 async function call(method,args=[],hooks={}) {
  checkAbort(hooks.signal);if(active)throw new EngineError('BUSY','Another worker task is active.');active=true;
  try{await cleanupPending;await ensure();return await send(method,args,hooks);}finally{active=false;}
 }
 return {
  capabilities:()=>call('capabilities'),
  loadAutomaticModels:(input,hooks)=>call('loadAutomaticModels',[input],hooks),
  updateAutomatic:(request,hooks)=>call('updateAutomatic',[request],hooks),
  renderAutomatic:(request,hooks)=>call('renderAutomatic',[request],hooks),
  exportAutomatic:(request,hooks)=>call('exportAutomatic',[request],hooks),
  releaseAutomatic:()=>call('releaseAutomatic'),
  inspectMetadata:(input,hooks)=>call('inspectMetadata',[input],hooks),
  inspectHeaders:(input,hooks)=>call('inspectHeaders',[input],hooks),
  // A segmented RAM source may create storage later for owned results. Keep its
  // preallocated ID registered before that first write or cancellation can race it.
  async loadBlob(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('loadBlob',[{...input,temporarySessionId:id}],hooks);if(!['segmented-scanlines','segmented-strips-tiles'].includes(result.provenance.layout))storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  releaseSurface:id=>call('releaseSurface',[id]),
  readPlane:(request,hooks)=>call('readPlane',[request],hooks),
  readPixels:(request,hooks)=>call('readPixels',[request],hooks),readFlags:(request,hooks)=>call('readFlags',[request],hooks),readTable:(request,hooks)=>call('readTable',[request],hooks),readTableCsv:(request,hooks)=>call('readTableCsv',[request],hooks),readNpz:(request,hooks)=>call('readNpz',[request],hooks),releaseTable:id=>call('releaseTable',[id]),readMask:(request,hooks)=>call('readMask',[request],hooks),originalBlob:id=>call('originalBlob',[id]),deriveOriginal:(request,hooks)=>call('deriveOriginal',[request],hooks),readOriginal:(id,range,hooks)=>call('readOriginal',[id,range],hooks),
  load:(input,hooks)=>call('load',[input],hooks),run:(task,hooks)=>call('run',[task],hooks),
  async loadPrnuDatabase(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('loadPrnuDatabase',[{...input,temporarySessionId:id}],hooks);if(!result.metrics.temporaryBackend)storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  loadMedianModel:(input,hooks)=>call('loadMedianModel',[input],hooks),
  loadQualityModel:(input,hooks)=>call('loadQualityModel',[input],hooks),
  loadSegmentationModel:(input,hooks)=>call('loadSegmentationModel',[input],hooks),unloadSegmentationModel:()=>call('unloadSegmentationModel'),readSegmentationRaw:request=>call('readSegmentationRaw',[request]),
  loadM3Models:(input,hooks)=>call('loadM3Models',[input],hooks),unloadM3Models:()=>call('unloadM3Models'),
  loadD2prlModel:(input,hooks)=>call('loadD2prlModel',[input],hooks),unloadD2prlModel:()=>call('unloadD2prlModel'),
  readD2prlRaw:request=>call('readD2prlRaw',[request]),
  async buildPrnuDatabase(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('buildPrnuDatabase',[{...input,temporarySessionId:id}],hooks);if(!result.metrics.temporaryBackend)storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},exportPrnuDatabase:(id,hooks)=>call('exportPrnuDatabase',[id],hooks),
  async exportSurface(request,hooks){const id='job-'+crypto.randomUUID(),record={exportId:null,backend:null};storageOwners.set(id,record);try{const result=await call('exportSurface',[{...request,temporarySessionId:id}],hooks);if(result.metrics.storage==='temporary')record.exportId=result.id;else storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  async exportResultFile(result,request={},hooks){const id='job-'+crypto.randomUUID(),record={exportId:null,backend:null};storageOwners.set(id,record);try{const output=await call('exportResultFile',[result,{...request,temporarySessionId:id}],hooks);if(output.metrics.storage==='temporary')record.exportId=output.id;else storageOwners.delete(id);return output;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  readExport:(request,hooks)=>call('readExport',[request],hooks),
  async releaseExport(id){const result=await call('releaseExport',[id]);for(const [owner,record]of storageOwners)if(record.exportId===id)storageOwners.delete(owner);return result;},
  createPrnuDatabaseExport:(id,hooks)=>call('createPrnuDatabaseExport',[id],hooks),
  exportResult:(result,options,hooks)=>call('exportResult',[result,options],hooks),
  imagePixels:id=>call('imagePixels',[id]),original:id=>call('original',[id]),async unload(id){const result=await call('unload',[id]);for(const [owner,record] of storageOwners)if(record.imageId===id)storageOwners.delete(owner);return result;},
  dispose(){disposed=true;const error=new EngineError('DISPOSED','Engine disposed.');return storageOwners.size&&worker?stopWithStorageClose(error):reset(error);}
 };
}
