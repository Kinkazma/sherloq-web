import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeAvifNative} from '../src/avif-hdr-runtime.js';
import create from '../vendor/avif-hdr-dav1d/avif-hdr-dav1d-st.mjs';

const wasmBinary=new Uint8Array(await fs.readFile(new URL('../vendor/avif-hdr-dav1d/avif-hdr-dav1d-st.wasm',import.meta.url)));
const fixture=new Uint8Array(await fs.readFile(new URL('./fixtures/avif-preview/seams-420.avif',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function decode(options={}){
 const native=createHash('sha256'),display=createHash('sha256'),bands=[];
 const result=await decodeAvifNative(fixture,{moduleFactory:create,wasmBinary,
  onHeader:h=>({nativeBytes:h.codecMemoryBytes}),
  onWorkspaceReady:h=>({nativeBytes:h.codecMemoryBytes}),
  onBand:b=>{native.update(b.nativeBytes);display.update(b.displayBytes);bands.push([b.y,b.rows]);},
  ...options});
 return {result,native:native.digest('hex'),display:display.digest('hex'),bands};
}

test('a transferred complete preview supplies all SDR bands without losing native precision or the last row',async()=>{
 const reference=await decode({colorBackend:'cpu'});let previewHash,transferred;
 const reused=await decode({onPreview:p=>{
  assert.deepEqual([p.pixels.width,p.pixels.height],[96,257]);
  previewHash=hash(p.pixels.data);
  transferred=structuredClone(p,{transfer:[p.pixels.data.buffer]});
  assert.equal(p.pixels.data.byteLength,0,'The actual preview receiver may take ownership of its buffer.');
 }});
 assert.deepEqual(reused.bands,[[0,128],[128,128],[256,1]]);
 assert.equal(reused.native,reference.native);
 assert.equal(reused.display,reference.display);
 assert.equal(previewHash,reference.display);
 assert.equal(hash(transferred.pixels.data),reference.display);
 assert.equal(reused.result.metrics.gainMap.completePreviewReused,true);
 assert.equal(reused.result.metrics.gainMap.completePreviewRetainedBytes,96*257*3);
 assert.equal(reference.result.metrics.gainMap.completePreviewReused,false);
});

test('full-grid preview reuse avoids a second GPU projection; omitting it retains automatic GPU admission',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let attempts=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:async()=>{attempts++;return null;}}}});
 try{
  const cached=await decode({onPreview(){}});
  assert.equal(attempts,0);assert.equal(cached.result.metrics.gainMap.backend,'cpu');
  await decode();assert.equal(attempts,1,'Automatic projection still requests the GPU when there is no reusable result.');
  await decode({colorBackend:'cpu'});assert.equal(attempts,1);
 }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});

test('cancellation after preview publication does not publish partial native bands and closes the codec',async()=>{
 const controller=new AbortController();let closed=0,published=0;
 await assert.rejects(decode({signal:controller.signal,moduleFactory:async o=>{
  const m=await create(o),close=m._hdr_avif_close;
  m._hdr_avif_close=(...args)=>{closed++;return close(...args);};return m;
 },onPreview:p=>{structuredClone(p,{transfer:[p.pixels.data.buffer]});controller.abort();},onBand:()=>published++}),e=>e.code==='CANCELLED');
 assert.equal(published,0);assert.equal(closed,2,'Header bootstrap and full decoder both retire.');
});
