import test from 'node:test';import assert from 'node:assert/strict';
import {resolveComputeProfile,createEngine,DEFAULT_ENERGY_PROFILE,DEFAULT_ELA_PARAMS} from '../src/index.js';
test('Aggressive resources adapt to RAM/heap/cores independently of forensic parameters',()=>{
 const p=resolveComputeProfile('aggressive',{deviceMemoryGiB:8,heapLimitBytes:4*1024**3,hardwareConcurrency:10});
 assert.equal(p.memoryBudgetBytes,Math.floor(8*.65*1024)*1024**2);assert.equal(p.maxWorkers,10);
 const m=resolveComputeProfile('maximum',{deviceMemoryGiB:8,heapLimitBytes:4*1024**3,hardwareConcurrency:10});assert.ok(m.memoryBudgetBytes>p.memoryBudgetBytes);
 const e=createEngine({resourceHints:{deviceMemoryGiB:8,heapLimitBytes:4*1024**3,hardwareConcurrency:10}});assert.equal(e.capabilities().calculationProfile,'aggressive');assert.equal(e.capabilities().memory.budgetBytes,p.memoryBudgetBytes);
 assert.deepEqual(DEFAULT_ENERGY_PROFILE.deviations,[5,5]);assert.equal(DEFAULT_ELA_PARAMS.quality,75);e.dispose();
});

test('one JavaScript isolate heap does not cap shared banks and all worker heaps together',()=>{
 const p=resolveComputeProfile('maximum',{deviceMemoryGiB:32,heapLimitBytes:4*1024**3,hardwareConcurrency:64});
 assert.equal(p.memoryBudgetBytes,Math.floor(32*.8*1024)*1024**2);assert.equal(p.maxWorkers,64);
 const fallback=resolveComputeProfile('maximum',{deviceMemoryGiB:NaN,heapLimitBytes:4*1024**3,hardwareConcurrency:8});assert.equal(fallback.memoryBudgetBytes,2*1024**3);
 const small=resolveComputeProfile('maximum',{deviceMemoryGiB:2,heapLimitBytes:4*1024**3,hardwareConcurrency:4});assert.equal(small.memoryBudgetBytes,Math.floor(2*.8*1024)*1024**2);
});
