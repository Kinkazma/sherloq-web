import test from 'node:test';import assert from 'node:assert/strict';
import {AdaptiveConcurrency} from '../src/adaptive-concurrency.js';import {Budget} from '../src/cache.js';import {resolveComputeProfile} from '../src/profiles.js';
test('Immediate concurrency uses the highest admitted capacity, evicts only cache and counts no preflight work',()=>{
 const policy=new AdaptiveConcurrency(),budget=new Budget(1000);budget.retain(100);const release=budget.reserve(200);budget.put('recomputable',{byteLength:400});
 assert.equal(policy.select('a',12,budget,n=>n*100).count,7);assert.equal(policy.select('a',12,budget,n=>n*100).priorUsefulSamples,0);
 release();release();assert.equal(budget.active,0);assert.equal(policy.select('a',12,budget,n=>n*100).count,9);
 assert.equal(policy.select('b',12,budget,n=>n*2000,0).count,0);
});
test('Slow wall time cannot reduce CPU parallelism; useful completion promptly restores failure ceilings',()=>{
 const policy=new AdaptiveConcurrency(),budget=new Budget(1e6),observe=(count,ms)=>policy.observe('a',{count,maximum:8,milliseconds:ms,units:100});
 observe(8,100);observe(8,10000);assert.equal(policy.select('a',8,budget,()=>0).count,8);
 policy.reduce('a',8);assert.equal(policy.select('a',8,budget,()=>0).count,4);
 observe(4,80);assert.equal(policy.select('a',8,budget,()=>0).count,8);
});
test('Physical backing releases reopen a failed capacity independently of long task completion',()=>{
 const policy=new AdaptiveConcurrency(),budget=new Budget(1000);
 policy.select('a',8,budget,n=>n*100);policy.reduce('a',8,{error:{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm'}}});
 assert.equal(policy.select('a',8,budget,n=>n*100).count,4);
 budget.notifyBackingRelease('array-buffer',100);assert.equal(policy.select('a',8,budget,n=>n*100).count,4);
 budget.notifyBackingRelease('wasm',100);assert.equal(policy.select('a',8,budget,n=>n*100).count,8);
});
test('Only compute service time can establish contention, excluding measured waits',()=>{
 const policy=new AdaptiveConcurrency(),budget=new Budget(1e6),observe=(computeMilliseconds,waitMilliseconds=0)=>policy.observe('a',{count:8,maximum:8,milliseconds:computeMilliseconds+waitMilliseconds,computeMilliseconds,waitMilliseconds,units:100});
 observe(100);observe(200,1000);assert.equal(policy.select('a',8,budget,()=>0).count,8);
 observe(400);assert.equal(policy.select('a',8,budget,()=>0).count,6);
});
test('Large browser memory hints are not capped at an arbitrary global four GiB',()=>{
 const p=resolveComputeProfile('maximum',{deviceMemoryGiB:32,heapLimitBytes:16*1024**3,hardwareConcurrency:20});assert.ok(p.memoryBudgetBytes>4*1024**3);assert.equal(p.maxWorkers,20);
});
test('useful observations preserve decisions for other operation shapes and remain bounded',()=>{
 const policy=new AdaptiveConcurrency(),budget=new Budget(1e6);
 policy.reduce('slow',8);policy.observe('other',{count:8,maximum:8,milliseconds:100,units:100});
 assert.equal(policy.select('slow',8,budget,()=>0).count,4);
 for(let i=0;i<80;i++)policy.observe('shape'+i,{count:8,maximum:8,milliseconds:100,units:100});
 assert.equal(policy.states.size,64);policy.clear();assert.equal(policy.states.size,0);
});
