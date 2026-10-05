import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {scheduledWorkerCall, cancelScheduledWorkerCalls} from '../src/scheduled-worker-call.js';

test('pool clear prevents late dispatch to a terminated worker, next generation is reusable', async () => {
  const budget = new Budget(100), owner = {budget, profile: {maxWorkers: 1}};
  const scheduler = getExecutionScheduler(budget, {maxWorkers: 1}), held = await scheduler.acquire({});
  let dispatched = 0;
  const pending = scheduledWorkerCall(owner, () => {dispatched++;});
  cancelScheduledWorkerCalls(owner);
  await assert.rejects(pending, {code: 'CANCELLED'});
  held.release();
  await scheduledWorkerCall(owner, () => {dispatched++;});
  assert.equal(dispatched, 1);
  assert.equal(scheduler.snapshot().running, 0);
});

test('different worker pools cannot multiply the shared CPU quota', async () => {
  const budget = new Budget(100), owners = [1,2,3].map(() => ({budget, profile: {maxWorkers: 2}}));
  let active = 0, peak = 0;
  const jobs = owners.flatMap(owner => Array.from({length: 3}, () => scheduledWorkerCall(owner, async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
  })));
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.equal(getExecutionScheduler(budget).snapshot().completed, 9);
});

test('production quality and LUT pools honor one quota and clearing a queued pool preserves its input', async () => {
  const {QualityPool} = await import('../src/quality-pool.js');
  const {LutPool} = await import('../src/lut-pool.js');
  const budget = new Budget(1024), scheduler = getExecutionScheduler(budget, {maxWorkers: 2});
  const quality = new QualityPool(budget, {maxWorkers: 8}), lut = new LutPool(budget, {maxWorkers: 8});
  let active = 0, peak = 0, calls = 0;
  const worker = () => ({terminate(){}, postMessage(){
    calls++; active++; peak=Math.max(peak,active);
    setImmediate(()=>{active--;this.onmessage({data:{values:[]}});});
  }});
  await Promise.all([quality.rpc(worker(),{}),lut.rpc(worker(),{}),quality.rpc(worker(),{}),lut.rpc(worker(),{})]);
  assert.equal(peak,2);assert.equal(calls,4);
  const held=await scheduler.acquire({cpu:2}), source=new Uint8Array([1,2,3]);
  const queued=lut.rpc(worker(),{source},[source.buffer]);
  lut.dispose();await assert.rejects(queued,{code:'CANCELLED'});held.release();
  assert.deepEqual([...source],[1,2,3]);assert.equal(calls,4);
  quality.dispose();assert.equal(scheduler.snapshot().running,0);assert.equal(budget.total(),0);
});

const pendingGate=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
test('legacy CPU and GPU worker calls are visible for their full admitted lifetime',async()=>{
 const budget=new Budget(100),owner={budget,profile:{maxWorkers:2}},cpu=pendingGate(),gpu=pendingGate();
 const a=scheduledWorkerCall(owner,()=>cpu.promise,{label:'legacy-cpu'}),b=scheduledWorkerCall(owner,()=>gpu.promise,{cpu:0,gpu:1,label:'legacy-gpu'});await nextTurn();
 const active=budget.resourceSnapshot().operations;assert.equal(active.length,2);assert.deepEqual(active.map(o=>[o.owner,o.state]).sort(),[['worker:legacy-cpu','compute'],['worker:legacy-gpu','compute']]);assert.equal(budget.resourceProgressSnapshot('failed','array-buffer').independentProducers,2);assert.equal(budget.resourceProducers.size,0,'Ticketed calls must not create a second legacy producer');
 cpu.resolve('cpu-exact');assert.equal(await a,'cpu-exact');assert.equal(budget.resourceSnapshot().operations.length,1);gpu.resolve('gpu-exact');assert.equal(await b,'gpu-exact');assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(getExecutionScheduler(budget).snapshot().running,0);
});
test('worker calls inherit their parent owner and preserve two blocked child dependencies',async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),parent=budget.beginOperation({owner:'ela',id:'io-parent'}),holder=budget.beginOperation({owner:'held',id:'blocked-holder'}),held=await scheduler.acquire({operation:holder});held.setResourceBlocked(true);parent.setState('io');const owner={budget,profile:{maxWorkers:1},resourceOperation:parent},first=pendingGate(),second=pendingGate();
 const a=scheduledWorkerCall(owner,()=>first.promise,{label:'quality-a'}),b=scheduledWorkerCall(owner,()=>second.promise,{label:'quality-b'});await nextTurn();let snapshot=budget.resourceSnapshot();assert.equal(parent.state,'waiting-child');assert.equal(snapshot.operations.find(o=>o.key===parent.key).dependencies.length,2);assert.equal(budget.resourceProgressSnapshot('failed','array-buffer').independentProducers,0,'A parent waiting for blocked RPCs must not look like useful I/O');assert.deepEqual(snapshot.operations.filter(o=>o.parent===parent.key).map(o=>o.owner),['ela','ela']);
 held.release();holder.release();await nextTurn();first.resolve(1);assert.equal(await a,1);assert.equal(parent.state,'waiting-child');snapshot=budget.resourceSnapshot();assert.equal(snapshot.operations.find(o=>o.key===parent.key).dependencies.length,1);second.resolve(2);assert.equal(await b,2);assert.equal(parent.state,'io');parent.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});
test('a supplied worker operation remains owned by the caller without a duplicate ticket',async()=>{
 const budget=new Budget(100),ticket=budget.beginOperation({owner:'sift',id:'native-lane'}),owner={budget,profile:{maxWorkers:1}},wait=pendingGate(),call=scheduledWorkerCall(owner,()=>wait.promise,{operation:ticket,label:'inherited'});await nextTurn();assert.equal(budget.resourceSnapshot().operations.length,1);assert.equal(ticket.state,'compute');wait.resolve(42);assert.equal(await call,42);assert.equal(ticket.closed,false);assert.equal(ticket.state,'ready');ticket.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});
test('cancelling active legacy dispatch keeps activity visible until owned work has settled',async()=>{
 const budget=new Budget(100),owner={budget,profile:{maxWorkers:1}},active=pendingGate(),call=scheduledWorkerCall(owner,()=>active.promise,{label:'drained-worker'});await nextTurn();cancelScheduledWorkerCalls(owner);assert.equal(budget.resourceSnapshot().operations.length,1);assert.equal(budget.resourceProgressSnapshot('peer','array-buffer').independentProducers,1,'Cancellation cannot erase still-running work');active.resolve('settled');assert.equal(await call,'settled');assert.equal(budget.resourceSnapshot().operations.length,0);
 await scheduledWorkerCall(owner,()=>5);assert.equal(budget.resourceSnapshot().operations.length,0);
});
test('queued worker cancellation restores its parent and leaves no stale operation',async()=>{
 const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),held=await scheduler.acquire({}),parent=budget.beginOperation({owner:'ela'});parent.setState('io');const owner={budget,resourceOperation:parent},call=scheduledWorkerCall(owner,()=>assert.fail('Cancelled queued RPC dispatched'));
 cancelScheduledWorkerCalls(owner);await assert.rejects(call,{code:'CANCELLED'});assert.equal(parent.state,'io');assert.deepEqual(budget.resourceSnapshot().operations.map(o=>o.key),[parent.key]);held.release();parent.release();assert.equal(budget.resourceSnapshot().operations.length,0);
});
test('AKAZE and grouping RPCs carry explicit service owners rather than the compatibility fallback',async()=>{
 const {AkazePagedPool}=await import('../src/akaze-paged-pool.js'),{CloningGroupPool}=await import('../src/cloning-group-pool.js');const budget=new Budget(1000),profile={maxWorkers:2},parent={profile,workers:new Set()},akaze=new AkazePagedPool(parent,{budget}),cloning=new CloningGroupPool(budget,profile),dispatch=[];
 const worker=()=>({terminate(){},postMessage(data){dispatch.push(()=>this.onmessage({data:{exact:data.value}}));}}),a=akaze.rpc({worker:worker()}, {kind:'detect',value:7}),b=cloning.rpc(worker(),{value:9});await nextTurn();assert.deepEqual(budget.resourceSnapshot().operations.map(o=>o.owner).sort(),['cloning','sift']);dispatch.forEach(done=>done());assert.deepEqual(await Promise.all([a,b]),[{exact:7},{exact:9}]);akaze.close();cloning.dispose();assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.total(),0);
});
test('allocation recovery waits for admitted legacy worker credit instead of exhausting five retries',{timeout:3000},async()=>{
 const {runWithResourceRecovery}=await import('../src/resource-recovery.js');const budget=new Budget(100),owner={budget,profile:{maxWorkers:1}},held=budget.reserve(60),returned=held.split(20),publish=pendingGate(),finish=pendingGate(),waiting=pendingGate();let attempts=0;
 const peer=scheduledWorkerCall(owner,async()=>{await publish.promise;returned();await finish.promise;return 'peer-exact';},{label:'legacy-memory-producer'});await nextTurn();const task=runWithResourceRecovery(()=>{attempts++;const release=budget.reserve(60);release();return 'allocation-exact';},{budget,owner:'d2prl',operation:'output-allocation',onWait:event=>{if(event.stage==='waiting')waiting.resolve();}});
 try{await waiting.promise;assert.equal(attempts,1);await nextTurn();assert.equal(attempts,1);publish.resolve();assert.equal(await task,'allocation-exact');assert.equal(attempts,2);assert.ok(budget.resourceSnapshot().operations.some(o=>o.owner==='worker:legacy-memory-producer'),'Recovery must not wait for the whole peer to finish once credit is usable');finish.resolve();assert.equal(await peer,'peer-exact');}
 finally{publish.resolve();finish.resolve();returned();held();await peer;}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.recovering,false);
});
