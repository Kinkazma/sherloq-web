import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';import {Budget} from '../src/cache.js';import {createBlobSource} from '../src/blob-source.js';import {fileDigest,digestParams} from '../src/digest.js';import {hexParams,hexView} from '../src/metadata.js';import {initJpegWasm} from '../src/jpeg.js';
const algorithms={'MD5':'md5','SHA-1':'sha1','SHA2-224':'sha224','SHA2-256':'sha256','SHA2-384':'sha384','SHA2-512':'sha512','SHA3-224':'sha3-224','SHA3-256':'sha3-256','SHA3-384':'sha3-384','SHA3-512':'sha3-512'};
test('Original Blob hashing/hex windows preserve ten independent digests, seams, EOF and cancellation',async()=>{
 assert.deepEqual(digestParams(),{imageHashes:true});assert.throws(()=>digestParams({imageHashes:0}),{code:'INVALID_INPUT'});
 for(const bytes of [new Uint8Array(),new TextEncoder().encode('abc'),Uint8Array.from({length:2*1024**2+17},(_,i)=>i*37)]){
  const budget=new Budget(2*1024**2),source=createBlobSource(new Blob([bytes]),{budget,chunkBytes:65537});
  try{
   const actual=await fileDigest(null,digestParams({imageHashes:false}),{},{source});for(const [label,algorithm] of Object.entries(algorithms))assert.equal(actual.data.hashes[label],createHash(algorithm).update(bytes).digest('hex'));assert.deepEqual(actual.data.imageHashes,{});assert.match(actual.data.imageHashStatus,/Not requested/);
   for(const offset of [0,Math.min(65530,bytes.length),bytes.length]){const p=hexParams({offset,length:65536}),actual=await hexView(null,p,{},{source}),expected=await hexView(null,p,{},{bytes});assert.deepEqual(actual,expected);}
   await assert.rejects(hexView(null,hexParams({offset:bytes.length+1}),{},{source}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
   if(bytes.length){const controller=new AbortController();await assert.rejects(fileDigest(null,digestParams({imageHashes:false}),{signal:controller.signal,onProgress:()=>controller.abort()},{source}),{code:'CANCELLED'});assert.equal(budget.total(),0);}
  }finally{source.dispose();}
 }
});
test('Public segmented byte operations allow explicit visual-hash opt-out, cache immutable data and retain source bytes',async()=>{
 await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});const bytes=new Uint8Array(await readFile(new URL('../fixtures/bench-1024.jpg',import.meta.url))),engine=createEngine({memoryBudgetBytes:52*1024**2});
 try{
  const loaded=await engine.loadBlob({id:'i',blob:new Blob([bytes])});assert.equal(loaded.provenance.layout,'segmented-scanlines');assert.equal(loaded.operationConstraints?.['file.digest'],undefined);assert.ok(loaded.availableOperations.includes('file.hex'));
  await assert.rejects(engine.run({id:'visual',imageId:'i',operation:'file.digest'}),{code:'MEMORY_LIMIT'});await assert.rejects(engine.run({id:'bad',imageId:'i',operation:'file.digest',params:{imageHashes:0}}),{code:'INVALID_INPUT'});
  const task={id:'hash',imageId:'i',operation:'file.digest',params:{imageHashes:false}},a=await engine.run(task);for(const [label,algorithm] of Object.entries(algorithms))assert.equal(a.data.hashes[label],createHash(algorithm).update(bytes).digest('hex'));assert.equal(a.metrics.cache.result,false);a.data.hashes.MD5='mutated';const b=await engine.run(task);assert.equal(b.metrics.cache.result,true);assert.notEqual(b.data.hashes.MD5,'mutated');assert.equal(b.provenance.params.imageHashes,false);
  const hex={id:'hex',imageId:'i',operation:'file.hex',params:{offset:100,length:65536}},r=await engine.run(hex);assert.deepEqual(r.data.bytes,bytes.slice(100,65636));r.data.bytes.fill(0);const again=await engine.run(hex);assert.equal(again.metrics.cache.result,true);assert.deepEqual(again.data.bytes,bytes.slice(100,65636));assert.equal(new TextDecoder().decode(engine.exportResult(b,{format:'json'}).bytes).includes('Not requested'),true);
  await engine.unload('i');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.cacheBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);await assert.rejects(engine.run(task),{code:'NOT_FOUND'});
 }finally{await engine.dispose();}
});
