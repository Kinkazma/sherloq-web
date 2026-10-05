import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {streamedImageHashes} from '../src/digest-stream.js';import {Budget} from '../src/cache.js';import {createRgbSurface} from '../src/rgb-surface.js';
const wasmBinary=await readFile(new URL('../vendor/digest-stream/digest-stream.wasm',import.meta.url));
function surface(image,budget){return createRgbSurface({byteLength:image.data.length,readInto:async(out,offset)=>out.set(image.data.subarray(offset,offset+out.length)),dispose(){}},{width:image.width,height:image.height,budget});}
test('six bounded perceptual hashes match the existing native RGB corpus',async()=>{
 const budget=new Budget(128*1024**2),reference=JSON.parse(await readFile(new URL('../fixtures/image-hash-reference.json',import.meta.url)));
 for(const item of reference.cases){const data=new Uint8Array(await readFile(new URL('../fixtures/'+item.file,import.meta.url))),s=surface({...item,data},budget),result=await streamedImageHashes(s,{account:n=>budget.reserve(n),wasmBinary});
  for(let k=0;k<6;k++)assert.deepEqual([...result.hashes[['Average','Block mean','Color moments','Marr-Hildreth','pHash','Radial variance'][k]]],item.hashes[k].values,item.file+'/'+k);assert.equal(budget.total(),0);await s.dispose();
 }
});
import {imageCodec} from '../src/codecs.js';
test('six bounded hashes match native downsampling, 2x resize and 3.52 MP JPEG',async()=>{
 const reference=JSON.parse(await readFile(new URL('./data/digest-stream-native.json',import.meta.url))),budget=new Budget(128*1024**2);
 for(const item of reference.cases){const bytes=new Uint8Array(await readFile(new URL('./data/'+item.file,import.meta.url))),image=await imageCodec.decode(bytes),s=surface(image,budget),result=await streamedImageHashes(s,{account:n=>budget.reserve(n),wasmBinary});for(const [name,values]of Object.entries(item.hashes))assert.deepEqual([...result.hashes[name]],values,item.file+'/'+name);assert.equal(budget.total(),0);await s.dispose();}
});
test('memory refusal and cancellation release all row and native reservations',async()=>{
 const image={width:9,height:9,data:new Uint8Array(9*9*3)},budget=new Budget(1024),s=surface(image,budget);await assert.rejects(streamedImageHashes(s,{account:n=>budget.reserve(n),wasmBinary}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const enough=new Budget(128*1024**2),controller=new AbortController(),s2=surface(image,enough);await assert.rejects(streamedImageHashes(s2,{account:n=>enough.reserve(n),wasmBinary,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(enough.total(),0);
});
test('all eight oriented surface mappings match independently oriented native hashes',async()=>{
 const reference=JSON.parse(await readFile(new URL('./data/digest-stream-native.json',import.meta.url))),data=new Uint8Array(await readFile(new URL('../fixtures/pixels-random-odd.rgb',import.meta.url)));
 for(const item of reference.orientations){const budget=new Budget(128*1024**2),s=createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width:17,height:19,orientation:item.orientation,budget,ownsStore:false}),result=await streamedImageHashes(s,{account:n=>budget.reserve(n),wasmBinary});for(const [name,values]of Object.entries(item.hashes))assert.deepEqual([...result.hashes[name]],values,'orientation '+item.orientation+'/'+name);assert.equal(budget.total(),0);await s.dispose();}
});
