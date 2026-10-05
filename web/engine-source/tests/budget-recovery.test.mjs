import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getSharedReadCache,createSharedReadCacheClient} from '../src/shared-read-cache.js';
const MiB=1024**2,tick=()=>new Promise(resolve=>setImmediate(resolve));

test('recovery tokens are concurrent, reentrant, idempotent, and leave the policy budget unchanged',async()=>{
 const budget=new Budget(100),states=[],unsubscribe=budget.subscribe(()=>states.push(budget.recovering));
 const outer=budget.beginRecovery();await tick();const inner=budget.beginRecovery();assert.equal(budget.snapshot().activeRecoveries,2);
 const useful=budget.reserve(80);assert.equal(budget.total(),80);outer();outer();await tick();assert.equal(budget.recovering,true);assert.equal(budget.snapshot().activeRecoveries,1);
 inner();inner();await tick();assert.equal(budget.recovering,false);assert.equal(budget.snapshot().activeRecoveries,0);assert.deepEqual(states,[true,true,false]);assert.equal(budget.limit,100);useful();unsubscribe();assert.equal(budget.total(),0);
});

test('a cancelled asynchronous reclaim releases its recovery token in finally',async()=>{
 const budget=new Budget(100),held=budget.reserve(100),controller=new AbortController();let enter,leave;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{leave=resolve;});
 const unregister=budget.registerAsyncReclaimer(async()=>{enter();await gate;});
 const run=(async()=>{const release=budget.beginRecovery();try{await budget.reclaim(50,{signal:controller.signal});}finally{release();}})();await entered;assert.equal(budget.recovering,true);controller.abort();leave();await assert.rejects(run,{code:'CANCELLED'});assert.equal(budget.recovering,false);assert.equal(budget.snapshot().activeRecoveries,0);held();unregister();assert.equal(budget.total(),0);
});

test('shared pages remain readable while concurrent recovery protects reclaimed RAM for a useful retry',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),peer=budget.reserve(80*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),client=createSharedReadCacheClient(connection.descriptor),page=new Uint8Array(4096);let useful,first,second,reads=0;
 const reader=client.wrap(1,{byteLength:8*MiB,readInto(out,offset){reads++;out.fill(offset/4096%251);return out;}});
 try{
  for(let i=0;i<600;i++)reader.readInto(page,i*4096);const initialBanks=manager.snapshot().banks;assert.equal(initialBanks,1);
  first=budget.beginRecovery();second=budget.beginRecovery();await tick();manager.rebalance();assert.equal(manager.snapshot().banks,initialBanks);
  reader.readInto(page,599*4096);assert.equal(page[0],599%251);assert.equal(reads,600,'Recovery keeps an existing useful hit available');
  const freed=await budget.reclaim(budget.limit);assert.ok(freed>=4*MiB);assert.equal(manager.snapshot().banks,0);peer();await tick();manager.rebalance();assert.equal(manager.snapshot().banks,0,'An external release cannot steal priority from an active recovery');
  useful=budget.reserve(64*MiB);reader.readInto(page,601*4096);assert.equal(page[0],601%251);assert.equal(reads,601);first();await tick();assert.equal(manager.snapshot().banks,0);
  second();await tick();assert.ok(manager.snapshot().banks>0,'The last completed recovery restores cache growth');assert.equal(budget.recovering,false);assert.equal(budget.limit,160*MiB);assert.ok(budget.total()>=64*MiB,'The useful retry retains its actual reservation');
 }finally{first?.();second?.();useful?.();peer();await client.dispose();connection.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('new optional cache metadata is deferred during recovery and a later reader can connect',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;const budget=new Budget(80*MiB),manager=getSharedReadCache(budget),release=budget.beginRecovery();let connection,client;
 try{const skipped=manager.connect();assert.equal(skipped.descriptor,null);skipped.release();assert.equal(budget.total(),0);release();await tick();connection=manager.connect();assert.ok(connection.descriptor);client=createSharedReadCacheClient(connection.descriptor);assert.ok(manager.snapshot().banks>0);}finally{release();await client?.dispose();connection?.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});
