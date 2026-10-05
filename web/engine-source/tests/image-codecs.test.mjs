import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm} from '../src/opencv.js';import {createEngine} from '../src/index.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const ref=JSON.parse(await readFile(new URL('../fixtures/image-codec-reference.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
test('PNG/TIFF source bytes and native RGB conversion, including alpha and 16-bit inputs',async()=>{
 const e=createEngine();for(const f of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));if(f.nativeError){await assert.rejects(e.load({id:'i',bytes}),{code:'UNSUPPORTED_FORMAT'});continue;}
 const loaded=await e.load({id:'i',bytes});assert.equal(loaded.width,f.width);assert.equal(loaded.height,f.height);assert.equal(sha(e.imagePixels('i').data),f.sha256,f.file);assert.equal(sha(e.original('i')),sha(bytes));e.unload('i');}e.dispose();
});
