import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash,webcrypto} from 'node:crypto';
import {MEDIA_RESOURCE_PINS,readVerifiedMediaResource,mediaResourceURL} from '../src/media-resource-integrity.js';
import {nativeMagickResource} from '../src/native-magick-resources.js';
globalThis.crypto??=webcrypto;
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex'),bytes=async id=>new Uint8Array(await readFile(mediaResourceURL(id)));
test('generated media resource identities match the original PINNED sources',async()=>{
 const pinned=JSON.parse(await readFile(new URL('vendor/media/PINNED.json',root)));
 const native=JSON.parse(await readFile(new URL('vendor/media/magick-native/PINNED.json',root)));
 const nativeFiles=new Map(native.variants.flatMap(variant=>variant.files.map(file=>[file.target,file])));
 for(const[id,pin]of Object.entries(MEDIA_RESOURCE_PINS)){const body=await bytes(id);assert.equal(body.length,pin.bytes);assert.equal(sha(body),pin.sha256);assert.equal(pin.sha256,pinned.files[pin.file]??nativeFiles.get('vendor/media/'+pin.file)?.sha256);assert.equal(Object.isFrozen(pin),true);}
 for(const depth of [16,32]){
  const resource=nativeMagickResource(depth),pin=nativeFiles.get(`vendor/media/magick-native/q${depth}/native-magick.mjs`);
  const glue=await readFile(new URL(resource.moduleURL));
  assert.equal(resource.moduleSourceBytes,glue.length);
  assert.equal(resource.moduleSourceSha256,sha(glue));
  assert.equal(resource.moduleSourceSha256,pin.sha256);
  assert.equal(resource.wasmSha256,MEDIA_RESOURCE_PINS[resource.wasmResourceId].sha256);
 }
 assert.throws(()=>mediaResourceURL('../user.icc'),{code:'INVALID_INPUT'});
});
const wasmIds=['magick','avifSt','magickNative16','magickNative32'];
test('exact native Wasm reaches its caller unchanged before memory adaptation',async()=>{
 for(const id of wasmIds){const body=await bytes(id),actual=await readVerifiedMediaResource(id,{fetcher:async()=>new Response(body)});assert.equal(sha(actual),MEDIA_RESOURCE_PINS[id].sha256);assert.equal(WebAssembly.validate(actual),true);}
});
function changeValidWasm(original){
 const body=original.slice(),state={at:8};const leb=()=>{let value=0,shift=0,byte;do{byte=body[state.at++];value+=(byte&127)*2**shift;shift+=7;}while(byte&128);return value;};
 while(state.at<body.length){const id=body[state.at++],size=leb(),end=state.at+size;if(id===0){const length=leb();if(length){body[state.at]^=1;assert.equal(WebAssembly.validate(body),true);return body;}}if(id===11&&size){const altered=body.slice();altered[end-1]^=1;if(WebAssembly.validate(altered))return altered;}state.at=end;}
 throw Error('The fixture requires a mutable custom or native data section');
}
test('valid Wasm with the same length and a changed byte is rejected',async()=>{
 for(const id of wasmIds){const body=changeValidWasm(await bytes(id));await assert.rejects(readVerifiedMediaResource(id,{fetcher:async()=>new Response(body)}),{code:'DEPENDENCY_INTEGRITY'});}
});
test('fixed sRGB ICC is verified and a changed profile is rejected',async()=>{
 const body=await bytes('srgb');assert.equal(sha(await readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(body)})),MEDIA_RESOURCE_PINS.srgb.sha256);body[body.length-1]^=1;await assert.rejects(readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(body)}),{code:'DEPENDENCY_INTEGRITY'});
});
test('oversized and truncated bodies stop before returning any bytes',async()=>{
 let cancelled=false;const size=MEDIA_RESOURCE_PINS.srgb.bytes,stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(size+1));},cancel(){cancelled=true;}});
 await assert.rejects(readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(stream)}),{code:'DEPENDENCY_SIZE'});assert.equal(cancelled,true);
 await assert.rejects(readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(new Uint8Array(size-1))}),{code:'DEPENDENCY_SIZE'});
});
test('decoded compressed transfer length is pinned independently of its HTTP length',async()=>{
 const body=await bytes('srgb');assert.equal(sha(await readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(body,{headers:{'Content-Encoding':'gzip','Content-Length':'123'}})})),MEDIA_RESOURCE_PINS.srgb.sha256);
 await assert.rejects(readVerifiedMediaResource('srgb',{fetcher:async()=>new Response(body,{headers:{'Content-Length':'123'}})}),{code:'DEPENDENCY_SIZE'});
});
test('pre-aborted requests do not fetch or enter a codec',async()=>{
 const stop=new AbortController();stop.abort();let fetched=false;await assert.rejects(readVerifiedMediaResource('srgb',{signal:stop.signal,fetcher:async()=>{fetched=true;return new Response(new Uint8Array(588));}}),{code:'CANCELLED'});assert.equal(fetched,false);
});
