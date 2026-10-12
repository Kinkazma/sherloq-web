import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import {publishD2prlDescriptor,getD2prlDescriptorLease,validateD2prlDescriptor} from '../experiments/d2prl/descriptor-ownership.js';
import {createDescriptors} from '../experiments/d2prl/descriptors.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

test('a published descriptor validates once per active immutable lifetime',async()=>{
 const view=Uint16Array.of(0,0x3c00,0xbc00,0x7bff),revoke=publishD2prlDescriptor(view),lease=getD2prlDescriptorLease(view);
 assert.ok(lease);assert.ok(Object.isFrozen(lease));
 assert.deepEqual(await validateD2prlDescriptor(view),{lease,elementsScanned:4});
 assert.deepEqual(await validateD2prlDescriptor(view),{lease,elementsScanned:0});
 revoke();revoke();assert.throws(()=>getD2prlDescriptorLease(view),{code:'INVALID_INPUT'});
 await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});
});

test('external views and their aliases revalidate each invocation',async()=>{
 const view=Uint16Array.of(0x3c00,0),alias=new Uint16Array(view.buffer);
 assert.equal(getD2prlDescriptorLease(view),null);
 for(const input of [view,view,alias])assert.deepEqual(await validateD2prlDescriptor(input),{lease:null,elementsScanned:2});
 view[1]=0x7c00;await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});
 await assert.rejects(validateD2prlDescriptor(alias),{code:'INVALID_INPUT'});
});

test('publication does not grant ownership to another view of the same backing',async()=>{
 const view=Uint16Array.of(0x3c00,0),revoke=publishD2prlDescriptor(view),alias=new Uint16Array(view.buffer);
 try{assert.ok(getD2prlDescriptorLease(view));assert.equal(getD2prlDescriptorLease(alias),null);assert.deepEqual(await validateD2prlDescriptor(alias),{lease:null,elementsScanned:2});}
 finally{revoke();}
});

test('concurrent consumers share the successful owned validation',async()=>{
 const view=new Uint16Array(65536),revoke=publishD2prlDescriptor(view),lease=getD2prlDescriptorLease(view);
 try{
  const results=await Promise.all([validateD2prlDescriptor(view),validateD2prlDescriptor(view)]);
  assert.deepEqual(results,[{lease,elementsScanned:view.length},{lease,elementsScanned:0}]);
  assert.deepEqual(await validateD2prlDescriptor(view),{lease,elementsScanned:0});
 }finally{revoke();}
});

for(const half of [0x7c00,0xfc00,0x7e00])test('failed half validation never marks an owned lifetime: '+half.toString(16),async()=>{
 const view=Uint16Array.of(half),revoke=publishD2prlDescriptor(view);
 try{for(let i=0;i<2;i++)await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});}
 finally{revoke();}
});

test('cancelled validation cannot grant a reusable validation result',async()=>{
 const view=new Uint16Array(65536),revoke=publishD2prlDescriptor(view),signal=new AbortController(),lease=getD2prlDescriptorLease(view);
 try{
  const pending=validateD2prlDescriptor(view,{signal:signal.signal});signal.abort();
  await assert.rejects(pending,{code:'CANCELLED'});
  assert.deepEqual(await validateD2prlDescriptor(view),{lease,elementsScanned:view.length});
  assert.deepEqual(await validateD2prlDescriptor(view),{lease,elementsScanned:0});
  await assert.rejects(validateD2prlDescriptor(view,{signal:AbortSignal.abort()}),{code:'CANCELLED'});
 }finally{revoke();}
});

test('revocation while validation is pending prevents publication of success',async()=>{
 const view=new Uint16Array(65536),revoke=publishD2prlDescriptor(view),pending=validateD2prlDescriptor(view);
 revoke();await assert.rejects(pending,{code:'INVALID_INPUT'});
 await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});
});

test('released arena views stay rejected after their byte range is reused',async()=>{
 const budget=new Budget(32*1024**2),arena=createWasmTensorArena({budget}),first=arena.allocate(Uint16Array,64),view=first.data,revoke=publishD2prlDescriptor(view);
 await validateD2prlDescriptor(view);revoke();first.release();
 const second=arena.allocate(Uint16Array,64);
 try{assert.equal(second.data.buffer,view.buffer);assert.equal(second.data.byteOffset,view.byteOffset);assert.equal(getD2prlDescriptorLease(second.data),null);assert.throws(()=>getD2prlDescriptorLease(view),{code:'INVALID_INPUT'});await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});}
 finally{second.release();arena.dispose();}assert.equal(budget.total(),0);
});

test('detaching a published extent invalidates its ownership',async()=>{
 const view=Uint16Array.of(0x3c00),revoke=publishD2prlDescriptor(view);
 structuredClone(view.buffer,{transfer:[view.buffer]});
 assert.throws(()=>getD2prlDescriptorLease(view),{code:'INVALID_INPUT'});
 await assert.rejects(validateD2prlDescriptor(view),{code:'INVALID_INPUT'});revoke();
});

test('shared mutable backing and repeated publication cannot acquire the brand',()=>{
 if(typeof SharedArrayBuffer==='function')assert.throws(()=>publishD2prlDescriptor(new Uint16Array(new SharedArrayBuffer(2))),{code:'INVALID_INPUT'});
 const view=Uint16Array.of(0),revoke=publishD2prlDescriptor(view);assert.throws(()=>publishD2prlDescriptor(view),{code:'INVALID_INPUT'});revoke();assert.throws(()=>publishD2prlDescriptor(view),{code:'INVALID_INPUT'});
});

test('descriptor producer publishes only completed banks and revokes before returning them',async()=>{
 const budget=new Budget(128*1024**2),arena=createWasmTensorArena({budget}),banks=[];
 const observedArena={allocate(Type,length,options){const owned=arena.allocate(Type,length,options);if(Type===Uint16Array)banks.push(owned.data);return owned;}};
 const tensor=(Type=Float32Array)=>({data:Type.of(0),shape:[1,1,1,1],release(){}});
 const engine=createDescriptors({budget,arena:observedArena,convolution:{async run(){return tensor();}},math:{async run(op){return tensor(op==='half'?Uint16Array:Float32Array);}},loadConvolution:async()=>({release(){}}),loadBatchNorm:async()=>({release(){}})});
 let result;
 try{
  result=await engine.run(new Float32Array(3*448**2),{onStage(){assert.equal(banks.length,2);assert.ok(banks.every(view=>getD2prlDescriptorLease(view)===null),'The producer still owns a writable bank');}});
  assert.ok(getD2prlDescriptorLease(result.zm));assert.ok(getD2prlDescriptorLease(result.cnn));
  assert.equal(result.zm,banks[0]);assert.equal(result.cnn,banks[1]);
  result.release();result.release();assert.ok(banks.every(view=>{assert.throws(()=>getD2prlDescriptorLease(view),{code:'INVALID_INPUT'});return true;}));
 }finally{result?.release();engine.dispose();arena.dispose();}assert.equal(budget.total(),0);
});

function poolFixture({tileSize=8,maxWorkers=2}={}){
 const budget=new Budget(128*1024**2),workers=[];
 const workerFactory=()=>{
  const descriptors=new Map();let uploading;
  const worker={closed:false,uploads:0,terminate(){this.closed=true;},postMessage(message){
   // Emulate structured cloning, so this fake worker cannot accidentally read
   // a caller's later mutation through an alias retained from a prior upload.
   const received=structuredClone(message);
   queueMicrotask(()=>{
    if(this.closed)return;const response={id:received.id,ok:true,heapBytes:16*1024**2};
    if(received.type==='features'){descriptors.set(received.key,received.values);this.uploads++;}
    if(received.type==='features-begin')uploading={key:received.key,bytes:new Uint8Array(received.bytes)};
    if(received.type==='features-chunks')for(const {at,value} of received.chunks)uploading.bytes.set(value,at);
    if(received.type==='features-end'){descriptors.set(uploading.key,new Uint16Array(uploading.bytes.buffer));uploading=null;this.uploads++;}
    if(received.type==='evaluate'){
     const count=received.end-received.begin,features=descriptors.get(received.key);
     response.x=Float32Array.from({length:count},(_,i)=>received.x[i]+features[received.begin+i]);response.y=received.y.slice(0,count);
    }
    this.onmessage({data:response});
   });
  }};workers.push(worker);return worker;
 };
 return{budget,workers,async create(){return createEvaluatorPool('unused',{budget,maxWorkers,tileSize,workerFactory});}};
}

function cleanPool(fixture){
 assert.equal(fixture.budget.total(),0);assert.ok(fixture.workers.every(worker=>worker.closed));
 const resources=fixture.budget.resourceSnapshot();assert.ok(Object.values(resources.domains).every(domain=>domain.backings===0));assert.equal(resources.operations.length,0);
 const scheduler=getExecutionScheduler(fixture.budget).snapshot();assert.equal(scheduler.running,0);assert.equal(scheduler.queued,0);assert.equal(scheduler.active.cpu,0);
}

const evaluatorInput=()=>({features:new Uint16Array(36*64).fill(1),offsetX:new Float32Array(64),offsetY:new Float32Array(64),side:8,channels:36,candidates:1});

test('pool reuses one validation and one upload per worker for a live immutable descriptor',async()=>{
 const fixture=poolFixture(),pool=await fixture.create(),input=evaluatorInput(),revoke=publishD2prlDescriptor(input.features);
 try{
  const first=await pool.evaluate(input),second=await pool.evaluate(input);assert.deepEqual(first,second);
  assert.equal(pool.stats.descriptorValidationElements,input.features.length);assert.equal(pool.stats.descriptorUploads,2);assert.equal(fixture.workers.length,2);assert.ok(fixture.workers.every(worker=>worker.uploads===1));
 }finally{revoke();pool.dispose();}cleanPool(fixture);
});

test('pool rescans and reuploads a mutated external descriptor',async()=>{
 const fixture=poolFixture(),pool=await fixture.create(),input=evaluatorInput();
 try{
  const first=await pool.evaluate(input);input.features.fill(2);const second=await pool.evaluate(input);
  assert.ok(first.x.every(value=>value===1));assert.ok(second.x.every(value=>value===2));
  assert.equal(pool.stats.descriptorValidationElements,2*input.features.length);assert.equal(pool.stats.descriptorUploads,4);assert.ok(fixture.workers.every(worker=>worker.uploads===2));
  input.features[0]=0x7c00;await assert.rejects(pool.evaluate(input),{code:'INVALID_INPUT'});
 }finally{pool.dispose();}cleanPool(fixture);
});

for(const last of [false,true])test('pool rejects descriptor revocation at '+(last?'final':'intermediate')+' progress and releases every owner',async()=>{
 const fixture=poolFixture({maxWorkers:1,tileSize:last?64:8}),pool=await fixture.create(),input=evaluatorInput(),revoke=publishD2prlDescriptor(input.features);
 let progress=0;
 try{
  await assert.rejects(pool.evaluate(input,{onProgress(){progress++;revoke();}}),{code:'INVALID_INPUT'});
  assert.equal(progress,1);assert.equal(pool.stats.activeWorkers,0);
 }finally{revoke();pool.dispose();}cleanPool(fixture);
});
