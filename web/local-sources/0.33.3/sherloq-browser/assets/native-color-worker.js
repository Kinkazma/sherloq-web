import {createNativeJpegColorReader} from './native-jpeg-color-reader.js?v=0.33.3';
import {createNativeTiffColorReader} from './native-tiff-color-reader.js?v=0.33.3';
import {Budget} from './unified-engine/src/cache.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {EngineError,requireValue,checkAbort,serializeEngineError} from './unified-engine/src/errors.js';
import {displayGeometry} from './unified-engine/src/display-sampling.js';
import {allocateOwnedTypedArray} from './unified-engine/src/allocation.js';

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
  if(action==='read-sampled'){
   // The existing seek reader keeps its 1024² exact window contract. Sample
   // those finite windows inside this Worker, not through one RPC per row.
   const tile=payload?.tile,capability=reader.capability,g=displayGeometry(capability,tile),channels=capability.channels.length,Type=capability.depth===16?Uint16Array:Uint8Array;
   const output=allocateOwnedTypedArray(Type,g.width*g.height*channels,{budget,label:'native-colour-sampled-frame'});
   try{const chunk=Math.max(1,Math.floor(1023/tile.step)+1);
    for(let y=0;y<g.height;y+=chunk)for(let x=0;x<g.width;x+=chunk){
     checkAbort(controller?.signal);const w=Math.min(chunk,g.width-x),h=Math.min(chunk,g.height-y),rect={x:tile.x+x*tile.step,y:tile.y+y*tile.step,width:(w-1)*tile.step+1,height:(h-1)*tile.step+1},window=await reader.readWindow(rect,{signal:controller?.signal});
     try{const p=window.pixels;requireValue(p?.data instanceof Type&&p.channels===channels&&p.depth===capability.depth&&p.width===rect.width&&p.height===rect.height,'Native sampled colour window differs from its exact reader.');for(let row=0;row<h;row++)for(let col=0;col<w;col++){const from=(row*tile.step*p.width+col*tile.step)*channels,to=((y+row)*g.width+x+col)*channels;for(let c=0;c<channels;c++)output.data[to+c]=p.data[from+c];}}
     finally{window.release();}
    }
    checkAbort(controller?.signal);const pixels={width:g.width,height:g.height,format:capability.space.toLowerCase()+capability.depth,space:capability.space,channels,depth:capability.depth,sampleType:capability.depth===16?'uint16':'uint8',origin:{x:tile.x,y:tile.y},samplingStep:tile.step,logicalRect:{x:tile.x,y:tile.y,width:tile.w,height:tile.h},data:output.data};self.postMessage({id,result:{pixels}},[pixels.data.buffer]);
   }finally{output.release();}return;
  }
  throw new EngineError('INVALID_INPUT','Unknown native colour action.');
 }catch(error){self.postMessage({id,error:serializeEngineError(error)});}
}
self.onmessage=({data})=>{
 if(data?.action==='cancel'){controller?.abort();return;}
 queue=queue.then(()=>handle(data),()=>handle(data));
};
