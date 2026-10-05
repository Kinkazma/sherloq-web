import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler,getExecutionScheduler} from '../src/execution-scheduler.js';
import {ElasticWorkerPool} from '../src/elastic-worker-pool.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('partial checkout after reclamation preserves the allocation cause and retries with the same worker',async()=>{
 const budget=new Budget(1000);let fail=false,allocations=0;const events=[];
 const Type=new Proxy(Uint8Array,{construct(target,args){if(typeof args[0]==='number'){allocations++;if(fail){fail=false;throw new RangeError('Array buffer allocation failed');}}return Reflect.construct(target,args);}});
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workBuffers:{input:{Type,length:64},output:{length:16}},workerFactory:()=>new Worker()});
 const run=()=>pool.run(1,{prepare:async index=>({message:{index}}),consume:async()=>{},onProgress:e=>events.push(e)});
 try{await run();await budget.reclaimAllocation(80,{kind:'array-buffer'});fail=true;await run();
  assert.equal(pool.snapshot().created,1);assert.equal(pool.snapshot().completed,2);assert.equal(allocations,3);
  const failures=events.filter(e=>e.phase==='resource-recovery');assert.equal(failures.length,1);assert.equal(failures[0].error.code,'MEMORY_ALLOCATION');assert.equal(failures[0].error.cause.message,'Array buffer allocation failed');
 }finally{pool.dispose();}assert.equal(budget.total(),0);
});
class Worker {
 constructor(){this.dead=false;}
 terminate(){this.dead=true;}
 postMessage(message){setImmediate(()=>{if(!this.dead)this.onmessage({data:{result:{value:message.index*3,heapBytes:16}}});});}
}

test('persistent workers grow their active concurrency when another detector returns CPUs',async()=>{
 const budget=new Budget(10000),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),peer=await scheduler.acquire({cpu:3});
 const pool=new ElasticWorkerPool(budget,{maxWorkers:4,workerBytes:100,ioBytes:20,workerFactory:()=>new Worker()}),outputs=[],peaks=[];
 try{
  await pool.run(40,{prepare:async index=>({message:{index}}),consume:async(index,result)=>{outputs[index]=result.value;if(index===3)peer.release();},onProgress:progress=>peaks.push(progress.execution.peakComputing)});
  assert.equal(peaks[0],1);assert.equal(Math.max(...peaks),4);assert.deepEqual(outputs,Array.from({length:40},(_,i)=>i*3));
  assert.equal(scheduler.snapshot().active.cpu,0);assert.equal(budget.total(),pool.snapshot().residentAllowanceBytes);
  assert.ok(pool.snapshot().created<=4);assert.equal(pool.snapshot().completed,40);
 }finally{peer.release();pool.dispose();}
 assert.equal(budget.total(),0);
});

test('idle native instances release real ownership under memory pressure and are recreated only for real work',async()=>{
 const budget=new Budget(1000),pool=new ElasticWorkerPool(budget,{maxWorkers:4,workerBytes:100,ioBytes:10,workerFactory:()=>new Worker()});
 const run=()=>pool.run(8,{prepare:async index=>({message:{index}}),consume:async()=>{}});
 try{
  await run();assert.equal(budget.total(),400);
  const other=budget.reserve(800);assert.equal(budget.total(),1000);assert.equal(pool.snapshot().reclaimed,2);
  other();await run();assert.equal(pool.snapshot().completed,16);assert.equal(pool.snapshot().residentWorkers,4);
 }finally{pool.dispose();}
 assert.equal(budget.total(),0);
});

test('preparation and output writes do not retain CPU admission',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),pool=new ElasticWorkerPool(budget,{maxWorkers:2,workerBytes:100,workerFactory:()=>new Worker()});
 let preparing=0,consumed=0,prepared;const both=new Promise(resolve=>{prepared=resolve;});let proceed;const gate=new Promise(resolve=>{proceed=resolve;});
 try{
  const pending=pool.run(2,{prepare:async index=>{if(++preparing===2)prepared();await gate;return {message:{index}};},consume:async()=>{assert.equal(scheduler.snapshot().labels.tiles.activeCpu,2-++consumed);}});
  await both;assert.equal(scheduler.snapshot().active.cpu,0);const other=await scheduler.acquire({cpu:2});other.release();proceed();await pending;
 }finally{pool.dispose();}
 assert.equal(budget.total(),0);
});

test('disposing while CPU admission is queued does not start a late worker job',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),peer=await scheduler.acquire({cpu:1});let calls=0;
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workerFactory:()=>({terminate(){},postMessage(){calls++;}})});
 const pending=pool.run(1,{prepare:async index=>({message:{index}}),consume:async()=>{}});
 await tick();pool.dispose();await assert.rejects(pending,{code:'CANCELLED'});peer.release();await tick();assert.equal(calls,0);assert.equal(budget.total(),0);
});

test('reservation split preserves ownership after its originating execution ends',async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget,{maxWorkers:1}),lease=await scheduler.acquire({bytes:80}),owned=lease.retainMemory(60);
 assert.equal(budget.total(),80);lease.release();assert.equal(budget.total(),60);owned();owned();assert.equal(budget.total(),0);
});

test('tight memory reuses one native worker instead of repeatedly evicting it for queued lanes',async()=>{
 const budget=new Budget(150),pool=new ElasticWorkerPool(budget,{maxWorkers:4,workerBytes:100,ioBytes:20,workerFactory:()=>new Worker()});
 try{
  await pool.run(20,{prepare:async index=>({message:{index}}),consume:async()=>{}});
  assert.equal(pool.snapshot().created,1);assert.equal(pool.snapshot().reclaimed,0);assert.equal(pool.snapshot().completed,20);
 }finally{pool.dispose();}
 assert.equal(budget.total(),0);
});

test('released peer memory starts additional useful lanes during the same preparation',async()=>{
 const budget=new Budget(500),peer=budget.reserve(380),pool=new ElasticWorkerPool(budget,{maxWorkers:4,workerBytes:100,ioBytes:20,workerFactory:()=>new Worker()}),widths=[];
 try{
  await pool.run(40,{prepare:async index=>({message:{index}}),consume:async index=>{if(index===3)peer();},onProgress:p=>widths.push(p.execution.peakComputing)});
  assert.equal(widths[0],1);assert.equal(Math.max(...widths),4);assert.equal(pool.snapshot().created,4);assert.equal(pool.snapshot().reclaimed,0);
 }finally{peer();pool.dispose();}
 assert.equal(budget.total(),0);
});

test('multiple failed tile computations reprepare detached inputs without repeating completed tiles',async()=>{
 const budget=new Budget(5000),workers=[],attempts=new Map(),prepared=new Map(),consumed=new Map(),outputs=[];
 const factory=()=>{const worker={dead:false,terminate(){this.dead=true;},postMessage(message,transfer){const data=structuredClone(message,{transfer});assert.equal(message.bytes.byteLength,0,'The failed attempt really detached its input');setImmediate(()=>{if(this.dead)return;const count=(attempts.get(data.index)??0)+1;attempts.set(data.index,count);if([1,4,9].includes(data.index)&&count<=2)this.onmessage({data:{error:{code:'MEMORY_ALLOCATION',name:'RangeError',message:'Array buffer allocation failed',details:{requestedBytes:100}}}});else this.onmessage({data:{result:{value:data.bytes[0],heapBytes:32}}});});}};workers.push(worker);return worker;};
 const pool=new ElasticWorkerPool(budget,{maxWorkers:4,workerBytes:100,ioBytes:20,workerFactory:factory});
 try{await pool.run(12,{prepare:async(index,{reserveInput})=>{prepared.set(index,(prepared.get(index)??0)+1);const release=reserveInput(1),bytes=new Uint8Array([index*3]);return {message:{index,bytes},transfer:[bytes.buffer],release};},consume:async(index,result)=>{consumed.set(index,(consumed.get(index)??0)+1);outputs[index]=result.value;}});assert.deepEqual(outputs,Array.from({length:12},(_,i)=>i*3));for(let i=0;i<12;i++){assert.equal(consumed.get(i),1);assert.equal(prepared.get(i),[1,4,9].includes(i)?3:1);}assert.equal(pool.snapshot().resourceRecoveries,6);assert.equal(pool.snapshot().completed,12);assert.equal(budget.recovering,false);assert.equal(pool.snapshot().maximum,4);}finally{pool.dispose();}assert.equal(budget.total(),0);assert.ok(workers.every(w=>w.dead));
});

test('idempotent partial publication retains its result and never repeats preparation or computation',async()=>{
 const budget=new Budget(2000),outputs=new Uint8Array(12),results=new Map(),attempts=new Map();let prepared=0,computed=0;
 const pool=new ElasticWorkerPool(budget,{maxWorkers:3,workerBytes:100,ioBytes:20,workerFactory:()=>({terminate(){},postMessage({index}){computed++;queueMicrotask(()=>this.onmessage({data:{result:{bytes:new Uint8Array([index,index+10]),heapBytes:32}}}));}})});
 try{await pool.run(6,{consumeIdempotent:true,prepare:async index=>{prepared++;return {message:{index}};},consume:async(index,result)=>{if(results.has(index))assert.equal(result,results.get(index),'Keep the exact computed result through publication retries');else results.set(index,result);const attempt=(attempts.get(index)??0)+1;attempts.set(index,attempt);outputs[index*2]=result.bytes[0];if([1,3].includes(index)&&attempt<=3)throw new RangeError('Array buffer allocation failed');outputs[index*2+1]=result.bytes[1];}});assert.equal(prepared,6);assert.equal(computed,6);assert.deepEqual([...outputs],[0,10,1,11,2,12,3,13,4,14,5,15]);assert.equal(pool.snapshot().resourceRecoveries,6);assert.equal(pool.snapshot().completed,6);assert.equal(budget.recovering,false);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('failed source preparation retries only its tile and keeps the healthy worker',async()=>{
 const budget=new Budget(1000),pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workerFactory:()=>new Worker()});let attempts=0,consumed=0;
 try{await pool.run(1,{prepare:async index=>{if(++attempts<3)throw new RangeError('Array buffer allocation failed');return {message:{index}};},consume:async()=>{consumed++;}});assert.equal(attempts,3);assert.equal(consumed,1);assert.equal(pool.snapshot().created,1);assert.equal(pool.snapshot().resourceRecoveries,2);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('a consumer without an idempotent contract is never replayed',async()=>{
 const budget=new Budget(1000),pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workerFactory:()=>new Worker()});let calls=0;
 try{await assert.rejects(pool.run(1,{prepare:async index=>({message:{index}}),consume:async()=>{calls++;throw new RangeError('Array buffer allocation failed');}}),{code:'MEMORY_ALLOCATION'});assert.equal(calls,1);assert.equal(pool.snapshot().resourceRecoveries,0);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('five comparable failures of one tile stop without resetting the guard after repeated preparation',async()=>{
 const budget=new Budget(1000);let calls=0,prepared=0;
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workerFactory:()=>({terminate(){},postMessage(){calls++;queueMicrotask(()=>this.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Array buffer allocation failed'}}}));}})});
 try{await assert.rejects(pool.run(1,{prepare:async()=>{prepared++;return {message:{}};},consume:async()=>assert.fail('Failed computation cannot publish')}),error=>error.details?.recovery?.loopDetected&&error.details.recovery.consecutiveFailures===5);assert.equal(calls,5);assert.equal(prepared,5);assert.equal(pool.snapshot().resourceRecoveries,4);assert.equal(budget.recovering,false);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('cancellation during local recovery releases its input scope, worker and pressure token',async()=>{
 const budget=new Budget(1000),stop=new AbortController();let entered;const recovering=new Promise(resolve=>{entered=resolve;}),unregister=budget.registerAsyncReclaimer(()=>{entered();stop.abort();});
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,ioBytes:20,workerFactory:()=>new Worker()});
 try{const pending=pool.run(1,{signal:stop.signal,consumeIdempotent:true,prepare:async(index,{reserveInput})=>({message:{index},release:reserveInput(10)}),consume:async()=>{throw new RangeError('Array buffer allocation failed');}});await recovering;await assert.rejects(pending,{code:'CANCELLED'});assert.equal(budget.recovering,false);assert.equal(pool.snapshot().computing,0);}finally{unregister();pool.dispose();}assert.equal(budget.total(),0);
});

test('reusable tile buffers remain charged across transfer ACK, publication retries and later tiles',async()=>{
 const budget=new Budget(1000),allocations=[];const Type=new Proxy(Uint8Array,{construct(target,args){if(typeof args[0]==='number')allocations.push(args[0]);return Reflect.construct(target,args);}});let computations=0,published=0,failed=false;const ids=[];
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,ioBytes:5,workBuffers:{rgb:{Type,length:64},output:{Type,length:16}},workerFactory:()=>({terminate(){},postMessage(message,transfer){computations++;const owned=structuredClone(message,{transfer});assert.equal(message.rgb.byteLength,0);owned.output.fill(owned.index);queueMicrotask(()=>this.onmessage({data:structuredClone({result:{rgb:owned.rgb,output:owned.output,heapBytes:16}},{transfer:[owned.rgb.buffer,owned.output.buffer]})}));}})});
 try{
  await pool.run(8,{consumeIdempotent:true,prepare:async(index,{buffers})=>{buffers.rgb.fill(index+7);return {message:{index,rgb:buffers.rgb,output:buffers.output},transfer:[buffers.rgb.buffer,buffers.output.buffer],ack:(result,{takeBackBuffer})=>{takeBackBuffer('rgb',result.rgb.buffer);takeBackBuffer('output',result.output.buffer);}};},consume:async(index,result)=>{assert.equal(result.rgb[0],index+7);assert.equal(result.output[0],index);assert.equal(budget.total(),185);assert.equal(await budget.reclaimAllocation(80,{kind:'array-buffer',owner:'peer'}),0,'In-flight publication pins its returned buffers');if(index===3&&!failed){failed=true;throw new RangeError('Array buffer allocation failed');}published++;},onProgress:event=>{if(event.phase==='tiles')ids.push(budget.resourceSnapshot({allocations:true}).allocations.filter(value=>value.kind==='array-buffer').map(value=>value.id));}});
  assert.deepEqual(allocations,[64,16]);assert.equal(computations,8);assert.equal(published,8);assert.equal(budget.total(),180);assert.equal(pool.snapshot().resourceRecoveries,1);
  for(const value of ids)assert.deepEqual(value,ids[0]);
  assert.equal(await budget.reclaimAllocation(80,{kind:'array-buffer',owner:'peer'}),80);assert.equal(budget.total(),100);
 }finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('tile recovery relays full refusal, reclaim and wait metadata and resumes committed indices only',async()=>{
 const budget=new Budget(1000),pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,ioBytes:20,workerFactory:()=>new Worker()}),events=[],prepared=[],committed=new Set([0,2]);let failing=true;
 try{await pool.run(4,{isCommitted:index=>committed.has(index),onCommitted:index=>committed.add(index),prepare:async index=>{prepared.push(index);if(failing){failing=false;throw Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:20}});}return {message:{index}};},consume:async()=>{},onProgress:event=>events.push(event)});assert.deepEqual(prepared,[1,1,3]);assert.deepEqual([...committed].sort(),[0,1,2,3]);const failure=events.find(event=>event.phase==='resource-recovery');assert.equal(failure.tile,1);assert.equal(failure.tileStage,'prepare');assert.ok(failure.resources);assert.equal(failure.recoveryStage,'operation');assert.ok(events.some(event=>event.phase==='resource-reclaimed'));assert.equal(events.at(-1).completed,4);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('a failing cleanup is secondary evidence and cannot replace the tile allocation cause',async()=>{
 const budget=new Budget(1024),events=[];let first=true,cleanup=true;
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:32,workerFactory:()=>({terminate(){},postMessage(){const error=first;first=false;queueMicrotask(()=>this.onmessage({data:error?{error:{code:'MEMORY_ALLOCATION',message:'original allocator refusal',details:{allocationKind:'array-buffer',requestedBytes:4}}}:{result:{heapBytes:16}}}));}})});
 try{await pool.run(1,{prepare:async()=>({message:{},release(){if(cleanup){cleanup=false;throw Error('secondary release failure');}}}),consume:async()=>{},onProgress:event=>events.push(event)});const recovery=events.find(event=>event.phase==='resource-recovery');assert.equal(recovery.error.message,'original allocator refusal');assert.equal(recovery.error.details.cleanupErrors[0].message,'secondary release failure');assert.equal(pool.metrics.completed,1);}finally{pool.dispose();}assert.equal(budget.total(),0);
});
