import {NATIVE_PREVIEW_FINANCE,createNativePreviewFinanceRegistry,capturedNativePreviewTermination} from './native-preview-peer-finance.js';
import {CAPTURED_OWNERSHIP_CONTROL,createCapturedOwnershipRegistry} from './captured-ownership-control.js';
import {applicationNeuralWindowClientService,neuralWindowApplicationSnapshot} from './neural-window-client-service.js';
import {createNeuralWindowClientLink} from './neural-window-client-link.js';
import {createSourceSamplesControlClient} from './source-samples-control.js';
import {engineWorkerURL} from './engine-worker-entry.js';
import {removeTerminatedTemporarySession} from './temporary-storage.js';
import {resolveComputeProfile} from './profiles.js';
import {readExtensionMemoryHints} from './browser-memory.js';
import {EngineError,checkAbort,deserializeEngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
// One main worker, one internal codec thread. Storage jobs close owned handles
// cooperatively before termination, with a bounded forced-stop watchdog.
// Source loads and automatic run/resume/presentation cancellation wait for cooperative
// settlement, retaining source storage and checkpoints. Explicit destruction
// and fatal transport failures still close storage and report cleared images.
// Read windows/pages settle cooperatively before the caller releases their
// owned bytes. Obsolete reads must not destroy the canonical Original shared
// by other panels. Load/model/archive-creation cancellation remains separate.
const COOPERATIVE_READ_METHODS=new Set(['readDisplay','readPixels','readNativePixels','readPlane','readMask','readFlags','readTable','readTableCsv','readNpz','readOriginal','readExport']);
export function cooperativeColorWindows(task){
 const d=task?.sourceRegionDomain,s=d?.snapshot,p=task?.params,n=s?.width*s?.height;
 return task?.operation==='noise.separation'&&p?.mode===0&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=10&&typeof p.grayscale==='boolean'&&['cpu','webgpu','auto'].includes(task.backend??'auto')&&d?.schema==='sherloq.source-region-domain/1'&&s?.schema==='sherloq.source-regions/1'&&typeof d.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(d.fingerprint)&&typeof s.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(s.sourceSha256)&&Number.isSafeInteger(s.width)&&s.width>0&&Number.isSafeInteger(s.height)&&s.height>0&&Number.isSafeInteger(n)&&Number.isSafeInteger(d.countIncluded)&&d.countIncluded>0&&d.countIncluded<n&&Number.isSafeInteger(d.width)&&d.width>0&&Number.isSafeInteger(d.height)&&d.height>0&&d.width<=s.width&&d.height<=s.height&&d.countIncluded<d.width*d.height;
}
export function createWorkerEngine(options={}) {
 const {memoryHintProvider,memoryExtensionId,provisionalDisplayOnly=false,...workerOptions}=options;options=workerOptions;
 const memoryReader=memoryHintProvider??(memoryExtensionId?()=>readExtensionMemoryHints(memoryExtensionId):null);
 const profile=resolveComputeProfile(options.computeProfile??'aggressive',options.resourceHints);
 options={...options,resourceHints:profile.hints};
 let worker,serial=0,disposed=false,active=false,ready,cancellationTimer,cancellationError;
 let initialized=false,sentWork=false,initializationFlight,initializationRetryUsed=false,initializationDiagnostic,aiDetectorsOwned=false;
 let memoryTimer,memoryReading=false,memoryGeneration=0;
 let capturedOwnership;
 const capturedOriginals=new Map(),capturedRetirements=new Map();
 const capturedBinding=value=>value?.surface?{imageId:value.id,sourceSurfaceId:value.surface.id,sourceRevision:value.surface.revision,sourceSha256:value.sha256,nativeSurfaceId:value.nativeSurface?.id??null,nativeRevision:value.nativeSurface?.revision??null}:null;
 const capturedRegistry=()=>capturedOwnership??=createCapturedOwnershipRegistry({
  isPeerCurrent:peer=>worker===peer&&!disposed&&!cancellationError,
  getBinding:(peer,id)=>worker===peer?capturedOriginals.get(id):null,
  execute:async(method,args,{peer,ticket,signal})=>{
   checkAbort(signal);if(active)throw new EngineError('BUSY','Another worker task is active.');active=true;
   try{await cleanupPending;await drainTerminatedStorage();checkAbort(signal);if(worker!==peer||disposed||cancellationError)throw new EngineError('WORKER_RETIRED','Captured control cannot use a replacement peer.');return await send(method,args,{signal,capturedTicket:ticket});}finally{active=false;}
  },
  requestPeerRetirement:peer=>{if(worker===peer)return reset(new EngineError('WORKER_MESSAGE_FAILED','Captured ownership reply requires retirement of its actual peer.'));const resume=capturedRetirements.get(peer);return resume?resume():Promise.reject(new EngineError('WORKER_RETIRED','Captured ownership has no retirement provider.'));}
 });
 async function refreshMemory(){
  if(!memoryReader||memoryReading||disposed||!active||!worker)return;
  memoryReading=true;const generation=memoryGeneration,created=worker;
  try{const hints=await memoryReader();if(hints&&active&&!disposed&&worker===created&&generation===memoryGeneration)await send('updateResourceHints',[hints]);}
  catch{/* Optional observation failure retains the last policy; useful work continues. */}
  finally{memoryReading=false;if(active&&!disposed&&worker===created&&generation===memoryGeneration)memoryTimer=setTimeout(refreshMemory,2000);}
 }
 let nativePresentationRegistry;
 const nativeFinanceRegistry=()=>nativePresentationRegistry??=createNativePreviewFinanceRegistry({
  isPeerCurrent:created=>worker===created&&!disposed&&!cancellationError,
  admit:async(request,{peer:captured,onPeer,group})=>{
   if(active)throw new EngineError('BUSY','Another worker task is active.');active=true;
   try{await cleanupPending;await drainTerminatedStorage();if(!captured){await ensure();captured=worker;}
    if(worker!==captured||disposed||cancellationError)throw new EngineError('WORKER_RETIRED','Native presentation admission cannot change its captured peer.');
    onPeer(captured);const lease=await send('reserveExternalMemory',[request],{nativePresentationGroup:group});
    if(!lease||typeof lease.id!=='string'||!lease.id||lease.bytes!==request.bytes){const failure=new EngineError('WORKER_MESSAGE_FAILED','Invalid captured external memory receipt.');reset(failure);throw failure;}return{lease};
   }finally{active=false;}
  },
  releaseCaptured:async(lease,captured,group)=>{
   if(worker!==captured||disposed||cancellationError)throw new EngineError('WORKER_RETIRED','The captured native presentation peer is unavailable.');
   if(active)throw new EngineError('BUSY','The useful task must settle before presentation retirement.');active=true;
   try{return await send('releaseExternalMemory',[lease.id],{nativePresentationGroup:group});}finally{active=false;}
  }
 });
 let sourceSamplesLinks,sourceSamplesReceipts,sourceSamplesTerminations;
 const sourceSamplesLink=created=>{let link=sourceSamplesLinks?.get(created);if(!link){link=createSourceSamplesControlClient({worker:created,canPost:()=>worker===created});sourceSamplesLinks??=new Map();sourceSamplesLinks.set(created,link);}return link;};
 const neuralWindowLinks=new Map();
 async function retireNeuralWindowLinks(){let failed=false,primary;for(const [created,row]of [...neuralWindowLinks])if(row.retiring)try{await row.link.close();created.terminate();neuralWindowLinks.delete(created);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 const pending=new Map(),storageOwners=new Map(),shutdownWaiters=[],externalCacheOwners=new Map(),terminatedStorageRetirements=new Map();let cleanupPending=Promise.resolve();
 // This retry ledger records storage cleanup after worker retirement. A live
 // failed import keeps its registration until the Core acknowledges retirement.
 function retireTerminatedStorage(id,record){
  let owner=terminatedStorageRetirements.get(id);if(!owner){owner={record,backends:new Set(record.backend?[record.backend]:record.loadBlob
    ?[...(globalThis.navigator?.storage?.getDirectory?['opfs']:[]),...(globalThis.indexedDB?['indexeddb']:[])]
    :['opfs','indexeddb']),pending:null};terminatedStorageRetirements.set(id,owner);}if(owner.pending)return owner.pending;
  const task=(async()=>{let failed=false,primary;for(const backend of [...owner.backends])try{await removeTerminatedTemporarySession(id,backend);owner.backends.delete(backend);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;terminatedStorageRetirements.delete(id);})();owner.pending=task;void task.finally(()=>{if(owner.pending===task)owner.pending=null;}).catch(()=>{});return task;
 }
 async function drainTerminatedStorage(){let failed=false,primary;for(const [id,owner]of [...terminatedStorageRetirements])try{await retireTerminatedStorage(id,owner.record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}

 async function cleanOwners(owners){const failures=[];for(const [id,record] of owners){if(record.prnuBuild||record.loadBlob){try{await retireTerminatedStorage(id,record);}catch(error){failures.push({id,backend:record.backend??null,code:error?.code??error?.name,message:String(error?.message??error)});}continue;}for(const backend of record.backend?[record.backend]:['opfs','indexeddb'])try{await removeTerminatedTemporarySession(id,backend);}catch(e){failures.push({id,backend,code:e.code??e.name,message:e.message});}}return failures;}
 function reset(error,{storageClosed=false,preserveUnsentOwners=false,preserveActive=false,imagesCleared=true}={}) {
  clearTimeout(memoryTimer);memoryGeneration++;
  error.imagesCleared=imagesCleared;
  if(error.details?.retainedAnalysis){const {retainedAnalysis,...details}=error.details;error.details=details;}
  clearTimeout(cancellationTimer);cancellationError=null;
  const stopped=worker,row=stopped&&neuralWindowLinks.get(stopped),samples=sourceSamplesLinks?.get(stopped),nativeOwned=!!stopped&&nativePresentationRegistry?.hasPeer(stopped),capturedOwned=!!stopped&&capturedOwnership?.hasPeer(stopped),nativeTermination=nativeOwned||capturedOwned?capturedNativePreviewTermination(stopped):null;
  if(!samples){if(row){row.retiring=true;if(!nativeOwned&&!capturedOwned)cleanupPending=cleanupPending.catch(()=>{}).then(retireNeuralWindowLinks);}else if(!nativeOwned&&!capturedOwned)stopped?.terminate();}
  worker=null;ready=null;aiDetectorsOwned=false;samples?.peerUnavailable();
  if(imagesCleared)capturedOriginals.clear();
  const external=[...externalCacheOwners.values()];externalCacheOwners.clear();
  const waiting=[...pending.values()],kept=preserveUnsentOwners?[...storageOwners].filter(([,record])=>!record.sent&&!record.backend):[],keptIds=new Set(kept.map(([id])=>id)),owners=[...storageOwners].filter(([id,record])=>!keptIds.has(id)&&(!storageClosed||record.loadBlobRetirement==='terminated-worker'));pending.clear();storageOwners.clear();for(const [id,record]of kept)storageOwners.set(id,record);if(!preserveActive)active=false;
  // Only newly financed native producers/admissions are settled early. Their
  // local owners may be waiting for these exact promises before retirement.
  if(nativeOwned||capturedOwned)for(let i=waiting.length-1;i>=0;i--)if(waiting[i].nativePresentationGroup||waiting[i].capturedTicket){const p=waiting.splice(i,1)[0];p.cleanup();const failure=p.capturedTicket?new EngineError(error.code??'WORKER_RETIRED',error.message,{cause:error}):error;if(p.capturedTicket)failure.imagesCleared=imagesCleared;p.reject(p.callbackPrimary?p.callbackPrimary.error:failure);}
  let registerCapturedCertificate;
  if(capturedOwned){const registration=new Promise(resolve=>registerCapturedCertificate=resolve);capturedOwnership.peerUnavailable(stopped,{certificate:()=>registration.then(provider=>provider()),resume:()=>{const resume=capturedRetirements.get(stopped);return resume?resume():Promise.reject(new EngineError('WORKER_RETIRED','Captured retirement has not started.'));}});}
  const rejectAll=failures=>{if(failures?.length)error.temporaryCleanupFailures=failures;for(const p of waiting){p.cleanup();p.reject(p.callbackPrimary?p.callbackPrimary.error:error);}for(const resolve of shutdownWaiters.splice(0))resolve(failures??[]);};
  if(samples){
   // This captured retirement can be retried by a child holding an adopted
   // receipt. Its completed stages never run again and its Worker never changes.
   const prior=cleanupPending;
   let retiring,neuralClosed=false,terminationAccepted=false,externalRetired=false,certificate;
   const resume=()=>{
    if(retiring)return retiring;
    const task=prior.then(async()=>{
     let resolveNativeCertificate,rejectNativeCertificate,nativeDrain,capturedDrain;
     if(nativeOwned||capturedOwned){const certificateAttempt=new Promise((resolve,reject)=>{resolveNativeCertificate=resolve;rejectNativeCertificate=reject;});void certificateAttempt.catch(()=>{});
      if(nativeOwned){nativeDrain=nativePresentationRegistry.peerRetiring(stopped,{certificate:()=>certificateAttempt,resume});void nativeDrain.catch(()=>{});}
      if(capturedOwned){registerCapturedCertificate(()=>certificateAttempt);capturedDrain=capturedOwnership.peerRetiring(stopped,{certificate:()=>certificateAttempt,resume});void capturedDrain.catch(()=>{});}
     }
     try{
     if(row&&!neuralClosed){const reply=await row.link.close();if(reply===false||reply===0)throw reply;neuralClosed=true;}
     if(nativeTermination){if(!certificate)certificate=await nativeTermination();terminationAccepted=true;}
     else if(!terminationAccepted){const reply=await stopped.terminate();if(reply===false||reply===0)throw reply;terminationAccepted=true;}
     if(!certificate){
      const exit=stopped.done;let kind='browser-terminate-requested';
      if(exit&&typeof exit.then==='function'){await exit;kind='node-worker-exit';}
      certificate=Object.freeze({terminated:true,kind});
     }
     if(nativeOwned||capturedOwned){resolveNativeCertificate(certificate);const drains=await Promise.allSettled([nativeDrain,capturedDrain]),failed=drains.find(value=>value.status==='rejected');if(failed)throw failed.reason;}
     if(!externalRetired){await Promise.allSettled(external.map(retire=>retire()));externalRetired=true;}
     await samples.peerTerminated(certificate);
     sourceSamplesLinks.delete(stopped);sourceSamplesTerminations.delete(samples);neuralWindowLinks.delete(stopped);
     return cleanOwners(owners);
     }catch(failure){rejectNativeCertificate?.(failure);await Promise.allSettled([nativeDrain,capturedDrain]);throw failure;}
    });
    retiring=task;cleanupPending=task;task.catch(()=>{retiring=null;});return task;
   };
   sourceSamplesTerminations??=new WeakMap();sourceSamplesTerminations.set(samples,resume);
   if(capturedOwned)capturedRetirements.set(stopped,resume);
   const task=resume();task.then(rejectAll,failure=>rejectAll([{code:failure?.code??'SOURCE_PEER_RETIREMENT',message:String(failure?.message??failure)}]));
   return task;
  }
  if(nativeOwned||capturedOwned){
   const prior=cleanupPending;let retiring,externalRetired=false,neuralClosed=false;
   const resume=()=>{if(retiring)return retiring;const task=prior.then(async()=>{
    const certificateAttempt=(async()=>{if(row&&!neuralClosed){const reply=await row.link.close();if(reply===false||reply===0)throw reply;neuralClosed=true;}return nativeTermination();})();void certificateAttempt.catch(()=>{});if(capturedOwned)registerCapturedCertificate(()=>certificateAttempt);
    const nativeDrain=nativeOwned?nativePresentationRegistry.peerRetiring(stopped,{certificate:()=>certificateAttempt,resume}):null,capturedDrain=capturedOwned?capturedOwnership.peerRetiring(stopped,{certificate:()=>certificateAttempt,resume}):null;void nativeDrain?.catch(()=>{});void capturedDrain?.catch(()=>{});
    try{await certificateAttempt;const drains=await Promise.allSettled([nativeDrain,capturedDrain]),failed=drains.find(value=>value.status==='rejected');if(failed)throw failed.reason;}catch(failure){await Promise.allSettled([nativeDrain,capturedDrain]);throw failure;}
    neuralWindowLinks.delete(stopped);
    if(!externalRetired){await Promise.allSettled(external.map(retire=>retire()));externalRetired=true;}
    return cleanOwners(owners);
   });retiring=task;cleanupPending=task;void task.catch(()=>{if(retiring===task)retiring=null;});
   task.then(rejectAll,failure=>rejectAll([{code:failure?.code??'NATIVE_PRESENTATION_RETIREMENT',message:String(failure?.message??failure)}]));return task;};
   if(capturedOwned)capturedRetirements.set(stopped,resume);
   return resume();
  }
  if(external.length)cleanupPending=cleanupPending.then(()=>Promise.allSettled(external.map(retire=>retire())));
  if(owners.length){cleanupPending=cleanupPending.then(()=>cleanOwners(owners));cleanupPending.then(rejectAll,failure=>rejectAll([{code:failure?.code??'NEURAL_WINDOW_RETIREMENT',message:String(failure?.message??failure)}]));}
  else if(external.length||row)cleanupPending.then(()=>rejectAll(),failure=>rejectAll([{code:failure?.code??'NEURAL_WINDOW_RETIREMENT',message:String(failure?.message??failure)}]));else rejectAll();return cleanupPending;
 }

 function stopWithStorageClose(error){
  const done=new Promise(resolve=>shutdownWaiters.push(resolve));
  if(!cancellationError){cancellationError=error;try{worker.postMessage({method:'cancel-and-close'});cancellationTimer=setTimeout(()=>{error.cancellationMode='forced-after-storage-close-timeout';reset(error);},aiDetectorsOwned?15000:1000);}catch{reset(error);}}
  return done;
 }

 function send(method,args=[],{signal,onProgress,nativePresentationGroup,nativePresentationFrame,capturedTicket}={}) {
  checkAbort(signal);
  if(disposed)return Promise.reject(new EngineError('DISPOSED','Engine disposed.'));
  const sequence=++serial,ocrNative=method==='run'&&args[0]?.operation==='various.ocr'&&args[0]?.params?.algorithm==='tesseract';
  return new Promise((resolve,reject)=>{
   let cooperativeTimer;
   const abort=()=>{
    if(capturedOwnership?.ownsTicket(capturedTicket)){const entry=pending.get(sequence);if(entry){entry.cancelled=new EngineError('CANCELLED','Captured ownership command revoked; await its actual acknowledgement.');entry.cancelled.imagesCleared=false;entry.retainedFinal=true;}return;}
    if(method==='loadBlob'&&worker){
     const entry=pending.get(sequence);if(!entry)return;
     const error=new EngineError('CANCELLED','Image import cancelled cooperatively.');error.imagesCleared=false;
     entry.cancelled=error;entry.retainedFinal=true;
     try{worker.postMessage({method:'cancel-task',sequence});}
     catch(cause){error.cause=cause;reset(error);}
     return;
    }
    if(['prepareSourceSamples','readSourceSamples'].includes(method)&&worker){const entry=pending.get(sequence);if(entry){entry.cancelled=new EngineError('CANCELLED','Source sample request cancelled cooperatively.');entry.cancelled.imagesCleared=false;try{worker.postMessage({method:'cancel-task',sequence});}catch(cause){entry.cancelled.cause=cause;}}return;}
    if(COOPERATIVE_READ_METHODS.has(method)&&worker){const error=new EngineError('CANCELLED','Source/result read cancelled cooperatively.');error.imagesCleared=false;const entry=pending.get(sequence);if(!entry)return;entry.cancelled=error;try{worker.postMessage({method:'cancel-task',sequence});}catch(cause){error.cause=cause;reset(error);}return;}
    if(method==='finalResultLifetime'){const entry=pending.get(sequence);if(entry){entry.cancelled=new EngineError('CANCELLED','Final ownership transition revoked; await its actual acknowledgement.');entry.cancelled.imagesCleared=false;entry.retainedFinal=true;}return;}
    const retainedD2Preview=method==='run'&&args[0]?.operation==='ai.clones.d2prl'&&typeof args[0]?.params?.refilterOf==='string'&&args[0].params.refilterOf.trim().length>0;
    if((retainedD2Preview||['previewParameters','localizeRetainedParameters','renderRetainedNativeParameters'].includes(method))&&worker){const error=new EngineError('CANCELLED','Provisional parameter view cancelled cooperatively.');error.imagesCleared=false;const entry=pending.get(sequence);if(!entry)return;entry.cancelled=error;entry.retainedFinal=retainedD2Preview||['localizeRetainedParameters','renderRetainedNativeParameters'].includes(method);try{worker.postMessage({method:'cancel-task',sequence});}catch(cause){error.cause=cause;reset(error);}return;}
    if(['capabilities','describeUsefulOperation'].includes(method)){const p=pending.get(sequence);if(p){pending.delete(sequence);p.cleanup();p.reject(new EngineError('CANCELLED','Diagnostic read cancelled.'));}return;}
    const automatic=['resumeAutomatic','updateAutomatic','renderAutomatic','previewAutomaticD2','exportAutomatic'].includes(method)||method==='run'&&['analysis.complete','analysis.clones'].includes(args[0]?.operation);
    const extensions=['loadAiDetectors','unloadAiDetectors','loadExtensionModels','runExtensions'].includes(method)||method==='run'&&['ai.generation.detect','ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'].includes(args[0]?.operation);
    const cooperativeSparseClone=method==='run'&&args[0]?.operation==='tampering.copyMove.sparse'&&['SIFT','RootSIFT','SIFT + G2NN + RANSAC','XFeat','XFeat + LighterGlue','ALIKED','ALIKED rotation','ALIKED + LightGlue','ALIKED rotation + LightGlue','SIFT + LightGlue','EfficientLoFTR'].includes(args[0]?.params?.algorithm??'SIFT + G2NN + RANSAC');
    const cooperativeSynthesis=['elaSynthesisAxis','elaSynthesisBudgetPlan','beginElaSynthesis','runElaSynthesisFrame','appendElaSynthesis','finishElaSynthesis','renderElaSynthesis','runElaSynthesisEnergy','disposeElaSynthesis'].includes(method);const cooperativeSsg=method==='run'&&args[0]?.operation==='tampering.copyMove.sparse'&&args[0]?.params?.algorithm==='SSG'&&args[0]?.backend!=='webgpu';const cooperativePrnuBuild=method==='buildPrnuDatabase'||method==='selectedElaAutoStats';const cooperativeNlm=method==='run'&&args[0]?.operation==='noise.separation'&&args[0]?.params?.mode===4&&['cpu','webgpu'].includes(args[0]?.backend);const cooperativeTesseract=method==='run'&&args[0]?.operation==='various.ocr'&&args[0]?.params?.algorithm==='tesseract';const cooperativeSherloq=method==='run'&&args[0]?.params?.equalization?.method==='sherloq7c'&&['inspection.adjust','detail.gradient','ela.classic'].includes(args[0]?.operation);const cooperativeCompute=cooperativeSherloq||cooperativeSynthesis||provisionalDisplayOnly&&(method==='readDisplay'||method==='run'&&['inspection.adjust','inspection.magnifier','detail.gradient','detail.echo','colors.space','colors.pca','detail.frequency'].includes(args[0]?.operation))||method==='run'&&cooperativeColorWindows(args[0])||cooperativeTesseract||cooperativeNlm||cooperativePrnuBuild||cooperativeSsg||cooperativeSparseClone||method==='run'&&['inspection.adjust','inspection.magnifier','detail.echo','colors.space','colors.pca','detail.frequency','inspection.sherloq7c','inspection.histogram','detail.gradient','colors.stats','noise.planes','noise.minmax','pixels.defects','noise.separation','tampering.copyMove.brisk','tampering.copyMove.orb','tampering.copyMove.akaze','tampering.resampling','detail.wavelets','noise.blocking','various.stereogram','noise.noisesniffer','ela.classic','jpeg.quality','jpeg.recompression','comparison.image','noise.prnu','jpeg.zero','tampering.resampling.fourier','tampering.copyMove.dense','ela.energy','jpeg.ghosts','ela.biomes','jpeg.multiple'].includes(args[0]?.operation);
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
    const error=new EngineError('CANCELLED','Task cancelled; reload image before the next run.');error.imagesCleared=true;if((storageOwners.size||aiDetectorsOwned)&&worker)stopWithStorageClose(error);else reset(error);
   };
   const cleanup=()=>{clearTimeout(cooperativeTimer);signal?.removeEventListener('abort',abort);};
   pending.set(sequence,{resolve,reject,cleanup,onProgress,ocrNative,cancel:abort,method,...(capturedOwnership?.ownsTicket(capturedTicket)?{capturedTicket}:{}),...(nativePresentationRegistry?.ownsGroup(nativePresentationGroup)?{nativePresentationGroup,nativePresentationFrame}:{})});signal?.addEventListener('abort',abort,{once:true});
   try{const target=capturedOwnership?.ownsTicket(capturedTicket)?capturedTicket.peer:worker;if(capturedTicket&&target!==worker)throw new EngineError('WORKER_RETIRED','Captured command cannot post to a replacement peer.');target.postMessage({sequence,method,args,options:method==='init'?{...options,neuralWindowGpuAvailable:!!globalThis.navigator?.gpu}:undefined});if(capturedTicket)capturedOwnership.posted(capturedTicket);if(!['init','capabilities','updateResourceHints'].includes(method)){sentWork=true;const session=args[0]?.temporarySessionId??args[1]?.temporarySessionId;if(session&&storageOwners.has(session))storageOwners.get(session).sent=true;}}catch(e){pending.delete(sequence);cleanup();reject(e);}
  });
 }
 function startWorker() {
  if(disposed)throw new EngineError('DISPOSED','Engine disposed.');
  if(!worker){
   const workerURL=engineWorkerURL(import.meta.url);try{worker=new Worker(workerURL,{type:'module'});}catch(cause){throw new EngineError('WORKER_FAILED',cause?.message||'Browser engine worker could not be created.',{cause,details:{phase:'worker-create',workerURL:workerURL.href}});}const created=worker;
   const control=data=>{if(worker!==created)return true;if(sourceSamplesLinks?.get(created)?.accept(data))return true;if(data.neuralWindowRequest){let row=neuralWindowLinks.get(created);if(!row){const service=applicationNeuralWindowClientService({limitBytes:options.memoryBudgetBytes??profile.memoryBudgetBytes,onOwner:()=>{}});row={link:null,retiring:false};neuralWindowLinks.set(created,row);row.link=createNeuralWindowClientLink({worker:created,service,onOwner:owner=>{row.link=owner;},onFailure:error=>failed(error)});}return row.link.accept(data);}if(data.externalCacheReclaim){const request=data.externalCacheReclaim;if(!Number.isSafeInteger(request.ticket)||request.ticket<1||typeof request.id!=='string'||!request.id||!Number.isSafeInteger(request.bytes)||request.bytes<1)throw workerMessageFailure('engine-client','message','invalid-external-cache-reclaim');const retire=externalCacheOwners.get(request.id),reply=(error,hasFailure=false)=>{if(worker!==created)return;try{created.postMessage({method:'external-cache-retired',sequence:request.ticket,args:hasFailure?[{error:serializeEngineError(error)}]:[]});}catch(cause){failed(new EngineError('WORKER_MESSAGE_FAILED','External cache acknowledgement could not be sent.',{cause}));}};void Promise.resolve().then(()=>{if(!retire)throw new EngineError('EXTERNAL_CACHE_OWNER_MISSING','External cache owner is unavailable.');return retire();}).then(()=>{externalCacheOwners.delete(request.id);reply();},error=>reply(error,true));return true;}if(data.shutdownPhase){if(cancellationError)(cancellationError.cancellationPhases??=[]).push(data.shutdownPhase);return true;}if(typeof data.storageClosed==='boolean'){if(cancellationError){const error=cancellationError;error.cancellationMode=data.storageClosed?'storage-closed-before-worker-termination':'forced-after-storage-close-failure';reset(error,{storageClosed:data.storageClosed});}return true;}if(data.storageSession){let owner=storageOwners.get(data.storageSession.id);if(!owner){const parent=storageOwners.get(data.loadBlobStorageOwner);owner=parent?.loadBlob?{dynamic:true,loadBlob:true,imageId:parent.imageId,loadBlobOwner:data.loadBlobStorageOwner}:{dynamic:true};storageOwners.set(data.storageSession.id,owner);}owner.backend=data.storageSession.backend;return true;}return false;};
   const failed=error=>{if(worker!==created)return;if(!initialized&&!sentWork){reset(error,{preserveUnsentOwners:true,preserveActive:true,imagesCleared:false});return;}error.imagesCleared=true;if(storageOwners.size||aiDetectorsOwned){
    // The failed useful-message channel is latched closed. A separate guarded
    // shutdown receiver must still consume its storage-close acknowledgement.
    installWorkerMessageProtocol(created,control,{label:'engine-shutdown',onFailure:()=>reset(error)});void stopWithStorageClose(error);
   }else reset(error);};
   installWorkerMessageProtocol(worker,data=>{if(worker!==created||control(data))return;if(data.fatal){failed(deserializeEngineError(data.fatal));return;}if(cancellationError)return;if(!Number.isSafeInteger(data.sequence)||!['progress','result','error'].some(key=>Object.hasOwn(data,key)))throw workerMessageFailure('engine-client','message','invalid-response');const p=pending.get(data.sequence);if(!p)return;if(data.progress){try{p.onProgress?.(data.progress);}catch(error){if(!p.ocrNative)throw error;p.callbackPrimary??={error};p.cancel();}return;}pending.delete(data.sequence);p.cleanup();if(p.capturedTicket)capturedOwnership.response(p.capturedTicket,data);if(['prepareSourceSamples','readSourceSamples'].includes(p.method)){return(async()=>{if(data.error){const error=deserializeEngineError(data.error);if(p.cancelled)error.imagesCleared=false;p.reject(error);return;}const link=sourceSamplesLink(created),result=p.method==='prepareSourceSamples'?link.adoptSource(data.result):link.adoptWindow(data.result);if(p.method==='readSourceSamples')data.result.samples=null;sourceSamplesReceipts??=new WeakMap();sourceSamplesReceipts.set(result,link);if(p.cancelled){try{await link.retire(result);}catch(cleanup){p.cancelled.cleanupOwner=link;p.cancelled.cleanupError=cleanup;}p.reject(p.cancelled);return;}p.resolve(result);})().catch(p.reject);}if(p.nativePresentationFrame&&!data.error)try{p.nativePresentationFrame.adoptPixels(data.result?.pixels);}catch(primary){p.reject(primary);throw new EngineError('WORKER_MESSAGE_FAILED','Native presentation response differs from its admitted frame.',{cause:primary});}if(p.callbackPrimary){p.reject(p.callbackPrimary.error);return;}const replyError=data.error?deserializeEngineError(data.error):null;
   if(p.method==='loadBlob'&&replyError)replyError.loadBlobRetirement=data.loadBlobRetirement;
   if(p.cancelled){
    // Completion can win the race with the cancellation control message.
    // Its published owned result is a success, not a new cancelled checkpoint.
    if(!data.error&&(p.automatic||p.retainedFinal)){p.resolve(data.result);return;}
    const error=replyError??p.cancelled;error.imagesCleared=false;
    p.reject(error);return;
   }replyError?p.reject(replyError):p.resolve(data.result);},{label:'engine-client',onFailure:failed});
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
  try{await cleanupPending;await drainTerminatedStorage();await ensure();void refreshMemory();return await send(method,args,hooks);}finally{active=false;clearTimeout(memoryTimer);}
 }
 return {
  [CAPTURED_OWNERSHIP_CONTROL]:request=>{if(!worker||disposed||cancellationError)throw new EngineError('WORKER_RETIRED','A live Original peer is required for captured ownership.');return capturedRegistry().create({...request,peer:worker});},
  [NATIVE_PREVIEW_FINANCE]:request=>{if(!worker||disposed||cancellationError)throw new EngineError('WORKER_RETIRED','A live captured Original peer is required.');return nativeFinanceRegistry().create({...request,peer:worker});},
  prepareSourceSamples:(request,hooks)=>call('prepareSourceSamples',[request],hooks),
  readSourceSamples:(request,hooks)=>call('readSourceSamples',[request],hooks),
  retireSourceSamples(request){
   const captured=sourceSamplesReceipts?.get(request),link=captured??sourceSamplesLinks?.get(worker);
   if(!link)return Promise.reject(new EngineError('SOURCE_LEASE_NOT_ADOPTED','No captured source control owner.'));
   const retiring=captured&&sourceSamplesTerminations?.get(captured);
   return retiring?retiring().then(()=>link.retire(request)):link.retire(request);
  },
  async updateResourceHints(hints){await cleanupPending;await drainTerminatedStorage();await ensure();return send('updateResourceHints',[hints]);},
  elaSynthesisAxis:(input,hooks)=>call('elaSynthesisAxis',[input],hooks),
  elaSynthesisBudgetPlan:(input,hooks)=>call('elaSynthesisBudgetPlan',[input],hooks),
  beginElaSynthesis:(input,hooks)=>call('beginElaSynthesis',[input],hooks),
  runElaSynthesisFrame:(input,hooks)=>call('runElaSynthesisFrame',[input],hooks),
  appendElaSynthesis:(input,hooks)=>call('appendElaSynthesis',[input],hooks),
  finishElaSynthesis:(input,hooks)=>call('finishElaSynthesis',[input],hooks),
  renderElaSynthesis:(input,hooks)=>call('renderElaSynthesis',[input],hooks),
  runElaSynthesisEnergy:(input,hooks)=>call('runElaSynthesisEnergy',[input],hooks),
  disposeElaSynthesis:(input,hooks)=>call('disposeElaSynthesis',[input],hooks),
  selectedElaAutoStats:(input,hooks)=>call('selectedElaAutoStats',[input],hooks),
  describeUsefulOperation:(input,hooks)=>call('describeUsefulOperation',[input],hooks),
  async capabilities(hooks={}){checkAbort(hooks.signal);await cleanupPending;await drainTerminatedStorage();await ensure();const value=await send('capabilities',[],hooks);return{...value,...(initializationDiagnostic?{workerInitialization:structuredClone(initializationDiagnostic)}:{}),...(neuralWindowApplicationSnapshot()?{windowNeuralRuntime:neuralWindowApplicationSnapshot()}:{})};},
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
  async loadBlob(input,hooks){
   const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null,loadBlob:true};storageOwners.set(id,record);
   try{
    const result=await call('loadBlob',[{...input,temporarySessionId:id}],hooks);
    // Every successful Core load has drained the earlier failed-import ledger.
    for(const [owner,entry]of storageOwners)if(entry.loadBlobRetirement==='core')storageOwners.delete(owner);
    if(!['segmented-scanlines','segmented-strips-tiles','paged-rgb'].includes(result.provenance.layout))storageOwners.delete(id);
    capturedOriginals.set(result.id,capturedBinding(result));return result;
   }catch(error){
    for(const [owner,entry]of storageOwners){
     if(owner!==id&&entry.loadBlobOwner!==id)continue;
     const retirement=error?.loadBlobRetirement;
     if(retirement==='core'||retirement==='published')entry.loadBlobRetirement=retirement;
     else if(entry.backend&&retirement!=='acknowledged')entry.loadBlobRetirement='terminated-worker';
     else storageOwners.delete(owner);
    }
    throw error;
   }
  },
  finalResultLifetime(){return Promise.reject(new EngineError('CAPTURED_CONTROL_REQUIRED','Final ownership transitions require their captured local control.'));},
  releaseSurface:id=>call('releaseSurface',[id]),
  readDisplay:(request,hooks)=>call('readDisplay',[request],hooks),
  readPlane:(request,hooks)=>call('readPlane',[request],hooks),
  readNativePixels:(request,hooks)=>call('readNativePixels',[request],hooks),
  readPixels:(request,hooks)=>call('readPixels',[request],hooks),readFlags:(request,hooks)=>call('readFlags',[request],hooks),readTable:(request,hooks)=>call('readTable',[request],hooks),readTableCsv:(request,hooks)=>call('readTableCsv',[request],hooks),readNpz:(request,hooks)=>call('readNpz',[request],hooks),releaseTable:id=>call('releaseTable',[id]),readMask:(request,hooks)=>call('readMask',[request],hooks),originalBlob:id=>call('originalBlob',[id]),deriveOriginal:(request,hooks)=>call('deriveOriginal',[request],hooks),readOriginal:(id,range,hooks)=>call('readOriginal',[id,range],hooks),
  load:(input,hooks)=>call('load',[input],hooks),previewParameters:(task,{preview={},nativePresentation,...hooks}={})=>{const captured=nativePresentationRegistry?.hook(nativePresentation);if(nativePresentation!==undefined&&!captured)throw new EngineError('LEASE_NOT_ADOPTED','Unknown native presentation capability.');return call('previewParameters',[task,preview],{...hooks,...(captured?{nativePresentationGroup:captured.group,nativePresentationFrame:captured.frame}:{})});},localizeRetainedParameters:(task,hooks)=>call('localizeRetainedParameters',[task],hooks),renderRetainedNativeParameters:(input,hooks)=>call('renderRetainedNativeParameters',[input],hooks),run:(task,hooks)=>call('run',[task],hooks),
  async loadPrnuDatabase(input,hooks){const id='job-'+crypto.randomUUID(),record={imageId:input.id,backend:null};storageOwners.set(id,record);try{const result=await call('loadPrnuDatabase',[{...input,temporarySessionId:id}],hooks);if(!result.metrics.temporaryBackend)storageOwners.delete(id);return result;}catch(error){if(storageOwners.has(id)){storageOwners.delete(id);if(record.backend){const failures=await cleanOwners([[id,record]]);if(failures.length)error.temporaryCleanupFailures=failures;}}throw error;}},
  loadMedianModel:(input,hooks)=>call('loadMedianModel',[input],hooks),
  loadQualityModel:(input,hooks)=>call('loadQualityModel',[input],hooks),
  loadSegmentationModel:(input,hooks)=>call('loadSegmentationModel',[input],hooks),unloadSegmentationModel:()=>call('unloadSegmentationModel'),readSegmentationRaw:request=>call('readSegmentationRaw',[request]),
  describeOcrUsefulWork:(input,hooks)=>call('describeOcrUsefulWork',[input],hooks),
  loadOcrModels:(input,hooks)=>call('loadOcrModels',[input],hooks),unloadOcrModels:()=>call('unloadOcrModels'),
  loadM3Models:(input,hooks)=>call('loadM3Models',[input],hooks),unloadM3Models:()=>call('unloadM3Models'),
  async loadAiDetectors(input,hooks){const answer=await call('loadAiDetectors',[input],hooks);aiDetectorsOwned=true;return answer;},async unloadAiDetectors(){const answer=await call('unloadAiDetectors');aiDetectorsOwned=false;return answer;},
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
  async reserveExternalCache(request,{onReclaim}={}){if(typeof onReclaim!=='function')throw new EngineError('INVALID_INPUT','External cache retirement callback required.');const entry=await call('reserveExternalCache',[request]);if(!entry||typeof entry.id!=='string'||!entry.id||entry.bytes!==request.bytes){const error=new EngineError('WORKER_MESSAGE_FAILED','Invalid external cache reservation response.');if((storageOwners.size||aiDetectorsOwned)&&worker)await stopWithStorageClose(error);else await reset(error);throw error;}let flight;externalCacheOwners.set(entry.id,()=>flight??=(async()=>onReclaim())().catch(error=>{flight=null;throw error;}));return entry;},
  updateExternalCache:request=>call('updateExternalCache',[request]),
  async releaseExternalCache(id){const answer=await call('releaseExternalCache',[id]);externalCacheOwners.delete(id);return answer;},
  reserveExternalMemory:request=>call('reserveExternalMemory',[request]),
  releaseExternalMemory:id=>call('releaseExternalMemory',[id]),
  readExport:(request,hooks)=>call('readExport',[request],hooks),
  async releaseExport(id){const result=await call('releaseExport',[id]);for(const [owner,record]of storageOwners)if(record.exportId===id)storageOwners.delete(owner);return result;},
  createPrnuDatabaseExport:(id,hooks)=>call('createPrnuDatabaseExport',[id],hooks),
  exportResult:(result,options,hooks)=>call('exportResult',[result,options],hooks),
  imagePixels:id=>call('imagePixels',[id]),original:id=>call('original',[id]),async unload(id){if(capturedOwnership)await capturedOwnership.closeImage(id);sourceSamplesLinks?.get(worker)?.beginOriginalClose(id);const result=await call('unload',[id]);capturedOriginals.delete(id);for(const [owner,record] of storageOwners)if(record.imageId===id&&record.loadBlobRetirement!=='terminated-worker')storageOwners.delete(owner);return result;},
  dispose:disposeEngine
 };
 function disposeEngine(){if(capturedOwnership?.snapshot().some(row=>row.controls))return capturedOwnership.closeAll().then(disposeEngine);if(nativePresentationRegistry?.size)return nativePresentationRegistry.closeAll().then(disposeEngine);const created=worker,link=sourceSamplesLinks?.get(created);if(link?.state.sources)return(async()=>{await link.close();if(worker!==created)throw new EngineError('WORKER_RETIRED','Captured source Worker retired during closure.');if(active)throw new EngineError('BUSY','The useful task must settle before source shutdown.');active=true;try{await send('dispose');}finally{active=false;}disposed=true;clearTimeout(memoryTimer);memoryGeneration++;return reset(new EngineError('DISPOSED','Engine disposed.'),{storageClosed:true});})();disposed=true;clearTimeout(memoryTimer);memoryGeneration++;const error=new EngineError('DISPOSED','Engine disposed.');const closing=(storageOwners.size||aiDetectorsOwned)&&worker?stopWithStorageClose(error):reset(error);return Promise.resolve(closing).then(()=>drainTerminatedStorage()).then(()=>({windowNeuralRuntime:neuralWindowApplicationSnapshot()}));}
}
