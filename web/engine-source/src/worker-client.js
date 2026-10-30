import {applicationNeuralWindowClientService,neuralWindowApplicationSnapshot} from './neural-window-client-service.js';
import {createNeuralWindowClientLink} from './neural-window-client-link.js';
import {engineWorkerURL} from './engine-worker-entry.js';
import {removeTerminatedTemporarySession} from './temporary-storage.js';
import {resolveComputeProfile} from './profiles.js';
import {readExtensionMemoryHints} from './browser-memory.js';
import {EngineError,checkAbort,deserializeEngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
// One main worker, one internal codec thread. Storage jobs close owned handles
// cooperatively before termination, with a bounded forced-stop watchdog.
// Automatic run/resume/presentation cancellation waits for actual cooperative
// settlement, retaining source storage and checkpoints. Explicit destruction
// and fatal transport failures still close storage and report cleared images.
// Only the qualified bounded-window path may retain Original during cancel.
// Whole-image and all other historical cancellation routes remain unchanged.
export function cooperativeColorWindows(task){
 const d=task?.sourceRegionDomain,s=d?.snapshot,p=task?.params,n=s?.width*s?.height;
 return task?.operation==='noise.separation'&&p?.mode===0&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=10&&typeof p.grayscale==='boolean'&&['cpu','webgpu','auto'].includes(task.backend??'auto')&&d?.schema==='sherloq.source-region-domain/1'&&s?.schema==='sherloq.source-regions/1'&&typeof d.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(d.fingerprint)&&typeof s.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(s.sourceSha256)&&Number.isSafeInteger(s.width)&&s.width>0&&Number.isSafeInteger(s.height)&&s.height>0&&Number.isSafeInteger(n)&&Number.isSafeInteger(d.countIncluded)&&d.countIncluded>0&&d.countIncluded<n&&Number.isSafeInteger(d.width)&&d.width>0&&Number.isSafeInteger(d.height)&&d.height>0&&d.width<=s.width&&d.height<=s.height&&d.countIncluded<d.width*d.height;
}
export function createWorkerEngine(options={}) {
 const {memoryHintProvider,memoryExtensionId,...workerOptions}=options;options=workerOptions;
 const memoryReader=memoryHintProvider??(memoryExtensionId?()=>readExtensionMemoryHints(memoryExtensionId):null);
 const profile=resolveComputeProfile(options.computeProfile??'aggressive',options.resourceHints);
 options={...options,resourceHints:profile.hints};
 let worker,serial=0,disposed=false,active=false,ready,cancellationTimer,cancellationError;
 let initialized=false,sentWork=false,initializationFlight,initializationRetryUsed=false,initializationDiagnostic;
 let memoryTimer,memoryReading=false,memoryGeneration=0;
 async function refreshMemory(){
  if(!memoryReader||memoryReading||disposed||!active||!worker)return;
  memoryReading=true;const generation=memoryGeneration,created=worker;
  try{const hints=await memoryReader();if(hints&&active&&!disposed&&worker===created&&generation===memoryGeneration)await send('updateResourceHints',[hints]);}
  catch{/* Optional observation failure retains the last policy; useful work continues. */}
  finally{memoryReading=false;if(active&&!disposed&&worker===created&&generation===memoryGeneration)memoryTimer=setTimeout(refreshMemory,2000);}
 }
 const neuralWindowLinks=new Map();
 async function retireNeuralWindowLinks(){let failed=false,primary;for(const [created,row]of [...neuralWindowLinks])if(row.retiring)try{await row.link.close();created.terminate();neuralWindowLinks.delete(created);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 const pending=new Map(),storageOwners=new Map(),shutdownWaiters=[],externalCacheOwners=new Map(),prnuBuildRetirements=new Map();let cleanupPending=Promise.resolve();
 // Only terminated-worker PRNU sessions enter this local retry ledger. A live
 // failed builder still owns its stores through the engine's transform ledger.
 function retireTerminatedPrnuBuild(id,record){
  let owner=prnuBuildRetirements.get(id);if(!owner){owner={record,backends:new Set(record.backend?[record.backend]:['opfs','indexeddb']),pending:null};prnuBuildRetirements.set(id,owner);}if(owner.pending)return owner.pending;
  const task=(async()=>{let failed=false,primary;for(const backend of [...owner.backends])try{await removeTerminatedTemporarySession(id,backend);owner.backends.delete(backend);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;prnuBuildRetirements.delete(id);})();owner.pending=task;void task.finally(()=>{if(owner.pending===task)owner.pending=null;}).catch(()=>{});return task;
 }
 async function drainPrnuBuildRetirements(){let failed=false,primary;for(const [id,owner]of [...prnuBuildRetirements])try{await retireTerminatedPrnuBuild(id,owner.record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}

 async function cleanOwners(owners){const failures=[];for(const [id,record] of owners){if(record.prnuBuild){try{await retireTerminatedPrnuBuild(id,record);}catch(error){failures.push({id,backend:record.backend??null,code:error?.code??error?.name,message:String(error?.message??error)});}continue;}for(const backend of record.backend?[record.backend]:['opfs','indexeddb'])try{await removeTerminatedTemporarySession(id,backend);}catch(e){failures.push({id,backend,code:e.code??e.name,message:e.message});}}return failures;}
 function reset(error,{storageClosed=false,preserveUnsentOwners=false,preserveActive=false,imagesCleared=true}={}) {
  clearTimeout(memoryTimer);memoryGeneration++;
  error.imagesCleared=imagesCleared;
  if(error.details?.retainedAnalysis){const {retainedAnalysis,...details}=error.details;error.details=details;}
  clearTimeout(cancellationTimer);cancellationError=null;
  const stopped=worker,row=stopped&&neuralWindowLinks.get(stopped);if(row){row.retiring=true;cleanupPending=cleanupPending.catch(()=>{}).then(retireNeuralWindowLinks);}else stopped?.terminate();worker=null;ready=null;
  const external=[...externalCacheOwners.values()];externalCacheOwners.clear();if(external.length)cleanupPending=cleanupPending.then(()=>Promise.allSettled(external.map(retire=>retire())));
  const waiting=[...pending.values()],kept=preserveUnsentOwners?[...storageOwners].filter(([,record])=>!record.sent&&!record.backend):[],keptIds=new Set(kept.map(([id])=>id)),owners=storageClosed?[]:[...storageOwners].filter(([id])=>!keptIds.has(id));pending.clear();storageOwners.clear();for(const [id,record]of kept)storageOwners.set(id,record);if(!preserveActive)active=false;
  const rejectAll=failures=>{if(failures?.length)error.temporaryCleanupFailures=failures;for(const p of waiting){p.cleanup();p.reject(p.callbackPrimary?p.callbackPrimary.error:error);}for(const resolve of shutdownWaiters.splice(0))resolve(failures??[]);};
  if(owners.length){cleanupPending=cleanupPending.then(()=>cleanOwners(owners));cleanupPending.then(rejectAll,failure=>rejectAll([{code:failure?.code??'NEURAL_WINDOW_RETIREMENT',message:String(failure?.message??failure)}]));}
  else if(external.length||row)cleanupPending.then(()=>rejectAll(),failure=>rejectAll([{code:failure?.code??'NEURAL_WINDOW_RETIREMENT',message:String(failure?.message??failure)}]));else rejectAll();return cleanupPending;
 }

 function stopWithStorageClose(error){
  const done=new Promise(resolve=>shutdownWaiters.push(resolve));
  if(!cancellationError){cancellationError=error;try{worker.postMessage({method:'cancel-and-close'});cancellationTimer=setTimeout(()=>{error.cancellationMode='forced-after-storage-close-timeout';reset(error);},1000);}catch{reset(error);}}
  return done;
 }

 function send(method,args=[],{signal,onProgress}={}) {
  checkAbort(signal);
  if(disposed)return Promise.reject(new EngineError('DISPOSED','Engine disposed.'));
  const sequence=++serial,ocrNative=method==='run'&&args[0]?.operation==='various.ocr'&&args[0]?.params?.algorithm==='tesseract';
  return new Promise((resolve,reject)=>{
   let cooperativeTimer;
   const abort=()=>{
    const retainedD2Preview=method==='run'&&args[0]?.operation==='ai.clones.d2prl'&&typeof args[0]?.params?.refilterOf==='string'&&args[0].params.refilterOf.trim().length>0;
    if((retainedD2Preview||['previewParameters','localizeRetainedParameters','renderRetainedNativeParameters'].includes(method))&&worker){const error=new EngineError('CANCELLED','Provisional parameter view cancelled cooperatively.');error.imagesCleared=false;const entry=pending.get(sequence);if(!entry)return;entry.cancelled=error;entry.retainedFinal=retainedD2Preview||['localizeRetainedParameters','renderRetainedNativeParameters'].includes(method);try{worker.postMessage({method:'cancel-task',sequence});}catch(cause){error.cause=cause;reset(error);}return;}
    if(['capabilities','describeUsefulOperation'].includes(method)){const p=pending.get(sequence);if(p){pending.delete(sequence);p.cleanup();p.reject(new EngineError('CANCELLED','Diagnostic read cancelled.'));}return;}
    const automatic=['resumeAutomatic','updateAutomatic','renderAutomatic','previewAutomaticD2','exportAutomatic'].includes(method)||method==='run'&&['analysis.complete','analysis.clones'].includes(args[0]?.operation);
    const extensions=['loadExtensionModels','runExtensions'].includes(method)||method==='run'&&['ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'].includes(args[0]?.operation);
    const cooperativeSparseClone=method==='run'&&args[0]?.operation==='tampering.copyMove.sparse'&&['SIFT','RootSIFT','SIFT + G2NN + RANSAC','XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR'].includes(args[0]?.params?.algorithm??'SIFT + G2NN + RANSAC');
    const cooperativeSsg=method==='run'&&args[0]?.operation==='tampering.copyMove.sparse'&&args[0]?.params?.algorithm==='SSG'&&args[0]?.backend!=='webgpu';const cooperativePrnuBuild=method==='buildPrnuDatabase';const cooperativeNlm=method==='run'&&args[0]?.operation==='noise.separation'&&args[0]?.params?.mode===4&&['cpu','webgpu'].includes(args[0]?.backend);const cooperativeTesseract=method==='run'&&args[0]?.operation==='various.ocr'&&args[0]?.params?.algorithm==='tesseract';const cooperativeCompute=method==='run'&&cooperativeColorWindows(args[0])||cooperativeTesseract||cooperativeNlm||cooperativePrnuBuild||cooperativeSsg||cooperativeSparseClone||method==='run'&&['colors.stats','noise.planes','noise.minmax','pixels.defects','noise.separation','tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','tampering.resampling','detail.wavelets','noise.blocking','various.stereogram','noise.noisesniffer','ela.classic','jpeg.quality','jpeg.recompression','comparison.image','noise.prnu','jpeg.zero','tampering.resampling.fourier','tampering.copyMove.dense','ela.energy','jpeg.ghosts','ela.biomes','jpeg.multiple'].includes(args[0]?.operation);
    const model=method==='run'&&['ai.clones.d2prl','ai.clones.segmentation','tampering.copyMove.sparse','ai.sources.safire','ai.localization.focal','ai.localization.adaifl'].includes(args[0]?.operation);
    if(worker&&(automatic||extensions||cooperativeCompute||model&&!storageOwners.size)){
     const error=new EngineError('CANCELLED','Task cancelled cooperatively.');error.imagesCleared=false;const entry=pending.get(sequence);if(!entry)return;entry.cancelled=error;entry.automatic=automatic||extensions;entry.retainedFinal=cooperativeCompute;
     try{
      worker.postMessage({method:'cancel-task',sequence});
      // Draining owned I/O can take arbitrarily long without losing liveness.
      // Automatic checkpoints are destroyed only by explicit shutdown or a
      // real worker failure, never by elapsed cancellation time alone.
      if(!automatic&&!extensions&&!cooperativeCompute)cooperativeTimer=setTimeout(()=>{const forced=new EngineError('CANCELLED','Cancellation timed out; reload sources and model manifest.');forced.cancellationMode='forced-after-task-cancel-timeout';reset(forced);},5000);
     }catch(cause){error.cause=cause;error.cancellationMode='forced-after-cancel-message-failure';reset(error);}return;
    }
    const error=new EngineError('CANCELLED','Task cancelled; reload image before the next run.');error.imagesCleared=true;if(storageOwners.size&&worker)stopWithStorageClose(error);else reset(error);
   };
   const cleanup=()=>{clearTimeout(cooperativeTimer);signal?.removeEventListener('abort',abort);};
   pending.set(sequence,{resolve,reject,cleanup,onProgress,ocrNative,cancel:abort});signal?.addEventListener('abort',abort,{once:true});
   try{worker.postMessage({sequence,method,args,options:method==='init'?{...options,neuralWindowGpuAvailable:!!globalThis.navigator?.gpu}:undefined});if(!['init','capabilities','updateResourceHints'].includes(method)){sentWork=true;const session=args[0]?.temporarySessionId??args[1]?.temporarySessionId;if(session&&storageOwners.has(session))storageOwners.get(session).sent=true;}}catch(e){pending.delete(sequence);cleanup();reject(e);}
  });
 }
 function startWorker() {
  if(disposed)throw new EngineError('DISPOSED','Engine disposed.');
  if(!worker){
   const workerURL=engineWorkerURL(import.meta.url);try{worker=new Worker(workerURL,{type:'module'});}catch(cause){throw new EngineError('WORKER_FAILED',cause?.message||'Browser engine worker could not be created.',{cause,details:{phase:'worker-create',workerURL:workerURL.href}});}const created=worker;
   const control=data=>{if(worker!==created)return true;if(data.neuralWindowRequest){let row=neuralWindowLinks.get(created);if(!row){const service=applicationNeuralWindowClientService({limitBytes:options.memoryBudgetBytes??profile.memoryBudgetBytes,onOwner:()=>{}});row={link:null,retiring:false};neuralWindowLinks.set(created,row);row.link=createNeuralWindowClientLink({worker:created,service,onOwner:owner=>{row.link=owner;},onFailure:error=>failed(error)});}return row.link.accept(data);}if(data.externalCacheReclaim){const request=data.externalCacheReclaim;if(!Number.isSafeInteger(request.ticket)||request.ticket<1||typeof request.id!=='string'||!request.id||!Number.isSafeInteger(request.bytes)||request.bytes<1)throw workerMessageFailure('engine-client','message','invalid-external-cache-reclaim');const retire=externalCacheOwners.get(request.id),reply=(error,hasFailure=false)=>{if(worker!==created)return;try{created.postMessage({method:'external-cache-retired',sequence:request.ticket,args:hasFailure?[{error:serializeEngineError(error)}]:[]});}catch(cause){failed(new EngineError('WORKER_MESSAGE_FAILED','External cache acknowledgement could not be sent.',{cause}));}};void Promise.resolve().then(()=>{if(!retire)throw new EngineError('EXTERNAL_CACHE_OWNER_MISSING','External cache owner is unavailable.');return retire();}).then(()=>{externalCacheOwners.delete(request.id);reply();},error=>reply(error,true));return true;}if(data.shutdownPhase){if(cancellationError)(cancellationError.cancellationPhases??=[]).push(data.shutdownPhase);return true;}if(typeof data.storageClosed==='boolean'){if(cancellationError){const error=cancellationError;error.cancellationMode=data.storageClosed?'storage-closed-before-worker-termination':'forced-after-storage-close-failure';reset(error,{storageClosed:data.storageClosed});}return true;}if(data.storageSession){let owner=storageOwners.get(data.storageSession.id);if(!owner){owner={dynamic:true};storageOwners.set(data.storageSession.id,owner);}owner.backend=data.storageSession.backend;return true;}return false;};
   const failed=error=>{if(worker!==created)return;if(!initialized&&!sentWork){reset(error,{preserveUnsentOwners:true,preserveActive:true,imagesCleared:false});return;}error.imagesCleared=true;if(storageOwners.size){
    // The failed useful-message channel is latched closed. A separate guarded
    // shutdown receiver must still consume its storage-close acknowledgement.
    installWorkerMessageProtocol(created,control,{label:'engine-shutdown',onFailure:()=>reset(error)});void stopWithStorageClose(error);
   }else reset(error);};
   installWorkerMessageProtocol(worker,data=>{if(worker!==created||control(data))return;if(data.fatal){failed(deserializeEngineError(data.fatal));return;}if(cancellationError)return;if(!Number.isSafeInteger(data.sequence)||!['progress','result','error'].some(key=>Object.hasOwn(data,key)))throw workerMessageFailure('engine-client','message','invalid-response');const p=pending.get(data.sequence);if(!p)return;if(data.progress){try{p.onProgress?.(data.progress);}catch(error){if(!p.ocrNative)throw error;p.callbackPrimary??={error};p.cancel();}return;}pending.delete(data.sequence);p.cleanup();if(p.callbackPrimary){p.reject(p.callbackPrimary.error);return;}if(p.cancelled){
    // Completion can win the race with the cancellation control message.
    // Its published owned result is a success, not a new cancelled checkpoint.
    if(!data.error&&(p.automatic||p.retainedFinal)){p.resolve(data.result);return;}
    const error=data.error?deserializeEngineError(data.error):p.cancelled;error.imagesCleared=false;
    p.reject(error);return;
   }data.error?p.reject(deserializeEngineError(data.error)):p.resolve(data.result);},{label:'engine-client',onFailure:failed});
   worker.onerror=event=>{if(worker===created){const cold=!initialized&&!sentWork;reset(new EngineError('WORKER_FAILED',event?.message||'Worker stopped; reload image.',{cause:event?.error,details:{phase:cold?'worker-startup':'worker-execution',workerURL:workerURL.href,workerEvent:{type:event?.type,filename:event?.filename,line:event?.lineno,column:event?.colno}}}),{preserveUnsentOwners:cold,preserveActive:cold,imagesCleared:!cold});}};
   ready=send('init');
  }
  return ready;
 }
 function ensure(){
  if(disposed)throw new EngineError('DISPOSED','Engine disposed.');if(initializationFlight)return initializationFlight;if(worker)return ready;
  initializationFlight=(async()=>{
   let firstError;
   for(;;){
    let created;
    try{const opening=startWorker();created=worker;const value=await opening;initialized=true;if(firstError)initializationDiagnostic={attempts:2,recovered:true,firstError:serializeEngineError(firstError)};return value;}
    catch(error){
     const cold=!initialized&&!sentWork;
     if(worker===created&&worker)reset(error,{preserveUnsentOwners:cold,preserveActive:cold,imagesCleared:!cold});
     else if(cold)error.imagesCleared=false;
     await cleanupPending;
     if(!disposed&&cold&&!initializationRetryUsed&&error.code==='WORKER_LOAD_FAILED'&&error.details?.phase==='module-load'&&error.details?.retryable===true){initializationRetryUsed=true;firstError=error;continue;}
     if(firstError){const failure=new EngineError(error.code??'WORKER_LOAD_FAILED',error.message,{cause:error,details:{...error.details,workerInitialization:{attempts:2,recovered:false,firstError:serializeEngineError(firstError)}}});failure.stack=error.stack;failure.imagesCleared=error.imagesCleared;throw failure;}
     throw error;
    }
   }
  })().finally(()=>{initializationFlight=null;});return initializationFlight;
 }
 async function call(method,args=[],hooks={}) {
  checkAbort(hooks.signal);if(active)throw new EngineError('BUSY','Another worker task is active.');active=true;
  try{await cleanupPending;await drainPrnuBuildRetirements();await ensure();void refreshMemory();return await send(method,args,hooks);}finally{active=false;clearTimeout(memoryTimer);}
 }
 return {
  async updateResourceHints(hints){await cleanupPending;await drainPrnuBuildRetirements();await ensure();return send('updateResourceHints',[hints]);},
  describeUsefulOperation:(input,hooks)=>call('describeUsefulOperation',[input],hooks),
  async capabilities(hooks={}){checkAbort(hooks.signal);await cleanupPending;await drainPrnuBuildRetirements();await ensure();const value=await send('capabilities',[],hooks);return{...value,...(initializationDiagnostic?{workerInitialization:structuredClone(initializationDiagnostic)}:{}),...(neuralWindowApplicationSnapshot()?{windowNeuralRuntime:neuralWindowApplicationSnapshot()}:{})};},
  loadAutomaticModels:(input,hooks)=>call('loadAutomaticModels',[input],hooks),
  resumeAutomatic:(request,hooks)=>call('resumeAutomatic',[request],hooks),
  updateAutomatic:(request,hooks)=>call('updateAutomatic',[request],hooks),
  renderAutomatic:(request,hooks)=>call('renderAutomatic',[request],hooks),
  previewAutomaticD2:(request,hooks)=>call('previewAutomaticD2',[request],hooks),
  exportAutomatic:(request,hooks)=>call('exportAutomatic',[request],hooks),
  releaseAutomatic:()=>call('releaseAutomatic'),
  inspectMetadata:(input,hooks)=>call('inspectMetadata',[input],hooks),
  inspectHeaders:(input,hooks)=>call('inspectHeaders',[input],hooks),
  deriveSourceRegionInput:(input,hooks)=>call('deriveSourceRegionInput',[input],hooks),
  // A segmented RAM source may create storage later for owned results. Keep its
  // preallocated ID registered before that first write or cancellation can race it.
  async loadBlob(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('loadBlob',[{...input,temporarySessionId:id}],hooks);if(!['segmented-scanlines','segmented-strips-tiles','paged-rgb'].includes(result.provenance.layout))storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  releaseSurface:id=>call('releaseSurface',[id]),
  readDisplay:(request,hooks)=>call('readDisplay',[request],hooks),
  readPlane:(request,hooks)=>call('readPlane',[request],hooks),
  readPixels:(request,hooks)=>call('readPixels',[request],hooks),readFlags:(request,hooks)=>call('readFlags',[request],hooks),readTable:(request,hooks)=>call('readTable',[request],hooks),readTableCsv:(request,hooks)=>call('readTableCsv',[request],hooks),readNpz:(request,hooks)=>call('readNpz',[request],hooks),releaseTable:id=>call('releaseTable',[id]),readMask:(request,hooks)=>call('readMask',[request],hooks),originalBlob:id=>call('originalBlob',[id]),deriveOriginal:(request,hooks)=>call('deriveOriginal',[request],hooks),readOriginal:(id,range,hooks)=>call('readOriginal',[id,range],hooks),
  load:(input,hooks)=>call('load',[input],hooks),previewParameters:(task,{preview={},...hooks}={})=>call('previewParameters',[task,preview],hooks),localizeRetainedParameters:(task,hooks)=>call('localizeRetainedParameters',[task],hooks),renderRetainedNativeParameters:(input,hooks)=>call('renderRetainedNativeParameters',[input],hooks),run:(task,hooks)=>call('run',[task],hooks),
  async loadPrnuDatabase(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('loadPrnuDatabase',[{...input,temporarySessionId:id}],hooks);if(!result.metrics.temporaryBackend)storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  loadMedianModel:(input,hooks)=>call('loadMedianModel',[input],hooks),
  loadQualityModel:(input,hooks)=>call('loadQualityModel',[input],hooks),
  loadSegmentationModel:(input,hooks)=>call('loadSegmentationModel',[input],hooks),unloadSegmentationModel:()=>call('unloadSegmentationModel'),readSegmentationRaw:request=>call('readSegmentationRaw',[request]),
  describeOcrUsefulWork:(input,hooks)=>call('describeOcrUsefulWork',[input],hooks),
  loadOcrModels:(input,hooks)=>call('loadOcrModels',[input],hooks),unloadOcrModels:()=>call('unloadOcrModels'),
  loadM3Models:(input,hooks)=>call('loadM3Models',[input],hooks),unloadM3Models:()=>call('unloadM3Models'),
  loadExtensionModels:(input,hooks)=>call('loadExtensionModels',[input],hooks),unloadExtensionModels:()=>call('unloadExtensionModels'),runExtensions:(task,hooks)=>call('runExtensions',[task],hooks),
  loadD2prlModel:(input,hooks)=>call('loadD2prlModel',[input],hooks),unloadD2prlModel:()=>call('unloadD2prlModel'),
  readD2prlRaw:request=>call('readD2prlRaw',[request]),
  async buildPrnuDatabase(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null,prnuBuild:true};storageOwners.set(id,record);try{
   const result=await call('buildPrnuDatabase',[{...input,temporarySessionId:id}],hooks);if(!result.metrics.temporaryBackend)storageOwners.delete(id);
   // A successful subsequent build has passed the engine's mandatory pending
   // retirement drain. Its failed predecessors no longer need parent metadata.
   for(const [oldId,old]of storageOwners)if(old.prnuBuildFailed&&old.failedWorker===worker)storageOwners.delete(oldId);return result;
  }catch(error){
   if(storageOwners.get(id)===record){if(worker&&record.backend){record.prnuBuildFailed=true;record.failedWorker=worker;}else if(!record.backend)storageOwners.delete(id);}
   // No external removal while the native worker is alive, and no mutation of
   // a primitive/frozen primary. Fatal reset owns terminated-session cleanup.
   throw error;
  }},exportPrnuDatabase:(id,hooks)=>call('exportPrnuDatabase',[id],hooks),
  async exportSurface(request,hooks){const id='job-'+crypto.randomUUID(),record={exportId:null,backend:null};storageOwners.set(id,record);try{const result=await call('exportSurface',[{...request,temporarySessionId:id}],hooks);if(result.metrics.storage==='temporary')record.exportId=result.id;else storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  async exportResultFile(result,request={},hooks){const id='job-'+crypto.randomUUID(),record={exportId:null,backend:null};storageOwners.set(id,record);try{const output=await call('exportResultFile',[result,{...request,temporarySessionId:id}],hooks);if(output.metrics.storage==='temporary')record.exportId=output.id;else storageOwners.delete(id);return output;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  async reserveExternalCache(request,{onReclaim}={}){if(typeof onReclaim!=='function')throw new EngineError('INVALID_INPUT','External cache retirement callback required.');const entry=await call('reserveExternalCache',[request]);if(!entry||typeof entry.id!=='string'||!entry.id||entry.bytes!==request.bytes){const error=new EngineError('WORKER_MESSAGE_FAILED','Invalid external cache reservation response.');if(storageOwners.size&&worker)await stopWithStorageClose(error);else await reset(error);throw error;}let flight;externalCacheOwners.set(entry.id,()=>flight??=(async()=>onReclaim())().catch(error=>{flight=null;throw error;}));return entry;},
  updateExternalCache:request=>call('updateExternalCache',[request]),
  async releaseExternalCache(id){const answer=await call('releaseExternalCache',[id]);externalCacheOwners.delete(id);return answer;},
  reserveExternalMemory:request=>call('reserveExternalMemory',[request]),
  releaseExternalMemory:id=>call('releaseExternalMemory',[id]),
  readExport:(request,hooks)=>call('readExport',[request],hooks),
  async releaseExport(id){const result=await call('releaseExport',[id]);for(const [owner,record]of storageOwners)if(record.exportId===id)storageOwners.delete(owner);return result;},
  createPrnuDatabaseExport:(id,hooks)=>call('createPrnuDatabaseExport',[id],hooks),
  exportResult:(result,options,hooks)=>call('exportResult',[result,options],hooks),
  imagePixels:id=>call('imagePixels',[id]),original:id=>call('original',[id]),async unload(id){const result=await call('unload',[id]);for(const [owner,record] of storageOwners)if(record.imageId===id)storageOwners.delete(owner);return result;},
  dispose(){disposed=true;clearTimeout(memoryTimer);memoryGeneration++;const error=new EngineError('DISPOSED','Engine disposed.');const closing=storageOwners.size&&worker?stopWithStorageClose(error):reset(error);return Promise.resolve(closing).then(()=>drainPrnuBuildRetirements()).then(()=>({windowNeuralRuntime:neuralWindowApplicationSnapshot()}));}
 };
}
