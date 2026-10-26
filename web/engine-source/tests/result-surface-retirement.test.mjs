import test from 'node:test';
import assert from 'node:assert/strict';
import {createResultSurfaces} from '../src/segmented-results.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(dispose,{pairedSourceIds}={}){
 const surfaces=new Map(),registry=createResultSurfaces(surfaces),record={surface:{descriptor:{id:'research-view',revision:1},dispose},...(pairedSourceIds?{pairedSourceIds}:{})};
 registry.publish('source',record);return {registry,surfaces};
}
test('failed asynchronous result retirement preserves the exact owner for retry',async()=>{
 const primary=Object.freeze(Object.assign(new Error('source ACK failed'),{code:'STORAGE_IO'}));let calls=0;
 const {registry,surfaces}=setup(async()=>{if(++calls===1)throw primary;});
 await assert.rejects(registry.release('research-view'),e=>e===primary);
 assert.equal(registry.hasAny(),true);assert.equal(registry.hasFor('source'),true);assert.equal(surfaces.has('research-view'),true);
 await registry.release('research-view');assert.equal(calls,2);assert.equal(registry.hasAny(),false);assert.equal(surfaces.size,0);
});
test('a pending retirement stays addressable and concurrent releases share one disposal',async()=>{
 const gate=deferred();let calls=0;const {registry,surfaces}=setup(()=>{calls++;return gate.promise;});
 const a=registry.release('research-view'),b=registry.release('research-view');await Promise.resolve();
 assert.equal(calls,1);assert.equal(registry.hasFor('source'),true);assert.equal(surfaces.has('research-view'),true);
 gate.resolve();await Promise.all([a,b]);assert.equal(calls,1);assert.equal(registry.hasAny(),false);assert.equal(surfaces.size,0);
});
test('concurrent rejected release and clear keep the same frozen cause and permit retry',async()=>{
 const gate=deferred(),primary=Object.freeze(new Error('cleanup rejected'));let calls=0;
 const {registry}=setup(()=>++calls===1?gate.promise:undefined,{pairedSourceIds:['reference']});
 const a=registry.release('research-view'),b=registry.clear('reference');await Promise.resolve();gate.reject(primary);
 const answers=await Promise.allSettled([a,b]);assert.deepEqual(answers.map(r=>r.status),['rejected','rejected']);assert.ok(answers.every(r=>r.reason===primary));assert.equal(calls,1);
 assert.equal(registry.hasFor('reference'),true);await registry.clear('reference');assert.equal(calls,2);assert.equal(registry.hasAny(),false);
});
test('clear retires other results after one failure and retains only the failed result',async()=>{
 const surfaces=new Map(),registry=createResultSurfaces(surfaces);let first=0,second=0;const failure=new Error('retry first');
 registry.publish('source',{surface:{descriptor:{id:'a'},dispose:()=>{if(++first===1)throw failure;}}});
 registry.publish('source',{surface:{descriptor:{id:'b'},dispose:async()=>{second++;}}});
 await assert.rejects(registry.clear(),e=>e===failure);assert.equal(first,1);assert.equal(second,1);assert.deepEqual([...surfaces.keys()],['a']);
 await registry.clear();assert.equal(first,2);assert.equal(second,1);assert.equal(surfaces.size,0);
});
test('retirement blocks duplicate publication until the original owner acknowledges',async()=>{
 const gate=deferred(),{registry}=setup(()=>gate.promise),pending=registry.release('research-view');
 assert.throws(()=>registry.publish('other',{surface:{descriptor:{id:'research-view'},dispose(){}}}),{code:'INVALID_INPUT'});
 gate.resolve();await pending;registry.publish('other',{surface:{descriptor:{id:'research-view'},dispose(){}}});assert.equal(registry.hasFor('other'),true);await registry.clear();
});
test('original source release remains invalid and successful missing result remains NOT_FOUND',async()=>{
 const surfaces=new Map([['original',{imageId:'source',record:{}}]]),registry=createResultSurfaces(surfaces);
 await assert.rejects(registry.release('original'),{code:'INVALID_INPUT'});await assert.rejects(registry.release('missing'),{code:'NOT_FOUND'});assert.equal(surfaces.size,1);
});
