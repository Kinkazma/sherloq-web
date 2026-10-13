import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {DenseFieldPool,denseJobMemory} from '../src/dense-pool.js';
import {denseDescriptorCacheByteBound} from '../src/dense-descriptor-cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

// Protocol doubles test the actual parent admission/backing/scheduler owners.
// Native math and field parity are covered by the separate real-engine runs.
function fixture({mode='success',jobsCount=2}={}){
 const budget=new Budget(512*1024**2),source={width:32,height:32,data:new Uint8Array(32*32*3).fill(37)},before=source.data.slice(),requests=[],workers=[];
 const jobs=Array.from({length:jobsCount},(_,index)=>({index,width:32,height:32,sourceImage:source,crop:{x:0,y:0,width:32,height:32},pass:{method:1,patch:3,targetPatch:index===0?3:5,reflection:false,quarterTurn:index>0},options:{},descriptorCache:true}));
 const bound=denseDescriptorCacheByteBound(jobs[0]);
 const pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory:()=>{
  const worker={dead:false,terminate(){this.dead=true;},postMessage(message){
   if(mode==='clone-error'&&requests.length===1)throw new DOMException('Injected cache-following send failure','DataCloneError');
   const job=structuredClone(message);requests.push(job);const index=requests.length-1;
   queueMicrotask(()=>{if(this.dead)return;if(index>0&&mode==='messageerror'){this.onmessageerror({});return;}
    const shape=denseJobMemory({...jobs[index],descriptorCache:job.descriptorCache}),n=shape.width*shape.height;
    const retainedBytes=mode==='overbound'&&index>0?bound+1:bound;
    this.onmessage({data:{result:{width:shape.width,height:shape.height,targets:new Int32Array(n).fill(-1),distancesSquared:new Float32Array(n).fill(Infinity),allowed:new Uint8Array(n).fill(1),selected:new Uint8Array(n),comparisons:0n,descriptorCache:{retainedBytes},heapBytes:65536}}});
   });
  }};workers.push(worker);return worker;
 }});
 const assertFinal=()=>{
  assert.equal(budget.total(),0);const state=budget.resourceSnapshot();assert.equal(state.operations.length,0);assert.equal(state.pressures.length,0);
  for(const domain of Object.values(state.domains)){assert.equal(domain.backings,0);assert.equal(domain.reservedBytes,0);assert.equal(domain.materializedBytes,0);}
  const scheduler=getExecutionScheduler(budget).snapshot();assert.deepEqual(scheduler.active,{cpu:0,gpu:0});assert.equal(scheduler.running,0);assert.equal(scheduler.queued,0);assert.equal(pool.active.size,0);assert.ok(workers.every(worker=>worker.dead));assert.deepEqual(source.data,before);
 };
 return {budget,pool,jobs,bound,requests,workers,assertFinal};
}

test('successful private cache reports never outlive their resident lane; delivered results retain only their output policy',{timeout:3000},async()=>{
 const f=fixture();let observed=0,result;
 try{result=await f.pool.run(f.jobs,{onProgress:event=>{if(event.phase==='complete'){observed++;const domain=f.budget.resourceSnapshot().domains['array-buffer'];assert.equal(domain.materializedBytes,f.bound);assert.equal(domain.backings,1);}}});
  assert.equal(observed,2);assert.equal(f.requests[1].reuseSource,true);assert.equal(f.requests[1].sourceImage,undefined);assert.equal(f.requests[0].descriptorCache,true);assert.equal(f.budget.total(),result.metrics.outputBytes);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].backings,0);result.release();result=null;
 }finally{result?.release();f.pool.dispose();}f.assertFinal();
});

test('cancellation after the first cache publication returns every cached backing and never starts a second field',{timeout:3000},async()=>{
 const f=fixture(),stop=new AbortController();let sawPublication=false;
 try{await assert.rejects(f.pool.run(f.jobs,{signal:stop.signal,onProgress:event=>{if(event.phase==='complete'){assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,f.bound);sawPublication=true;stop.abort();}}}),{code:'CANCELLED'});assert.ok(sawPublication);assert.equal(f.requests.length,1);
 }finally{f.pool.dispose();}f.assertFinal();
});

test('cancelling queued CPU admission between cached fields preserves another owner and retires the idle resident cache',{timeout:3000},async()=>{
 const f=fixture(),stop=new AbortController(),scheduler=getExecutionScheduler(f.budget,{maxWorkers:1});let other,sawQueue=false;
 try{await assert.rejects(f.pool.run(f.jobs,{signal:stop.signal,onProgress:event=>{if(event.phase==='complete'&&!other){other=scheduler.acquire({cpu:1,label:'unrelated-function',resourceOwner:'unrelated'}).then(lease=>{try{assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,f.bound);assert.equal(scheduler.snapshot().queued,1);sawQueue=true;stop.abort();assert.equal(scheduler.snapshot().active.cpu,1,'The unrelated CPU owner remains admitted through cancellation.');}finally{lease.release();}});}}}),{code:'CANCELLED'});await other;assert.ok(sawQueue);assert.equal(f.requests.length,1);
 }finally{f.pool.dispose();}f.assertFinal();
});

for(const mode of ['overbound','clone-error','messageerror'])test(mode+' after cache publication retires cache, worker, output reservations and CPU ownership',{timeout:3000},async()=>{
 const f=fixture({mode});let published=false;
 try{await assert.rejects(f.pool.run(f.jobs,{onProgress:event=>{if(event.phase==='complete'){published=true;assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,f.bound);}}}),error=>mode==='overbound'?error.code==='INVALID_INPUT'&&/admitted source-feature bound/.test(error.message):mode==='clone-error'?error.name==='DataCloneError':error.code==='WORKER_MESSAGE_FAILED');assert.ok(published);
 }finally{f.pool.dispose();}f.assertFinal();
});

test('a retained completed output survives a later cache fault while private backing owners retire immediately',{timeout:3000},async()=>{
 const f=fixture({mode:'overbound'});let held,heldResult;
 try{await assert.rejects(f.pool.run(f.jobs,{retainResult(index,result,release){if(index!==0)return false;held=release;heldResult=result;return true;}}),{code:'INVALID_INPUT'});assert.ok(heldResult.targets.length);assert.equal(f.budget.total(),denseJobMemory(f.jobs[0]).output);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].backings,0);assert.deepEqual(getExecutionScheduler(f.budget).snapshot().active,{cpu:0,gpu:0});held();held=null;
 }finally{held?.();f.pool.dispose();}f.assertFinal();
});
