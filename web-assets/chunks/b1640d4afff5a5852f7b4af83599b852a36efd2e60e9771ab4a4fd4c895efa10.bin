import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';
// Caller owns the destination choice. Await every write before requesting another
// page; no Blob concatenation or complete encoded byte array is created here.
export async function pipeRasterExport(engine,descriptor,writable,{signal,onProgress,release=true}={}){
 requireValue(writable&&typeof writable.getWriter==='function','A caller-supplied WritableStream is required.');const writer=writable.getWriter();let failure;
 try{let offset=0;while(offset<descriptor.byteLength){checkAbort(signal);const page=await engine.readExport({exportId:descriptor.id,revision:descriptor.revision,offset,length:Math.min(1024**2,descriptor.byteLength-offset)},{signal});checkAbort(signal);await writer.write(page.bytes);offset=page.nextOffset;onProgress?.({id:descriptor.id,phase:'write-export',fraction:offset/descriptor.byteLength});}checkAbort(signal);await writer.close();}
 catch(error){failure=error;try{await writer.abort(error);}catch{}throw error;}
 finally{writer.releaseLock();if(release)try{await engine.releaseExport(descriptor.id);}catch(error){if(!failure)throw error;}}
}
