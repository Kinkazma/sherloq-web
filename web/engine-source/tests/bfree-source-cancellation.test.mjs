import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,runPrepared} from '../../extensions-source/bfree.js';
const dense=()=>({width:14,height:14,data:new Uint8Array(14*14*3)});
// Contract tests use controlled window leases/logits; no neural implementation is substituted in native qualifications.
test('B-Free acknowledges each asynchronous window retirement before another read or return',async()=>{
 let retiring=false,released=0,reads=0;const source={width:28,height:28,sourceSha256:'a'.repeat(64),async readWindow(rect){assert.equal(retiring,false);reads++;return{pixels:{width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3)},release(){retiring=true;return new Promise(resolve=>setTimeout(()=>{released++;retiring=false;resolve();},1));}};}};
 const value=await prepare(source);assert.equal(value.patches.length,5);assert.equal(reads,5);assert.equal(released,5);assert.equal(retiring,false);
});
test('B-Free propagates asynchronous retirement failure and does not cache unfinished preparation',async()=>{
 const memo=new Map(),source={width:14,height:14,sourceSha256:'b'.repeat(64),async readWindow(rect){return{pixels:{width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3)},async release(){throw Object.assign(Error('retirement failed'),{code:'TEST_RETIREMENT'});}};}};
 await assert.rejects(prepare(source,{memo}),{code:'TEST_RETIREMENT'});assert.equal(memo.size,0);
});
for(const completed of[1,3,5])test('B-Free preprocessing callback cancellation at window'+completed+' rejects before memo admission',async()=>{
 const controller=new AbortController(),memo=new Map();await assert.rejects(prepare(dense(),{memo,signal:controller.signal,onProgress:p=>{if(p.completed===completed)controller.abort();}}),{name:'AbortError'});assert.equal(memo.size,0);
});
for(const completed of[1,3,5])test('B-Free controlled inference callback cancellation at window'+completed+' rejects before memo admission',async()=>{
 const controller=new AbortController(),memo=new Map(),prepared={key:'controlled-'+completed,patches:Array.from({length:5},()=>({feeds:{}}))};await assert.rejects(runPrepared(prepared,{loadSession:async()=>({}),infer:async()=>({logits:{data:Float32Array.of(.25)}})},{memo,signal:controller.signal,onProgress:p=>{if(p.completed===completed)controller.abort();}}),{name:'AbortError'});assert.equal(memo.size,0);
});
test('B-Free refuses signed bytes but retains RGB8 and clampedRGB8 inputs',async()=>{
 await assert.rejects(prepare({...dense(),data:new Int8Array(14*14*3)}),TypeError);assert.equal((await prepare(dense())).patches.length,5);assert.equal((await prepare({...dense(),data:new Uint8ClampedArray(14*14*3)})).patches.length,5);
});
test('B-Free hot preparation respects cancellation while awaited input digest completes',async()=>{
 const image=dense(),memo=new Map();await prepare(image,{memo});const controller=new AbortController(),pending=prepare(image,{memo,signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
