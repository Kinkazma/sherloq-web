import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createNeuralTensor,noteNeuralTensorTaskYield} from '../src/neural-tensor-store.js';
const bits=data=>new Uint32Array(data.buffer,data.byteOffset,data.length);
function timing(t){let now=0,yields=0,afterYield=()=>{};t.mock.method(performance,'now',()=>now);t.mock.method(globalThis,'setTimeout',callback=>{yields++;queueMicrotask(()=>{afterYield();callback();});return yields;});return {advance(ms){now+=ms;},get yields(){return yields;},onYield(fn){afterYield=fn;}};}
test('bounded RITA transfers keep native float32 bits and avoid a timer for each short window',async t=>{
 const clock=timing(t),budget=new Budget(1024**2),tensor=await createNeuralTensor(4,3,5,{budget,cooperation:'bounded'}),words=Uint32Array.from({length:60},(_,i)=>(i*0x9e3779b1)>>>0),data=new Float32Array(words.buffer);
 await tensor.writeRows(0,3,data);for(let top=0;top<3;top++){const part=await tensor.readRows(top,1);const expected=new Uint32Array(20);for(let c=0;c<4;c++)expected.set(words.subarray(c*15+top*5,c*15+(top+1)*5),c*5);assert.deepEqual(bits(part.data),expected);part.release();}
 assert.equal(clock.yields,0);const complete=new Float32Array(60);await tensor.readInto(complete);assert.deepEqual(bits(complete),words);await tensor.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,0);
});
test('other neural consumers retain their original checkpoint per transfer',async t=>{
 const clock=timing(t),budget=new Budget(1024**2),tensor=await createNeuralTensor(2,2,3,{budget});await tensor.writeRows(0,2,new Float32Array(12));assert.equal(clock.yields,1);const part=await tensor.readRows(0,1);assert.equal(clock.yields,2);part.release();await tensor.writeWindow({x:0,y:0,width:1,height:1},Float32Array.of(1,2));assert.equal(clock.yields,3);await tensor.dispose();assert.equal(budget.active,0);
});
test('eight milliseconds of synchronous copy work admits control messages and releases cancelled read leases',async t=>{
 const clock=timing(t),budget=new Budget(1024**2),tensor=await createNeuralTensor(4,2,3,{budget,cooperation:'bounded'}),controller=new AbortController();await tensor.writeRows(0,2,new Float32Array(24));const originalSet=Uint8Array.prototype.set;t.mock.method(Uint8Array.prototype,'set',function(...args){clock.advance(3);return originalSet.apply(this,args);});clock.onYield(()=>controller.abort());await assert.rejects(tensor.readRows(0,1,{signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(clock.yields,1);assert.equal(budget.active,0);await tensor.dispose();assert.equal(budget.retained,0);
});
test('each channel and window row checks cancellation even before the next scheduled yield',async t=>{
 timing(t);for(const operation of ['read','write','window']){
  const budget=new Budget(1024**2),tensor=await createNeuralTensor(4,3,5,{budget,cooperation:'bounded'});let checks=0;const signal={get aborted(){return ++checks>9;}};
  const request=operation==='read'?()=>tensor.readRows(0,3,{signal}):operation==='write'?()=>tensor.writeRows(0,3,new Float32Array(60),{signal}):()=>tensor.writeWindow({x:0,y:0,width:2,height:2},new Float32Array(16),{signal});
  await assert.rejects(request(),e=>e.code==='CANCELLED');assert.ok(checks>9);assert.equal(budget.active,0);await tensor.dispose();assert.equal(budget.retained,0);
 }
});
test('invalid cooperation policy rejects before allocating storage',async()=>{const budget=new Budget(1024**2);await assert.rejects(createNeuralTensor(1,1,1,{budget,cooperation:'never'}),e=>e.code==='INVALID_INPUT');assert.equal(budget.retained,0);assert.equal(budget.active,0);});
test('bounded transfers preserve temporary NCHW byte offsets beyond four GiB and clean the same storage owner',async t=>{
 const clock=timing(t),budget=new Budget(1024),records=new Map();let created=0,removed=0;
 const temporarySession={async create(size){created++;assert.equal(size,64*8000*12000*4);return {write(data,offset){records.set(offset,data.slice());},readInto(target,offset){target.set(records.get(offset));},dispose(){removed++;records.clear();}};}};
 const tensor=await createNeuralTensor(64,8000,12000,{budget,storage:'temporary',temporarySession,cooperation:'bounded'}),words=Uint32Array.from({length:64},(_,i)=>(i*0x9e3779b1)>>>0),data=new Float32Array(words.buffer);await tensor.writeTokens(96000000-1,1,data);const part=await tensor.readTokens(96000000-1,1);assert.deepEqual(bits(part.data),words);assert.ok(Math.max(...records.keys())>2**32);assert.equal(clock.yields,0);part.release();await tensor.dispose();assert.equal(removed,created);assert.equal(records.size,0);assert.equal(budget.total(),0);
});

test('bounded copy work is shared across banks under the same budget',async t=>{
 const clock=timing(t),budget=new Budget(1024),a=await createNeuralTensor(1,1,1,{budget,cooperation:'bounded'}),b=await createNeuralTensor(1,1,1,{budget,cooperation:'bounded'}),originalSet=Uint8Array.prototype.set;
 t.mock.method(Uint8Array.prototype,'set',function(...args){clock.advance(2);return originalSet.apply(this,args);});
 for(const tensor of [a,b,a,b])await tensor.writeTokens(0,1,Float32Array.of(1));assert.equal(clock.yields,1);await a.dispose();await b.dispose();assert.equal(budget.total(),0);
});
test('a real worker response excludes the preceding GPU wait, while CPU-only chains keep a wall-time backstop',async t=>{
 const clock=timing(t),budget=new Budget(1024),tensor=await createNeuralTensor(1,1,1,{budget,cooperation:'bounded'});await tensor.writeTokens(0,1,Float32Array.of(7));clock.advance(100);noteNeuralTensorTaskYield(budget);const part=await tensor.readTokens(0,1);assert.equal(part.data[0],7);part.release();assert.equal(clock.yields,0);clock.advance(32);const next=await tensor.readTokens(0,1);next.release();assert.equal(clock.yields,1);await tensor.dispose();assert.equal(budget.total(),0);
});
test('asynchronous storage waits are excluded without hiding a synchronous CPU prefix before a Promise',async t=>{
 const clock=timing(t),budget=new Budget(1024),data=new Uint8Array(4);let busy=false;const temporarySession={async create(){return {write(source){data.set(source);},readInto(target){if(busy)clock.advance(9);return Promise.resolve().then(()=>{if(!busy)clock.advance(100);target.set(data);});},dispose(){}};}};
 const tensor=await createNeuralTensor(1,1,1,{budget,cooperation:'bounded',storage:'temporary',temporarySession});await tensor.writeTokens(0,1,Float32Array.of(9));const part=await tensor.readTokens(0,1);assert.equal(part.data[0],9);part.release();assert.equal(clock.yields,0);busy=true;const controller=new AbortController();clock.onYield(()=>controller.abort());await assert.rejects(tensor.readTokens(0,1,{signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(clock.yields,1);assert.equal(budget.active,0);await tensor.dispose();assert.equal(budget.total(),0);
});

test('already-resolved Promises cannot repeatedly erase short synchronous CPU prefixes',async t=>{
 const clock=timing(t),budget=new Budget(1024),temporarySession={async create(){return {write(){},readInto(target){clock.advance(7);target.fill(0);return Promise.resolve(target);},dispose(){}};}};
 const tensor=await createNeuralTensor(1,1,1,{budget,cooperation:'bounded',storage:'temporary',temporarySession});let part=await tensor.readTokens(0,1);part.release();assert.equal(clock.yields,0);part=await tensor.readTokens(0,1);part.release();assert.equal(clock.yields,1);await tensor.dispose();assert.equal(budget.total(),0);
});
