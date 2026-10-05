import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler} from '../src/execution-scheduler.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const fault=bytes=>Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:bytes}});

test('unrelated commits do not spend another allocation attempt; matching retirement wakes the suspended operation', {timeout:3000},async()=>{
 const budget=new Budget(4096),scheduler=new ExecutionScheduler(budget,{maxWorkers:2});
 const peer=await scheduler.acquire({cpu:1,bytes:512,resourceOwner:'patchmatch'}),phase=budget.beginResourceProducer('patchmatch');
 const entered=deferred(),events=[],transient=budget.reserve(64);let calls=0,available=false;
 const work=runWithResourceRecovery(()=>{calls++;if(!available)throw fault(64);return new Uint8Array(64);},{budget,owner:'d2prl',operation:'readback',onWait:event=>{events.push(structuredClone(event));if(event.stage==='waiting')entered.resolve();}});
 try{
  await entered.promise;assert.equal(calls,1);
  for(let i=0;i<12;i++){phase.commit();await turn();}
  const io=budget.reserve(16);io();budget.notifyBackingRelease('gpu',64);await turn();assert.equal(calls,1);
  transient();available=true;budget.notifyBackingRelease('array-buffer',64);
  assert.equal((await work).byteLength,64);assert.equal(calls,2);assert.equal(budget.recovering,false);
  assert.deepEqual(events.filter(value=>value.stage==='resumed').map(value=>value.reason),['backing-released']);
  assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resourceListeners.size,0);
 }finally{transient();peer.release();phase();scheduler.dispose();}
 assert.equal(budget.total(),0);
});

test('a typed reclaim result and its retirement notification are counted once', {timeout:3000},async()=>{
 const budget=new Budget(4096),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),peer=await scheduler.acquire({resourceOwner:'patchmatch'}),entered=deferred();let first=true,calls=0;
 const unregister=budget.registerAsyncReclaimer(async()=>{if(!first)return 0;first=false;budget.notifyBackingRelease('array-buffer',32);return 32;},{allocationKind:'array-buffer'});
 const work=runWithResourceRecovery(()=>{if(++calls===1)throw fault(64);return 1;},{budget,owner:'d2prl',wait:async()=>{},onWait:event=>{if(event.stage==='waiting')entered.resolve();}});
 try{await entered.promise;assert.equal(calls,1);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').releasedBytes,32);budget.notifyBackingRelease('array-buffer',32);assert.equal(await work,1);assert.equal(calls,2);}
 finally{unregister();peer.release();scheduler.dispose();}assert.equal(budget.total(),0);
});

test('legacy typed owners publish only missing retirement notifications',async()=>{
 const budget=new Budget(100);let calls=0;const unregister=budget.registerAsyncReclaimer(async()=>{calls++;return 25;},{allocationKind:'array-buffer'});
 await budget.reclaimAllocation(20,{kind:'array-buffer'});assert.equal(calls,1);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').releasedBytes,25);unregister();
});

test('waiting cancellation releases pressure and subscriptions without replaying the operation', {timeout:3000},async()=>{
 const budget=new Budget(100),peer=budget.beginResourceProducer('patchmatch',{active:true}),entered=deferred(),stop=new AbortController();let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;throw fault(20);},{budget,owner:'d2prl',signal:stop.signal,onWait:event=>{if(event.stage==='waiting')entered.resolve();}}),rejected=assert.rejects(work,{code:'CANCELLED'});
 await entered.promise;stop.abort();await rejected;assert.equal(calls,1);assert.equal(budget.recovering,false);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resourceListeners.size,0);peer();assert.equal(budget.resourceProducers.size,0);
});

test('blocked, own, and merely queued leases cannot keep recovery waiting', {timeout:3000},async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),own=await scheduler.acquire({cpu:1,bytes:100,resourceOwner:'d2prl'}),stop=new AbortController();
 const queued=scheduler.acquire({cpu:1,bytes:1,resourceOwner:'patchmatch',signal:stop.signal}),cancelled=assert.rejects(queued,{code:'MEMORY_LIMIT'});
 assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);let calls=0,waits=0;
 await assert.rejects(runWithResourceRecovery(()=>{calls++;throw fault(20);},{budget,owner:'d2prl',wait:async()=>{},onWait:()=>waits++}),error=>error.details.recovery.consecutiveFailures===5);
 assert.equal(calls,5);assert.equal(waits,0);stop.abort();await cancelled;own.release();
 const peer=await scheduler.acquire({cpu:1,resourceOwner:'patchmatch'});assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,1);peer.setResourceBlocked(true);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);peer.setResourceBlocked(false);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,1);peer.releaseCpu(1);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);peer.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('peer quiescence resumes the bounded guard and two waiting owners cannot deadlock', {timeout:3000},async()=>{
 const budget=new Budget(100),a=budget.beginResourceProducer('a',{active:true,commitOnRelease:false}),b=budget.beginResourceProducer('b',{active:true,commitOnRelease:false});
 const waitingA=budget.waitForResourceOpportunity({owner:'a',kind:'array-buffer',bytes:20});
 assert.equal((await budget.waitForResourceOpportunity({owner:'b',kind:'array-buffer',bytes:20})).reason,'no-independent-producer');b();assert.equal((await waitingA).reason,'no-independent-producer');a();
 const peer=budget.beginResourceProducer('patchmatch',{active:true,commitOnRelease:false}),entered=deferred();let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;throw fault(20);},{budget,owner:'d2prl',wait:async()=>{},onWait:event=>{if(event.stage==='waiting')entered.resolve();}}),failed=assert.rejects(work,error=>error.details.recovery.consecutiveFailures===5);
 await entered.promise;assert.equal(calls,1);peer();await failed;assert.equal(calls,5);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resourceListeners.size,0);assert.equal(budget.resourceProducers.size,0);assert.equal(budget.recovering,false);
});

test('invalid producer ownership is rejected before execution admission',async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget);
 for(const resourceOwner of ['',42,null])await assert.rejects(scheduler.acquire({bytes:50,resourceOwner}),{code:'INVALID_INPUT'});
 assert.equal(budget.total(),0);assert.equal(scheduler.snapshot().running,0);assert.equal(budget.resourceProducers.size,0);scheduler.dispose();
});

test('only a contiguous range in the failed allocator wakes reuse pressure', {timeout:3000},async()=>{
 const budget=new Budget(100),peer=budget.beginOperation({owner:'sift',id:'publishing-tiles'}),entered=deferred();peer.setState('io');let calls=0,largest=0;
 const allocator=budget.registerReusableBacking('array-buffer',bytes=>largest>=bytes),other=budget.registerReusableBacking('array-buffer',()=>true);
 const work=runWithResourceRecovery(()=>{calls++;if(calls===1){const error=fault(20);error.details={...error.details,reuseScope:allocator.id,reuseBytes:20};throw error;}return 7;},{budget,owner:'d2prl',onWait:event=>{if(event.waitStage==='waiting')entered.resolve();}});
 try{await entered.promise;peer.commit();other.changed();budget.notifyReusableBacking('array-buffer',200);await turn();assert.equal(calls,1,'Another arena and aggregate bytes cannot satisfy this allocation');largest=12;allocator.changed();allocator.changed();await turn();assert.equal(calls,1,'Two 12-byte holes cannot satisfy one 20-byte range');largest=20;allocator.changed();assert.equal(await work,7);assert.equal(calls,2);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').releasedBytes,0);}finally{allocator.release();other.release();peer.release();}
});
