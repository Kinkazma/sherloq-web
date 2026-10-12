import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {WaveletStripPool} from '../src/wavelet-strip-pool.js';
import {installTransformStripWorker} from '../src/transform-strip-worker.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const options=(consume=()=>{})=>({count:12,pixels:1,key:'fixture',prepare:async index=>({index}),consume,local:async job=>job});
class Worker{
 constructor(){this.dead=false;}
 terminate(){this.dead=true;}
 postMessage(job){setImmediate(()=>{if(!this.dead)this.onmessage({data:{result:job}});});}
}
const poolFor=(budget,profile={})=>new WaveletStripPool(budget,{maxWorkers:4,workerHeapBytes:10,workerPixelBytes:0,workerFactory:()=>new Worker(),...profile});

test('an import error during preparation is retained with cause, URL, strip and stage',async()=>{
 const budget=new Budget(1000),cause=new TypeError('Failed to load dependency'),url='https://example.test/frequency-strip-worker.js';let posted=0;
 const pool=poolFor(budget,{maxWorkers:1,workerURL:url,workerFactory:()=>{const worker={terminate(){},postMessage(){posted++;}};queueMicrotask(()=>worker.onerror({type:'error',message:'Module failed',error:cause,filename:url,lineno:4,colno:2}));return worker;}});
 await assert.rejects(pool.run({...options(),count:1,prepare:async index=>{await tick();return {index};}}),error=>{
  assert.equal(error.code,'WORKER_FAILED');assert.equal(error.cause,cause);assert.deepEqual(error.details.workerEvent,{type:'error',filename:url,line:4,column:2});
  assert.equal(error.details.transformStrip.index,0);assert.equal(error.details.transformStrip.stage,'prepare');assert.equal(error.details.transformStrip.workerURL,url);return true;
 });
 assert.equal(posted,0);assert.equal(budget.total(),0);assert.equal(pool.metrics().residentWorkers,0);
});

test('a load error cancels queued CPU admission immediately without waiting for its peer', {timeout:1000},async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),peer=await scheduler.acquire({cpu:1});let posted=0;
 const pool=poolFor(budget,{maxWorkers:1,workerFactory:()=>{const worker={terminate(){},postMessage(){posted++;}};setImmediate(()=>worker.onerror({message:'Script refused',filename:'script.js'}));return worker;}});
 try{await assert.rejects(pool.run({...options(),count:1}),{code:'WORKER_FAILED'});assert.equal(scheduler.snapshot().active.cpu,1);assert.equal(scheduler.snapshot().queued,0);assert.equal(posted,0);assert.equal(budget.total(),0);}finally{peer.release();pool.clear();}
});

for(const kind of ['null','messageerror','invalid-envelope'])test(kind+' retires only the failed endpoint and retries its useful strip',async()=>{
 const budget=new Budget(1000),prepared=new Map(),consumed=new Map();let failed=false;
 const pool=poolFor(budget,{workerFactory:()=>({dead:false,terminate(){this.dead=true;},postMessage(job){setImmediate(()=>{if(this.dead)return;if(job.index===2&&!failed){failed=true;if(kind==='messageerror')this.onmessageerror({});else this.onmessage({data:kind==='null'?null:{error:null}});}else this.onmessage({data:{result:job}});});}})});
 try{await pool.run({...options((value,index)=>{assert.equal(value.index,index);consumed.set(index,(consumed.get(index)??0)+1);}),prepare:async index=>{prepared.set(index,(prepared.get(index)??0)+1);return {index};}});
  assert.equal(pool.metrics().stripRetries,1);assert.equal(pool.metrics().workers,4);assert.equal(pool.metrics().completedStripJobs,12);
  for(let index=0;index<12;index++){assert.equal(consumed.get(index),1);assert.equal(prepared.get(index),index===2?2:1);}
 }finally{pool.clear();}assert.equal(budget.total(),0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});

test('five unreadable replies settle with the original transport diagnostic and no orphaned admission',async()=>{
 const budget=new Budget(1000);let calls=0;
 const pool=poolFor(budget,{maxWorkers:1,workerFactory:()=>({terminate(){},postMessage(){calls++;queueMicrotask(()=>this.onmessage({data:null}));}})});
 await assert.rejects(pool.run({...options(),count:1}),error=>error.code==='WORKER_MESSAGE_FAILED'&&error.details.transport.reason==='null-data'&&error.details.recovery.consecutiveFailures===5&&error.details.transformStrip.index===0);
 assert.equal(calls,5);assert.equal(pool.metrics().stripRetries,4);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});

test('independent stages reuse all four workers without retaining a CPU grant between strips',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget);let peak=0,computing=0;
 pool.factory=()=>({terminate(){},postMessage(job){peak=Math.max(peak,++computing);setImmediate(()=>{computing--;this.onmessage({data:{result:job}});});}});
 try{for(const key of ['rows','columns','reconstruction'])await pool.run({...options(()=>assert.equal(getExecutionScheduler(budget).snapshot().labels['transform-strip'].activeCpu,computing)),key});
  assert.equal(pool.metrics().workerStarts,4);assert.equal(pool.metrics().workerReuses,8);assert.equal(pool.metrics().completedStripJobs,36);assert.equal(peak,4);assert.equal(budget.total(),40);
 }finally{pool.clear();}assert.equal(budget.total(),0);assert.equal(budget.reclaimers.size,0);
});

test('idle slots remain charged, retire under pressure, and report actual known heap retirement',async()=>{
 const budget=new Budget(100),pool=poolFor(budget,{workerFactory:()=>({terminate(){},postMessage(job){setImmediate(()=>this.onmessage({data:{result:{...job,heapBytes:8}}}));}})});
 try{await pool.run(options());assert.equal(budget.total(),40);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,32);
  const peer=budget.reserve(80);assert.equal(budget.total(),100);assert.equal(pool.metrics().residentWorkers,2);assert.equal(budget.backingReleased.get('wasm'),16);peer();
  await pool.run(options());assert.equal(pool.metrics().residentWorkers,4);assert.equal(pool.metrics().workerStarts,6);
 }finally{pool.clear();}assert.equal(budget.total(),0);
});

test('busy siblings cannot be reclaimed by an unrelated reservation',async()=>{
 const budget=new Budget(60),workers=[],pool=poolFor(budget,{workerFactory:()=>{const worker={dead:false,terminate(){this.dead=true;},postMessage(job){this.job=job;}};workers.push(worker);return worker;}});
 let prepared;const allReady=new Promise(resolve=>{prepared=resolve;});const pending=pool.run({...options(),count:4,prepare:async index=>{if(index===3)queueMicrotask(prepared);return {index};}});
 await allReady;await tick();assert.throws(()=>budget.reserve(30),{code:'MEMORY_LIMIT'});assert.ok(workers.every(worker=>!worker.dead));
 for(const worker of workers)worker.onmessage({data:{result:worker.job}});await pending;pool.clear();assert.equal(budget.total(),0);
});

test('larger strips grow only the existing reservation and observed heap remains charged',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget,{maxWorkers:1,workerPixelBytes:2,workerFactory:()=>({terminate(){},postMessage(job){queueMicrotask(()=>this.onmessage({data:{result:{...job,heapBytes:job.heap}}}));}})});
 const run=(pixels,heap)=>pool.run({...options(),count:1,pixels,prepare:async()=>({heap})});
 try{await run(2,10);assert.equal(budget.total(),10);await run(10,30);assert.equal(budget.total(),30);await run(1,30);assert.equal(budget.total(),30);assert.equal(pool.metrics().workerStarts,1);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,30);}finally{pool.clear();}assert.equal(budget.total(),0);
});

test('parking returns transient workspace and incremental projection preserves a later parallel stage',async()=>{
 const budget=new Budget(240),pool=poolFor(budget,{workerPixelBytes:40});let residentDuringCompute;
 try{await pool.run({...options(),consume:()=>{residentDuringCompute=Math.max(residentDuringCompute??0,budget.total());}});assert.equal(residentDuringCompute,200);assert.equal(budget.total(),40);
  assert.equal(pool.memoryForConcurrency(4,50,0),160);await pool.run({...options(),key:'second-stage'});assert.equal(pool.plans.at(-1).count,4);assert.equal(pool.metrics().workerStarts,4);assert.equal(budget.total(),40);
 }finally{pool.clear();}assert.equal(budget.total(),0);
});

test('allocation recovery re-reads detached inputs and never repeats already published strips',async()=>{
 const budget=new Budget(1000),attempts=new Map(),prepared=new Map(),consumed=new Map(),outputs=[],failedIndices=new Set([1,4,9]);let peak=0,inFlight=0;
 const pool=poolFor(budget,{workerFactory:()=>({dead:false,terminate(){this.dead=true;},postMessage(job,transfer){const input=structuredClone(job,{transfer});assert.equal(job.bytes.byteLength,0);peak=Math.max(peak,++inFlight);setImmediate(()=>{inFlight--;if(this.dead)return;const attempt=(attempts.get(input.index)??0)+1;attempts.set(input.index,attempt);this.onmessage({data:failedIndices.has(input.index)&&attempt<=2?{error:{code:'MEMORY_ALLOCATION',message:'Array buffer allocation failed',details:{requestedBytes:1,allocationKind:'array-buffer'}}}:{result:{value:input.bytes[0]}}});});}})});
 try{await pool.run({...options((value,index)=>{outputs[index]=value.value;consumed.set(index,(consumed.get(index)??0)+1);}),prepare:async index=>{prepared.set(index,(prepared.get(index)??0)+1);return {index,bytes:new Uint8Array([index*3])};}});
  assert.deepEqual(outputs,Array.from({length:12},(_,index)=>index*3));assert.equal(peak,4);assert.equal(pool.metrics().stripRetries,6);
  for(let index=0;index<12;index++){assert.equal(consumed.get(index),1);assert.equal(prepared.get(index),failedIndices.has(index)?3:1);}
 }finally{pool.clear();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('source preparation recovery keeps the healthy worker',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget,{maxWorkers:1});let prepared=0;
 try{await pool.run({...options(),count:1,prepare:async()=>{if(++prepared<3)throw new RangeError('Array buffer allocation failed');return {};}});assert.equal(prepared,3);assert.equal(pool.metrics().workerStarts,1);assert.equal(pool.metrics().stripRetries,2);}finally{pool.clear();}assert.equal(budget.total(),0);
});

test('publication without an idempotence contract is attempted once',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget);let published=0;
 await assert.rejects(pool.run({...options(()=>{published++;throw new RangeError('Array buffer allocation failed');}),count:1}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.transformStrip.stage==='consume');
 assert.equal(published,1);assert.equal(pool.metrics().stripRetries,0);assert.equal(budget.total(),0);
});

test('idempotent publication keeps its exact result instead of re-reading or recomputing',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget,{maxWorkers:1});let prepared=0,published=0,first;
 try{await pool.run({...options(result=>{if(!first)first=result;assert.equal(result,first);if(++published<3)throw new RangeError('Array buffer allocation failed');}),count:1,consumeIdempotent:true,prepare:async index=>{prepared++;return {index};}});assert.equal(prepared,1);assert.equal(published,3);assert.equal(pool.metrics().stripRetries,2);}finally{pool.clear();}assert.equal(budget.total(),0);
});

test('opaque worker failures cannot permanently lower the parallelism of the next stage',async()=>{
 const budget=new Budget(1000);let fail=true;
 const pool=poolFor(budget,{workerFactory:()=>({dead:false,terminate(){this.dead=true;},postMessage(job){setImmediate(()=>{if(this.dead)return;fail?this.onerror({message:'A script failed'}):this.onmessage({data:{result:job}});});}})});
 await assert.rejects(pool.run(options()),{code:'WORKER_FAILED'});fail=false;
 try{await pool.run(options());assert.equal(pool.plans.at(-1).ceiling,4);assert.equal(pool.metrics().residentWorkers,4);}finally{pool.clear();}assert.equal(budget.total(),0);
});

test('clear cancels queued admissions and no late job reaches a terminated worker',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),peer=await scheduler.acquire({cpu:1});let posted=0;
 const pool=poolFor(budget,{maxWorkers:1,workerFactory:()=>({terminate(){},postMessage(){posted++;}})}),pending=pool.run({...options(),count:1});
 await tick();pool.clear();await assert.rejects(pending,{code:'CANCELLED'});peer.release();await tick();assert.equal(posted,0);assert.equal(budget.total(),0);assert.equal(scheduler.snapshot().queued,0);
});

test('resuming explicit committed indices performs only missing useful work',async()=>{
 const budget=new Budget(1000),pool=poolFor(budget),committed=new Set([0,2]),seen=[];
 try{await pool.run({...options((result,index)=>seen.push(index)),count:4,isCommitted:index=>committed.has(index),onCommitted:index=>committed.add(index)});assert.deepEqual(seen.sort(),[1,3]);assert.deepEqual([...committed].sort(),[0,1,2,3]);assert.equal(pool.metrics().completedStripJobs,2);}finally{pool.clear();}assert.equal(budget.total(),0);
});

test('the common worker endpoint preserves async causes and settles receiver message errors',async()=>{
 const replies=[],target={postMessage:reply=>replies.push(reply)},cause=new RangeError('Array buffer allocation failed');
 const protocol=installTransformStripWorker(async()=>{await tick();throw cause;},{target,label:'fixture'});
 target.onmessage({data:{op:'run'}});await tick();await tick();assert.equal(replies.length,1);assert.equal(replies[0].error.code,'MEMORY_ALLOCATION');assert.equal(replies[0].error.cause.message,cause.message);assert.equal(protocol.failed,true);
 const otherReplies=[],other={postMessage:reply=>otherReplies.push(reply)};installTransformStripWorker(()=>assert.fail('Unreadable input cannot compute'),{target:other});other.onmessageerror({});assert.equal(otherReplies.length,1);assert.equal(otherReplies[0].error.code,'WORKER_MESSAGE_FAILED');
});

test('the common worker endpoint deduplicates aliased result buffers',async()=>{
 const bytes=new Uint8Array([1,2,3]),calls=[],target={postMessage:(reply,transfer)=>calls.push({reply,transfer})};installTransformStripWorker(()=>({a:bytes,b:bytes.subarray(1)}),{target});target.onmessage({data:{op:'run'}});await tick();assert.equal(calls.length,1);assert.deepEqual(calls[0].transfer,[bytes.buffer]);
});

test('a simultaneous import failure does not replace the initial preparation cause',async()=>{
 const budget=new Budget(1000);let prepared=0;
 const pool=poolFor(budget,{maxWorkers:1,workerFactory:()=>{const worker={terminate(){},postMessage(job){queueMicrotask(()=>this.onmessage({data:{result:job}}));}};if(prepared===0)queueMicrotask(()=>worker.onerror({message:'Independent module load failure'}));return worker;}});
 const events=[];
 try{await pool.run({...options(),count:1,onRecovery:event=>events.push(event),prepare:async()=>{if(++prepared===1){await tick();throw new RangeError('Array buffer allocation failed');}return {};}});assert.equal(events[0].error.code,'MEMORY_ALLOCATION');assert.equal(events[0].error.cause.message,'Array buffer allocation failed');assert.equal(events[0].error.details.workerFailure.message,'Independent module load failure');assert.equal(prepared,2);}finally{pool.clear();}assert.equal(budget.total(),0);
});
