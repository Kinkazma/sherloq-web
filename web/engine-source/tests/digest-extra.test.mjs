import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {extraImageHashes} from '../src/digest-extra.js';import {Budget} from '../src/cache.js';import {imageCodec} from '../src/codecs.js';import {createEngine} from '../src/index.js';
const wasmBinary=await readFile(new URL('../vendor/digest-extra/digest.wasm',import.meta.url));
test('Color moments and Marr-Hildreth match all existing native fixtures and original-byte downsampling cases',async()=>{
 const budget=new Budget(256*1024**2),small=JSON.parse(await readFile(new URL('../fixtures/image-hash-reference.json',import.meta.url))),large=JSON.parse(await readFile(new URL('./data/digest-extra-native.json',import.meta.url)));
 for(const item of small.cases){const image={width:item.width,height:item.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+item.file,import.meta.url)))},hashes=await extraImageHashes(image,{account:bytes=>budget.reserve(bytes),wasmBinary});for(const [name,kind]of [['Color moments',2],['Marr-Hildreth',3]])assert.deepEqual([...hashes[name]],item.hashes[kind].values,item.file+'/'+name);assert.equal(budget.total(),0);}
 const engine=createEngine({cpuKernel:'single'});
 try{for(const item of large.cases){const bytes=new Uint8Array(await readFile(new URL('./data/'+item.file,import.meta.url)));await engine.load({id:'i',bytes});const result=await engine.run({id:'d',imageId:'i',operation:'file.digest'});for(const [name,values]of Object.entries(item.hashes))assert.deepEqual([...result.data.imageHashes[name]],values,item.file+'/'+name);assert.equal(Object.keys(result.data.imageHashes).length,6);assert.deepEqual(result.data.unavailable,{});assert.equal(engine.capabilities().memory.activeReservationBytes,0);engine.unload('i');}}finally{engine.dispose();}
});
test('extra hashes refuse unadmitted memory and stop between useful kernels',async()=>{
 const image={width:1,height:1,format:'rgb8',data:new Uint8Array(3)},budget=new Budget(10);await assert.rejects(extraImageHashes(image,{account:bytes=>budget.reserve(bytes),wasmBinary}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const enough=new Budget(256*1024**2),abort=new AbortController();await assert.rejects(extraImageHashes(image,{account:bytes=>enough.reserve(bytes),wasmBinary,signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(enough.total(),0);
});
