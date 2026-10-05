import test from 'node:test';import assert from 'node:assert/strict';
import {deriveOriginalBytes} from '../src/derive-original.js';import {Budget} from '../src/cache.js';import {createEngine} from '../src/index.js';
const bytes=s=>new TextEncoder().encode(s),str=async blob=>blob.text();
test('overwrite, insertion, deletion and EOF insertion use original coordinates and own input snapshots',async()=>{
 const budget=new Budget(1024**2),source=bytes('0123456789'),patches=[{offset:0,deleteCount:1,bytes:bytes('AB')},{offset:3,deleteCount:0,bytes:bytes('!')},{offset:5,deleteCount:2,bytes:new Uint8Array()},{offset:10,deleteCount:0,bytes:bytes('END')}];
 const pending=deriveOriginalBytes(source,patches,{budget});source.fill(88);patches[0].bytes.fill(90);patches[1].offset=1;patches.pop();
 const result=await pending;assert.equal(await str(result.blob),'AB12!34789END');assert.equal(result.sizeBytes,13);assert.deepEqual(result.edits.map(e=>e.outputOffset),[0,4,7,10]);assert.equal(result.blob.type,'application/octet-stream');assert.equal(budget.active,0);
});
test('invalid edits, memory refusal and cancellation release reservations',async()=>{
 const budget=new Budget(1024**2),source=new Blob(['0123456789']),p=(offset,deleteCount=0)=>({offset,deleteCount,bytes:bytes('a')});
 for(const patches of [[p(-1)],[p(11)],[p(9,2)],[p(1),p(1)],[p(3,2),p(4)],[p(2),p(1)],[p(.5)],[{offset:0,deleteCount:0,bytes:new Uint8Array()}]])await assert.rejects(deriveOriginalBytes(source,patches,{budget}),{code:'INVALID_INPUT'});
 await assert.rejects(deriveOriginalBytes(source,[p(0)],{budget:new Budget(1)}),{code:'MEMORY_LIMIT'});
 const controller=new AbortController(),patches=Array.from({length:256},(_,i)=>p(i));await assert.rejects(deriveOriginalBytes(new Blob(['0'.repeat(256)]),patches,{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);
 const empty=await deriveOriginalBytes(source,[{offset:0,deleteCount:10,bytes:new Uint8Array()}],{budget});assert.equal(empty.blob.size,0);
});
test('large immutable Blob is sliced without arrayBuffer materialization',async()=>{
 class NoReadBlob extends Blob {arrayBuffer(){throw Error('full read forbidden');}}
 const source=new NoReadBlob(Array(256).fill(new Blob([new Uint8Array(65536)]))),budget=new Budget(16384);
 const result=await deriveOriginalBytes(source,[{offset:source.size-1,deleteCount:1,bytes:bytes('!')}],{budget});assert.equal(result.sizeBytes,16777216);assert.equal(await result.blob.slice(-1).text(),'!');assert.equal(result.metrics.sourceCopyBytes,0);assert.ok(budget.peak<16384);
});
test('public engine preserves source and caches and can reuse after cancellation',async()=>{
 const engine=createEngine({cpuKernel:'single'}),source=bytes('0123456789');
 try{
  const loaded=await engine.load({id:'i',bytes:source,pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)},provenance:{decoder:'explicit-test'}});
  const task={id:'hex',imageId:'i',operation:'file.hex',params:{offset:0,length:10}},before=await engine.run(task);
  const controller=new AbortController();controller.abort();await assert.rejects(engine.deriveOriginal({imageId:'i',patches:[]},{signal:controller.signal}),{code:'CANCELLED'});
  const result=await engine.deriveOriginal({imageId:'i',patches:[{offset:2,deleteCount:3,bytes:bytes('X')}]});assert.equal(await str(result.blob),'01X56789');assert.equal(result.provenance.originalSha256,loaded.sha256);assert.deepEqual(engine.original('i'),source);
  const after=await engine.run(task);assert.deepEqual(after.data,before.data);assert.equal(after.metrics.cache.result,true);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{engine.dispose();}
});
test('segmented JPEG uses original Blob under its existing small budget',async()=>{
 const {readFile}=await import('node:fs/promises'),{initJpegWasm}=await import('../src/jpeg.js');await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
 const source=new Uint8Array(await readFile(new URL('../fixtures/bench-1024.jpg',import.meta.url))),engine=createEngine({memoryBudgetBytes:52*1024**2});
 try{const loaded=await engine.loadBlob({id:'i',blob:new Blob([source])});assert.equal(loaded.provenance.layout,'segmented-scanlines');const result=await engine.deriveOriginal({imageId:'i',patches:[{offset:0,deleteCount:2,bytes:Uint8Array.of(1,2)}]});assert.equal(result.metrics.sourceCopyBytes,0);const actual=new Uint8Array(await result.blob.arrayBuffer());assert.deepEqual(actual.subarray(2),source.subarray(2));assert.deepEqual((await engine.readOriginal('i',{offset:0,length:2})).bytes,source.slice(0,2));assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();}
});
