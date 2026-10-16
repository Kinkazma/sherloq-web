import "../runtime-context.js?v=0.21.0";
import {createTemporarySession} from '../unified-engine/src/temporary-storage.js';
let session,next=1;const arrays=new Map();
self.onmessage=async({data:m})=>{
 try{
  let result,transfer=[];
  if(m.operation==='init'){session=await createTemporarySession({backend:'opfs'});result={backend:session.backend};}
  else if(m.operation==='create'){const array=await session.create(m.bytes),key=next++;arrays.set(key,array);result={key};}
  else if(m.operation==='write'){await arrays.get(m.key).write(m.bytes,m.offset);result={};}
  else if(m.operation==='read'){const bytes=new Uint8Array(m.length);await arrays.get(m.key).readInto(bytes,m.offset);result={bytes};transfer=[bytes.buffer];}
  else if(m.operation==='flush'){await arrays.get(m.key).flush();result={};}
  else if(m.operation==='remove'){await arrays.get(m.key)?.dispose();arrays.delete(m.key);result={};}
  else if(m.operation==='dispose'){await session?.dispose();arrays.clear();result={};}
  else throw Error('Unknown Comprint storage operation');
  self.postMessage({id:m.id,result},transfer);
 }catch(e){self.postMessage({id:m.id,error:{message:e.message,code:e.code,details:e.details}});}
};
