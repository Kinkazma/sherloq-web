import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler,getExecutionScheduler} from '../src/execution-scheduler.js';
import {scheduledWorkerCall} from '../src/scheduled-worker-call.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const fault=bytes=>Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:bytes}});

test('a recovered field releases its domain turn after a child commits, before the field ends', {timeout:3000},async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),parent=budget.beginOperation({owner:'patchmatch',id:'long-field'}),peer=budget.beginOperation({owner:'sift',id:'other-field'}),retry=gate(),finish=gate();let child,attempts=0;
 const run=runWithResourceRecovery(async()=>{if(++attempts===1)throw fault(4);child=budget.beginOperation({owner:'patchmatch',parent,id:'wavefront'});child.setState('compute');retry.resolve();await finish.promise;child.release();return 42;},{budget,owner:'patchmatch',resourceOperation:parent,reclaim:async()=>{budget.notifyBackingRelease('array-buffer',4);return 4;},wait:async()=>{}});
 await retry.promise;let admitted=false;const admission=scheduler.acquire({cpu:1,domains:{'array-buffer':4},operation:peer}).then(lease=>{admitted=true;return lease;});
 await turn();assert.equal(admitted,false);peer.commit();await turn();assert.equal(admitted,false,'Unrelated useful work cannot clear another recovery');
 child.commit();await turn();assert.equal(admitted,true);assert.equal(budget.recovering,false);assert.equal(parent.closed,false);
 (await admission).release();finish.resolve();assert.equal(await run,42);parent.release();peer.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('a later failure rearms domain arbitration after the previous retry made useful progress',async()=>{
 const budget=new Budget(1000),op=budget.beginOperation({owner:'patchmatch',id:'field'});let attempts=0;const pressures=[];
 try{await runWithResourceRecovery(async()=>{attempts++;if(attempts===2){op.commit();await turn();assert.equal(budget.recovering,false);}if(attempts<3)throw fault(4);assert.equal(budget.recovering,true);return 1;},{budget,owner:'patchmatch',resourceOperation:op,wait:async()=>{},onRecovery:()=>pressures.push(budget.recovering)});assert.deepEqual(pressures,[true,true]);assert.equal(budget.recovering,false);}finally{op.release();}
});

test('domain ledger separates logical reservation, materialized backing and aliased pinned ownership',()=>{
 const budget=new Budget(1000),credit=budget.reserve(300),ab=budget.registerBacking('array-buffer',100,{owner:'patchmatch',label:'descriptors',state:'reserved'}),wasm=budget.registerBacking('wasm',200,{owner:'d2prl'});
 ab.materialize(64);ab.setReclaimable(true);const a=ab.pin(),b=ab.pin();let snapshot=budget.resourceSnapshot();assert.equal(budget.total(),300);assert.equal(snapshot.domains['array-buffer'].reservedBytes,100);assert.equal(snapshot.domains['array-buffer'].materializedBytes,64);assert.equal(snapshot.domains['array-buffer'].pinnedBytes,64);assert.equal(snapshot.domains['array-buffer'].reclaimableBytes,0);assert.equal(snapshot.domains.wasm.materializedBytes,200);assert.throws(()=>ab(),{code:'BUSY'});
 a();a();assert.equal(budget.resourceSnapshot().domains['array-buffer'].pinnedBytes,64);b();assert.equal(budget.resourceSnapshot().domains['array-buffer'].reclaimableBytes,64);ab();wasm();credit();assert.equal(budget.total(),0);assert.ok(Object.values(budget.resourceSnapshot().domains).every(domain=>domain.reservedBytes===0));assert.ok(Object.values(budget.snapshot()).every(value=>typeof value==='number'));
});

test('backing pressure is domain-specific, nested and ends after the useful retry',async()=>{
 const budget=new Budget(1000),outer=budget.beginRecovery({kind:'gpu',owner:'other',requestedBytes:10});let attempts=0;
 await runWithResourceRecovery(()=>{if(++attempts===1)throw fault(20);assert.equal(budget.isBackingUnderPressure('array-buffer'),true);assert.equal(budget.isBackingUnderPressure('gpu'),true);return 7;},{budget,owner:'d2prl',wait:async()=>{}});
 assert.equal(budget.isBackingUnderPressure('array-buffer'),false);assert.equal(budget.isBackingUnderPressure('gpu'),true);assert.equal(budget.limit,1000);outer();outer();assert.equal(budget.recovering,false);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.resourceSnapshot().pressures.length,0);
});

test('durable operations bridge CPU lease gaps and real IO until backing retirement', {timeout:3000},async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),peer=budget.beginOperation({owner:'patchmatch',id:'field'}),lease=await scheduler.acquire({cpu:1,operation:peer}),entered=gate();let calls=0;
 const work=runWithResourceRecovery(()=>{if(++calls===1)throw fault(30);return 17;},{budget,owner:'d2prl',wait:async()=>{},onWait:event=>{if(event.waitStage==='waiting')entered.resolve();}});
 await entered.promise;lease.release();await turn();assert.equal(peer.state,'ready');assert.equal(calls,1,'Releasing a wavefront CPU lease does not terminate its useful operation');peer.setState('io');await turn();assert.equal(calls,1);const next=await scheduler.acquire({cpu:1,operation:peer});assert.equal(peer.state,'compute');budget.notifyBackingRelease('array-buffer',30);assert.equal(await work,17);next.release();peer.release();scheduler.dispose();assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.total(),0);
});

test('queued operations have holder dependencies, and blocked cycles are not productive work',async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),a=budget.beginOperation({owner:'a',id:'a'}),b=budget.beginOperation({owner:'b',id:'b'}),lease=await scheduler.acquire({cpu:1,operation:a}),stop=new AbortController();
 const pending=scheduler.acquire({cpu:1,operation:b,signal:stop.signal}),cancelled=assert.rejects(pending,{code:'CANCELLED'});assert.equal(b.state,'queued');assert.equal(budget.resourceProgressSnapshot('reader','array-buffer').independentProducers,2);a.setState('recovery');assert.equal(budget.resourceProgressSnapshot('reader','array-buffer').independentProducers,0);a.setState('waiting-child',{dependencies:[b]});assert.equal(budget.resourceProgressSnapshot('reader','array-buffer').independentProducers,0,'A CPU holder waiting for its queued child cannot finish');stop.abort();await cancelled;lease.release();a.release();b.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('all operation owners waiting in recovery cannot keep each other alive', {timeout:3000},async()=>{
 const budget=new Budget(100),a=budget.beginOperation({owner:'a',id:'a'}),b=budget.beginOperation({owner:'b',id:'b'});a.setState('io');b.setState('io');
 const aw=budget.waitForResourceOpportunity({owner:'a',kind:'array-buffer',bytes:20});assert.equal((await budget.waitForResourceOpportunity({owner:'b',kind:'array-buffer',bytes:20})).reason,'no-independent-producer');b.setState('recovery');assert.equal((await aw).reason,'no-independent-producer');a.release();b.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('reclaim carries owner, bounded target and attributable retirement diagnostics',async()=>{
 const budget=new Budget(1000),calls=[],a=budget.reserve(30),b=budget.reserve(40);
 budget.registerAsyncReclaimer(async request=>{calls.push(request);a();return 30;},{allocationKind:'array-buffer',owner:'patchmatch',label:'descriptors',priority:2});budget.registerAsyncReclaimer(async()=>{assert.fail('Enough backing has retired');b();return 40;},{allocationKind:'array-buffer',owner:'other',priority:1});
 await budget.reclaimAllocation(20,{kind:'array-buffer',owner:'d2prl'});assert.equal(calls.length,1);assert.equal(calls[0].owner,'d2prl');assert.equal(calls[0].shortfallBytes,20);assert.deepEqual(budget.resourceSnapshot().lastAllocationReclaim.owners,[{owner:'patchmatch',label:'descriptors',kind:'array-buffer',retiredBytes:30,accountedBytes:30}]);b();assert.equal(budget.total(),0);
});

test('resource wait diagnostics preserve wait stage and exact baseline across cancellation', {timeout:3000},async()=>{
 const budget=new Budget(100),peer=budget.beginOperation({owner:'patchmatch',id:'io'}),stop=new AbortController(),entered=gate();peer.setState('io');let event;
 const work=runWithResourceRecovery(()=>{throw fault(20);},{budget,owner:'d2prl',signal:stop.signal,onWait:value=>{event=structuredClone(value);entered.resolve();}}),rejected=assert.rejects(work,{code:'CANCELLED'});await entered.promise;assert.equal(event.waitStage,'waiting');assert.equal(event.baseline.releasedBytes,0);assert.equal(event.current.operations[0].state,'io');assert.equal(event.domain.materializedBytes,0);stop.abort();await rejected;peer.release();assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.resourceWaiters.size,0);assert.equal(budget.resourceListeners.size,0);assert.equal(budget.recovering,false);
});

test('one recovering lane does not hide useful compute or IO from the same owner',async()=>{
 const budget=new Budget(100),failed=budget.beginOperation({owner:'patchmatch',id:'failed-tile'}),useful=budget.beginOperation({owner:'patchmatch',id:'useful-tile'}),reader=budget.beginOperation({owner:'d2prl',id:'reader'});
 failed.setState('recovery');useful.setState('io');reader.setState('recovery');const pressure=budget.beginRecovery({kind:'array-buffer',owner:'patchmatch',operation:failed,requestedBytes:20});
 assert.deepEqual(budget.resourceProgressSnapshot('d2prl','array-buffer',reader).operations.map(value=>value.id),['useful-tile']);
 const waiting=budget.waitForResourceOpportunity({owner:'patchmatch',operation:failed,kind:'array-buffer',bytes:20});budget.notifyBackingRelease('array-buffer',20);assert.equal((await waiting).reason,'backing-released');pressure();failed.release();useful.release();reader.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('mixed legacy owner dependencies resolve through an explicit useful operation',()=>{
 const budget=new Budget(100),running=budget.beginOperation({owner:'patchmatch',id:'field'}),queued=budget.beginOperation({owner:'sift',id:'next'});running.setState('io');queued.setState('queued',{resource:'cpu',dependencies:['owner:patchmatch']});assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,2);running.setState('recovery');assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);running.release();queued.release();
});

test('a retired backing from a peer lane with the same owner wakes its suspended sibling',async()=>{
 const budget=new Budget(100),a=budget.beginOperation({owner:'patchmatch',id:'waiting'}),b=budget.beginOperation({owner:'patchmatch',id:'writing'});a.setState('recovery');b.setState('io');const after=budget.resourceProgressSnapshot('patchmatch','array-buffer',a),wait=budget.waitForResourceOpportunity({owner:'patchmatch',operation:a,kind:'array-buffer',bytes:20,after});a.commit();assert.equal(budget.resourceProgressSnapshot('patchmatch','array-buffer',a).commits,after.commits);b.commit();budget.notifyBackingRelease('array-buffer',20);assert.equal((await wait).reason,'backing-released');a.release();b.release();
});

test('memory admission rejects self-held or parent-child cyclic ownership', {timeout:3000},async()=>{
 const budget=new Budget(150),scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),parent=budget.beginOperation({owner:'patchmatch',id:'parent'}),held=await scheduler.acquire({cpu:0,bytes:100,operation:parent});
 await assert.rejects(scheduler.acquire({cpu:0,bytes:100,operation:parent}),{code:'MEMORY_LIMIT'});
 const child=budget.beginOperation({owner:'patchmatch',id:'child',parent});await assert.rejects(scheduler.acquire({cpu:0,bytes:100,operation:child}),{code:'MEMORY_LIMIT'});child.release();held.release();parent.release();scheduler.dispose();assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('explicit parent operations survive child RPC handoffs and restore their IO state',async()=>{
 const budget=new Budget(100),parent=budget.beginOperation({owner:'ela',id:'quality'});parent.setState('io');const child=budget.beginOperation({owner:'ela',id:'encode',parent});assert.equal(parent.state,'waiting-child');child.setState('compute');assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,2);child.release();assert.equal(parent.state,'io');parent.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('a parent awaiting two queued RPCs is not productive behind a blocked holder', {timeout:3000},async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),holder=budget.beginOperation({owner:'patchmatch',id:'blocked-field'}),held=await scheduler.acquire({cpu:1,operation:holder}),parent=budget.beginOperation({owner:'ela',id:'qualities'}),owner={budget,maximum:1,resourceOwner:'ela',resourceOperation:parent},a=gate(),b=gate();held.setResourceBlocked(true);parent.setState('io');
 const first=scheduledWorkerCall(owner,()=>a.promise),second=scheduledWorkerCall(owner,()=>b.promise);assert.equal(parent.state,'waiting-child');assert.equal(budget.resourceSnapshot().operations.find(value=>value.key===parent.key).dependencies.length,2);assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);
 held.release();holder.release();await turn();assert.ok(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers>0);a.resolve();await first;assert.equal(parent.state,'waiting-child');assert.equal(budget.resourceSnapshot().operations.find(value=>value.key===parent.key).dependencies.length,1);b.resolve();await second;assert.equal(parent.state,'io');parent.release();scheduler.dispose();assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.total(),0);
});

test('backing aliases are counted once and a resized worker heap advances its generation',()=>{
 const budget=new Budget(1000),identity={},a=budget.registerBacking('wasm',100,{owner:'sift',identity}),b=budget.registerBacking('wasm',100,{owner:'sift',identity});
 assert.equal(a.id,b.id);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,100);
 const borrowed=a.pin();assert.throws(()=>a.resize(200),{code:'BUSY'});b();assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,100);borrowed();a.resize(200);
 assert.equal(a.generation,1);assert.equal(budget.resourceSnapshot({allocations:true}).allocations[0].bytes,200);a();assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);
});
