import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {DenseFieldPool,denseJobMemory,denseResidentWorkerBytes} from '../src/dense-pool.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';

const MiB=1024**2,turn=()=>new Promise(resolve=>setImmediate(resolve));
const fixture=()=>({width:10,height:10,field:{targets:new Int32Array(100).fill(7),distancesSquared:new Float32Array(100).fill(.25),allowed:new Uint8Array(100).fill(1)},pass:{method:0,patch:8,targetPatch:8}});
const answer=(job,heapBytes=16*MiB)=>({...job.field,selected:new Uint8Array(100).fill(1),heapBytes});
async function until(ready){for(let i=0;i<40&&!ready();i++)await turn();assert(ready(),'Expected useful work never reached its boundary');}
function controlledWorkers(){const workers=[];return {workers,create(){const worker={terminated:false,postMessage(job){this.job=job;},terminate(){this.terminated=true;},complete(){this.onmessage({data:{result:answer(this.job)}});}};workers.push(worker);return worker;}};}

test('actual resident lanes keep D2 waiting and return the first retired lane credit before the last finishes',{timeout:3000},async()=>{
 const budget=new Budget(160*MiB),control=controlledWorkers(),pool=new DenseFieldPool(budget,{maxWorkers:2,workerFactory:()=>control.create()}),job=fixture(),plans=[denseJobMemory(job),denseJobMemory(job)],laneBytes=denseResidentWorkerBytes(plans),events=[],observed=[];
 const parent=budget.beginOperation({owner:'patchmatch',id:'public-analysis'});
 let result,recovered,attempts=0;
 const pending=pool.run([job,{...job}],{resourceOperation:parent,onProgress:progress=>{if(progress.phase==='complete')observed.push(budget.resourceSnapshot());}});
 try{
  await until(()=>control.workers.length===2&&control.workers.every(worker=>worker.job));
  const active=budget.resourceSnapshot();assert.equal(active.domains.wasm.reservedBytes,2*plans[0].wasmHeapBytes);assert.equal(active.domains.wasm.materializedBytes,0,'Reserved allowance is not a physical heap measurement');
  assert.equal(active.operations.filter(op=>op.id.startsWith('dense-resident/lane/')&&op.state==='compute').length,2);
  const publicOp=active.operations.find(op=>op.key===parent.key);assert.equal(publicOp.state,'waiting-child');assert.equal(publicOp.dependencies.length,1);
  assert.ok(budget.resourceProgressSnapshot('d2prl','policy').independentProducers>=2);
  const recovery=runWithResourceRecovery(()=>{attempts++;return budget.reserve(laneBytes);},{budget,owner:'d2prl',operation:'convolution',onWait:event=>events.push(event)});recovery.catch(()=>{});
  await until(()=>events.some(event=>event.waitStage==='waiting'));
  for(let i=0;i<8;i++){parent.commit();await turn();}assert.equal(attempts,1,'Progress commits alone must not consume allocation attempts');
  const before=budget.total();control.workers[0].complete();recovered=await recovery;
  assert.equal(attempts,2);assert.equal(control.workers[0].terminated,true);assert.equal(control.workers[1].terminated,false);
  assert.equal(budget.total(),before,'One lane credit was returned and immediately admitted to D2');
  assert.equal(budget.resourceSnapshot().domains.wasm.reservedBytes,plans[0].wasmHeapBytes);
  assert.equal(observed[0].domains.wasm.materializedBytes,16*MiB);assert.equal(budget.resourceProgressSnapshot('d2prl','wasm').releasedBytes,16*MiB);
  assert(events.some(event=>event.reason==='admission-credit'));
  control.workers[1].complete();result=await pending;
  assert.deepEqual(result.results[0].targets,job.field.targets);assert.deepEqual(result.results[1].distancesSquared,job.field.distancesSquared);
  assert.equal(budget.resourceSnapshot().domains.wasm.reservedBytes,0);assert.equal(budget.resourceSnapshot().operations.length,1);
 }finally{pool.dispose();await pending.catch(()=>{});result?.release();recovered?.();parent.release();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.resourceWaiters.size,0);
});

test('resident lane identity and dependencies survive the CPU gap between two hypotheses',{timeout:3000},async()=>{
 const budget=new Budget(160*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),job=fixture(),snapshots=[];let other,firstKey,terminated=0;
 const pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(message){const lane=budget.resourceSnapshot().operations.find(op=>op.id==='dense-resident/lane/0');firstKey??=lane.key;assert.equal(lane.key,firstKey);if(message.index===0)other=scheduler.acquire({cpu:1,resourceOwner:'d2prl',label:'peer'}).then(lease=>{snapshots.push(budget.resourceSnapshot());lease.release();});queueMicrotask(()=>this.onmessage({data:{result:answer(message)}}));},terminate(){terminated++;}})});
 let result;try{result=await pool.run([{...job,index:0},{...job,index:1}]);await other;const lane=snapshots[0].operations.find(op=>op.key===firstKey);assert.equal(lane.state,'queued');assert.equal(lane.commits,1);assert.deepEqual(lane.dependencies,['owner:d2prl']);assert.equal(terminated,1);}finally{result?.release();pool.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

for(const mode of ['cancel','transport'])test('resident '+mode+' drains all lane credits, tickets and backing owners',{timeout:3000},async()=>{
 const budget=new Budget(160*MiB),control=controlledWorkers(),pool=new DenseFieldPool(budget,{maxWorkers:2,workerFactory:()=>control.create()}),job=fixture(),controller=new AbortController();
 const pending=pool.run([job,{...job}],{signal:controller.signal}),rejected=assert.rejects(pending,{code:mode==='cancel'?'CANCELLED':'WORKER_MESSAGE_FAILED'});
 await until(()=>control.workers.length===2&&control.workers.every(worker=>worker.job));
 if(mode==='cancel')controller.abort();else control.workers[0].onmessage({data:null});
 await rejected;assert(control.workers.every(worker=>worker.terminated));assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);assert.equal(budget.resourceSnapshot().domains.wasm.reservedBytes,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);pool.dispose();
});
