import "../../runtime-context.js?v=0.14.5";
import {createEngine} from './index.js';
let engine,currentController,currentSequence,stopping=false,shutdown;
function closeForCancellation(){if(shutdown)return shutdown;shutdown=(async()=>{try{self.postMessage({shutdownPhase:'closing-storage'});await engine?.dispose();self.postMessage({storageClosed:true});}catch(error){self.postMessage({storageClosed:false,shutdownError:{code:error.code??'INTERNAL'}});}})();return shutdown;}
self.onmessage=async ({data:{sequence,method,args,options}})=>{
 if(method==='cancel-task'){if(currentSequence===sequence)currentController?.abort();return;}
 if(method==='cancel-and-close'){stopping=true;self.postMessage({shutdownPhase:'abort-received'});currentController?.abort();if(!currentController)await closeForCancellation();return;}
 const controller=new AbortController();currentController=controller;currentSequence=sequence;
 try {
  if(stopping)return;
  if(method==='init'){engine=createEngine({...options,onTemporarySession:storageSession=>self.postMessage({storageSession})});self.postMessage({sequence,result:engine.capabilities()});return;}
  if(!engine || !['capabilities','load','loadBlob','loadAutomaticModels','updateAutomatic','renderAutomatic','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','releaseSurface','readPlane','exportSurface','readExport','releaseExport','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','originalBlob','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','unloadD2prlModel','readD2prlRaw','loadM3Models','unloadM3Models','loadSegmentationModel','unloadSegmentationModel','readSegmentationRaw','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','exportPrnuDatabase','run','exportResult','original','imagePixels','unload','dispose'].includes(method))throw new Error('Invalid worker method.');
  const result=await engine[method](...args,...(['load','loadBlob','loadAutomaticModels','updateAutomatic','renderAutomatic','exportAutomatic','exportResultFile','releaseAutomatic','inspectHeaders','inspectMetadata','deriveOriginal','releaseSurface','readPlane','exportSurface','readExport','releaseExport','readPixels','readMask','readFlags','readTable','readTableCsv','readNpz','releaseTable','readOriginal','loadMedianModel','loadQualityModel','loadD2prlModel','loadSegmentationModel','loadPrnuDatabase','buildPrnuDatabase','createPrnuDatabaseExport','run'].includes(method)?[{signal:controller.signal,onProgress:progress=>self.postMessage({sequence,progress})}]:[]));
  if(stopping)return;const buffers=new Set();
  function collect(value){if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}if(value&&typeof value==='object')for(const child of Object.values(value))collect(child);}
  collect(result);self.postMessage({sequence,result},[...buffers]);
 }catch(error){if(!stopping)self.postMessage({sequence,error:{code:error.code??'INTERNAL',message:error.code?error.message:'Engine task failed.'}});}
 finally{if(currentController===controller){currentController=null;currentSequence=null;}if(stopping)await closeForCancellation();}
};
