import {createNativeJpegColorReader} from './native-jpeg-color-reader.js?v=0.33.1';
import {createNativeTiffColorReader} from './native-tiff-color-reader.js?v=0.33.1';
import {Budget} from './unified-engine/src/cache.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './unified-engine/src/errors.js';

let reader=null,budget=null,controller=null,session=null,sessionOpening=null,queue=Promise.resolve(),closed=false;
async function retire(){
 await reader?.dispose();reader=null;await sessionOpening?.catch(()=>{});if(session){await session.dispose();session=null;}
 requireValue(!budget||budget.total()===0,'Native-color owners have not acknowledged retirement.');budget=null;closed=true;return{disposed:true};
}
async function handle({id,action,payload}={}){
 try{
  if(action==='dispose'){const result=await retire();self.postMessage({id,result});return;}
  if(closed)throw new EngineError('DISPOSED','Native-color worker is closed.');
  if(action==='load'){
   requireValue(!reader&&!budget,'Native-color worker already owns a source.');requireValue(payload?.blob instanceof Blob&&Number.isSafeInteger(payload.memoryBudgetBytes)&&payload.memoryBudgetBytes>0,'A financed Original Blob is required.');
   controller=new AbortController();budget=new Budget(payload.memoryBudgetBytes);
   const getTemporarySession=async()=>{if(session)return session;if(!sessionOpening)sessionOpening=(async()=>{const value=await createTemporarySession({budget,signal:controller.signal,id:payload.temporarySessionId});session=value;self.postMessage({temporarySession:{id:value.id,backend:value.backend}});checkAbort(controller.signal);return value;})();return sessionOpening;};
   const signature=new Uint8Array(await payload.blob.slice(0,4).arrayBuffer());checkAbort(controller.signal);
   const jpeg=signature[0]===255&&signature[1]===216,tiff=signature[0]===73&&signature[1]===73||signature[0]===77&&signature[1]===77;
   if(!jpeg&&!tiff)throw new EngineError('NATIVE_COLOR_UNSUPPORTED','This source has no qualified native colour-window reader.');
   reader=await(jpeg?createNativeJpegColorReader:createNativeTiffColorReader)({blob:payload.blob,sourceSha256:payload.sourceSha256,width:payload.width,height:payload.height,budget,signal:controller.signal,getTemporarySession,onProgress:progress=>self.postMessage({id,progress})});
   const capability=reader.capability;requireValue(capability.width===payload.width&&capability.height===payload.height&&capability.sourceSha256===payload.sourceSha256,'Native colour reader differs from the Original identity.');
   self.postMessage({id,result:{capability,metrics:reader.metrics??null}});return;
  }
  requireValue(reader,'A native Original colour source must be loaded first.');
  if(action==='read'){
   const window=await reader.readWindow(payload?.rect,{signal:controller?.signal});
   try{const pixels=window.pixels;requireValue(pixels?.data&&pixels.width===payload.rect.width&&pixels.height===payload.rect.height,'Native colour window differs from its requested grid.');self.postMessage({id,result:{pixels}},[pixels.data.buffer]);}finally{window.release();}return;
  }
  throw new EngineError('INVALID_INPUT','Unknown native colour action.');
 }catch(error){self.postMessage({id,error:serializeEngineError(error)});}
}
self.onmessage=({data})=>{
 if(data?.action==='cancel'){controller?.abort();return;}
 queue=queue.then(()=>handle(data),()=>handle(data));
};
