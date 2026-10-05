import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import create from '../vendor/learned-prepare/prepare.js';import {prepareAlikedRows} from '../src/aliked-rows.js';import {alikedShape} from '../src/aliked-worker.js';import {researchRows} from '../src/m3-research-rows.js';import {Budget} from '../src/cache.js';
const wasmBinary=new Uint8Array(await readFile(new URL('../vendor/learned-prepare/prepare.wasm',import.meta.url)));
for(const [width,height] of [[131,97],[1537,1031],[1024,1024],[37,113],[2049,79]])test(`ALIKED support rows preserve native preparation ${width}x${height}`,async()=>{
 const data=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+(i>>7)*29)%256),[w,h]=alikedShape(width,height),n=w*h,m=await create({wasmBinary,wasmMemory:new WebAssembly.Memory({initial:256,maximum:8192})}),ip=m._malloc(data.length),op=m._malloc(n*12);m.HEAPU8.set(data,ip);assert.equal(m._learned_prepare(ip,width,height,w,h,op),1);const expected=m.HEAPF32.slice(op/4,op/4+n*3);m._free(ip);m._free(op);
 const budget=new Budget(128*1024**2),got=await prepareAlikedRows(researchRows({data,width,height}),{budget,wasmBinary});assert.deepEqual(got.tensor,expected);got.release();assert.equal(budget.snapshot().activeReservationBytes,0);
});
test('ALIKED row read failure and second admission failure release all working memory',async()=>{
 const budget=new Budget(128*1024**2);await assert.rejects(prepareAlikedRows({width:20,height:30,readRows(){throw Error('source unavailable');}},{budget,wasmBinary}),/source unavailable/);assert.equal(budget.total(),0);
 const small=new Budget(50*1024**2);await assert.rejects(prepareAlikedRows({width:1,height:1,readRows(){throw Error('should not read');}},{budget:small,wasmBinary}),e=>e.code==='MEMORY_LIMIT');assert.equal(small.total(),0);
});
