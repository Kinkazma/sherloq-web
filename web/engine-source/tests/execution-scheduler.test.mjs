import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler, ExecutionScheduler} from '../src/execution-scheduler.js';
import {ForgeryscopePreparation} from '../src/forgeryscope-preparation.js';

test('an empty real reclaimer cannot wake admission forever; a real release resumes queued work',async()=>{
 const budget=new Budget(100),notifications=[];let pending=false;
 budget.changed=()=>{if(pending||!budget.listeners.size)return;pending=true;notifications.push(()=>{pending=false;for(const listener of budget.listeners)listener();});};
 const scheduler=getExecutionScheduler(budget,{maxWorkers:2}),preparation=new ForgeryscopePreparation(budget,()=>assert.fail('No preparation work requested'));
 const holder=budget.beginOperation({owner:'d2prl'}),waiter=budget.beginOperation({owner:'sift'}),active=await scheduler.acquire({cpu:1,bytes:80,operation:holder});
 const next=scheduler.acquire({cpu:1,bytes:30,operation:waiter});let steps=0;
 while(notifications.length&&steps++<20)notifications.shift()();
 const remaining=notifications.length;active.release();const admitted=await next;
 assert.equal(remaining,0,'Empty Forgeryscope preparation retirement creates false memory progress');assert.ok(steps<5);assert.equal(admitted.bytes,30);assert.equal(budget.active,30);
 admitted.release();preparation.dispose();holder.release();waiter.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('zero-byte ownership transfers do not send admission notifications',async()=>{
 const budget=new Budget(100);let calls=0;const unsubscribe=budget.subscribe(()=>calls++);
 budget.retained=0;budget.active=0;const empty=budget.reserve(0);empty.split(0)();empty();await Promise.resolve();assert.equal(calls,0);
 const release=budget.reserve(10);await Promise.resolve();assert.equal(calls,1);release();await Promise.resolve();assert.equal(calls,2);unsubscribe();
});

test('concurrent CPU and GPU waits of one operation converge without starving worker messages',async()=>{
 const budget=new Budget(100),notifications=[];let pending=false;
 // Drain notifications explicitly: an old infinite microtask loop must fail
 // this test deterministically instead of starving the test timeout itself.
 budget.resourceChanged=()=>{if(pending)return;pending=true;notifications.push(()=>{pending=false;for(const listener of [...budget.resourceListeners,...budget.resourceAdmissionListeners])listener();});};
 const scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),cpuOwner=budget.beginOperation({owner:'other',id:'cpu'}),gpuOwner=budget.beginOperation({owner:'other',id:'gpu'}),operation=budget.beginOperation({owner:'sift',id:'concurrent-phases'});
 const cpu=await scheduler.acquire({cpu:1,operation:cpuOwner}),gpu=await scheduler.acquire({cpu:0,gpu:1,operation:gpuOwner}),waitingCpu=scheduler.acquire({cpu:1,operation}),waitingGpu=scheduler.acquire({cpu:0,gpu:1,operation});
 let steps=0;while(notifications.length&&steps++<20)notifications.shift()();
 assert.equal(notifications.length,0,'queued state changes form a self-waking loop');assert.ok(steps<5);
 const state=budget.resourceSnapshot().operations.find(record=>record.key===operation.key);assert.equal(state.resource,'cpu+gpu');assert.deepEqual(new Set(state.dependencies),new Set([cpuOwner.key,gpuOwner.key]));
 cpu.release();const first=await waitingCpu;gpu.release();const second=await waitingGpu;assert.deepEqual(scheduler.snapshot().active,{cpu:1,gpu:1});first.release();second.release();operation.release();cpuOwner.release();gpuOwner.release();scheduler.dispose();
});

test('independent pools share CPU capacity and one GPU queue without preflight work', async () => {
  const budget = new Budget(1000), scheduler = getExecutionScheduler(budget, {maxWorkers: 3});
  assert.equal(getExecutionScheduler(budget, {maxWorkers: 12}), scheduler);
  const first = await scheduler.acquire({cpu: 2, bytes: 200});
  let secondStarted = false;
  const second = scheduler.acquire({cpu: 2, bytes: 300}).then(lease => {secondStarted = true; return lease;});
  const gpu = await scheduler.acquire({cpu: 0, gpu: 1, bytes: 100});
  assert.equal(secondStarted, false);
  assert.equal(budget.active, 300);
  assert.deepEqual(scheduler.snapshot().active, {cpu: 2, gpu: 1});
  first.release(); first.release();
  const next = await second;
  assert.equal(budget.active, 400);
  gpu.release(); next.release();
  assert.equal(budget.total(), 0);
  assert.equal(scheduler.snapshot().preflightExecutions, 0);
  assert.equal(scheduler.snapshot().peakCpu, 2);
});

test('memory and CPU are admitted together, then queued work resumes without retrying computation', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 2});
  const first = await scheduler.acquire({bytes: 70});
  let calls = 0;
  const next = scheduler.run({bytes: 60}, () => {calls++; assert.equal(budget.active, 60); return 'done';});
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(scheduler.snapshot().active.cpu, 1);
  const waiting=scheduler.snapshot().queuedRequests[0];assert.equal(waiting.waitingFor,'memory');assert.equal(waiting.evaluatedBytes,60);assert.deepEqual(waiting.memoryRefusal,{requestedBytes:60,budgetBytes:100,availableBytes:30});
  first.release();
  assert.equal(await next, 'done');
  assert.equal(calls, 1);
  assert.equal(budget.total(), 0);
});

test('unrecoverable admission rejects instead of waiting forever for retained results', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 2});
  budget.retain(80);
  await assert.rejects(scheduler.acquire({bytes: 30}), {code: 'MEMORY_LIMIT'});
  assert.equal(scheduler.snapshot().running, 0);
  assert.equal(budget.active, 0);
  budget.retained -= 80;
  const lease = await scheduler.acquire({bytes: 30});
  lease.release();
});

test('queued cancellation removes listeners and cannot leak a late reservation', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 1});
  const first = await scheduler.acquire({bytes: 20}), controller = new AbortController();
  const pending = scheduler.acquire({bytes: 50, signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {code: 'CANCELLED'});
  first.release();
  assert.equal(budget.total(), 0);
  assert.equal(scheduler.snapshot().queued, 0);
  await assert.rejects(scheduler.acquire({signal: controller.signal}), {code: 'CANCELLED'});
});

test('exceptions and disposal return all leases and reject only pending work', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 1});
  await assert.rejects(scheduler.run({bytes: 40}, () => {throw Error('kernel failed');}), /kernel failed/);
  assert.equal(budget.total(), 0);
  const first = await scheduler.acquire({bytes: 50}), pending = scheduler.acquire({});
  scheduler.dispose();
  await assert.rejects(pending, {code: 'DISPOSED'});
  assert.equal(budget.active, 50);
  first.release();
  assert.equal(budget.total(), 0);
});

test('elastic useful batches take spare cores and expand after a peer finishes', async () => {
  const budget = new Budget(1000), scheduler = new ExecutionScheduler(budget, {maxWorkers: 10});
  const peer = await scheduler.acquire({cpu: 7, label: 'other-detector'});
  const first = await scheduler.acquire({cpu: 10, minCpu: 1, bytes: 10, bytesForCpu: count => count * 20, label: 'patchmatch'});
  assert.equal(first.cpu, 3); assert.equal(first.bytes, 70);
  assert.equal(scheduler.snapshot().active.cpu, 10);
  first.release(); peer.release();
  const next = await scheduler.acquire({cpu: 10, minCpu: 1, bytesForCpu: count => count * 20, label: 'patchmatch'});
  assert.equal(next.cpu, 10); assert.equal(budget.total(), 200);
  const state = scheduler.snapshot();
  assert.equal(state.labels.patchmatch.activeCpu, 10);
  assert.equal(state.labels['other-detector'].activeCpu, 0);
  assert.equal(state.elasticAdmissions, 2);
  next.release(); assert.equal(budget.total(), 0);
});

test('elastic width fits accounted memory without oversubscribing CPUs or reserving failed widths', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 8});
  budget.retain(35);
  const lease = await scheduler.acquire({cpu: 8, minCpu: 1, bytes: 5, bytesForCpu: count => count * 20});
  assert.equal(lease.cpu, 3); assert.equal(lease.bytes, 65);
  assert.equal(budget.total(), 100); assert.equal(budget.peak, 100);
  const gpu = await scheduler.acquire({cpu: 0, gpu: 1});
  assert.deepEqual(scheduler.snapshot().active, {cpu: 3, gpu: 1});
  gpu.release(); lease.release(); budget.retained -= 35;
  assert.equal(budget.total(), 0);
});

test('cold data is reclaimed asynchronously before admitting memory and no CPU is held during migration', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 2});
  budget.retain(80); let finish, entered;
  const migrating = new Promise(resolve => {entered = resolve;});
  budget.registerAsyncReclaimer(async ({bytes, shortfallBytes}) => {
    assert.equal(bytes, 60); assert.equal(shortfallBytes, 40); entered();
    await new Promise(resolve => {finish = resolve;}); budget.retained -= 60;
  });
  const pending = scheduler.acquire({cpu: 2, bytes: 60});
  await migrating;
  assert.equal(budget.total(), 80); assert.equal(scheduler.snapshot().active.cpu, 0);
  const independent = await scheduler.acquire({cpu: 1, bytes: 10});
  independent.release(); finish();
  const lease = await pending; assert.equal(budget.total(), 80); assert.equal(lease.cpu, 2);
  lease.release(); budget.retained -= 20; assert.equal(budget.total(), 0);
});

test('cancellation during asynchronous reclamation cannot admit a late task', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 2});
  const signal = new AbortController(); let finish;
  budget.retain(80); budget.registerAsyncReclaimer(() => new Promise(resolve => {finish = resolve;}));
  const pending = scheduler.acquire({cpu: 2, bytes: 60, signal: signal.signal});
  await new Promise(resolve => setImmediate(resolve)); signal.abort();
  await assert.rejects(pending, {code: 'CANCELLED'}); finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scheduler.snapshot().running, 0); assert.equal(scheduler.snapshot().queued, 0); assert.equal(budget.active, 0);
  budget.retained -= 80;
});

test('invalid elastic memory bounds reject without leaking execution capacity', async () => {
  const budget = new Budget(100), scheduler = new ExecutionScheduler(budget, {maxWorkers: 2});
  await assert.rejects(scheduler.acquire({cpu: 2, minCpu: 0}), {code: 'INVALID_INPUT'});
  await assert.rejects(scheduler.acquire({cpu: 2, minCpu: 1, bytesForCpu: () => NaN}), {code: 'INVALID_INPUT'});
  assert.equal(scheduler.snapshot().running, 0); assert.equal(budget.total(), 0);
});

test('a GPU coordinator returns only its own CPU while sibling native lanes stay admitted',async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:4}),field=await scheduler.acquire({cpu:4,bytes:200,label:'field'});
 let peerReady=false;const waiting=scheduler.acquire({cpu:1,label:'peer'}).then(lease=>{peerReady=true;return lease;});
 await Promise.resolve();assert.equal(peerReady,false);field.releaseCpu(1);const peer=await waiting;
 assert.equal(field.cpu,3);assert.equal(scheduler.snapshot().active.cpu,4);assert.equal(scheduler.snapshot().labels.field.activeCpu,3);assert.equal(budget.total(),200);
 const gpu=await scheduler.acquire({cpu:0,gpu:1,label:'distance-gpu'});gpu.release();
 const resume=scheduler.acquire({cpu:1,label:'field-refinement'});peer.release();const refinement=await resume;
 assert.equal(scheduler.snapshot().active.cpu,4);assert.throws(()=>field.releaseCpu(4),{code:'INVALID_INPUT'});
 refinement.release();field.release();assert.equal(scheduler.snapshot().active.cpu,0);assert.equal(budget.total(),0);assert.equal(scheduler.snapshot().labels.field.activeJobs,0);
});

test('a queued GPU job permits all independent CPU slots that its current owner will not need',async()=>{
 const scheduler=new ExecutionScheduler(new Budget(1000),{maxWorkers:10});
 const first=await scheduler.acquire({cpu:1,gpu:1});
 const next=scheduler.acquire({cpu:1,gpu:1});
 const independent=await scheduler.acquire({cpu:9});
 assert.deepEqual(scheduler.snapshot().active,{cpu:10,gpu:1});
 first.release();const second=await next;
 assert.deepEqual(scheduler.snapshot().active,{cpu:10,gpu:1});
 second.release();independent.release();scheduler.dispose();
});

test('GPU backfill preserves its successor minimum even when the GPU owner holds no CPU',async()=>{
 const scheduler=new ExecutionScheduler(new Budget(1000),{maxWorkers:4});
 const first=await scheduler.acquire({cpu:0,gpu:1}),next=scheduler.acquire({cpu:1,gpu:1});
 const independent=await scheduler.acquire({cpu:4,minCpu:1});
 assert.equal(independent.cpu,3);
 first.release();const second=await next;assert.deepEqual(scheduler.snapshot().active,{cpu:4,gpu:1});
 second.release();independent.release();scheduler.dispose();
});

test('phase domains defer competing growth while the pressured operation can progress, without duplicating policy bytes',async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:3}),operation=budget.beginOperation({owner:'sift',id:'readback'});
 const pressure=budget.beginRecovery({kind:'array-buffer',owner:'sift',operation,requestedBytes:40});
 operation.setState('io');let started=false;
 const waiting=scheduler.acquire({cpu:1,bytes:40,domains:{'array-buffer':40}}).then(lease=>{started=true;return lease;});
 const independent=await scheduler.acquire({cpu:1,bytes:100,domains:{wasm:100}});
 assert.equal(started,false);assert.equal(budget.active,100);assert.equal(scheduler.snapshot().phaseDomains.wasm,100);
 const recovering=await scheduler.acquire({cpu:1,bytes:40,domains:{'array-buffer':40},operation});
 assert.equal(budget.active,140);recovering.release();pressure();const resumed=await waiting;
 assert.equal(budget.active,140);resumed.release();independent.release();operation.release();scheduler.dispose();
 assert.equal(budget.total(),0);assert.equal(budget.resourceAdmissionListeners.size,0);
});

test('pressure deferral never reserves CPUs ahead of the recovering parent child',async()=>{
 const budget=new Budget(1000),scheduler=new ExecutionScheduler(budget,{maxWorkers:4}),parent=budget.beginOperation({owner:'sift',id:'tile'});
 const pressure=budget.beginRecovery({kind:'array-buffer',owner:'sift',operation:parent,requestedBytes:40});parent.setState('recovery');
 const active=await scheduler.acquire({cpu:1}),blocked=scheduler.acquire({cpu:4,domains:{'array-buffer':100}});
 const child=budget.beginOperation({owner:'sift',id:'copy',parent});
 const recovering=await scheduler.acquire({cpu:1,domains:{'array-buffer':40},operation:child});
 assert.equal(recovering.cpu,1);recovering.release();child.release();pressure();active.release();const admitted=await blocked;admitted.release();parent.release();scheduler.dispose();
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('queued admission retries reclamation when a real owner becomes cold, without polling or stopping its peer',async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),peer=await scheduler.acquire({cpu:1}),cold=budget.reserve(80),backing=budget.registerBacking('array-buffer',80,{owner:'finished-stage'});let eligible=false,visits=0;
 budget.registerAsyncReclaimer(async()=>{visits++;if(eligible){backing();cold();}},{allocationKind:'array-buffer'});
 const waiting=scheduler.acquire({cpu:1,bytes:40});await new Promise(resolve=>setImmediate(resolve));assert.equal(visits,1);assert.equal(scheduler.snapshot().waiting.memory,1);
 for(let i=0;i<3;i++){budget.resourceChanged();await new Promise(resolve=>setImmediate(resolve));}assert.equal(visits,1,'Unchanged diagnostics cannot spin reclamation');
 eligible=true;backing.setReclaimable(true);const lease=await waiting;assert.equal(visits,2);assert.equal(scheduler.snapshot().active.cpu,2);assert.equal(budget.total(),40);lease.release();peer.release();scheduler.dispose();assert.equal(budget.total(),0);
});
