import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSessionCache,sessionCacheStats} from '../experiments/segmentation/session-cache.js';

test('only useful acquisition creates a session; warm acquisition reuses it',()=>{
 const budget=new Budget(1000);let created=0,terminated=0;
 const cache=createSessionCache({budget,bytes:600,create:()=>({id:++created,terminate(){terminated++;}})});
 assert.equal(created,0);assert.equal(budget.total(),0);const before=cache.snapshot();
 const first=cache.acquire();cache.unlock();const second=cache.acquire();assert.strictEqual(second,first);cache.unlock();
 assert.deepEqual(sessionCacheStats(cache,before),{enabled:true,residentBytesAfterInference:600,creations:1,reuses:1,pressureEvictions:0});
 cache.dispose();cache.dispose();assert.equal(terminated,1);assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});

test('idle model yields to useful work before a result grid; active RPC remains protected',()=>{
 const budget=new Budget(1000);let terminated=0;
 const cache=createSessionCache({budget,bytes:600,create:()=>({terminate(){terminated++;}})});
 budget.put('grid',{byteLength:100});cache.acquire();assert.throws(()=>cache.acquire(),{code:'INVALID_INPUT'});
 assert.throws(()=>budget.reserve(500),{code:'MEMORY_LIMIT'});assert.equal(terminated,0);assert.equal(cache.residentBytes,600);
 cache.unlock();budget.put('grid',{byteLength:100});const useful=budget.reserve(500);
 assert.equal(terminated,1);assert(budget.get('grid'));assert.equal(cache.residentBytes,0);assert.equal(cache.snapshot().pressureEvictions,1);
 useful();cache.acquire();cache.unlock();cache.dispose();budget.clear();assert.equal(budget.total(),0);
});

test('failed construction rolls back reservation; CPU-style explicit retirement is reusable',()=>{
 const budget=new Budget(1000);let fail=true,terminated=0;
 const cache=createSessionCache({budget,bytes:600,create:()=>{if(fail)throw Error('worker unavailable');return{terminate(){terminated++;}};}});
 assert.throws(()=>cache.acquire(),/worker unavailable/);assert.equal(budget.total(),0);
 fail=false;cache.acquire();assert.throws(()=>cache.dispose(),{code:'INVALID_INPUT'});cache.unlock();cache.releaseIdle();
 assert.equal(budget.total(),0);cache.acquire();cache.unlock();cache.dispose();assert.equal(terminated,2);assert.equal(budget.reclaimers.size,0);
});
