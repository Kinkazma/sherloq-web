import "../../runtime-context.js?v=0.33.3";
import {EngineError,checkAbort} from './errors.js';
export const RAW_NATIVE_RESOURCE=Object.freeze({url:new URL('../vendor/libraw-native/libraw-native.wasm',import.meta.url).href,bytes:1175584,sha256:'1274c32202db8490531dc4fc899d5fa6217522454f7bf0505659975730a61537'});
export async function readVerifiedRawResource({signal,fetcher=globalThis.fetch}={}){
 checkAbort(signal);const pin=RAW_NATIVE_RESOURCE,response=await fetcher(pin.url,{signal,credentials:'same-origin',cache:'no-cache'});
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new EngineError('DEPENDENCY_HTTP','Native RAW resource download failed.',{details:{status:response.status}});}
 const reader=response.body?.getReader();if(!reader)throw new EngineError('DEPENDENCY_BODY','Native RAW resource has no response body.');let count=0,complete=false;
 try{const bytes=new Uint8Array(pin.bytes);for(;;){checkAbort(signal);const part=await reader.read();checkAbort(signal);if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>pin.bytes-count)throw new EngineError('DEPENDENCY_SIZE','Native RAW resource exceeds its pinned length.');bytes.set(part.value,count);count+=part.value.length;}
  if(count!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','Native RAW resource is truncated.');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  if(digest!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','Native RAW resource identity differs.');complete=true;return bytes;
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
