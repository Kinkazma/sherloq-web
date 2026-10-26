import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createOriginalSourceRegionsState} from '../src/source-region-geometry.js';
const observed=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,0));
async function fixture({release=()=>{},readGate,invalid=false}={}){
 const budget=new Budget(1024*1024),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:4,height:4}),entered=deferred();let reads=0,acks=0,signal;
 const source={width:4,height:4,sha256:'a'.repeat(64),async readWindow(r,h={}){const index=++reads;signal=h.signal;const free=budget.reserve(r.width*r.height*3);entered.resolve();await readGate?.promise;let closed=false;return{pixels:{format:'rgb8',width:r.width+(invalid?1:0),height:r.height,data:new Uint8Array(r.width*r.height*3)},release(){if(closed)return;const value=release({read:index});if(value&&typeof value.then==='function')return value.then(()=>{closed=true;acks++;free();});closed=true;acks++;free();}};}};
 const view=await createSourceRegionView(source,state.snapshot(),{budget,maxReadPixels:4});return{view,budget,entered,get reads(){return reads;},get acks(){return acks;},get readSignal(){return signal;}};
}
const rect={x:0,y:0,width:4,height:1};
for(const route of['visitIncluded','readMaskedWindow'])test(route+': failed source ACK remains owned and reachable for retry',async()=>{
 let refusing=true,calls=0;const h=await fixture({release(){calls++;if(refusing)throw false;}});
 const outcome=await observed(route==='visitIncluded'?h.view.visitIncluded(()=>{}):h.view.readMaskedWindow(rect));assert.equal(outcome.ok,false);assert.equal(outcome.error,false);assert.ok(h.budget.total()>0);refusing=false;await h.view.dispose();assert.equal(calls,2);assert.equal(h.acks,1);assert.equal(h.budget.total(),0);
});
for(const primary of[Object.freeze(new Error('visitor primary')),0,null,undefined,false,''])test('visitor primary stays exact during failed source ACK: '+String(primary),async()=>{
 let refusing=true;const h=await fixture({release(){if(refusing)throw Error('secondary ACK');}});const result=await observed(h.view.visitIncluded(()=>{throw primary;}));assert.equal(result.ok,false);assert.equal(result.error,primary);refusing=false;await h.view.dispose();assert.equal(h.budget.total(),0);
});
test('dispose attempts independent live leases despite a synchronous first refusal',async()=>{
 let refusing=true,attempts=[];const h=await fixture({release({read}){attempts.push(read);if(read===1&&refusing)throw 0;}});await h.view.readWindow(rect);await h.view.readWindow(rect);const result=await observed(Promise.resolve().then(()=>h.view.dispose()));assert.equal(result.ok,false);assert.equal(result.error,0);assert.deepEqual(attempts,[1,2]);assert.equal(h.acks,1);refusing=false;await h.view.dispose();assert.equal(h.acks,2);assert.equal(h.budget.total(),0);
});
test('view close waits for a late source read and its actual retirement',async()=>{
 const readGate=deferred(),ack=deferred(),enteredAck=deferred(),h=await fixture({readGate,release(){enteredAck.resolve();return ack.promise;}});const pending=observed(h.view.readWindow(rect));await h.entered.promise;let closed=false;const closing=Promise.resolve(h.view.dispose()).then(()=>closed=true);await tick();assert.equal(closed,false);assert.equal(h.readSignal.aborted,true);readGate.resolve();await enteredAck.promise;await tick();assert.equal(closed,false);assert.ok(h.budget.total()>0);ack.resolve();await closing;assert.equal((await pending).ok,false);assert.equal(h.budget.total(),0);
});
test('close waits for an asynchronous included visitor before retiring its pixels',async()=>{
 const barrier=deferred(),entered=deferred(),h=await fixture();const pending=observed(h.view.visitIncluded(async pixels=>{entered.resolve();await barrier.promise;assert.equal(pixels.data.length,12);assert.equal(h.acks,0);}));await entered.promise;let done=false;const close=Promise.resolve(h.view.dispose()).then(()=>done=true);await tick();assert.equal(done,false);assert.equal(h.acks,0);barrier.resolve();await close;assert.equal((await pending).ok,false);assert.equal(h.acks,1);assert.equal(h.budget.total(),0);
});
test('concurrent disposal waits for all independent asynchronous refusals then retries only those without ACK',async()=>{
 const gate=deferred();let refusing=true,attempts=[];const h=await fixture({release({read}){attempts.push(read);return gate.promise.then(()=>{if(read===1&&refusing)throw null;});}});const a=await h.view.readWindow(rect),b=await h.view.readWindow(rect);const first=h.view.dispose(),second=h.view.dispose();assert.equal(first,second);assert.deepEqual(attempts,[1,2]);gate.resolve();const r=await observed(first);assert.equal(r.ok,false);assert.equal(r.error,null);assert.equal(h.acks,1);refusing=false;await h.view.dispose();assert.deepEqual(attempts,[1,2,1]);assert.equal(h.acks,2);assert.equal(h.budget.total(),0);await a.release();await b.release();
});
test('malformed late native source retains its exact failed cleanup owner',async()=>{
 let refusing=true,calls=0;const h=await fixture({invalid:true,release(){calls++;if(refusing)throw false;}});const r=await observed(h.view.readWindow(rect));assert.equal(r.ok,false);assert.equal(r.error.code,'INVALID_INPUT');assert.ok(h.budget.total()>0);refusing=false;await h.view.dispose();assert.equal(calls,2);assert.equal(h.budget.total(),0);
});
test('completed ordinary view and lease retain immediate synchronous retirement',async()=>{
 const h=await fixture(),a=await h.view.readWindow(rect);assert.equal(a.release(),undefined);assert.equal(h.acks,1);assert.equal(h.view.dispose(),undefined);assert.equal(h.view.dispose(),undefined);assert.equal(h.budget.total(),0);
});
test('masked output retains its own bytes while source ACKs have already settled',async()=>{
 const h=await fixture(),a=await h.view.readMaskedWindow(rect);assert.equal(a.included,4);assert.equal(h.acks,1);assert.equal(h.budget.total(),16);assert.deepEqual(Array.from(a.pixels.membership),[1,1,1,1]);assert.equal(h.view.dispose(),undefined);assert.equal(h.budget.total(),0);assert.equal(a.release(),undefined);
});
test('external cancellation reaches an active source without changing its original cause',async()=>{
 const external=new AbortController(),state=await createOriginalSourceRegionsState({sourceSha256:'b'.repeat(64),width:1,height:1}),primary=Object.freeze(new Error('source cancellation cause'));let sourceSignal,entered=deferred();const source={width:1,height:1,sha256:'b'.repeat(64),readWindow(r,{signal}){sourceSignal=signal;entered.resolve();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(primary),{once:true}));}},view=await createSourceRegionView(source,state.snapshot(),{signal:external.signal});const work=observed(view.readWindow({x:0,y:0,width:1,height:1}));await entered.promise;external.abort();assert.equal(sourceSignal.aborted,true);const r=await work;assert.equal(r.ok,false);assert.equal(r.error,primary);await view.dispose();
});
test('readWindow publication rechecks liveness after the nested native await',async()=>{
 const state=await createOriginalSourceRegionsState({sourceSha256:'d'.repeat(64),width:4,height:4}),budget=new Budget(1024);let view,closing,closeCalled=false,acks=0;const pixels={format:'rgb8',width:4,height:1,data:new Uint8Array(12)},source={width:4,height:4,sha256:'d'.repeat(64),async readWindow(){const free=budget.reserve(12);let released=false;return{get pixels(){queueMicrotask(()=>{if(!closeCalled){closeCalled=true;closing=view.dispose();}});return pixels;},release(){if(!released){released=true;acks++;free();}}};}};view=await createSourceRegionView(source,state.snapshot());const answer=await observed(view.readWindow(rect));if(answer.ok)await answer.value.release();await closing;assert.equal(answer.ok,false);assert.equal(acks,1);assert.equal(budget.total(),0);
});
