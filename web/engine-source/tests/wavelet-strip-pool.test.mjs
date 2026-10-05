import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {WaveletStripPool} from '../src/wavelet-strip-pool.js';
test('sibling failure settles delayed strip reads before releasing shared admission',async()=>{
 const budget=new Budget(256*1024**2);let live=0;
 const pool=new WaveletStripPool(budget,{maxWorkers:2,workerFactory:()=>{live++;let closed=false;return {postMessage(){queueMicrotask(()=>this.onmessage({data:{error:{code:'WORKER_FAILED',message:'fixture'}}}));},terminate(){if(!closed){closed=true;live--;}}};}});
 await assert.rejects(pool.run({count:3,pixels:128,key:'failure',prepare:async i=>{if(i===1)await new Promise(r=>setTimeout(r,15));return {op:'down'};},consume:()=>assert.fail('No failed output'),local:()=>assert.fail('Expected workers')}),{code:'WORKER_FAILED'});assert.equal(live,0);assert.equal(budget.total(),0);
});
test('abort terminates busy strip workers and releases workspace',async()=>{
 const budget=new Budget(256*1024**2),stop=new AbortController();let live=0;
 const pool=new WaveletStripPool(budget,{maxWorkers:2,workerFactory:()=>{live++;let closed=false;return {postMessage(){queueMicrotask(()=>stop.abort());},terminate(){if(!closed){closed=true;live--;}}};}});
 await assert.rejects(pool.run({count:3,pixels:128,key:'abort',signal:stop.signal,prepare:async()=>({op:'down'}),consume:()=>assert.fail('No aborted output'),local:()=>assert.fail('Expected workers')}),{code:'CANCELLED'});assert.equal(live,0);assert.equal(budget.total(),0);
});

test('a tight-memory local strip gains worker lanes when a peer returns memory mid-stage',async()=>{
 const budget=new Budget(100),owner=budget.reserve(10),peer=budget.reserve(85);let created=0,locals=0;
 const pool=new WaveletStripPool(budget,{maxWorkers:4,workerHeapBytes:10,workerPixelBytes:0,workerFactory:()=>{created++;return {terminate(){},postMessage(job){setImmediate(()=>this.onmessage({data:{result:job}}));}};}});
 const seen=[];
 try{
  await pool.run({count:24,pixels:1,key:'grow',prepare:async i=>({i}),local:async value=>{locals++;await new Promise(resolve=>setImmediate(resolve));return value;},consume:async value=>{seen.push(value.i);if(value.i===2)peer();}});
  assert.equal(pool.metrics().workers,4);assert.equal(created,3);assert.ok(locals>=3);assert.deepEqual(seen.sort((a,b)=>a-b),Array.from({length:24},(_,i)=>i));
 }finally{peer();owner();pool.clear();}
 assert.equal(budget.total(),0);
});

test('a failed worker ceiling reopens at useful strip completions during the next stage',async t=>{
 const budget=new Budget(1000);let fail=true,created=0,clock=0;
 // Fake workers have a fixed cost per completed strip. Host scheduling delays
 // must not masquerade as slower useful work and change the learned ceiling.
 t.mock.method(performance,'now',()=>clock);
 const pool=new WaveletStripPool(budget,{maxWorkers:4,workerHeapBytes:10,workerPixelBytes:0,workerFactory:()=>{created++;let closed=false;return {terminate(){closed=true;},postMessage(job){setImmediate(()=>{if(closed)return;clock++;this.onmessage({data:fail?{error:{code:'WORKER_RESOURCE',message:'resource failure'}}:{result:job}});});}};}});
 const run=async()=>{const seen=[];await pool.run({count:12,pixels:1,key:'shape',prepare:async i=>({i}),consume:async value=>seen.push(value.i),local:async value=>value});assert.deepEqual(seen.sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));};
 await assert.rejects(run(),{code:'WORKER_RESOURCE'});const before=created;fail=false;await run();assert.equal(created-before,4);assert.equal(pool.plans.at(-1).ceiling,2);assert.equal(budget.total(),0);
 // Recovery remains based on completed useful work, with no synthetic probe.
 await run();await run();const recovery=created;await run();assert.equal(created-recovery,4);assert.equal(budget.total(),0);
});


test('unseparated strip wall time cannot establish compute contention',async t=>{
 const budget=new Budget(1000);let clock=0,stripCost=1,created=0;
 t.mock.method(performance,'now',()=>clock);
 const pool=new WaveletStripPool(budget,{maxWorkers:4,workerHeapBytes:10,workerPixelBytes:0,workerFactory:()=>{created++;return {terminate(){},postMessage(job){setImmediate(()=>{clock+=stripCost;this.onmessage({data:{result:job}});});}};}});
 const run=async()=>{const seen=[];await pool.run({count:12,pixels:1,key:'slow',prepare:async i=>({i}),consume:async value=>seen.push(value.i),local:()=>assert.fail('Workers fit')});assert.deepEqual(seen.sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));assert.equal(budget.total(),0);};
 await run();assert.equal(created,4);stripCost=2;await run();assert.equal(created,8);
 const before=created;await run();assert.equal(created-before,4);assert.equal(pool.plans.at(-1).ceiling,4);assert.equal(pool.metrics().completedStripJobs,36);
});
