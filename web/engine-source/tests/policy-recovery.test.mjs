import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler} from '../src/execution-scheduler.js';
import {EngineError,resourceAllocationKind,resourceRecoveryKind} from '../src/errors.js';
import {ResourceRecoveryController,reclaimForResourceRecovery,runWithResourceRecovery} from '../src/resource-recovery.js';
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const fault=(kind,bytes)=>new EngineError('MEMORY_ALLOCATION','Useful allocation refused',{details:{allocationKind:kind,requestedBytes:bytes}});

test('admission refusal reports exact credit and reclaims only its shortfall',async()=>{
 const budget=new Budget(100),held=budget.reserve(80),part=held.split(20),requests=[];let error;
 try{budget.reserve(40);}catch(value){error=value;}
 assert.equal(error.code,'MEMORY_LIMIT');assert.deepEqual(error.details,{requestedBytes:40,availableBytes:20,shortfallBytes:20,budgetBytes:100});
 assert.equal(resourceAllocationKind(error),null);assert.equal(resourceRecoveryKind(error),'policy');
 const first=budget.registerAsyncReclaimer(request=>{requests.push(request);part();return 20;}),second=budget.registerAsyncReclaimer(()=>assert.fail('The first retirement provides enough admission credit'));
 assert.equal(await reclaimForResourceRecovery(budget,error),20);assert.equal(requests.length,1);assert.equal(requests[0].bytes,40);assert.equal(requests[0].shortfallBytes,20);
 first();second();part();held();assert.equal(budget.total(),0);assert.deepEqual(budget.resourceSnapshot().backingReleased,{});
});

test('policy wait ignores commits and physical retirements until enough credit is available',{timeout:3000},async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),peer=budget.beginOperation({owner:'patchmatch',id:'peer'}),requester=budget.beginOperation({owner:'patchmatch',id:'requester'});
 const peerLease=await scheduler.acquire({cpu:1,operation:peer}),lease=await scheduler.acquire({cpu:1,operation:requester}),held=budget.reserve(80),first=held.split(10),rest=held.split(30),entered=gate(),events=[],controller=new ResourceRecoveryController();let calls=0;
 const listeners=budget.listeners.size,work=runWithResourceRecovery(()=>{calls++;const release=budget.reserve(40);release();return 7;},{controller,budget,resourceOperation:requester,onWait:event=>{events.push(structuredClone(event));if(event.stage==='waiting')entered.resolve();}});
 try{
  await entered.promise;for(let i=0;i<9;i++){peer.commit();await turn();}budget.notifyBackingRelease('array-buffer',100);budget.notifyBackingRelease('wasm',100);await turn();assert.equal(calls,1);
  first();await turn();assert.equal(calls,1,'Thirty available bytes cannot admit forty');rest();assert.equal(await work,7);assert.equal(calls,2);assert.equal(controller.snapshot().totalFailures,1);assert.equal(peer.state,'compute');
  assert.deepEqual(events.map(event=>[event.kind,event.stage,event.reason]),[['policy','waiting',undefined],['policy','resumed','admission-credit']]);assert.equal(events[1].current.availableBytes,60);
  assert.equal(budget.listeners.size,listeners);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resources.waitingOperations.size,0);assert.equal(budget.recovering,false);
 }finally{first();rest();held();lease.release();peerLease.release();requester.release();peer.release();scheduler.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('policy wait cancellation retires its budget and graph subscriptions without replay',{timeout:3000},async()=>{
 const budget=new Budget(100),held=budget.reserve(80),peer=budget.beginOperation({owner:'peer'}),entered=gate(),stop=new AbortController();peer.setState('io');let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;budget.reserve(40);},{budget,owner:'reader',signal:stop.signal,onWait:event=>{if(event.stage==='waiting')entered.resolve();}}),cancelled=assert.rejects(work,{code:'CANCELLED'});
 await entered.promise;assert.equal(budget.listeners.size,1);stop.abort();await cancelled;assert.equal(calls,1);assert.equal(budget.listeners.size,0);assert.equal(budget.resourceListeners.size,0);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.recovering,false);peer.release();held();assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.total(),0);
});

test('policy recovery does not treat a dependency cycle as an independent producer',{timeout:3000},async()=>{
 const budget=new Budget(100),held=budget.reserve(80),parent=budget.beginOperation({owner:'same',id:'parent'}),child=budget.beginOperation({owner:'same',id:'child',parent});child.setState('queued',{dependencies:[parent],resource:'memory'});let calls=0,waits=0;
 try{await assert.rejects(runWithResourceRecovery(()=>{calls++;budget.reserve(40);},{budget,resourceOperation:parent,wait:async()=>{},onWait:()=>waits++}),error=>error.code==='MEMORY_LIMIT'&&error.details.recovery.consecutiveFailures===5);assert.equal(calls,5);assert.equal(waits,0);}
 finally{child.release();parent.release();held();}assert.equal(budget.recovering,false);assert.equal(budget.total(),0);
});

test('a peer that cannot free enough credit resumes the five-failure guard when it stops',{timeout:3000},async()=>{
 const budget=new Budget(100),held=budget.reserve(80),peer=budget.beginOperation({owner:'peer'}),entered=gate();peer.setState('io');let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;budget.reserve(40);},{budget,owner:'requester',wait:async()=>{},onWait:event=>{if(event.stage==='waiting')entered.resolve();}}),failed=assert.rejects(work,error=>error.details.recovery.consecutiveFailures===5);
 await entered.promise;assert.equal(calls,1);peer.release();await failed;assert.equal(calls,5);held();assert.equal(budget.listeners.size,0);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.recovering,false);assert.equal(budget.total(),0);
});

test('a failed reclaim retargets its domain and then completes the original reclaim before useful retry',{timeout:3000},async()=>{
 const budget=new Budget(1000),peer=budget.beginOperation({owner:'peer'}),entered=gate(),order=[],events=[],controller=new ResourceRecoveryController();peer.setState('io');let calls=0,first=true;
 const work=runWithResourceRecovery(()=>{if(++calls===1)throw fault('array-buffer',64);assert.deepEqual(order,['array-buffer','wasm','array-buffer']);return 9;},{budget,owner:'reader',controller,reclaim:async event=>{const kind=resourceRecoveryKind(event.error);order.push(kind);if(kind==='array-buffer'&&first){first=false;throw fault('wasm',32);}return 0;},onWait:event=>{events.push(structuredClone(event));if(event.stage==='waiting')entered.resolve();}});
 try{
  await entered.promise;assert.deepEqual(order,['array-buffer','wasm']);assert.equal(budget.isBackingUnderPressure('array-buffer'),true);assert.equal(budget.isBackingUnderPressure('wasm'),true);
  budget.notifyBackingRelease('array-buffer',64);await turn();assert.equal(calls,1);assert.equal(order.length,2,'The outer retirement cannot satisfy the inner Wasm refusal');budget.notifyBackingRelease('wasm',31);await turn();assert.equal(order.length,2);budget.notifyBackingRelease('wasm',1);
  assert.equal(await work,9);assert.equal(calls,2);assert.equal(controller.snapshot().totalFailures,2);assert.equal(events[0].kind,'wasm');assert.equal(events[0].requestedBytes,32);assert.equal(events[0].baseline.releasedBytes,0);
 }finally{peer.release();}assert.equal(budget.recovering,false);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('cancellation of an inner policy recovery releases all nested pressures',{timeout:3000},async()=>{
 const budget=new Budget(100),held=budget.reserve(80),peer=budget.beginOperation({owner:'peer'}),entered=gate(),stop=new AbortController();peer.setState('io');let calls=0;const order=[];
 const work=runWithResourceRecovery(()=>{calls++;throw fault('wasm',20);},{budget,owner:'reader',signal:stop.signal,reclaim:async event=>{order.push(resourceRecoveryKind(event.error));if(event.error.code!=='MEMORY_LIMIT')budget.reserve(40);return 0;},onWait:event=>{assert.equal(event.kind,'policy');entered.resolve();}}),cancelled=assert.rejects(work,{code:'CANCELLED'});
 await entered.promise;assert.deepEqual(order,['wasm','policy']);assert.equal(budget.resourceSnapshot().pressures.length,2);stop.abort();await cancelled;assert.equal(calls,1);assert.equal(budget.recovering,false);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.listeners.size,0);assert.equal(budget.resourceListeners.size,0);peer.release();held();assert.equal(budget.total(),0);
});

test('alternating domains in reclaim share one guard and never replay the useful allocation',async()=>{
 const budget=new Budget(1000);let calls=0,reclaims=0;
 await assert.rejects(runWithResourceRecovery(()=>{calls++;throw fault('array-buffer',64);},{budget,owner:'reader',reclaim:async event=>{reclaims++;throw fault(resourceRecoveryKind(event.error)==='wasm'?'array-buffer':'wasm',64);},wait:async()=>{}}),error=>error.details.recovery.totalFailures===5&&error.details.recovery.consecutiveFailures===5);
 assert.equal(calls,1);assert.equal(reclaims,4);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('same-domain nested failures still resume the original reclaim with its own error context',async()=>{
 const budget=new Budget(100),original=fault('array-buffer',40),inner=fault('array-buffer',40),order=[];original.details.allocation='output';inner.details.allocation='migration';let first=true,calls=0;
 assert.equal(await runWithResourceRecovery(()=>{if(++calls===1)throw original;assert.deepEqual(order,['output','migration','output']);return 3;},{budget,reclaim:async({error})=>{order.push(error.details.allocation);if(first){first=false;throw inner;}return 0;},wait:async()=>{}}),3);
 assert.equal(calls,2);assert.equal(budget.recovering,false);
});
