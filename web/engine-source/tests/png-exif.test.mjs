import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createEngine} from '../src/index.js';import {imageHeader} from '../src/image-headers.js';import {checkPngExif} from './png-exif-fixture.js';
const root=new URL('./data/png-exif/',import.meta.url),load=async file=>new Uint8Array(await readFile(new URL(file,root))),ref=JSON.parse(await readFile(new URL('reference.json',root)));
test('PNG eXIf directories GPS and thumbnail match native before and after IDAT',async()=>{const engine=createEngine({cpuKernel:'single'});try{await checkPngExif(engine,load,bytes=>createHash('sha256').update(bytes).digest('hex'),ref);}finally{engine.dispose();}});
test('duplicated or out-of-range PNG eXIf is explicitly rejected',async()=>{
 const bytes=await load(ref.cases[0].file),length=new DataView(bytes.buffer).getUint32(33),chunk=bytes.slice(33,45+length),duplicate=new Uint8Array(bytes.length+chunk.length);duplicate.set(bytes.subarray(0,33));duplicate.set(chunk,33);duplicate.set(bytes.subarray(33),33+chunk.length);assert.throws(()=>imageHeader(duplicate),{code:'INVALID_INPUT'});
 const outside=bytes.slice();outside.fill(255,45,49);assert.throws(()=>imageHeader(outside),{code:'INVALID_INPUT'});
});
