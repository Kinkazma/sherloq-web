import test from 'node:test';import assert from 'node:assert/strict';
import {forgeryscopeMaskField} from '../src/forgeryscope-segmented-result.js';
import {createM2NpzStream} from '../src/m2-npz-stream.js';
import {forgeryscopeNpz} from '../src/npz.js';
import {Budget} from '../src/cache.js';
import {analyzeForgeryscope} from '../src/forgeryscope-pipeline.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
test('Forgeryscope waits for its whole input/output envelope before retrying admission',async()=>{
 const budget=new Budget(1000),peer=budget.reserve(950),producer=budget.beginResourceProducer('peer',{active:true}),image={width:2,height:2,data:new Uint8Array(12)};let attempts=0,detects=0,waiting;
 const wait=new Promise(resolve=>waiting=resolve),run=runWithResourceRecovery(()=>{attempts++;return analyzeForgeryscope(image,{budget,networks:{detect:async()=>{detects++;return [];}}});},{budget,owner:'forgeryscope',onWait:e=>{if(e.stage==='waiting')waiting();}});
 await wait;assert.equal(attempts,1);assert.equal(detects,0);assert.equal(budget.total(),950);peer();producer();const result=await run;assert.equal(attempts,2);assert.equal(detects,1);assert.equal(budget.total(),40);result.release();assert.equal(budget.total(),0);
});
test('Forgeryscope virtual float map preserves native cast and arbitrary byte windows',async()=>{
 const mask=Uint8Array.of(0,1,0,1,1,0,0,1),field=forgeryscopeMaskField(mask,{floating:true}),expected=Float32Array.from(mask),bytes=new Uint8Array(expected.buffer);
 assert.deepEqual(await field.readInto(new Float32Array(5),2),expected.slice(2,7));
 for(let at=0;at<bytes.length;at++)assert.deepEqual(await field.readBytes(new Uint8Array(Math.min(7,bytes.length-at)),at),bytes.slice(at,at+7));
 const output=await field.readInto(new Float32Array(8));output.fill(9);assert.deepEqual(await field.readInto(new Float32Array(8)),expected);
});
test('Forgeryscope source fields preserve full NPZ bytes and release export leases',async()=>{
 const mask=Uint8Array.of(0,1,0,1,1,0,0,1),dense={width:4,height:2,map:Float32Array.from(mask),mask,candidates:mask,metadata:{profile:'auto'},provenance:{source:'test'}},segmented={...dense,map:forgeryscopeMaskField(mask,{floating:true}),mask:forgeryscopeMaskField(mask),candidates:forgeryscopeMaskField(mask)},expected=forgeryscopeNpz(dense,MiB),budget=new Budget(MiB*3),stream=await createM2NpzStream('forgeryscope',segmented,{budget});
 try{const actual=await stream.read(0,stream.length);assert.deepEqual(actual,expected.bytes);}finally{stream.release();}assert.equal(budget.total(),0);
});
const MiB=1024**2;
