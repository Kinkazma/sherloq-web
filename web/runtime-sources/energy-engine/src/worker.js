import {createEngine} from './index.js';
let engine,currentController,stopping=false,shutdown;
function closeForCancellation(){if(shutdown)return shutdown;shutdown=(async()=>{try{self.postMessage({shutdownPhase:'closing-storage'});await engine?.dispose();self.postMessage({storageClosed:true});}catch(error){self.postMessage({storageClosed:false,shutdownError:{code:error.code??'INTERNAL'}});}})();return shutdown;}
self.onmessage=async ({data:{sequence,method,args,options}})=>{
 if(method==='cancel-and-close'){stopping=true;self.postMessage({shutdownPhase:'abort-received'});currentController?.abort();if(!currentController)await closeForCancellation();return;}
 const controller=new AbortController();currentController=controller;
 try {
  if(stopping)return;
  if(method==='init'){engine=createEngine({...options,onTemporarySession:storageSession=>self.postMessage({storageSession})});self.postMessage({sequence,result:engine.capabilities()});return;}
  if(!engine || !['capabilities','load','loadBlob','releaseSurface','readPixels','readMask','readFlags','readTable','readTableCsv','releaseTable','originalBlob','readOriginal','loadMedianModel','loadQualityModel','loadPrnuDatabase','buildPrnuDatabase','exportPrnuDatabase','run','exportResult','original','imagePixels','unload','dispose'].includes(method))throw new Error('Invalid worker method.');
  const result=await engine[method](...args,...(['load','loadBlob','releaseSurface','readPixels','readMask','readFlags','readTable','readTableCsv','releaseTable','readOriginal','loadMedianModel','loadQualityModel','loadPrnuDatabase','buildPrnuDatabase','run'].includes(method)?[{signal:controller.signal,onProgress:progress=>self.postMessage({sequence,progress})}]:[]));
  if(stopping)return;const buffers=new Set();
  function collect(value){if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return;}if(value&&typeof value==='object')for(const child of Object.values(value))collect(child);}
  collect(result);self.postMessage({sequence,result},[...buffers]);
 }catch(error){if(!stopping)self.postMessage({sequence,error:{code:error.code??'INTERNAL',message:error.code?error.message:'Engine task failed.'}});}
 finally{if(currentController===controller)currentController=null;if(stopping)await closeForCancellation();}
};
