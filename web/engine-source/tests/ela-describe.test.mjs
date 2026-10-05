import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {checkElaDescribe} from './ela-describe-fixture.js';import {createElaCellDescriber} from '../src/ela-cell-describe.js';import {Budget} from '../src/cache.js';
import {initJpegWasm} from '../src/jpeg.js';import {initCvWasm} from '../src/opencv.js';
const load=name=>readFile(new URL('./data/'+name,import.meta.url)),describeWasm=await readFile(new URL('../vendor/ela-describe/describe.wasm',import.meta.url)),peersWasm=await readFile(new URL('../vendor/ela-peers/peers.wasm',import.meta.url));
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
test('original RGB, real JPEG, descriptor bands, native content peers and cell regions',async()=>{const result=await checkElaDescribe({load,describeWasm,peersWasm});assert.equal(result.preparations,27);assert.equal(result.segmentations,27);console.log(result);});
test('descriptor memory refusal and cancellation release admission',async()=>{
 const image={width:96,height:96,format:'rgb8',data:new Uint8Array(96*96*3)},tinyBudget=new Budget(100),tiny=createElaCellDescriber({budget:tinyBudget,wasmBinary:describeWasm});
 await assert.rejects(tiny.describe(image,image,16),{code:'MEMORY_LIMIT'});tiny.dispose();assert.equal(tinyBudget.total(),0);
 const budget=new Budget(80*1024**2),describer=createElaCellDescriber({budget,wasmBinary:describeWasm}),abort=new AbortController();
 try{await assert.rejects(describer.describe(image,image,16,{signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(budget.total(),64*1024**2);const result=await describer.describe(image,image,16);result.release();}finally{describer.dispose();}assert.equal(budget.total(),0);
});
