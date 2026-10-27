import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {evaluateScopedNativeTile} from './scientific-matching.js';
import {EngineError,requireValue,serializeEngineError,normalizeResourceError} from '../../src/errors.js';
// One scalar WASM engine per worker. No nested thread pool or warm-up work.
let module, limit, abiLimit, nativePayloadBytes=0,abiBytes=0,tileSize, kernelTileSize, descriptorSide, descriptorLayout, xp, yp, out,featureUpload,scientificMask=null;
const features=new Map(),descriptorSlots=new Map();
function allocate(bytes){const p=module._malloc(bytes);if(!p)throw new EngineError('MEMORY_ALLOCATION','Evaluator heap allocation refused',{details:{requestedBytes:bytes,allocationKind:'wasm'}});if(module.HEAPU8.length>limit){module._free(p);throw new EngineError('MEMORY_LIMIT','Worker heap admission',{details:{requestedBytes:module.HEAPU8.length}});}const overhead=p-nativePayloadBytes;if(!Number.isSafeInteger(p)||p<0||p+bytes>module.HEAPU8.length||overhead>abiLimit){module._free(p);throw new EngineError('MODEL_IDENTITY','Evaluator native ABI differs',{details:{pointer:p,bytes,nativePayloadBytes,abiLimit}});}nativePayloadBytes+=bytes;abiBytes=Math.max(abiBytes,overhead);return p;}
const descriptorBytes=()=>[...descriptorSlots.values()].reduce((sum,slot)=>sum+slot.bytes,0);
function beginFeatures(data,bytes){
 requireValue(Number.isSafeInteger(data.key)&&data.key>0&&data.side===descriptorSide&&(data.channels===36||data.channels===96)&&Number.isSafeInteger(bytes)&&bytes===2*data.channels*descriptorSide**2,'Worker descriptor extent');
 requireValue(!features.has(data.key),'Duplicate descriptor');
 featureUpload=null;let slot=descriptorSlots.get(data.channels);
 if(!slot){slot={pointer:allocate(bytes),bytes,channels:data.channels,key:null};descriptorSlots.set(data.channels,slot);}
 requireValue(slot.bytes===bytes,'Worker descriptor slot extent');
 // Revoke this channel before its first in-place write. Its allocation stays
 // owned; a failed upload cannot expose the overwritten old key, while the
 // other channel remains committed. Only a complete upload publishes a key.
 if(slot.key!==null)features.delete(slot.key);slot.key=null;
 return featureUpload={key:data.key,bytes,pointer:slot.pointer,at:0,slot};
}
function commitFeatures(){const upload=featureUpload;requireValue(upload&&upload.at===upload.bytes,'Incomplete descriptor upload');upload.slot.key=upload.key;features.set(upload.key,upload.slot);featureUpload=null;}
function copyFeatures(upload,source,at){
 requireValue(Number.isSafeInteger(at)&&at>=0&&at%2===0&&source.byteOffset%2===0&&source.byteLength%2===0&&at+source.byteLength<=upload.bytes,'Aligned descriptor upload range');
 if(descriptorLayout==='CHW-uint16'){module.HEAPU8.set(source,upload.pointer+at);return;}
 // Source planes are always CHW. Permute raw half bits directly into the
 // existing channel slot, including chunks spanning a channel boundary.
 // This allocates only an alias view, never another complete descriptor bank.
 const values=new Uint16Array(source.buffer,source.byteOffset,source.byteLength/2),heapBits=new Uint16Array(module.HEAPU8.buffer),n=descriptorSide**2,channels=upload.slot.channels,base=upload.pointer/2;
 let channel=Math.floor(at/2/n),pixel=at/2%n,destination=base+pixel*channels+channel;
 for(let i=0;i<values.length;i++){heapBits[destination]=values[i];destination+=channels;if(++pixel===n){pixel=0;destination=base+(++channel);}}
}
installWorkerMessageProtocol(self,async data=>{
 const {id,type}=data;
 try{
  if(type==='init'){
   const {default:factory}=await import(data.moduleUrl);module=await factory();limit=data.heapLimit;abiLimit=data.abiLimit??1024**2;tileSize=data.tileSize;kernelTileSize=data.kernelTileSize??Math.min(512,tileSize);descriptorSide=data.side;descriptorLayout=data.descriptorLayout??'CHW-uint16';
   requireValue(Number.isInteger(tileSize)&&tileSize>=1&&tileSize<=4096&&Number.isInteger(kernelTileSize)&&kernelTileSize>=1&&kernelTileSize<=tileSize&&Number.isInteger(descriptorSide)&&descriptorSide>=2&&descriptorSide<=448,'Evaluator tile capacity');
   requireValue(Number.isSafeInteger(abiLimit)&&abiLimit>0&&abiLimit<=1024**2&&module.HEAPU8.length===16*1024**2,'Evaluator native heap contract');
   requireValue((descriptorLayout==='CHW-uint16'||descriptorLayout==='HWC-uint16')&&(module._d2prl_descriptor_layout?.()??0)===(descriptorLayout==='HWC-uint16'?1:0),'Evaluator native descriptor layout differs');
   xp=allocate(13*kernelTileSize*4);yp=allocate(13*kernelTileSize*4);out=allocate(2*kernelTileSize*4);
   self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length,descriptorBytes:descriptorBytes(),abiBytes});
  }else if(type==='features'){
   requireValue(data.values instanceof Uint16Array&&data.values.buffer instanceof ArrayBuffer,'Worker descriptor values');
   const upload=beginFeatures(data,data.values.byteLength);copyFeatures(upload,new Uint8Array(data.values.buffer,data.values.byteOffset,data.values.byteLength),0);upload.at=upload.bytes;commitFeatures();data.values=null;
   self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length,descriptorBytes:descriptorBytes(),abiBytes});
  }else if(type==='features-begin'){
   beginFeatures(data,data.bytes);self.postMessage({id,ok:true,heapBytes:module.HEAPU8.length,descriptorBytes:descriptorBytes(),abiBytes});
  }else if(type==='features-chunks'){
   requireValue(Array.isArray(data.chunks)&&data.chunks.length>0,'Descriptor upload chunks');
   for(const {at,value} of data.chunks){requireValue(featureUpload&&data.key===featureUpload.key&&Number.isSafeInteger(at)&&at===featureUpload.at&&value instanceof Uint8Array&&value.buffer instanceof ArrayBuffer&&value.byteLength>0&&value.byteLength<=featureUpload.bytes-at,'Descriptor upload range');copyFeatures(featureUpload,value,at);featureUpload.at+=value.byteLength;}self.postMessage({id,ok:true});
  }else if(type==='features-end'){
   requireValue(featureUpload&&data.key===featureUpload.key,'Descriptor upload key');commitFeatures();self.postMessage({id,ok:true});
  }else if(type==='scientific-scope'){
   requireValue(data.values===null||data.values instanceof Uint8Array&&data.values.length===descriptorSide**2&&data.values.every(v=>v===0||v===1),'Native scientific mask extent');scientificMask=data.values;
   self.postMessage({id,ok:true});
  }else if(type==='evaluate'){
   const slot=features.get(data.key),pointer=slot?.pointer,count=data.end-data.begin;
   requireValue(pointer!==undefined&&data.side===descriptorSide&&data.channels===slot.channels&&Number.isInteger(data.begin)&&Number.isInteger(data.end)&&count>=1&&count<=tileSize&&Number.isInteger(data.candidates)&&data.candidates>=1&&data.candidates<=13&&data.x instanceof Float32Array&&data.y instanceof Float32Array&&data.x.length===data.candidates*count&&data.y.length===data.candidates*count,'Worker tile');
   let x,y;try{x=new Float32Array(count);y=new Float32Array(count);}catch(error){throw normalizeResourceError(error,{requestedBytes:count*4,allocationKind:'array-buffer',allocation:'d2prl-evaluator-result'});}let computeMs=0,copyMs=0,kernelTiles=0;
   // A transport group carries candidate-major planes. Repack each kernel
   // range using its own stride, while retaining GLOBAL numerical indices.
   // Cancellation terminates this worker from the parent; no message can
   // publish a partial group. Retry uses the original committed candidates.
   const scopedStats={evaluatedSources:0,rejectedSources:0,rejectedCandidates:0,nativeCalls:0,projectedOutputs:0,unmatchedSources:0};
   for(let at=0;at<count;at+=kernelTileSize){
    const size=Math.min(kernelTileSize,count-at);let stamp=performance.now();
    if(scientificMask){
     const cx=new Float32Array(data.candidates*size),cy=new Float32Array(data.candidates*size);
     for(let k=0;k<data.candidates;k++){cx.set(data.x.subarray(k*count+at,k*count+at+size),k*size);cy.set(data.y.subarray(k*count+at,k*count+at+size),k*size);}copyMs+=performance.now()-stamp;stamp=performance.now();
     const scoped=evaluateScopedNativeTile(module,{pointer,xp,yp,out,side:data.side,channels:data.channels,candidates:data.candidates,begin:data.begin+at,end:data.begin+at+size,referenceThreads:data.referenceThreads,offsetX:cx,offsetY:cy,mask:scientificMask});
     computeMs+=performance.now()-stamp;x.set(scoped.x,at);y.set(scoped.y,at);for(const key of Object.keys(scopedStats))scopedStats[key]+=scoped.stats[key];kernelTiles++;continue;
    }
    for(let k=0;k<data.candidates;k++){module.HEAPF32.set(data.x.subarray(k*count+at,k*count+at+size),xp/4+k*size);module.HEAPF32.set(data.y.subarray(k*count+at,k*count+at+size),yp/4+k*size);}copyMs+=performance.now()-stamp;
    stamp=performance.now();if(module._d2prl_evaluate_tile(pointer,xp,yp,data.side,data.channels,data.candidates,data.begin+at,data.begin+at+size,out,out+size*4,data.referenceThreads)!==1)throw Error('Worker evaluator rejected');computeMs+=performance.now()-stamp;
    stamp=performance.now();x.set(module.HEAPF32.subarray(out/4,out/4+size),at);y.set(module.HEAPF32.subarray(out/4+size,out/4+2*size),at);copyMs+=performance.now()-stamp;kernelTiles++;
   }
   // Return transferred input ownership for the next useful range. Neither
   // worker nor caller retains an alias while these buffers are in transit.
   const reuseX=data.x,reuseY=data.y;data.x=data.y=null;
   self.postMessage({id,ok:true,x,y,reuseX,reuseY,computeMs,copyMs,kernelTiles,...(scientificMask?{scientificMatching:scopedStats}:{}),heapBytes:module.HEAPU8.length},[x.buffer,y.buffer,reuseX.buffer,reuseY.buffer]);
  }else throw Error('Unknown evaluator message');
 }catch(error){if(typeof type==='string'&&type.startsWith('features'))featureUpload=null;self.postMessage({id,ok:false,...(module?{heapBytes:module.HEAPU8.length,descriptorBytes:descriptorBytes()}:{}),error:serializeEngineError(normalizeResourceError(error))});}
},{label:'d2prl-evaluator',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
