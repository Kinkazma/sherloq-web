import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createElaSynthesisAccumulator} from '../src/ela-synthesis-accumulator.js';
const MiB=1024**2,GiB=1024**3;
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

test('29MP100-frame stack remains temporary under4GiB without any8.85GB resident reservation',async()=>{
 const budget=new Budget(4*GiB),release=budget.reserve(280*MiB),events=[],session={backend:'opfs',async create(bytes){events.push(['temporary',bytes]);return{byteLength:bytes,dispose(){events.push('dispose');},flush(){},readInto(){throw Error('No image read in admission oracle');},write(){throw Error('No image write in admission oracle');}};}};
 const acc=await createElaSynthesisAccumulator({width:3822,height:7716,count:100,budget,nativeHeadroomBytes:3*GiB,getTemporarySession:async()=>session});assert.equal(acc.intermediateBytes,8847165600);assert.deepEqual(events,[['temporary',8847165600]]);assert.equal(budget.total(),280*MiB);await acc.dispose();assert.equal(events.at(-1),'dispose');release();assert.equal(budget.total(),0);
});
for(const code of ['STORAGE_UNAVAILABLE','STORAGE_QUOTA','STORAGE_IO'])test('oversized stack preserves initial '+code+' instead of retrying impossible RAM',async()=>{
 const budget=new Budget(4*GiB),failure=new EngineError(code,'Exact first temporary refusal'),calls=[];let retained=0;const retain=budget.retain.bind(budget);budget.retain=bytes=>{retained++;return retain(bytes);};
 await assert.rejects(createElaSynthesisAccumulator({width:3822,height:7716,count:100,budget,nativeHeadroomBytes:3*GiB,createStore:async(bytes,{storage})=>{calls.push([bytes,storage]);throw failure;}}),error=>error===failure);assert.deepEqual(calls,[[8847165600,'temporary']]);assert.equal(retained,0);assert.equal(budget.total(),0);
});
for(const failure of [0,null,Object.freeze({code:'STORAGE_IO',message:'Frozen exact refusal'})])test('falsy/frozen primary cannot be replaced by a RAM fallback: '+String(failure),async()=>{
 const budget=new Budget(1024),calls=[];await assert.rejects(createElaSynthesisAccumulator({width:400,height:1,count:100,budget,createStore:async(_bytes,{storage})=>{calls.push(storage);throw failure;}}),error=>error===failure);assert.deepEqual(calls,['temporary']);assert.equal(budget.total(),0);
});
test('unknown native headroom may still use RAM after refused storage only when the entire exact bank and windows fit',async()=>{
 const budget=new Budget(16*MiB),calls=[],failure=new EngineError('STORAGE_UNAVAILABLE','Storage unavailable');const acc=await createElaSynthesisAccumulator({width:2,height:1,count:3,budget,createStore:async(bytes,options)=>{calls.push(options.storage);if(options.storage==='temporary')throw failure;return createSegmentedBytes(bytes,options);}});assert.deepEqual(calls,['temporary','memory']);assert(budget.retained>=18);await acc.dispose();assert.equal(budget.total(),0);
});
test('a live reservation created during temporary refusal is included before any RAM retry',async()=>{
 const budget=new Budget(1024),failure=new EngineError('STORAGE_UNAVAILABLE','Storage unavailable'),calls=[];let held;
 await assert.rejects(createElaSynthesisAccumulator({width:100,height:1,count:1,budget,createStore:async(_bytes,{storage})=>{calls.push(storage);held=budget.reserve(900);throw failure;}}),error=>error===failure);assert.deepEqual(calls,['temporary']);held();assert.equal(budget.total(),0);
});
test('RAM fallback never evicts a useful cache or ignores physical backing pressure',async()=>{
 for(const pressure of [false,true]){const budget=new Budget(1024),failure=new EngineError('STORAGE_IO','No storage'),calls=[];budget.put('useful',{byteLength:pressure?20:800});if(pressure)budget.isBackingUnderPressure=()=>true;
 await assert.rejects(createElaSynthesisAccumulator({width:100,height:1,count:1,budget,createStore:async(_bytes,{storage})=>{calls.push(storage);throw failure;}}),error=>error===failure);assert.deepEqual(calls,['temporary']);assert(budget.cache.has('useful'));budget.remove('useful');assert.equal(budget.total(),0);}
});
test('arbitrary tiny-store callback failures do not trigger an unrelated backend attempt',async()=>{
 for(const failure of [0,Object.freeze({message:'external callback'}),new EngineError('INVALID_INPUT','Caller failure')]){let calls=0;const budget=new Budget(1024);await assert.rejects(createElaSynthesisAccumulator({width:1,height:1,count:1,budget,createStore:async()=>{calls++;throw failure;}}),error=>error===failure);assert.equal(calls,1);assert.equal(budget.total(),0);}
});
test('a failed admissible RAM alternative retains the first frozen temporary primary',async()=>{
 const budget=new Budget(1024),failure=Object.freeze(new EngineError('STORAGE_IO','Primary storage refusal')),fallback=new EngineError('MEMORY_ALLOCATION','Physical allocation failed'),calls=[];
 await assert.rejects(createElaSynthesisAccumulator({width:1,height:1,count:1,budget,createStore:async(_bytes,{storage})=>{calls.push(storage);throw storage==='temporary'?failure:fallback;}}),error=>error===failure);assert.deepEqual(calls,['temporary','memory']);assert.equal(budget.total(),0);
});
test('abort has priority over a storage refusal and never attempts another backend',async()=>{
 const budget=new Budget(1024),controller=new AbortController(),calls=[];await assert.rejects(createElaSynthesisAccumulator({width:1,height:1,count:1,budget,createStore:async(_bytes,{storage})=>{calls.push(storage);controller.abort();throw new EngineError('STORAGE_IO','I/O failed');}},{signal:controller.signal}),{code:'CANCELLED'});assert.deepEqual(calls,['temporary']);assert.equal(budget.total(),0);
});
test('private session cleanup ACK is awaited before publishing the exact initial storage failure',async()=>{
 const budget=new Budget(1024),held=gate(),failure=Object.freeze(new EngineError('STORAGE_QUOTA','Quota refused')),events=[];let settled=false;
 const result=assert.rejects(createElaSynthesisAccumulator({width:400,height:1,count:100,budget,createSession:async()=>({id:'owned',backend:'opfs',async create(){events.push('create');throw failure;},async dispose(){events.push('dispose');await held.promise;events.push('ACK');}})}),error=>error===failure).then(()=>settled=true);
 await new Promise(setImmediate);assert.deepEqual(events,['create','dispose']);assert.equal(settled,false);held.resolve();await result;assert.deepEqual(events,['create','dispose','ACK']);assert.equal(budget.total(),0);
});
