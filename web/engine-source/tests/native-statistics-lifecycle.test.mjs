import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeStatistics} from '../src/native-statistics.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {COMPOSITE_STATISTICS_POLICY} from '../src/composite-policy.js';
const MiB=1024**2,turn=()=>new Promise(resolve=>setImmediate(resolve));
class Worker {
 postMessage(data){if(data.command==='execute'){this.executing=true;return;}this.job=data;}
 emit(data){this.onmessage?.({data});}
 ready(){this.emit({executionReady:true,heapBytes:16*MiB});}
 finish(){this.emit({heapBytes:32*MiB,statisticsPolicy:COMPOSITE_STATISTICS_POLICY,result:{out:{data:Float32Array.of(3),dims:[1]}}});}
 terminate(){this.dead=true;}
}
function fixture(){const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),workers=[],statistics=new NativeStatistics(budget,{downloadBytes:1024},{workerFactory:()=>{const worker=new Worker();workers.push(worker);return worker;}});return {budget,scheduler,workers,statistics};}
const inputs={in:{data:Float32Array.of(1),dims:[1]}},options={workspaceBytes:MiB,outputBytes:4};
test('statistics initialization uses no CPU and native work waits for a peer; outputs and heap have separate lifetimes',async()=>{
 const f=fixture(),peer=await f.scheduler.acquire({cpu:1});try{
  const pending=f.statistics.run('prepare',inputs,options);await turn();assert.equal(f.scheduler.snapshot().queued,0);f.workers[0].ready();await turn();assert.equal(f.workers[0].executing,undefined);assert.equal(f.scheduler.snapshot().queued,1);peer.release();await turn();assert.equal(f.workers[0].executing,true);f.workers[0].finish();const result=await pending;
  assert.equal(f.scheduler.snapshot().running,0);assert.equal(f.budget.resourceSnapshot().domains.wasm.materializedBytes,32*MiB);assert.equal(await f.budget.reclaimAllocation(1,{kind:'wasm'}),32*MiB);assert.equal(f.workers[0].dead,true);assert.deepEqual([...result.result.out.data],[3]);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,4);result.release();
 }finally{peer.release();f.statistics.dispose();}assert.equal(f.budget.total(),0);assert.equal(f.budget.resourceSnapshot().operations.length,0);
});
for(const fault of ['error','messageerror','abort'])test('statistics '+fault+' settles queued execution and preserves the relevant cause',async()=>{
 const f=fixture(),peer=await f.scheduler.acquire({cpu:1}),controller=new AbortController();try{
  const pending=f.statistics.run('prepare',inputs,{...options,signal:controller.signal}),rejected=assert.rejects(pending,error=>fault==='error'?error.code==='MEMORY_ALLOCATION'&&error.details.requestedBytes===4096&&error.cause.message==='native refusal':error.code===(fault==='abort'?'CANCELLED':'WORKER_MESSAGE_FAILED'));
  await turn();f.workers[0].ready();await turn();if(fault==='error')f.workers[0].emit({error:{code:'MEMORY_ALLOCATION',message:'output refused',details:{allocationKind:'array-buffer',requestedBytes:4096},cause:{message:'native refusal'}}});else if(fault==='messageerror')f.workers[0].onmessageerror({});else controller.abort();await rejected;
  assert.equal(f.workers[0].dead,true);assert.equal(f.scheduler.snapshot().queued,0);assert.equal(f.scheduler.snapshot().running,1);assert.equal(f.budget.total(),0);
 }finally{peer.release();f.statistics.dispose();}assert.equal(f.budget.resourceSnapshot().operations.length,0);
});
