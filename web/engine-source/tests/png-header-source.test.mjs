import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createEngine} from '../src/index.js';import {imageHeader} from '../src/image-headers.js';
const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
function chunk(type,payload){const b=new Uint8Array(12+payload.length);new DataView(b.buffer).setUint32(0,payload.length);b.set(new TextEncoder().encode(type),4);b.set(payload,8);return b;}
const ihdr=new Uint8Array(13);new DataView(ihdr.buffer).setUint32(0,32000);new DataView(ihdr.buffer).setUint32(4,24000);ihdr[8]=8;ihdr[9]=2;
function synthetic(parts){return new Blob([signature,chunk('IHDR',ihdr),...parts,chunk('IEND',new Uint8Array())]);}
test('sparse PNG headers skip image/compressed metadata bytes and preserve late eXIf absolute offsets',async()=>{
 const original=new Uint8Array(await readFile(new URL('./data/png-exif/exif-1.png',import.meta.url)));let offset=8,exif;
 while(offset+12<=original.length){const n=new DataView(original.buffer).getUint32(offset);if(new TextDecoder().decode(original.subarray(offset+4,offset+8))==='eXIf')exif=original.slice(offset+8,offset+8+n);offset+=n+12;}assert.ok(exif);
 const blob=synthetic([chunk('IDAT',new Uint8Array(32*1024**2)),chunk('iCCP',new Uint8Array(16*1024**2)),chunk('tRNS',new Uint8Array(6)),chunk('eXIf',exif)]),all=new Uint8Array(await blob.arrayBuffer()),expected=imageHeader(all),reads=[];
 class AuditedBlob extends Blob {arrayBuffer(){throw Error('Full PNG read forbidden');}slice(start,end,...args){reads.push([start,end]);assert.ok(end-start<4096,'Pixel/ICC payload read');return super.slice(start,end,...args);}}
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{const result=await engine.inspectHeaders({blob:new AuditedBlob([blob])});assert.deepEqual(result.header,expected);assert.equal(result.metrics.encodedReadMode,'png-chunk-ranges');assert.equal(result.metrics.encodedReadBytes,reads.reduce((sum,[a,b])=>sum+b-a,0));assert.ok(result.metrics.encodedReadBytes<4096);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{engine.dispose();}
});
test('PNG chunk corruption, ambiguous EXIF, oversized metadata and cancellation recover cleanly',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{
  const broken=chunk('IDAT',new Uint8Array(3));new DataView(broken.buffer).setUint32(0,0xffffffff);await assert.rejects(engine.inspectHeaders({blob:synthetic([broken])}),{code:'INVALID_INPUT'});
  await assert.rejects(engine.inspectHeaders({blob:synthetic([chunk('eXIf',new Uint8Array(256*1024))])}),{code:'MEMORY_LIMIT'});
  const original=new Uint8Array(await readFile(new URL('./data/png-exif/exif-0.png',import.meta.url)));let offset=8,entry;while(offset+12<=original.length){const n=new DataView(original.buffer).getUint32(offset);if(new TextDecoder().decode(original.subarray(offset+4,offset+8))==='eXIf')entry=original.slice(offset,offset+n+12);offset+=n+12;}await assert.rejects(engine.inspectHeaders({blob:synthetic([entry,entry])}),{code:'INVALID_INPUT'});
  const controller=new AbortController();class CancellingBlob extends Blob {slice(start,end,...args){if(start>33)controller.abort();return super.slice(start,end,...args);}}await assert.rejects(engine.inspectHeaders({blob:new CancellingBlob([synthetic([chunk('IDAT',new Uint8Array(3)),chunk('tEXt',new Uint8Array(9))])])},{signal:controller.signal}),{code:'CANCELLED'});
  assert.equal(engine.capabilities().memory.activeReservationBytes,0);const good=await engine.inspectHeaders({blob:synthetic([])});assert.equal(good.header.width,32000);assert.equal(engine.capabilities().memory.retainedBytes,0);
 }finally{engine.dispose();}
});
test('all qualified PNG depth, palette, Adam7 and EXIF cases keep identical structural headers',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{for(const folder of ['png-formats','png-exif']){const root=new URL('./data/'+folder+'/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root)));for(const item of ref.cases){const bytes=new Uint8Array(await readFile(new URL(item.file,root))),result=await engine.inspectHeaders({blob:new Blob([bytes])});assert.deepEqual(result.header,imageHeader(bytes),folder+'/'+item.file);assert.equal(result.metrics.encodedReadMode,'png-chunk-ranges');}}assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{engine.dispose();}
});
