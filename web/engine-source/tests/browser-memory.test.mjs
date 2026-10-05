import test from 'node:test';
import assert from 'node:assert/strict';
import {browserMemoryObservation,readSystemMemoryHints} from '../src/index.js';
import {resolveComputeProfile} from '../src/profiles.js';
const GiB=1024**3,MiB=1024**2;
test('memory metadata never manufactures free RAM or requests a measurement',()=>{
 const result=browserMemoryObservation({performanceObject:{memory:{jsHeapSizeLimit:4*GiB,usedJSHeapSize:6*GiB,totalJSHeapSize:GiB},measureUserAgentSpecificMemory(){throw Error('Forbidden preflight');}},navigatorObject:{deviceMemory:8}});
 assert.equal(result.availableAllocationBytes,null);assert.equal(result.reportedUsedJSHeapSize,6*GiB);assert.equal(result.measurement,'metadata-only');
 const unavailable=browserMemoryObservation({performanceObject:{get memory(){throw Error('denied');}},navigatorObject:{get deviceMemory(){throw Error('denied');}}});assert.equal(unavailable.jsHeapSizeLimit,null);assert.equal(unavailable.deviceMemoryGiB,null);
 assert.equal(browserMemoryObservation({performanceObject:{memory:{get usedJSHeapSize(){throw Error('denied');}}}}).reportedUsedJSHeapSize,null);
});
test('optional extension observation is dated and preserves the portable path',async()=>{
 assert.equal(await readSystemMemoryHints({}),null);await assert.rejects(readSystemMemoryHints({getInfo:async()=>({capacity:100,availableCapacity:101})}),TypeError);
 const hints=await readSystemMemoryHints({getInfo:async()=>({capacity:32*GiB,availableCapacity:12*GiB})});const profile=resolveComputeProfile('maximum',{...hints,hardwareConcurrency:10,deviceMemoryGiB:8});
 assert.equal(profile.memoryBudgetSource,'system-available-snapshot');assert.equal(profile.memoryBudgetBytes,Math.floor(12*.8*1024)*MiB);assert.equal(profile.maxWorkers,10);
 for(const observedAt of [Date.now()-6000,Date.now()+6000,NaN]){const stale=resolveComputeProfile('maximum',{...hints,systemMemoryObservedAt:observedAt,deviceMemoryGiB:8});assert.equal(stale.memoryBudgetSource,'approximate-device-memory');assert.equal(stale.memoryBudgetBytes,Math.floor(8*.8*1024)*MiB);}
});

test('extension transport addresses only the requested ID and reports denied or malformed observations',async()=>{
 const {readExtensionMemoryHints}=await import('../src/browser-memory.js'),id='a'.repeat(32);let messages=0;
 const hints=await readExtensionMemoryHints(id,{runtime:{sendMessage(destination,message,callback){messages++;assert.equal(destination,id);assert.deepEqual(message,{type:'sherloq-system-memory-v1'});callback({capacity:16*GiB,availableCapacity:7*GiB});}}});
 assert.equal(messages,1);assert.equal(hints.systemMemoryAvailableBytes,7*GiB);assert.equal(await readExtensionMemoryHints(id,{runtime:{}}),null);
 await assert.rejects(readExtensionMemoryHints('invalid',{runtime:{sendMessage(){throw Error('Must not send');}}}),TypeError);
 await assert.rejects(readExtensionMemoryHints(id,{runtime:{lastError:{message:'Permission denied'},sendMessage(_id,_message,callback){callback();}}}),/Permission denied/);
});
