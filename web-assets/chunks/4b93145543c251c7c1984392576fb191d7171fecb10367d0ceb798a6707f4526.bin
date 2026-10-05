import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {EngineError,serializeEngineError,normalizeResourceError} from '../../src/errors.js';
// One scalar WASM engine per worker. No nested thread pool or warm-up work.
let module, limit, tileSize, xp, yp, out,featureUpload;
const features=new Map();
function allocate(bytes){const p=module._malloc(bytes);if(!p)throw new EngineError('MEMORY_ALLOCATION','Evaluator heap allocation refused');if(module.HEAPU8.length>limit){module._free(p);throw new EngineError('MEMORY_LIMIT','Worker heap admission');}return p;}
installWorkerMessageProtocol(self,async data=>{
 const {id,type}=data;
 try{
  if(type==='init'){
   const {default:factory}=await import(data.moduleUrl);module=await factory();limit=data.heapLimit;tileSize=data.tileSize;
   xp=allocate(13*tileSize*4);yp=allocate(13*tileSize*4);out=allocate(2*tileSize*4);
   self.postMessage({id,ok:true});
  }else if(type==='features'){
   if(features.has(data.key))throw Error('Duplicate descriptor');
   if(features.size>=3){const key=features.keys().next().value;module._free(features.get(key));features.delete(key);}
   const pointer=allocate(data.values.byteLength);module.HEAPU8.set(new Uint8Array(data.values.buffer,data.values.byteOffset,data.values.byteLength),pointer);features.set(data.key,pointer);data.values=null;
   self.postMessage({id,ok:true});
  }else if(type==='features-begin'){
   if(featureUpload){module._free(featureUpload.pointer);featureUpload=null;}
   if(features.has(data.key))throw Error('Duplicate descriptor');
   if(features.size>=3){const key=features.keys().next().value;module._free(features.get(key));features.delete(key);}
   featureUpload={key:data.key,bytes:data.bytes,pointer:allocate(data.bytes),at:0};self.postMessage({id,ok:true});
  }else if(type==='features-chunks'){
   for(const {at,value} of data.chunks){if(!featureUpload||data.key!==featureUpload.key||at!==featureUpload.at||value.byteLength>featureUpload.bytes-at)throw Error('Descriptor upload range');module.HEAPU8.set(value,featureUpload.pointer+at);featureUpload.at+=value.byteLength;}self.postMessage({id,ok:true});
  }else if(type==='features-end'){
   if(!featureUpload||data.key!==featureUpload.key||featureUpload.at!==featureUpload.bytes)throw Error('Incomplete descriptor upload');features.set(data.key,featureUpload.pointer);featureUpload=null;self.postMessage({id,ok:true});
  }else if(type==='evaluate'){
   const pointer=features.get(data.key),count=data.end-data.begin;
   if(pointer===undefined||count<1||count>tileSize)throw Error('Worker tile');
   module.HEAPF32.set(data.x,xp/4);module.HEAPF32.set(data.y,yp/4);
   if(module._d2prl_evaluate_tile(pointer,xp,yp,data.side,data.channels,data.candidates,data.begin,data.end,out,out+count*4,data.referenceThreads)!==1)throw Error('Worker evaluator rejected');
   const x=module.HEAPF32.slice(out/4,out/4+count),y=module.HEAPF32.slice(out/4+count,out/4+2*count);
   self.postMessage({id,ok:true,x,y},[x.buffer,y.buffer]);
  }else throw Error('Unknown evaluator message');
 }catch(error){self.postMessage({id,ok:false,error:serializeEngineError(normalizeResourceError(error,type==='evaluate'?{requestedBytes:(data.end-data.begin)*8}:type==='features'?{requestedBytes:data.values?.byteLength}:type==='features-begin'?{requestedBytes:data.bytes}:undefined))});}
},{label:'d2prl-evaluator',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
