import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createParameterCache} from '../experiments/segmentation/parameter-cache.js';
import {readVerifiedModelAsset} from '../experiments/d2prl/model.js';
const data=v=>new Uint8Array(1024).fill(v),spec=v=>({bytes:1024,sha256:createHash('sha256').update(data(v)).digest('hex')});

test('verified bytes are lazy, shared by identity and reclaimed before result cache',async()=>{
 const budget=new Budget(5000);let reads=0;
 const cache=createParameterCache({budget,read:async s=>{reads++;return s.sha256===spec(1).sha256?data(1):data(2);}});
 try{
  assert.equal(reads,0);const a=await cache.read(spec(1));assert.strictEqual(await cache.read({...spec(1),file:'another-alias'}),a);assert.equal(reads,1);
  budget.put('owned-grid',{byteLength:1024});await cache.read(spec(2));assert.equal(cache.bytes,2560);
  const release=budget.reserve(2000);assert.equal(cache.bytes,1280);assert(budget.get('owned-grid'));release();
  assert.equal(cache.snapshot().hits,1);assert.equal(cache.snapshot().evictions,1);
 }finally{cache.dispose();budget.clear();}
 assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});

test('a new cache entry never evicts live results or lowers admitted CPU capacity',async()=>{
 const budget=new Budget(3000),cache=createParameterCache({budget,read:async()=>data(1)});
 try{
  budget.put('grid',{byteLength:2500});await cache.read(spec(1));assert.equal(cache.bytes,0);assert(budget.get('grid'));
  budget.remove('grid');await cache.read(spec(1));const available=budget.limit-budget.total()+cache.bytes;
  assert.equal(available,3000);cache.reclaim(2800);assert.equal(cache.bytes,0);
  const worker=budget.reserve(2800);assert.equal(budget.total(),2800);worker();
 }finally{cache.dispose();}assert.equal(budget.total(),0);
});

test('transport identity failure and cancellation never populate the cache',async t=>{
 const budget=new Budget(8192);let corrupted=true;
 t.mock.method(globalThis,'fetch',async()=>new Response(corrupted?data(2):data(1)));
 const cache=createParameterCache({budget,read:(s,h)=>readVerifiedModelAsset('https://models.invalid/parameter',s,h)});
 try{
  await assert.rejects(cache.read(spec(1)),{code:'MODEL_IDENTITY'});assert.equal(cache.bytes,0);
  corrupted=false;const value=await cache.read(spec(1));assert.deepEqual(value,data(1));
  const abort=new AbortController();abort.abort();await assert.rejects(cache.read(spec(1),{signal:abort.signal}),{code:'CANCELLED'});
  assert.equal(cache.snapshot().hits,0);
 }finally{cache.dispose();}assert.equal(budget.total(),0);
});

test('disabled CPU mode remains lazy and never retains parameter bytes',async()=>{
 const budget=new Budget(1024);let reads=0;
 const cache=createParameterCache({budget,enabled:false,read:async()=>{reads++;return data(1);}});
 try{await cache.read(spec(1));await cache.read(spec(1));assert.equal(reads,2);assert.equal(cache.bytes,0);assert.equal(budget.total(),0);}finally{cache.dispose();}
});

test('concurrent identical reads do not double-charge residency; shrink evicts LRU',async()=>{
 const budget=new Budget(3000),cache=createParameterCache({budget,read:async()=>data(1)});
 try{
  await Promise.all([cache.read(spec(1)),cache.read(spec(1))]);assert.equal(cache.bytes,1280);assert.equal(cache.snapshot().entries,1);
  budget.limit=64;cache.reclaim();assert.equal(cache.bytes,0);assert.equal(budget.total(),0);
 }finally{cache.dispose();cache.dispose();}assert.equal(budget.reclaimers.size,0);
});
