import test from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {resourceValueArbiter} from '../src/resource-value.js';
test('a measured useful worker can displace a lower-value optional cache but never active state',async()=>{
 const budget=new Budget(1000),active=budget.reserve(400),cache=budget.reserve(600),value=resourceValueArbiter(budget);let bytes=600;
 value.registerCache({bytes:()=>bytes,score:()=>.001,async reclaim(n){const freed=Math.min(bytes,n);cache.split(freed)();bytes-=freed;return freed;}});
 value.request('worker',{bytes:200,active:2,remaining:30,serviceMs:100});await value.pending;assert.equal(bytes,400);assert.equal(active.bytes,400);assert.equal(budget.total(),800);assert.equal(value.snapshot().decisions,1);
 active();cache();
});
test('valuable cache wins against low-payoff growth and unresolved reclamation cannot spin',async()=>{
 const budget=new Budget(1000),release=budget.reserve(1000),value=resourceValueArbiter(budget);let calls=0;
 value.registerCache({bytes:()=>500,score:()=>100,async reclaim(){calls++;return 0;}});value.request('worker',{bytes:100,active:8,remaining:10,serviceMs:1});assert.equal(value.pending,null);assert.equal(calls,0);
 value.request('new-worker',{bytes:100,remaining:10});await value.pending;assert.equal(calls,1);assert.equal(budget.total(),1000);value.release('new-worker');release();
});
