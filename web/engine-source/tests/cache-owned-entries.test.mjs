import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';

test('cache transfer pins the same owner without reporting retired backing',()=>{
 const budget=new Budget(100);let disposed=0;const record={byteLength:80,onEvict(){disposed++;}};
 assert.equal(budget.put('x',record),true);assert.equal(budget.put('x',record),true);assert.equal(disposed,0);
 assert.equal(budget.take('x'),record);const release=budget.reserve(record.byteLength);assert.equal(disposed,0);assert.equal(budget.cacheBytes,0);
 release();budget.put('x',record,['source']);budget.clearDependencies('source');budget.clear();assert.equal(disposed,1);assert.equal(budget.total(),0);
});

test('cache eviction, rejected insertion and replacement each settle their owner once',()=>{
 const budget=new Budget(100),events=[],record=(name,n)=>({byteLength:n,onEvict:()=>events.push(name)});
 budget.put('x',record('old',80));budget.put('x',record('new',90));assert.deepEqual(events,['old']);
 assert.equal(budget.put('large',record('refused',101)),false);assert.deepEqual(events,['old','refused']);
 const lease=budget.reserve(100);assert.deepEqual(events,['old','refused','new']);lease();assert.equal(budget.total(),0);
 budget.put('a',record('clear-a',20));budget.put('b',record('clear-b',20));budget.clear();assert.deepEqual(events.slice(-2),['clear-a','clear-b']);assert.equal(budget.total(),0);
});
