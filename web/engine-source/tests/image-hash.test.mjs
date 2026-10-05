import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {initCvWasm,cvHash} from '../src/opencv.js';
test('Four supported perceptual hashes match native bytes on every fixture',async()=>{
 await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});const ref=JSON.parse(await readFile(new URL('../fixtures/image-hash-reference.json',import.meta.url)));
 for(const f of ref.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};for(const kind of [0,1,4,5])assert.deepEqual(Array.from(await cvHash(image,kind)),f.hashes[kind].values,f.file+' '+kind);}
});
