import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {SiftPagedResources} from '../src/sift-paged-resources.js';

test('SIFT phase handoff keeps a memory waiter pending until admitted work releases its backing',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:10});
 const first=budget.beginOperation({owner:'sift',id:'first'}),next=budget.beginOperation({owner:'sift',id:'next'});
 const lease=await scheduler.acquire({cpu:0,gpu:1,bytes:950,operation:first,resourceOwner:'sift'}),memory=lease.retainMemory(950);
 const resources=new SiftPagedResources({budget,scheduler,operation:first,owner:'sift',workspaceBytes:950,lease});
 let settled=false;
 const waiting=scheduler.acquire({cpu:1,bytes:100,operation:next,resourceOwner:'sift'}).then(value=>{settled=true;return value;},error=>{settled=true;throw error;});
 waiting.catch(()=>{});
 try{
  assert.equal(settled,false);await resources.phase('cpu');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,false,'A phase boundary is not the absence of a useful producer');
  assert.equal(scheduler.snapshot().active.cpu,1);assert.equal(scheduler.snapshot().capacity.cpu,10);
  memory();resources.close();const admitted=await waiting;assert.equal(admitted.cpu,1);admitted.release();
 }finally{resources.close();memory();first.release();next.release();scheduler.dispose();}
 assert.equal(budget.total(),0);
});

test('Phase handoff keeps all ten CPU slots available and lets independent work overlap',async()=>{
 const budget=new Budget(10000),scheduler=getExecutionScheduler(budget,{maxWorkers:10}),operation=budget.beginOperation({owner:'sift'});
 const gpu=await scheduler.acquire({cpu:0,gpu:1,operation}),resources=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:0,lease:gpu});
 const peers=await scheduler.acquire({cpu:10});const moving=resources.phase('cpu');
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(scheduler.snapshot().active,{cpu:10,gpu:0});
 peers.release();await moving;
 const overlap=await scheduler.acquire({cpu:9});assert.deepEqual(scheduler.snapshot().active,{cpu:10,gpu:0});
 assert.equal(scheduler.snapshot().peakCpu,10);overlap.release();resources.close();operation.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('Cancellation of a queued handoff returns its old GPU lease and all CPU capacity',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),abort=new AbortController(),operation=budget.beginOperation({owner:'sift'});
 const gpu=await scheduler.acquire({cpu:0,gpu:1,operation}),peer=await scheduler.acquire({cpu:1});
 const resource=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:0,lease:gpu,signal:abort.signal});
 const moving=resource.phase('cpu');moving.catch(()=>{});abort.abort();await assert.rejects(moving,{code:'CANCELLED'});
 peer.release();resource.close();operation.release();assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:0});assert.equal(scheduler.snapshot().queued,0);scheduler.dispose();
});
