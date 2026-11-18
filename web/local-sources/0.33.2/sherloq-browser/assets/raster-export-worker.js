import {Budget} from './unified-engine/src/cache.js';
import {createRasterExports} from './unified-engine/src/raster-export.js';
import {serializeEngineError,deserializeEngineError} from './unified-engine/src/errors.js';
let controller,serial=0;const pending=new Map();
const ask=(request,value)=>new Promise((resolve,reject)=>{const sequence=++serial;pending.set(sequence,{resolve,reject});postMessage({request,value,sequence},value instanceof Uint8Array?[value.buffer]:[]);});
self.onmessage=async({data})=>{
 if(data.reply){const item=pending.get(data.reply);pending.delete(data.reply);if(item)data.error?item.reject(deserializeEngineError(data.error)):item.resolve(data.value);return;}
 if(data.cancel){controller?.abort();for(const item of pending.values())item.reject(Object.assign(Error('Cancelled'),{code:'CANCELLED'}));pending.clear();return;}
 controller=new AbortController();const budget=new Budget(data.memoryBudgetBytes),exports=createRasterExports(budget,{onTemporarySession:session=>postMessage({temporarySession:session})});
 try{const surface={descriptor:{id:'presentation',revision:1,width:data.width,height:data.height,format:'rgb8',storage:'temporary'},async readWindow(rect){const release=budget.reserve(rect.width*rect.height*3);try{const {bytes}=await ask('pixels',rect);return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:bytes},release};}catch(error){release();throw error;}}};
  const descriptor=await exports.create(surface,{...data.options,storage:'temporary'},{signal:controller.signal,onProgress:progress=>postMessage({progress})});
  await ask('start',descriptor);
  for(let offset=0;offset<descriptor.byteLength;offset+=1024**2){const page=await exports.read({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal:controller.signal});await ask('chunk',page.bytes);}
  await exports.release(descriptor.id);await exports.clear();postMessage({done:true,descriptor});
 }catch(error){try{await exports.clear();}catch(cleanup){error.cleanupError=cleanup;}postMessage({error:serializeEngineError(error)});}finally{controller=null;}
};
