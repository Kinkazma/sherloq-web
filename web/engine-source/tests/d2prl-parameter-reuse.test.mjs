import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
const MiB=1024**2;
function fixture(length){const data=Uint8Array.from({length},(_,i)=>(i*7)%251),sha256=createHash('sha256').update(data).digest('hex');return{data,spec:{file:'assets/'+sha256+'.bin',sha256,bytes:length,dtype:'float32',shape:[length/4]}};}
const bytes=value=>new Uint8Array(value.data.buffer,value.byteOffset,value.byteLength);
function fetcher(fixtures,requests){return async url=>{const item=fixtures.find(value=>url.endsWith(value.spec.file));assert.ok(item);requests.push(item.spec.file);return new Response(item.data);};}

test('verified parameters survive completed pass cleanup with one fetch and hash per asset',async()=>{
 const fixtures=[fixture(64),fixture(128)],requests=[],budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:fetcher(fixtures,requests)});
 try{
  let banks;
  for(let pass=0;pass<4;pass++){
   const leases=[];
   for(const item of fixtures){const value=await store.acquire(item.spec,{retain:true});leases.push(value);assert.deepEqual(bytes(value),item.data);}
   const views=leases.map(value=>value.data);
   if(banks)for(let i=0;i<views.length;i++)assert.equal(views[i],banks[i]);else banks=views;
   assert.equal(store.snapshot().liveLeaseCount,2);
   for(const lease of leases){lease.release();lease.release();assert.throws(()=>lease.data);}
   store.clearIncomplete();
   const status=store.snapshot();assert.equal(status.idleVerifiedEntries,2);assert.equal(status.liveLeaseCount,0);assert.equal(status.idleVerifiedTensorBytes,192);assert.equal(status.verifiedTensorBytes,192);assert.ok(budget.total()<=budget.limit);
  }
  const status=store.snapshot();assert.equal(requests.length,2);assert.equal(status.reads,2);assert.equal(status.networkBytes,192);assert.equal(status.committedBytes,192);assert.equal(status.cacheHits,6);assert.equal(status.cacheHitBytes,576);assert.equal(status.evictedEntries,0);
 }finally{store.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);
});

test('idle verified cache yields to pressure while live parameter leases retain exact bytes',async()=>{
 const first=fixture(64),second=fixture(128),requests=[],budget=new Budget(32*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:fetcher([first,second],requests)});let live,pressure,reloaded;
 try{
  const idle=await store.acquire(first.spec,{retain:true});live=await store.acquire(second.spec,{retain:true});idle.release();
  assert.throws(()=>budget.reserve(budget.limit),{code:'MEMORY_LIMIT'});
  assert.deepEqual(bytes(live),second.data);assert.equal(store.snapshot().liveLeaseCount,1);assert.equal(store.snapshot().verifiedEntries,1);assert.equal(store.snapshot().evictedEntries,1);
  live.release();live=null;pressure=budget.reserve(budget.limit);
  assert.equal(store.snapshot().entries,0);assert.equal(store.snapshot().residentBytes,0);assert.equal(store.snapshot().evictedEntries,2);assert.equal(budget.total(),budget.limit);
  pressure();pressure=null;reloaded=await store.acquire(first.spec,{retain:true});assert.deepEqual(bytes(reloaded),first.data);assert.equal(requests.length,3);
 }finally{reloaded?.release();live?.release();pressure?.();store.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);
});

test('discarding an incomplete checkpoint keeps verified cache and never publishes its prefix',async()=>{
 const complete=fixture(64),interrupted=fixture(3*MiB),requests=[],budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:async url=>{
  requests.push(url);if(url.endsWith(complete.spec.file))return new Response(complete.data);
  let at=0;return new Response(new ReadableStream({pull(controller){if(at===512*1024){controller.error(new TypeError('socket ended'));return;}controller.enqueue(interrupted.data.slice(at,at+128*1024));at+=128*1024;}}));
 }});
 try{
  const verified=await store.acquire(complete.spec,{retain:true});verified.release();
  await assert.rejects(store.acquire(interrupted.spec,{retain:true}),{code:'NETWORK_TRANSIENT'});
  assert.equal(store.snapshot().entries,2);assert.equal(store.snapshot().incompleteTensorBytes,interrupted.spec.bytes);assert.equal(store.snapshot().committedBytes,64+512*1024);
  store.clearIncomplete();assert.equal(store.snapshot().entries,1);assert.equal(store.snapshot().incompleteTensorBytes,0);
  const reused=await store.acquire(complete.spec,{retain:true});assert.deepEqual(bytes(reused),complete.data);reused.release();assert.equal(requests.length,2);
 }finally{store.dispose();}
 assert.equal(budget.total(),0);
});

test('checkpoint cleanup cannot discard an in-flight load or a live verified lease',async()=>{
 const item=fixture(64),budget=new Budget(64*MiB);let start,finish;
 const entered=new Promise(resolve=>start=resolve),pendingResponse=new Promise(resolve=>finish=resolve),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:async()=>{start();await pendingResponse;return new Response(item.data);}});
 let lease;
 try{
  const pending=store.acquire(item.spec,{retain:true});await entered;store.clearIncomplete();assert.equal(store.snapshot().entries,1);finish();lease=await pending;
  store.clearIncomplete();assert.equal(store.snapshot().liveLeaseCount,1);assert.deepEqual(bytes(lease),item.data);
  store.dispose();assert.deepEqual(bytes(lease),item.data);assert.ok(budget.total()>0);lease.release();lease.release();lease=null;
 }finally{finish();lease?.release();store.dispose();}
 assert.equal(budget.total(),0);
});

test('explicit cache clear during a load preserves its consumer lease and removes the deferred entry at release',async()=>{
 const item=fixture(64),budget=new Budget(64*MiB);let start,finish;
 const entered=new Promise(resolve=>start=resolve),response=new Promise(resolve=>finish=resolve),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:async()=>{start();await response;return new Response(item.data);}});let lease;
 try{const pending=store.acquire(item.spec,{retain:true});await entered;store.clear();assert.equal(store.snapshot().entries,1);finish();lease=await pending;assert.deepEqual(bytes(lease),item.data);lease.release();lease=null;assert.equal(store.snapshot().entries,0);}finally{finish();lease?.release();store.dispose();}
 assert.equal(budget.total(),0);
});
