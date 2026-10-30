import "../../runtime-context.js?v=0.30.0";
import {installNeuralWindowControl,neuralWindowControlMessage} from './neural-window-engine-link.js';
import {EngineError,serializeEngineError,normalizeResourceError,serializeEngineErrorWithCleanupSummaries} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
installNeuralWindowControl(message=>self.postMessage(message));
let engine,currentController,currentSequence,stopping=false,shutdown,cacheTicket=0;const cacheRetirements=new Map();
function requestCacheRetirement(request){const ticket=++cacheTicket;return new Promise((resolve,reject)=>{cacheRetirements.set(ticket,{resolve,reject});try{self.postMessage({externalCacheReclaim:{...request,ticket}});}catch(error){cacheRetirements.delete(ticket);reject(error);}});}
function closeForCancellation(){if(shutdown)return shutdown;shutdown=(async()=>{const diagnostics=engine?.waveletRetirementDiagnostics;let diagnosticScope;try{diagnosticScope=diagnostics?.begin({method:'shutdown'});self.postMessage({shutdownPhase:'closing-storage'});await engine?.dispose();self.postMessage({storageClosed:true});}catch(error){const summary=serializeEngineErrorWithCleanupSummaries(error,diagnostics?.snapshot(diagnosticScope));self.postMessage({storageClosed:false,shutdownError:{...summary,code:error?.code??'INTERNAL'}});}finally{diagnostics?.end(diagnosticScope);}})();return shutdown;}
installWorkerMessageProtocol(self,async packet=>{
 if(neuralWindowControlMessage(packet))return;
 const {sequence,method,args,options}=packet;
 if(method==='external-cache-retired'){if(!Number.isSafeInteger(sequence)||sequence<1||!Array.isArray(args)||args.length>1||args.length===1&&(!args[0]?.error||typeof args[0].error.code!=='string'||!args[0].error.code||typeof args[0].error.message!=='string'))throw workerMessageFailure('engine','message','invalid-external-cache-ack');const waiting=cacheRetirements.get(sequence);if(waiting){cacheRetirements.delete(sequence);args?.[0]?.error?waiting.reject(new EngineError(args[0].error.code??'EXTERNAL_CACHE_RETIRE_FAILED',args[0].error.message??'External cache retirement failed.')):waiting.resolve();}return;}
 if(method==='cancel-task'){if(currentSequence===sequence)currentController?.abort();return;}
 if(method==='cancel-and-close'){stopping=true;self.postMessage({shutdownPhase:'abort-received'});currentController?.abort();if(!currentController)await closeForCancellation();return;}
 if(!Number.isSafeInteger(sequence)||typeof method!=='string'||!Array.isArray(args))throw workerMessageFailure('engine','message','invalid-command');
 // Inspection must never replace the controller of a live calculation.
 if(['capabilities','updateResourceHints','describeUsefulOperation'].includes(method)){
  try{if(stopping||!engine)throw new EngineError('DISPOSED','Engine is not available.');self.postMessage({sequence,result:method==='capabilities'?engine.capabilities():method==='describeUsefulOperation'?engine.describeUsefulOperation(args[0]):engine.updateResourceHints(args[0])});}
  catch(error){self.postMessage({sequence,error:serializeEngineError(error)});}return;
 }
 if(currentController){self.postMessage({sequence,error:serializeEngineError(new EngineError('BUSY','Another worker task is active.'))});return;}
 const controller=new AbortController();currentController=controller;currentSequence=sequence;let diagnosticScope;
 try {
  if(stopping)return;
  if(method==='init'){
   const moduleURL=new URL('./index.js',import.meta.url).href;let createEngine;
   try{({createEngine}=await import('./index.js'));}
   catch(cause){
    // Retry evidence belongs to the module loader, never to an arbitrary
    // TypeError during useful work or engine construction.
    const explicitDownload=cause?.code==='NETWORK_TRANSIENT'||cause?.name==='TypeError'&&/Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(cause.message??'')&&!/content security|\bCSP\b|MIME|CORS|denied|blocked/i.test(cause.message??'');
    throw new EngineError('WORKER_LOAD_FAILED',cause?.message||'Browser engine module could not be loaded.',{cause,details:{phase:'module-load',moduleURL,retryable:explicitDownload}});
   }
   if(stopping)return;
   try{engine=createEngine({...options,waveletRetirementDiagnostics:true,onTemporarySession:storageSession=>self.postMessage({storageSession}),onExternalCacheReclaim:requestCacheRetirement});}
   catch(cause){const error=normalizeResourceError(cause),failure=error?.code?error:new EngineError('WORKER_INITIALIZATION_FAILED',cause?.message||'Browser engine could not be initialized.',{cause});failure.details={...failure.details,phase:'engine-create',moduleURL};throw failure;}
   self.postMessage({sequence,result:engine.capabilities()});return;
  }
  if(!engine || !['describeUsefulOperation','describeOcrUsefulWork','reserveExternalCache','updateExternalCache','releaseExternalCache','reserveExternalMemory','releaseExternalMemory','capabilities','load','loadBlob','loadAutomaticModels','resumeAutomatic','updateAutomatic','renderAutomatic','previewAutomaticD2','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','deriveSourceRegionInput','releaseSurface','readPlane','exportSurface','exportPixelBuffer','readExport','releaseExport','readDisplay','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','originalBlob','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','unloadD2prlModel','readD2prlRaw','loadOcrModels','unloadOcrModels','loadM3Models','unloadM3Models','loadExtensionModels','unloadExtensionModels','runExtensions','loadSegmentationModel','unloadSegmentationModel','readSegmentationRaw','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','exportPrnuDatabase','previewParameters','localizeRetainedParameters','renderRetainedNativeParameters','run','exportResult','original','imagePixels','unload','dispose'].includes(method))throw new Error('Invalid worker method.');
  diagnosticScope=engine.waveletRetirementDiagnostics?.begin({sequence,method});
  if(method==='reserveExternalMemory')await engine.prepareExternalCacheHeadroom?.(args[0],{signal:controller.signal});
  else if(['load','loadBlob','loadAutomaticModels','loadMedianModel','loadQualityModel','loadD2prlModel','loadOcrModels','loadM3Models','loadExtensionModels','loadSegmentationModel','loadPrnuDatabase','buildPrnuDatabase','deriveOriginal','resumeAutomatic','updateAutomatic','renderAutomatic','previewAutomaticD2','exportAutomatic','exportResultFile','exportSurface','exportPixelBuffer','createPrnuDatabaseExport','exportPrnuDatabase','unload'].includes(method))await engine.prepareExternalCacheHeadroom?.({all:true},{signal:controller.signal});
  const result=await engine[method](...args,...(['reserveExternalCache','updateExternalCache','load','loadBlob','loadAutomaticModels','resumeAutomatic','updateAutomatic','renderAutomatic','previewAutomaticD2','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','deriveSourceRegionInput','releaseSurface','readPlane','exportSurface','exportPixelBuffer','readExport','releaseExport','readDisplay','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','loadOcrModels','loadExtensionModels','runExtensions','loadSegmentationModel','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','previewParameters','localizeRetainedParameters','renderRetainedNativeParameters','run'].includes(method)?[{signal:controller.signal,onProgress:progress=>self.postMessage({sequence,progress})}]:[]));
  if(stopping)return;const buffers=new Set();
  function collect(value){if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}if(value&&typeof value==='object')for(const child of Object.values(value))collect(child);}
  collect(result);self.postMessage({sequence,result},[...buffers]);
 }catch(error){if(controller.signal.aborted&&error?.code!=='CANCELLED')error=new EngineError('CANCELLED','Task cancelled cooperatively.',{cause:error});if(!stopping)self.postMessage({sequence,error:serializeEngineErrorWithCleanupSummaries(error,engine?.waveletRetirementDiagnostics?.snapshot(diagnosticScope))});}
 finally{engine?.waveletRetirementDiagnostics?.end(diagnosticScope);if(currentController===controller){currentController=null;currentSequence=null;}if(stopping)await closeForCancellation();}
},{label:'engine',onFailure(error){stopping=true;currentController?.abort();for(const waiting of cacheRetirements.values())waiting.reject(error);cacheRetirements.clear();try{self.postMessage({fatal:serializeEngineError(error)});}finally{if(!currentController)void closeForCancellation();}}});
