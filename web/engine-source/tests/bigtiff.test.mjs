import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';import {imageCodec} from '../src/codecs.js';import {imageHeader,readTiff} from '../src/image-headers.js';
const root=new URL('./data/bigtiff/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root))),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('BigTIFF native RGB/grayscale, first frame, byte order and mapped tiles',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2});try{for(const row of ref.cases){const bytes=new Uint8Array(await readFile(new URL(row.file,root))),header=imageHeader(bytes);assert.equal(header.bigTiff,true);const info=await engine.inspectHeaders({blob:new Blob([bytes])});assert.deepEqual(info.header,header);const loaded=await engine.loadBlob({id:'i',blob:new Blob([bytes])});assert.equal(loaded.provenance.container,'BigTIFF');assert.equal(loaded.width,row.width);assert.equal(loaded.height,row.height);assert.equal(sha(engine.imagePixels('i').data),row.rgbSha256);assert.equal(sha((await imageCodec.decodeGray(bytes)).data),row.graySha256);assert.deepEqual(engine.original('i'),bytes);engine.unload('i');}}finally{await engine.dispose();}
});
test('BigTIFF keeps non-safe scalar integers exact and refuses unsafe offsets/counts',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('rgb8-le.tiff',root))),h=imageHeader(bytes),entries=h.directories[0].entries;
 assert.deepEqual(entries.find(e=>e.tag===65000).value,{integer64:'1152921504606847099'});assert.deepEqual(entries.find(e=>e.tag===65001).value,{integer64:'-1152921504606847099'});assert.deepEqual(entries.find(e=>e.tag===65002).value,[Number.MAX_SAFE_INTEGER,{integer64:'9007199254740992'}]);
 assert.throws(()=>readTiff(bytes),{code:'UNSUPPORTED_FORMAT'},'EXIF containers keep classic TIFF rules');
 for(const change of [b=>new DataView(b.buffer).setUint16(4,16,true),b=>new DataView(b.buffer).setUint16(6,1,true),b=>new DataView(b.buffer).setBigUint64(8,2n**60n,true),b=>new DataView(b.buffer).setBigUint64(h.directories[0].offset,2n**60n,true),b=>new DataView(b.buffer).setBigUint64(h.directories[0].offset+12,2n**60n,true)]){const broken=bytes.slice();change(broken);assert.throws(()=>imageHeader(broken),{code:'INVALID_INPUT'});}
 assert.throws(()=>imageHeader(bytes.subarray(0,15)),{code:'INVALID_INPUT'});
});
