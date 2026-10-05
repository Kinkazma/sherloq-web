import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler} from '../src/execution-scheduler.js';
import {SiftPool} from '../src/sift-paged.js';
import {EngineError} from '../src/errors.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const fault=bytes=>new EngineError('MEMORY_ALLOCATION','Injected backing refusal',{details:{allocationKind:'array-buffer',requestedBytes:bytes}});
const clean=budget=>{assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resourceListeners.size,0);};

// The integration.27 failure used these exact pool, admission and recovery
// paths. Only native computation and the initial allocator refusal are doubles.
test('simultaneous real SiftPool preparation refusals retry one continuation and preserve both useful results',{timeout:3000},async()=>{
 const budget=new Budget(4096),owner={profile:{maxWorkers:2},workers:new Set()},stop=new AbortController(),events=[],pool=new SiftPool(owner,{budget,heap:64,cost:()=>256,inputBytes:64,provider:'cpu',backend:'cpu',signal:stop.signal,onProgress:e=>events.push(e)}),savedWorker=globalThis.Worker;
 globalThis.Worker=class {postMessage(message){queueMicrotask(()=>this.onmessage?.({data:message.kind==='init'?{ready:true}:{points:new Float32Array([message.value]),heapBytes:64}}));}terminate(){}};
 await pool.open(2);const scheduler=pool.scheduler,peer=budget.beginOperation({owner:'peer',id:'useful-peer'}),lease=await scheduler.acquire({cpu:1,operation:peer}),banks=Array.from({length:2},()=>({data:new Uint8Array(64),credit:budget.reserve(64),backing:budget.registerBacking('array-buffer',64,{owner:'fixture-cache',reclaimable:true})}));
 const unregister=budget.registerAsyncReclaimer(async()=>{const bank=banks.pop();if(!bank)return 0;bank.data=null;bank.backing();bank.credit();budget.notifyBackingRelease('array-buffer',64);return 64;},{allocationKind:'array-buffer',priority:100});
 const together=gate(),retry=gate(),finish=gate(),calls=[0,0];let winner;
 const work=pool.records.map((rec,index)=>pool.execute(rec,async()=>{if(++calls[index]===1){if(calls[0]+calls[1]===2)together.resolve();await together.promise;throw fault(32);}if(winner===undefined){winner=index;retry.resolve();await finish.promise;}return {kind:'detect',value:index+11};}));
 try{
  await retry.promise;assert.equal(calls[winner],2);assert.equal(calls[1-winner],1);assert.equal(budget.resourceSnapshot().pressures.length,2);
  lease.release();peer.release();await turn();assert.equal(calls[1-winner],1,'A memory notification does not wake every failed lane');
  finish.resolve();const results=await Promise.all(work);assert.deepEqual(results.map(r=>r.points[0]),[11,12]);assert.deepEqual(calls,[2,2]);assert.deepEqual(events.filter(e=>e.phase==='resource-recovery').map(e=>e.decision.totalFailures),[1,1]);
 }finally{stop.abort();finish.resolve();await Promise.allSettled(work);pool.close();unregister();lease.release();peer.release();scheduler.dispose();globalThis.Worker=savedWorker;for(const bank of banks){bank.data=null;bank.backing();bank.credit();}}
 clean(budget);
});

test('same-domain retries serialize while distinct domains keep independent continuation width',{timeout:3000},async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:10}),a=budget.beginOperation({owner:'a'}),b=budget.beginOperation({owner:'b'}),c=budget.beginOperation({owner:'c'}),pa=budget.beginRecovery({kind:'array-buffer',operation:a}),pb=budget.beginRecovery({kind:'array-buffer',operation:b}),pc=budget.beginRecovery({kind:'gpu',operation:c});
 a.setState('recovery');b.setState('recovery');c.setState('recovery');let bReady=false;
 await budget.waitForRecoveryTurn({kind:'array-buffer',operation:a});const waiting=budget.waitForRecoveryTurn({kind:'array-buffer',operation:b}).then(()=>bReady=true);
 await budget.waitForRecoveryTurn({kind:'gpu',operation:c});const gpu=await scheduler.acquire({cpu:0,gpu:1,operation:c,domains:{gpu:20}}),cpu=await scheduler.acquire({cpu:10,operation:a,domains:{'array-buffer':20}});
 assert.equal(bReady,false);assert.deepEqual(scheduler.snapshot().active,{cpu:10,gpu:1});budget.notifyBackingRelease('array-buffer',100);budget.notifyReusableBacking('array-buffer',100);await turn();assert.equal(bReady,false);
 cpu.release();pa();a.release();await waiting;assert.equal(bReady,true);gpu.release();pb();pc();b.release();c.release();scheduler.dispose();clean(budget);
});

test('cross-domain pressures follow one age order and descendants inherit the winning continuation',{timeout:3000},async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),a=budget.beginOperation({owner:'a'}),b=budget.beginOperation({owner:'b'}),pa=budget.beginRecovery({kind:'array-buffer',operation:a}),pb=budget.beginRecovery({kind:'gpu',operation:b});a.setState('recovery');b.setState('recovery');
 const child=budget.beginOperation({owner:'a',parent:a});let bReady=false;const waiting=scheduler.acquire({cpu:1,operation:b,domains:{'array-buffer':10}}).then(lease=>{bReady=true;return lease;});
 const winner=await scheduler.acquire({cpu:1,operation:child,domains:{gpu:10}});assert.equal(bReady,false);assert.equal(winner.cpu,1);winner.release();child.release();pa();a.release();const next=await waiting;next.release();pb();b.release();scheduler.dispose();clean(budget);
});

test('queued recovery cancellation removes its turn and cannot retain a pressure or listener',{timeout:3000},async()=>{
 const budget=new Budget(1000),a=budget.beginOperation({owner:'a'}),b=budget.beginOperation({owner:'b'}),pa=budget.beginRecovery({kind:'array-buffer',operation:a}),pb=budget.beginRecovery({kind:'array-buffer',operation:b}),stop=new AbortController();
 const pending=budget.waitForRecoveryTurn({kind:'array-buffer',operation:b,signal:stop.signal}),rejected=assert.rejects(pending,{code:'CANCELLED'});stop.abort();await rejected;pb();b.release();pa();a.release();clean(budget);
});

test('guard still counts exactly five real failures per lane, never turn waits',{timeout:3000},async()=>{
 const budget=new Budget(1000),together=gate(),calls=[0,0],events=[];const tasks=calls.map((_,index)=>runWithResourceRecovery(async()=>{if(++calls[index]===1){if(calls[0]+calls[1]===2)together.resolve();await together.promise;}throw fault(32);},{budget,owner:'worker-'+index,wait:async()=>{},onRecovery:event=>events.push(event)}));
 const results=await Promise.allSettled(tasks);assert.deepEqual(calls,[5,5]);for(const result of results){assert.equal(result.status,'rejected');assert.equal(result.reason.code,'MEMORY_ALLOCATION');assert.equal(result.reason.details.recovery.consecutiveFailures,5);}assert.equal(events.filter(event=>event.phase==='resource-recovery').length,8);assert.equal(events.filter(event=>event.phase==='resource-terminal').length,2);clean(budget);
});

test('closed CPU parent-child cycle settles explicitly without fabricating an allocation error',{timeout:3000},async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),parent=budget.beginOperation({owner:'p'}),held=await scheduler.acquire({cpu:1,operation:parent}),child=budget.beginOperation({owner:'p',parent});
 await assert.rejects(scheduler.acquire({cpu:1,operation:child}),error=>{assert.equal(error.code,'RESOURCE_DEPENDENCY_CYCLE');assert.equal(error.details.resumable,true);assert.deepEqual(new Set(error.details.dependencyCycle.operations.map(o=>o.key)),new Set([parent.key,child.key]));assert.equal(error.details.allocationKind,undefined);return true;});
 child.release();held.release();parent.release();scheduler.dispose();clean(budget);
});

test('real retirement wakes the winning continuation only, then publication passes its turn',{timeout:3000},async()=>{
 const budget=new Budget(1000),peer=budget.beginOperation({owner:'peer'}),waiting=gate(),retry=gate(),publish=gate(),events=[],calls=[0,0];peer.setState('io');let waitingCount=0,winner;
 const work=calls.map((_,index)=>runWithResourceRecovery(async()=>{if(++calls[index]===1)throw fault(32);if(winner===undefined){winner=index;retry.resolve();await publish.promise;}return index;},{budget,owner:'lane-'+index,onWait:event=>{events.push(event);if(event.stage==='waiting'&&++waitingCount===2)waiting.resolve();}}));
 await waiting.promise;budget.notifyBackingRelease('gpu',64);await turn();assert.deepEqual(calls,[1,1]);budget.notifyBackingRelease('array-buffer',32);await retry.promise;assert.equal(calls[winner],2);assert.equal(calls[1-winner],1);
 for(let i=0;i<5;i++){peer.commit();budget.notifyBackingRelease('array-buffer',32);await turn();}assert.equal(calls[1-winner],1,'Repeated retirement does not bypass the chosen useful retry');publish.resolve();assert.deepEqual(await Promise.all(work),[0,1]);peer.release();assert.equal(events.filter(e=>e.reason==='backing-released').length,2);clean(budget);
});

test('a recoverable allocator range becomes reusable without releasing physical backing',{timeout:3000},async()=>{
 const budget=new Budget(1000),peer=budget.beginOperation({owner:'peer'}),waiting=gate(),allocatorState={bytes:0};peer.setState('io');const allocator=budget.registerReusableBacking('array-buffer',bytes=>allocatorState.bytes>=bytes),other=budget.registerReusableBacking('array-buffer',()=>true);let calls=0;
 const work=runWithResourceRecovery(()=>{if(++calls===1){const error=fault(32);error.details.reuseScope=allocator.id;throw error;}return 3;},{budget,owner:'lane',onWait:e=>{if(e.stage==='waiting')waiting.resolve();}});
 await waiting.promise;other.changed();await turn();assert.equal(calls,1);allocatorState.bytes=32;allocator.changed();assert.equal(await work,3);assert.equal(budget.resourceSnapshot().backingReleased['array-buffer']??0,0);allocator.release();other.release();peer.release();clean(budget);
});

test('a declared CPU/GPU/IO producer keeps a dependency component open until useful completion',async()=>{
 for(const state of ['compute','io']){
  const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),a=budget.beginOperation({owner:'a'}),b=budget.beginOperation({owner:'b'}),producer=budget.beginOperation({owner:'producer'}),held=await scheduler.acquire({cpu:1,gpu:1,operation:producer});producer.setState(state);
  a.setState('queued',{resource:'array-buffer',dependencies:[b,producer]});b.setState('queued',{resource:'array-buffer',dependencies:[a]});assert.equal(budget.resources.closedWaitCycle(a),null);assert.equal(budget.resources.closedWaitCycle(b),null);
  producer.setState('recovery');assert.equal(budget.resources.closedWaitCycle(a),null,'A declared external recovery is not an internal admission cycle');held.release();producer.release();assert.deepEqual(new Set(budget.resources.closedWaitCycle(a).map(o=>o.key)),new Set([a.key,b.key]));a.release();b.release();scheduler.dispose();clean(budget);
 }
});

test('recovery-turn cycles settle even without a scheduler admission promise',{timeout:3000},async()=>{
 const budget=new Budget(1000),childParent=budget.beginOperation({owner:'parent'}),child=budget.beginOperation({owner:'child',parent:childParent}),pressure=budget.beginRecovery({kind:'array-buffer',operation:child});
 child.setState('queued',{resource:'cpu',dependencies:[childParent]});
 await assert.rejects(budget.waitForRecoveryTurn({kind:'array-buffer',operation:childParent}),{code:'RESOURCE_DEPENDENCY_CYCLE'});pressure();child.release();childParent.release();clean(budget);
});


test('a downstream closed cycle settles its caller too without classifying an external IO as a deadlock',()=>{
 const budget=new Budget(1000),a=budget.beginOperation({owner:'a'}),b=budget.beginOperation({owner:'b'}),outer=budget.beginOperation({owner:'outer'});
 a.setState('queued',{resource:'gpu',dependencies:[b]});b.setState('queued',{resource:'array-buffer',dependencies:[a]});outer.setState('queued',{resource:'memory',dependencies:[a]});
 assert.deepEqual(new Set(budget.resources.closedWaitCycle(outer).map(o=>o.key)),new Set([a.key,b.key]));a.release();b.release();outer.release();clean(budget);
});
