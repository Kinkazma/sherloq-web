import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createEngine} from '../src/index.js';import {checkPngStream} from './png-stream-fixture.js';
const root=new URL('./data/png-stream/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root)));
test('22MP public PNG stream and six native hashes retain source bytes without contiguous staging',async()=>{
 class EncodedBlob extends Blob {arrayBuffer(){throw Error('Whole encoded PNG staging forbidden');}}const engine=createEngine({memoryBudgetBytes:192*1024**2,cpuKernel:'single'});try{await checkPngStream(engine,new EncodedBlob([await readFile(new URL(ref.cases[0].file,root))]),ref.cases[0],{storage:'memory'});}finally{await engine.dispose();}
});
test('Adam7 segmented source supports the non-JPEG quality curve and explicit decode cancellation',async()=>{
 const blob=new Blob([await readFile(new URL(ref.cases[1].file,root))]),engine=createEngine({memoryBudgetBytes:45*1024**2,cpuKernel:'single'}),controller=new AbortController();
 try{await assert.rejects(engine.loadBlob({id:'cancel',blob},{signal:controller.signal,onProgress:e=>{if(e.phase==='decode'&&e.fraction>.15)controller.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);
  const loaded=await engine.loadBlob({id:'i',blob});assert.equal(loaded.provenance.layout,'segmented-scanlines');const result=await engine.run({id:'quality',imageId:'i',operation:'jpeg.quality'});assert.equal(result.data.quantization,null);assert.equal(result.data.estimate,null);assert.equal(result.data.metadataError,null);assert.equal(result.data.raw.length,100);assert.match(result.data.modelError,/local JPEG-quality/);
 }finally{await engine.dispose();}
});
test('segmented animated PNG is explicitly refused before frame interpretation',async()=>{
 const original=new Uint8Array(await readFile(new URL(ref.cases[0].file,root))),chunk=new Uint8Array(20);new DataView(chunk.buffer).setUint32(0,8);chunk.set(new TextEncoder().encode('acTL'),4);new DataView(chunk.buffer).setUint32(8,1);const engine=createEngine({memoryBudgetBytes:96*1024**2});try{await assert.rejects(engine.loadBlob({id:'animation',blob:new Blob([original.subarray(0,33),chunk,original.subarray(33)])}),{code:'UNSUPPORTED_FORMAT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);}finally{await engine.dispose();}
});
