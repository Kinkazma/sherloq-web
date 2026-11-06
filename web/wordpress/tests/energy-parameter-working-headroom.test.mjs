import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const worker=await readFile(new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),'utf8');
const body=worker.slice(worker.indexOf('function previewWorkingBytes()'),worker.indexOf('function observePreview('));
function allowance(memory){const context=vm.createContext({engine:{capabilities:()=>({memory})}});new vm.Script(body).runInContext(context);return context.previewWorkingBytes();}

test('Biomes work leaves the known heap admitted alongside every external frame reservation',()=>{
 const memory={budgetBytes:1647289686,policyAvailableBytes:282149450,knownHeapCapacityBytes:183435264};
 assert.equal(allowance(memory),98714186);assert.equal(allowance(memory)+memory.knownHeapCapacityBytes,memory.policyAvailableBytes);
 const later={...memory,policyAvailableBytes:264432050};assert.equal(allowance(later),80996786);
});
test('roomy profiles keep their existing one-third working bound',()=>{
 const memory={budgetBytes:900*1024**2,policyAvailableBytes:800*1024**2,knownHeapCapacityBytes:100*1024**2};assert.equal(allowance(memory),300*1024**2);
});
test('an unavailable heap leaves no positive unadmitted workspace and byte rounding remains conservative',()=>{
 assert.equal(allowance({budgetBytes:1024,policyAvailableBytes:99,knownHeapCapacityBytes:100}),0);
 assert.equal(allowance({budgetBytes:1024,policyAvailableBytes:100.8,knownHeapCapacityBytes:2.1}),97);
});
test('old capability providers retain the historical fallback without changing preview parameters',()=>{
 assert.equal(allowance(undefined),128*1024**2);assert.equal(allowance({budgetBytes:1024,policyAvailableBytes:100}),100);
});
