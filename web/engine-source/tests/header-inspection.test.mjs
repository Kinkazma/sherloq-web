import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createEngine} from '../src/index.js';import {imageHeader} from '../src/image-headers.js';
const paths=['./data/recompression-segmented.jpg','./data/png-exif/exif-1.png','../fixtures/exif-6-le.jpg','../fixtures/codec-orientation-6.tiff'];
test('header-only API agrees with byte parser without pixel decode, source registration or full JPEG read',async()=>{
 let decodes=0;const engine=createEngine({memoryBudgetBytes:8*1024**2,codec:{memoryBytes:()=>0,decode(){decodes++;throw Error('decode forbidden');}}});
 try{for(const file of paths){const bytes=new Uint8Array(await readFile(new URL(file,import.meta.url))),expected=imageHeader(bytes);let largestRead=0;
 class AuditedBlob extends Blob {arrayBuffer(){if(['jpeg','png'].includes(expected.format))throw Error('whole encoded read forbidden');return super.arrayBuffer();}slice(start,end,...args){largestRead=Math.max(largestRead,end??this.size);return super.slice(start,end,...args);}}
 const result=await engine.inspectHeaders({blob:new AuditedBlob([bytes]),name:'inspection.bin'});assert.deepEqual(result.header,expected);assert.equal(result.file.name,'inspection.bin');assert.equal(result.metrics.pixelDecode,false);assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);if(expected.format==='jpeg')assert.ok(largestRead<bytes.length);
 }assert.equal(decodes,0);}finally{engine.dispose();}
});
test('header-only cancellation, malformed input and memory refusal leave engine reusable',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2}),controller=new AbortController();controller.abort();
 try{await assert.rejects(engine.inspectHeaders({blob:new Blob(['abcdefghi'])},{signal:controller.signal}),{code:'CANCELLED'});await assert.rejects(engine.inspectHeaders({blob:new Blob(['abcdefghi'])}),{code:'UNSUPPORTED_FORMAT'});await assert.rejects(engine.inspectHeaders({blob:new Blob([new Uint8Array(3*1024**2)])}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const r=await engine.inspectHeaders({blob:new Blob([await readFile(new URL('./data/png-exif/exif-0.png',import.meta.url))])});assert.ok(r.header.exif.gps);}finally{engine.dispose();}
});
