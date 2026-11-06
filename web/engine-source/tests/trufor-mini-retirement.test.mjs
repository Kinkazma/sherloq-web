import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {retireMiniPartialTargets,miniFusionMemoryFallbackAllowed} from '../src/trufor-mini-backbone.js';

// Allocation/acknowledgement controls only: no image and no neural inference.
test('Mini local fallback waits for every partial-output retirement acknowledgement',async()=>{
 const budget=new Budget(1024),owned=new Map(),started=[];let finish,entered;
 const acknowledgement=new Promise(resolve=>finish=resolve),secondStarted=new Promise(resolve=>entered=resolve);
 for(const [id,bytes] of [['first',32],['second',64]])owned.set(id,budget.reserve(bytes));
 const drop=async id=>{started.push(id);if(id==='second'){entered();await acknowledgement;}owned.get(id)();owned.delete(id);};
 let settled=false;const retiring=retireMiniPartialTargets([...owned.keys()],drop).then(value=>{settled=true;return value;});
 await secondStarted;assert.deepEqual(started,['first','second']);assert.equal(settled,false);assert.equal(budget.total(),64);
 finish();assert.deepEqual(await retiring,{failed:false});assert.equal(owned.size,0);assert.equal(budget.total(),0);
});

test('Mini failed retirement preserves the refusing owner for a retry and settles independent owners',async()=>{
 const budget=new Budget(1024),owned=new Map();let refuse=true;
 for(const [id,bytes] of [['first',32],['refused',64],['third',16]])owned.set(id,budget.reserve(bytes));
 const primary=Object.freeze(Object.assign(new Error('allocation refused'),{code:'MEMORY_LIMIT'})),refusal=Object.freeze(new Error('retirement acknowledgement refused'));
 const drop=async id=>{if(id==='refused'&&refuse)throw refusal;owned.get(id)();owned.delete(id);};
 const outcome=await retireMiniPartialTargets([...owned.keys()],drop);assert.equal(outcome.failed,true);assert.equal(outcome.reason,refusal);
 assert.deepEqual([...owned.keys()],['refused']);assert.equal(budget.total(),64);assert.equal(miniFusionMemoryFallbackAllowed(primary,{cleanupConfirmed:!outcome.failed}),false);
 refuse=false;assert.deepEqual(await retireMiniPartialTargets([...owned.keys()],drop),{failed:false});assert.equal(budget.total(),0);assert.equal(primary.code,'MEMORY_LIMIT');
});

test('Mini fusion fallback is restricted to memory errors and never consumes cancellation or shape errors',()=>{
 for(const code of ['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY']){
  const failure=Object.freeze({code});assert.equal(miniFusionMemoryFallbackAllowed(failure),true);assert.equal(miniFusionMemoryFallbackAllowed(failure,{cleanupConfirmed:false}),false);
 }
 for(const failure of [{code:'INVALID_ARGUMENT'},{code:'CANCELLED'},{code:'NEURAL_EXECUTION'},undefined,null,0])assert.equal(miniFusionMemoryFallbackAllowed(failure),false);
 const controller=new AbortController();controller.abort();assert.throws(()=>miniFusionMemoryFallbackAllowed({code:'MEMORY_LIMIT'},{signal:controller.signal}),{code:'CANCELLED'});
 for(const failure of [Object.freeze({code:'CANCELLED'}),Object.freeze({code:'INVALID_ARGUMENT'})])assert.equal(miniFusionMemoryFallbackAllowed(failure,{signal:controller.signal}),false);
});

test('Mini retirement reports even an undefined rejection as an unconfirmed acknowledgement',async()=>{
 const result=await retireMiniPartialTargets(['owner'],()=>Promise.reject(undefined));assert.equal(result.failed,true);assert.equal(result.reason,undefined);
});
