import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';import {jpegCodec,initJpegWasm} from '../src/jpeg.js';import {jpegHeader,readTiff} from '../src/image-headers.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
const ref=JSON.parse(await readFile(new URL('../fixtures/metadata-reference.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
test('All eight EXIF orientations, both byte orders, ICC and XMP preserve native RGB and source bytes',async()=>{
 const e=createEngine();for(const f of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));const header=jpegHeader(bytes);assert.equal(header.width,f.width);assert.equal(header.height,f.height);assert.equal(header.orientation,f.orientation);
 const loaded=await e.load({id:'i',bytes});assert.equal(sha(e.imagePixels('i').data),f.sha256,f.file);assert.equal(sha(e.original('i')),f.originalSha256);assert.equal(loaded.provenance.orientation,f.orientation);e.unload('i');}e.dispose();
});
test('Malformed metadata is bounded and rejected explicitly',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('../fixtures/exif-6-le.jpg',import.meta.url)));
 // The first APP1 begins immediately after SOI: TIFF offset at 12, first IFD at 20.
 const outside=bytes.slice();outside.fill(255,16,20);assert.throws(()=>jpegHeader(outside),{code:'INVALID_INPUT'});
 const cycle=bytes.slice();new DataView(cycle.buffer).setUint32(34,8,true);assert.throws(()=>jpegHeader(cycle),{code:'INVALID_INPUT'});
 const orientation=bytes.slice();orientation[30]=9;assert.throws(()=>jpegHeader(orientation),{code:'INVALID_INPUT'});
 assert.throws(()=>readTiff(new Uint8Array([73,73,43,0,8,0,0,0])),{code:'UNSUPPORTED_FORMAT'});
});
