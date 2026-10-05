import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ElasticQualityWorkers} from '../src/elastic-quality-workers.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
function fixture(budget,{maxWorkers=4,workerBytes=20,windowBytes=5,initialize=async()=>{},signal}={}){const states=[],events=[];let created=0;const pool=new ElasticQualityWorkers({budget,maxWorkers,workerBytes,windowBytes,states,create(){const id=++created;return {id,worker:{terminate(){events.push({id,bytes:budget.total()});}}};},initialize,signal});return {pool,states,events};}
test('qualities grow from one to four workers after real competing CPU and RAM are returned',async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),other=await scheduler.acquire({cpu:3,bytes:70}),{pool,states,events}=fixture(budget);try{
  const first=await pool.take(5);assert.equal(first.length,1);assert.equal(budget.total(),90);pool.finish(first);other.release();
  const second=await pool.take(4);assert.equal(second.length,4);assert.equal(second[0],first[0]);assert.equal(budget.total(),80);pool.finish(second);
  assert.deepEqual(pool.snapshot().batchWorkers,[1,4]);assert.equal(states.length,4);assert.equal(events.length,0);
 }finally{other.release();pool.dispose();}assert.equal(budget.total(),0);assert.equal(events.length,4);assert.equal(events[0].bytes,80);
});
test('bounded heaps persist between low-memory batches and are released only after termination',async()=>{
 const budget=new Budget(30),{pool,events}=fixture(budget);try{for(let i=0;i<8;i++){const active=await pool.take(4);assert.equal(active.length,1);pool.finish(active);}assert.equal(pool.snapshot().created,1);const competing=budget.reserve(25);assert.equal(events.length,1);assert.equal(events[0].bytes,20);assert.equal(budget.total(),25);competing();const resumed=await pool.take(4);assert.equal(resumed.length,1);pool.finish(resumed);assert.equal(pool.snapshot().created,2);}finally{pool.dispose();}assert.equal(budget.total(),0);
});
test('running useful streams are not retired to satisfy memory pressure',async()=>{
 const budget=new Budget(60),{pool,events}=fixture(budget);try{const active=await pool.take(2);assert.equal(active.length,2);assert.throws(()=>budget.reserve(30),{code:'MEMORY_LIMIT'});assert.equal(events.length,0);pool.finish(active);const reserve=budget.reserve(30);assert.equal(events.length,1);reserve();}finally{pool.dispose();}assert.equal(budget.total(),0);
});
test('more workers can be admitted by spilling cold data without re-running any stream',async()=>{
 const budget=new Budget(100),cold=budget.reserve(65),{pool}=fixture(budget);let spills=0;budget.registerAsyncReclaimer(()=>{spills++;cold();});try{const active=await pool.take(4);assert.equal(active.length,4);assert.equal(spills,1);pool.finish(active);assert.equal(pool.snapshot().created,4);}finally{cold();pool.dispose();}assert.equal(budget.total(),0);
});

test('a first quality waits for admitted competing memory without occupying a CPU',async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),other=await scheduler.acquire({cpu:3,bytes:90}),{pool}=fixture(budget);try{const waiting=pool.take(4);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pool.snapshot().created,0);assert.equal(scheduler.snapshot().waiting.memory,1);assert.equal(scheduler.used.cpu,3);other.release();const active=await waiting;assert.equal(active.length,4);assert.equal(pool.snapshot().created,4);assert.equal(budget.total(),80);pool.finish(active);}finally{other.release();pool.dispose();}assert.equal(budget.total(),0);
});
test('cancelled memory admission never constructs a late quality worker',async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),other=await scheduler.acquire({cpu:3,bytes:90}),controller=new AbortController(),{pool}=fixture(budget,{signal:controller.signal});try{const waiting=pool.take(4);await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await assert.rejects(waiting,{code:'CANCELLED'});other.release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pool.snapshot().created,0);assert.equal(scheduler.snapshot().queued,0);}finally{other.release();pool.dispose();}assert.equal(budget.total(),0);
});
