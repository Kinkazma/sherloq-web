import "../../runtime-context.js?v=0.33.3";
import {EngineError,checkAbort,requireValue} from './errors.js';

const root=new URL('../vendor/lcms-display-cpu/',import.meta.url);
export const LCMS_DISPLAY_CPU_RESOURCES=Object.freeze({
 scalar:Object.freeze({url:new URL('lcms-linear-scalar.wasm',root).href,bytes:7516,sha256:'25c8839c994f72939f06e75ef3e823bb27a0366fe9b6881f95bd49909e04a031'}),
 simd:Object.freeze({url:new URL('lcms-linear-simd.wasm',root).href,bytes:10164,sha256:'080d5e9f91e4c7d2fae46a2bcf6345c27fb5199aed741ad762d5a91146c9844d'})
});
// An instruction capability check, never a performance probe or discarded
// image conversion. Both implementations execute the same numerical model.
const SIMD_TYPE=Uint8Array.of(0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11);
export function lcmsDisplayCpuHasSimd(){try{return WebAssembly.validate(SIMD_TYPE);}catch{return false;}}
export async function readVerifiedLcmsDisplayCpuResource({variant,signal,fetcher=globalThis.fetch}={}){
 requireValue(Object.hasOwn(LCMS_DISPLAY_CPU_RESOURCES,variant),'A qualified CPU color implementation is required.');checkAbort(signal);
 const pin=LCMS_DISPLAY_CPU_RESOURCES[variant],response=await fetcher(pin.url,{signal,credentials:'same-origin',cache:'no-cache'});
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new EngineError('DEPENDENCY_HTTP','CPU color resource download failed.',{details:{status:response.status}});}
 const reader=response.body?.getReader();if(!reader)throw new EngineError('DEPENDENCY_BODY','CPU color resource has no response body.');let count=0,complete=false;
 try{const bytes=new Uint8Array(pin.bytes);for(;;){checkAbort(signal);const part=await reader.read();checkAbort(signal);if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>pin.bytes-count)throw new EngineError('DEPENDENCY_SIZE','CPU color resource exceeds its pinned length.');bytes.set(part.value,count);count+=part.value.length;}if(count!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','CPU color resource is truncated.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');checkAbort(signal);if(hash!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','CPU color resource identity differs.');complete=true;return bytes;}finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
