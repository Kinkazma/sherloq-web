import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createTesseractOcr} from '../src/tesseract-ocr.js';
const wasm=new Uint8Array(await readFile(new URL('../vendor/text-ocr/tesseract-core-simd-lstm.wasm',import.meta.resolve('../src/text-ocr-assets.js')))),language=Uint8Array.of(1,2,3),sha=createHash('sha256').update(language).digest('hex');
function fixture({never=false,badIdentity=false}={}){
 const budget=new Budget(512*1024**2),messages=[],created=[];
 class FakeWorker{
  addEventListener(){}removeEventListener(){}
  postMessage(data){messages.push(data.kind);if(never)return;queueMicrotask(()=>{if(this.terminated)return;if(data.kind==='init')this.onmessage?.({data:{ready:true,version:'native-test',heapBytes:24*1024**2}});else if(data.kind==='tile'){this.tile=data;this.onmessage?.({data:{admissionBytes:1024}});}else if(data.kind==='admitted')this.onmessage?.({data:{regions:[{text:'été',bounds:[1,2,8,9],confidence:42,score:.42,tile:this.tile.tile,lineKey:'0/1/1/1/1'}],nativeText:'été\n',heapBytes:24*1024**2}});});}
  terminate(){this.terminated=true;}
 }
 const api=createTesseractOcr({budget,profile:{maxWorkers:4},configuration:{languages:{eng:{data:language,bytes:3,sha256:badIdentity?'0'.repeat(64):sha}}},workerFactory:()=>{const w=new FakeWorker();created.push(w);return w;},assetLoader:async key=>key.startsWith('runtime/')?wasm:language});
 const image={width:12,height:12,format:'rgb8',data:new Uint8Array(12*12*3)};
 return {api,budget,messages,created,image};
}
test('Tesseract transcription uses shared CPU admission, response admission and native values',async()=>{const h=fixture(),result=await h.api.analyze(h.image,{language:'eng',psm:11});assert.deepEqual(h.messages,['init','tile','admitted']);assert.equal(result.regions[0].text,'été');assert.equal(result.regions[0].confidence,42);assert.equal(result.nativeText,'été\n');assert.equal(result.metrics.workers,1);assert.ok(h.created.every(w=>w.terminated));result.release();await h.api.dispose();assert.equal(h.budget.total(),0);});
test('initialization cancellation retires the worker and releases every reservation',async()=>{const h=fixture({never:true}),c=new AbortController(),p=h.api.analyze(h.image,{language:'eng',psm:11},{signal:c.signal});while(!h.created.length)await new Promise(r=>setTimeout(r,1));c.abort();await assert.rejects(p,{code:'CANCELLED'});await h.api.dispose();assert.equal(h.budget.total(),0);assert.ok(h.created.every(w=>w.terminated));});
test('missing language is explicit and does not allocate a worker',async()=>{const h=fixture();await assert.rejects(h.api.analyze(h.image,{language:'fra',psm:11}),{code:'MODEL_UNAVAILABLE'});assert.equal(h.created.length,0);await h.api.dispose();assert.equal(h.budget.total(),0);});
test('asset identity mismatch leaves no cached unverified bytes',async()=>{const h=fixture({badIdentity:true});await assert.rejects(h.api.analyze(h.image,{language:'eng',psm:11}),{code:'ASSET_INTEGRITY'});assert.equal(h.created.length,0);await h.api.dispose();assert.equal(h.budget.total(),0);});
