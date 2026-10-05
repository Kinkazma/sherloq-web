import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createEngine} from '../src/index.js';import {imageHeader} from '../src/image-headers.js';
function sparseTiff(big,le){
 const headerSize=big?16:8,offset=32*1024**2+headerSize,header=new Uint8Array(headerSize),hv=new DataView(header.buffer);header.set(le?[73,73]:[77,77]);hv.setUint16(2,big?43:42,le);if(big){hv.setUint16(4,8,le);hv.setBigUint64(8,BigInt(offset),le);}else hv.setUint32(4,offset,le);
 const count=5,size=big?20:12,prefix=big?8:2,tail=big?8:4,table=new Uint8Array(prefix+size*count+tail),v=new DataView(table.buffer);if(big)v.setBigUint64(0,BigInt(count),le);else v.setUint16(0,count,le);
 for(const [i,[tag,value]]of [[256,32000],[257,24000],[273,headerSize],[279,32*1024**2],[34675,0]].entries()){
  const p=prefix+i*size;v.setUint16(p,tag,le);v.setUint16(p+2,tag===34675?7:big?16:4,le);
  if(big){v.setBigUint64(p+4,BigInt(tag===34675?1024**2:1),le);v.setBigUint64(p+12,BigInt(tag===34675?headerSize:value),le);}else{v.setUint32(p+4,tag===34675?1024**2:1,le);v.setUint32(p+8,tag===34675?headerSize:value,le);}
 }
 return {blob:new Blob([header,new Uint8Array(32*1024**2),table]),offset,headerSize};
}
test('classic and BigTIFF late IFDs skip strip/ICC bytes in either byte order',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{for(const big of [false,true])for(const le of [false,true]){
  const {blob,offset,headerSize}=sparseTiff(big,le),expected=imageHeader(new Uint8Array(await blob.arrayBuffer())),reads=[];
  class AuditedBlob extends Blob {arrayBuffer(){throw Error('Whole TIFF read forbidden');}slice(start,end,...args){assert.ok(start<headerSize||start>=offset,'Pixel/ICC data read');reads.push([start,end]);return super.slice(start,end,...args);}}
  const result=await engine.inspectHeaders({blob:new AuditedBlob([blob])});assert.deepEqual(result.header,expected);assert.equal(result.metrics.encodedReadMode,'tiff-metadata-ranges');assert.equal(result.metrics.encodedReadBytes,reads.reduce((sum,[a,b])=>sum+b-a,0));assert.ok(result.metrics.encodedReadBytes<256);assert.ok(result.header.icc);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }}finally{engine.dispose();}
});
test('all TIFF/BigTIFF corpus structural values and original offsets agree with contiguous parsing',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{for(const folder of ['tiff-formats','bigtiff']){const root=new URL('./data/'+folder+'/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root)));for(const item of ref.cases){const bytes=new Uint8Array(await readFile(new URL(item.file,root))),result=await engine.inspectHeaders({blob:new Blob([bytes])});assert.deepEqual(result.header,imageHeader(bytes),folder+'/'+item.file);assert.equal(result.metrics.encodedReadMode,'tiff-metadata-ranges');}}assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{engine.dispose();}
});
test('unsafe BigTIFF fields, truncated IFDs, cycles and cancellation fail without retained reservations',async()=>{
 const engine=createEngine({memoryBudgetBytes:8*1024**2}),bytes=new Uint8Array(await readFile(new URL('./data/bigtiff/rgb8-le.tiff',import.meta.url))),offset=imageHeader(bytes).directories[0].offset;
 try{for(const mutate of [b=>new DataView(b.buffer).setBigUint64(8,2n**60n,true),b=>new DataView(b.buffer).setBigUint64(offset,5000n,true),b=>new DataView(b.buffer).setBigUint64(offset+12,2n**60n,true),b=>{const v=new DataView(b.buffer);v.setBigUint64(offset+8+Number(v.getBigUint64(offset,true))*20,BigInt(offset),true);}]){const b=bytes.slice();mutate(b);await assert.rejects(engine.inspectHeaders({blob:new Blob([b])}),{code:'INVALID_INPUT'});}await assert.rejects(engine.inspectHeaders({blob:new Blob([bytes.subarray(0,15)])}),{code:'INVALID_INPUT'});
  const controller=new AbortController();class CancelBlob extends Blob {slice(start,end,...args){if(start>8)controller.abort();return super.slice(start,end,...args);}}await assert.rejects(engine.inspectHeaders({blob:new CancelBlob([bytes])},{signal:controller.signal}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal((await engine.inspectHeaders({blob:new Blob([bytes])})).header.bigTiff,true);
 }finally{engine.dispose();}
});
test('sparse TIFF follows GPS/thumbnail directories and matches first duplicate-pointer semantics',async()=>{
 const png=new Uint8Array(await readFile(new URL('./data/png-exif/exif-0.png',import.meta.url))),length=new DataView(png.buffer).getUint32(33),raw=png.slice(41,41+length),v=new DataView(raw.buffer),first=v.getUint32(4,true),count=v.getUint16(first,true),engine=createEngine({memoryBudgetBytes:8*1024**2});
 try{for(const duplicate of [false,true]){const entries=count+2+Number(duplicate),bytes=new Uint8Array(raw.length+2+12*entries+4);bytes.set(raw);const view=new DataView(bytes.buffer),at=raw.length;view.setUint32(4,at,true);view.setUint16(at,entries,true);let p=at+2;
  for(const [tag,value]of [[256,31],[257,23]]){view.setUint16(p,tag,true);view.setUint16(p+2,4,true);view.setUint32(p+4,1,true);view.setUint32(p+8,value,true);p+=12;}
  if(duplicate){view.setUint16(p,34853,true);view.setUint16(p+2,7,true);view.setUint32(p+4,1,true);p+=12;}
  bytes.set(raw.subarray(first+2,first+2+count*12+4),p);const expected=imageHeader(bytes),thumb=expected.thumbnail;
  class AuditedBlob extends Blob {slice(start,end,...args){assert.ok(end<=thumb.offset||start>=thumb.offset+thumb.length,'Thumbnail JPEG payload read');return super.slice(start,end,...args);}}
  const result=await engine.inspectHeaders({blob:new AuditedBlob([bytes])});assert.deepEqual(result.header,expected);assert.equal(!!result.header.gps,!duplicate);
 }}finally{engine.dispose();}
});
test('metadata admission refuses large directory trees before staging and remains reusable',async()=>{
 const count=4096,size=2+count*12+4,bytes=new Uint8Array(8+size*3),v=new DataView(bytes.buffer);bytes.set([73,73,42,0]);v.setUint32(4,8,true);
 for(let d=0;d<3;d++){const offset=8+d*size;v.setUint16(offset,count,true);for(let i=0;i<count;i++){const p=offset+2+i*12;v.setUint16(p,i<2?256+i:50000,true);v.setUint16(p+2,i<2?4:7,true);v.setUint32(p+4,1,true);v.setUint32(p+8,23,true);}v.setUint32(offset+2+count*12,d<2?offset+size:0,true);}
 const engine=createEngine({memoryBudgetBytes:8*1024**2});try{await assert.rejects(engine.inspectHeaders({blob:new Blob([bytes])}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const original=await readFile(new URL('./data/bigtiff/rgb8-le.tiff',import.meta.url));assert.equal((await engine.inspectHeaders({blob:new Blob([original])})).header.bigTiff,true);}finally{engine.dispose();}
});
test('BigTIFF sparse addressing preserves an IFD offset beyond uint32 without allocating a full source',async()=>{
 const {inspectTiffSource}=await import('../src/tiff-header-source.js'),{Budget}=await import('../src/cache.js'),offset=2**32+64,header=new Uint8Array(16),h=new DataView(header.buffer),table=new Uint8Array(56),v=new DataView(table.buffer);header.set([73,73,43,0,8,0]);h.setBigUint64(8,BigInt(offset),true);v.setBigUint64(0,2n,true);
 for(let i=0;i<2;i++){const p=8+i*20;v.setUint16(p,256+i,true);v.setUint16(p+2,16,true);v.setBigUint64(p+4,1n,true);v.setBigUint64(p+12,BigInt(31+i),true);}
 const budget=new Budget(1024**2),source={byteLength:offset+table.length,async read(at,length){const data=at<16?header:table,start=at<16?at:at-offset;assert.ok(start>=0&&start+length<=data.length);return {bytes:data.subarray(start,start+length),release(){}};}},result=await inspectTiffSource(source,{account:n=>budget.reserve(n)});assert.equal(result.header.directories[0].offset,offset);assert.equal(result.header.width,31);assert.equal(result.header.height,32);assert.equal(budget.total(),0);
});
