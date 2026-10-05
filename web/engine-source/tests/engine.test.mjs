import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';import {initJpegWasm} from '../src/jpeg.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
const bytes=new Uint8Array(await readFile(new URL('../fixtures/synthetic.jpg',import.meta.url)));
const reference=JSON.parse(await readFile(new URL('../fixtures/reference.json',import.meta.url))).cases[0];
const request={id:'t',imageId:'i',operation:'ela.classic'};
test('End-to-end native parity, defensive ownership, caches and lifecycle',async()=>{
 const e=createEngine();const input=bytes.slice();await e.load({id:'i',bytes:input});input.fill(0);assert.deepEqual(e.original('i'),bytes);
 const result=await e.run(request);const expected=reference.expected.find(x=>!x.params.linear&&!x.params.grayscale&&x.params.scale===50);
 assert.equal(createHash('sha256').update(result.pixels.data).digest('hex'),expected.sha256);
 const r2=await e.run(request);assert.equal(r2.metrics.cache.result,true);r2.pixels.data.fill(0);
 const r3=await e.run(request);assert.deepEqual(r3.pixels.data,result.pixels.data);
 const r4=await e.run({...request,params:{scale:37}});assert.equal(r4.metrics.cache.base,true);assert.equal(r4.metrics.codecMs,0);
 e.unload('i');assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.cacheBytes,0);
 e.dispose();await assert.rejects(e.run(request),{code:'DISPOSED'});
});
test('Admission, unsupported modes, cancellation and no half-loaded image',async()=>{
 const small=createEngine({memoryBudgetBytes:1024});await assert.rejects(small.load({id:'i',bytes}),{code:'MEMORY_LIMIT'});
 const e=createEngine();await e.load({id:'i',bytes});
 await assert.rejects(e.run({...request,backend:'gpu'}),{code:'UNSUPPORTED_BACKEND'});
 await assert.rejects(e.run({...request,regions:[[0,0,2,2]]}),{code:'UNSUPPORTED_REGION'});
 await assert.rejects(e.run({...request,operation:'ela.ghosts'}),{code:'UNSUPPORTED_OPERATION'});
 assert.ok(e.capabilities().operations.some(operation=>operation.id==='ela.biomes'));
 await assert.rejects(e.run({...request,operation:'ela.biomes'}),{code:'INVALID_INPUT',message:'Image too small for 25 complete native ELA cells'});
 const c=new AbortController();await assert.rejects(e.run(request,{signal:c.signal,onProgress:p=>{if(p.phase==='base')c.abort();}}),{code:'CANCELLED'});
 assert.equal(e.capabilities().memory.activeReservationBytes,0);assert.equal(e.capabilities().memory.cacheBytes,0);
 await e.run(request);e.dispose();
});
test('Concurrent work rejected, quality invalidates recompression',async()=>{
 const e=createEngine();await e.load({id:'i',bytes});const first=e.run(request);await assert.rejects(e.run(request),{code:'BUSY'});await first;
 const next=await e.run({...request,params:{quality:76}});assert.equal(next.metrics.cache.recompressed,false);assert.equal(next.metrics.cache.base,false);assert.ok(next.metrics.codecMs>0);e.dispose();
});
test('Measured large-image lookup path stays byte-exact and reuses JPEG on gain change',async()=>{
 const data=new Uint8Array(await readFile(new URL('../fixtures/bench-512.jpg',import.meta.url)));
 const reference=createEngine({cpuKernel:'reference'}),fast=createEngine();
 await reference.load({id:'i',bytes:data});await fast.load({id:'i',bytes:data});
 for(const params of [{},{scale:37,contrast:59,grayscale:true},{quality:100,linear:true,scale:1}]){
  const a=await reference.run({...request,params}),b=await fast.run({...request,params});assert.deepEqual(a.pixels.data,b.pixels.data);assert.equal(b.metrics.kernel,'cpu-lookup');if(params.scale===37){assert.equal(b.metrics.cache.recompressed,true);assert.equal(b.metrics.codecMs,0);}
 }
 reference.dispose();fast.dispose();
});
