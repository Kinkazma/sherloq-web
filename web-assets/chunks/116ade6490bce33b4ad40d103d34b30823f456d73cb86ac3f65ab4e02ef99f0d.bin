import "../../runtime-context.js?v=0.30.0";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {deserializeEngineError,requireValue,serializeEngineError} from './errors.js';
import {createDenseMath} from './dense-math.js';
import {createDenseRegions} from './dense-regions.js';
import {strictDenseDescriptors} from './dense-strict-descriptors.js';
import {streamStrictDenseDescriptors} from './dense-strict-descriptor-stream.js';
let math,eligibility,pendingChunk,busy=false;
const publish=chunk=>new Promise((resolve,reject)=>{
 pendingChunk={token:chunk.token,resolve,reject};
 try{self.postMessage({chunk},[...new Set([chunk.first.buffer,chunk.second.buffer,chunk.mask.buffer])]);}
 catch(error){pendingChunk=null;reject(error);}
});
installWorkerMessageProtocol(self,async input=>{
 if(Object.hasOwn(input,'chunkAck')){
  requireValue(pendingChunk&&pendingChunk.token===input.chunkAck,'Unexpected native descriptor acknowledgement.');
  const waiting=pendingChunk;pendingChunk=null;input.error?waiting.reject(deserializeEngineError(input.error)):waiting.resolve();return;
 }
 requireValue(!busy,'A native descriptor context is already running.');busy=true;
 try{
  math??=await createDenseMath({print:()=>{}});
  eligibility??=await createDenseRegions();
  const result=input.compactDescriptors?await streamStrictDenseDescriptors(input,{math,eligibility,publish}):strictDenseDescriptors(input,{math,eligibility});
  self.postMessage({result},result.streamed?[]:[...new Set([result.first.buffer,result.second.buffer,result.mask.buffer])]);
 }catch(error){self.postMessage({error:serializeEngineError(error)});}finally{busy=false;}
},{label:'strict-native-dense-descriptors',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
