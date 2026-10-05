import "../../runtime-context.js?v=0.14.5";
import {createEngine} from './index.js';
import {EngineError,serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
let engine,currentController,currentSequence,stopping=false,shutdown;
function closeForCancellation(){if(shutdown)return shutdown;shutdown=(async()=>{try{self.postMessage({shutdownPhase:'closing-storage'});await engine?.dispose();self.postMessage({storageClosed:true});}catch(error){self.postMessage({storageClosed:false,shutdownError:{code:error.code??'INTERNAL'}});}})();return shutdown;}
installWorkerMessageProtocol(self,async ({sequence,method,args,options})=>{
 if(method==='cancel-task'){if(currentSequence===sequence)currentController?.abort();return;}
 if(method==='cancel-and-close'){stopping=true;self.postMessage({shutdownPhase:'abort-received'});currentController?.abort();if(!currentController)await closeForCancellation();return;}
 if(!Number.isSafeInteger(sequence)||typeof method!=='string'||!Array.isArray(args))throw workerMessageFailure('engine','message','invalid-command');
 // Inspection must never replace the controller of a live calculation.
 if(method==='capabilities'||method==='updateResourceHints'){
  try{if(stopping||!engine)throw new EngineError('DISPOSED','Engine is not available.');self.postMessage({sequence,result:method==='capabilities'?engine.capabilities():engine.updateResourceHints(args[0])});}
  catch(error){self.postMessage({sequence,error:serializeEngineError(error)});}return;
 }
 if(currentController){self.postMessage({sequence,error:serializeEngineError(new EngineError('BUSY','Another worker task is active.'))});return;}
 const controller=new AbortController();currentController=controller;currentSequence=sequence;
 try {
  if(stopping)return;
  if(method==='init'){engine=createEngine({...options,onTemporarySession:storageSession=>self.postMessage({storageSession})});self.postMessage({sequence,result:engine.capabilities()});return;}
  if(!engine || !['reserveExternalMemory','releaseExternalMemory','capabilities','load','loadBlob','loadAutomaticModels','resumeAutomatic','updateAutomatic','renderAutomatic','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','releaseSurface','readPlane','exportSurface','exportPixelBuffer','readExport','releaseExport','readDisplay','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','originalBlob','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','unloadD2prlModel','readD2prlRaw','loadM3Models','unloadM3Models','loadSegmentationModel','unloadSegmentationModel','readSegmentationRaw','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','exportPrnuDatabase','run','exportResult','original','imagePixels','unload','dispose'].includes(method))throw new Error('Invalid worker method.');
  const result=await engine[method](...args,...(['load','loadBlob','loadAutomaticModels','resumeAutomatic','updateAutomatic','renderAutomatic','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','releaseSurface','readPlane','exportSurface','exportPixelBuffer','readExport','releaseExport','readDisplay','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','loadSegmentationModel','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','run'].includes(method)?[{signal:controller.signal,onProgress:progress=>self.postMessage({sequence,progress})}]:[]));
  if(stopping)return;const buffers=new Set();
  function collect(value){if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}if(value&&typeof value==='object')for(const child of Object.values(value))collect(child);}
  collect(result);self.postMessage({sequence,result},[...buffers]);
 }catch(error){if(!stopping)self.postMessage({sequence,error:serializeEngineError(error)});}
 finally{if(currentController===controller){currentController=null;currentSequence=null;}if(stopping)await closeForCancellation();}
},{label:'engine',onFailure(error){stopping=true;currentController?.abort();try{self.postMessage({fatal:serializeEngineError(error)});}finally{if(!currentController)void closeForCancellation();}}});
