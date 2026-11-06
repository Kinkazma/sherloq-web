import "../../runtime-context.js?v=0.31.0";
import {EngineError,checkAbort,requireValue} from './errors.js';

// Generated from vendor/media/PINNED.json and the pinned physical lengths.
// BEGIN GENERATED MEDIA PINS
export const MEDIA_RESOURCE_PINS=Object.freeze({
 magick:Object.freeze({file:'magick/x86/magick.wasm',url:new URL('../vendor/media/magick/x86/magick.wasm',import.meta.url).href,bytes:15447097,sha256:'b7d6710436b150dc5bd1ca04d80b6b7614c54854d7470f888f7e69a2a41b00e4'}),
 avifSt:Object.freeze({file:'avif/avif-st.wasm',url:new URL('../vendor/media/avif/avif-st.wasm',import.meta.url).href,bytes:6075534,sha256:'8a0468a7f68d2eb915d14571ad046272e4db3c8ba25ff2518aacb2fd37b32800'}),
 srgb:Object.freeze({file:'srgb.icc',url:new URL('../vendor/media/srgb.icc',import.meta.url).href,bytes:588,sha256:'43a3c4fdd280876312a6e0f98fb408528d5ba8ba0af6f9f78b7939730303d77a'})
});
// END GENERATED MEDIA PINS

export function mediaResourceURL(id){
 requireValue(Object.hasOwn(MEDIA_RESOURCE_PINS,id),'Unknown pinned media resource.');
 return new URL(MEDIA_RESOURCE_PINS[id].url);
}
// Verify the original bytes before a caller changes a Wasm memory declaration
// or initializes a codec. The supplied URL and expected identity are not input
// parameters: user ICC profiles and arbitrary modules cannot enter this path.
export async function readVerifiedMediaResource(id,{signal,fetcher=globalThis.fetch}={}){
 const url=mediaResourceURL(id),pin=MEDIA_RESOURCE_PINS[id];checkAbort(signal);
 const response=await fetcher(url,{signal,credentials:'same-origin',cache:'no-cache'});checkAbort(signal);
 const details={resource:pin.file,requestedURL:url.href,expectedBytes:pin.bytes,expectedSha256:pin.sha256};
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new EngineError('DEPENDENCY_HTTP','Pinned media resource download failed.',{details:{...details,status:response.status}});}
 const reader=response.body?.getReader();
 if(!reader)throw new EngineError('DEPENDENCY_BODY','Pinned media resource response body is missing.',{details});
 let count=0,complete=false;const declared=response.headers?.get('content-length'),encoded=response.headers?.get('content-encoding');
 try{
  // Content-Length describes compressed transfer bytes when Content-Encoding
  // is present; the decoded body still has the exact pinned length below.
  if(!encoded&&/^\d+$/.test(declared??'')&&Number(declared)!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','Pinned media resource length differs.',{details:{...details,declaredBytes:declared}});
  const bytes=new Uint8Array(pin.bytes);
  for(;;){
   checkAbort(signal);const part=await reader.read();checkAbort(signal);
   if(part.done)break;
   if(!(part.value instanceof Uint8Array)||part.value.byteLength>pin.bytes-count)throw new EngineError('DEPENDENCY_SIZE','Pinned media resource exceeds its expected length.',{details:{...details,receivedBytes:count+(part.value?.byteLength??0)}});
   bytes.set(part.value,count);count+=part.value.byteLength;
  }
  if(count!==pin.bytes)throw new EngineError('DEPENDENCY_SIZE','Pinned media resource is truncated.',{details:{...details,receivedBytes:count}});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  if(digest!==pin.sha256)throw new EngineError('DEPENDENCY_INTEGRITY','Pinned media resource SHA-256 differs.',{details:{...details,receivedBytes:count,receivedSha256:digest}});
  complete=true;return bytes;
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
