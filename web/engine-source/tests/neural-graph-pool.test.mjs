import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2,asset={url:'https://example.invalid/model',bytes:1024,sha256:'a'.repeat(64)},runtimes={wasm:{factoryUrl:'bounded',ortUrl:'ort',wasmUrl:'wasm'}};
const input={x:{data:new Float32Array([1]),dims:[1]}},options={backend:'cpu',workspaceBytes:MiB,outputBytes:4};
class Worker {
  constructor(action){this.action=action;this.terminated=false;}
  terminate(){this.terminated=true;}
  postMessage(job){
    if(job.command==='execute'){this.executing=true;queueMicrotask(()=>{if(!this.terminated){this.action(this,this.job);if(this.resultPending)this.result();}});return;}
    this.job=job;this.executing=false;queueMicrotask(()=>{if(!this.terminated)this.onmessage({data:{executionReady:true,initializationMs:10}});});
  }
  result(){if(!this.executing){this.resultPending=true;return;}this.resultPending=false;this.onmessage({data:{heapBytes:16*MiB,result:{y:{data:new Float32Array([2]),dims:[1],type:'float32'}},provider:this.job.provider}});}
}
test('Queued abort leaves active worker intact; output lease and dispose release separately',async()=>{
  const budget=new Budget(256*MiB),workers=[];
  const pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>{const w=new Worker(()=>{});workers.push(w);return w;}});
  const first=pool.run('a',input,options),abort=new AbortController(),second=pool.run('a',input,{...options,signal:abort.signal});
  abort.abort();await assert.rejects(second,e=>e.code==='CANCELLED');assert.equal(workers.length,1);assert.equal(workers[0].terminated,false);
  workers[0].result();const result=await first;
  assert.equal(result.metrics.preflightExecutions,0);pool.dispose();assert.equal(budget.retained,0);assert.ok(budget.active>0);
  result.release();result.release();assert.equal(budget.active,0);
});
test('Useful allocation failure admits a larger real heap once, without a calibration job',async()=>{
  const budget=new Budget(512*MiB),caps=[];
  const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes,workerFactory:()=>new Worker((w,job)=>{
    caps.push(job.memoryMaximumBytes);if(caps.length===1)w.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'allocation failed',details:{allocationKind:'wasm',nativeHeapExhausted:true}}}});else w.result();
  })});
  const result=await pool.run('a',input,options);assert.equal(caps.length,2);assert.ok(caps[1]>caps[0]);assert.equal(result.metrics.preflightExecutions,0);result.release();pool.dispose();assert.equal(budget.total(),0);
});
test('Admission refusal and identity failure leave no active reservations',async()=>{
  const budget=new Budget(20*MiB),pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>{throw Error('must not spawn');}});
  await assert.rejects(pool.run('a',input,options),e=>e.code==='MEMORY_LIMIT');assert.equal(budget.total(),0);pool.dispose();
  const otherBudget=new Budget(128*MiB),other=new NeuralGraphPool(otherBudget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>new Worker(w=>w.onmessage({data:{error:{code:'MODEL_IDENTITY',message:'bad SHA'}}}))});
  await assert.rejects(other.run('a',input,options),e=>e.code==='MODEL_IDENTITY');other.dispose();assert.equal(otherBudget.total(),0);
});

test('Auto uses CPU when GPU residency cannot fit, without disabling later GPU work',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(104*MiB),providers=[],pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes:{...runtimes,webgpu:runtimes.wasm},workerFactory:()=>new Worker((w,job)=>{providers.push(job.provider);w.result();})});
 try{
  const r=await pool.run('a',input,{...options,backend:'auto',workspaceBytes:24*MiB});assert.equal(r.metrics.provider,'wasm');assert.equal(r.metrics.retry.from,'webgpu');r.release();
  const next=await pool.run('a',input,{...options,backend:'auto'});assert.equal(next.metrics.provider,'webgpu');next.release();assert.deepEqual(providers,['wasm','webgpu']);
  await assert.rejects(pool.run('a',input,{...options,backend:'webgpu',workspaceBytes:24*MiB}),{code:'MEMORY_LIMIT'});
 }finally{pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);
});
test('Immutable input reuse avoids retransmission and keeps its residency charged',async()=>{
 const budget=new Budget(256*MiB),messages=[],pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>new Worker((w,job)=>{messages.push(job);w.result();})}),feeds={...input,bank:{data:new Float32Array(65536),dims:[65536]}};
 for(const key of ['bank1','bank1','bank2']){const r=await pool.run('a',feeds,{...options,reusableInputs:{bank:key}});assert.equal(r.metrics.reusedInputBytes,key==='bank1'&&messages.length===2?262144:0);r.release();}
 assert.ok(messages[0].inputs.bank);assert.equal(messages[1].inputs.bank,undefined);assert.ok(messages[2].inputs.bank);assert.ok(pool.slots[0].bytes>=pool.slots[0].cap+feeds.bank.data.byteLength);pool.dispose();assert.equal(budget.total(),0);
});

const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('Separate neural pools initialize together but share a single admitted GPU execution',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(512*MiB),workers=[],pools=Array.from({length:2},()=>new NeuralGraphPool(budget,{maxWorkers:4},{assets:{a:asset},runtimes:{...runtimes,webgpu:runtimes.wasm},workerFactory:()=>{const worker=new Worker(()=>{});workers.push(worker);return worker;}}));
 try{
  const first=pools[0].run('a',input,{...options,backend:'webgpu'}),second=pools[1].run('a',input,{...options,backend:'webgpu'});
  await turn();assert.equal(workers.length,2);assert.equal(workers[0].executing,true);assert.equal(workers[1].executing,false);
  const scheduler=getExecutionScheduler(budget);assert.equal(scheduler.snapshot().active.gpu,1);assert.equal(scheduler.snapshot().queued,1);
  workers[0].result();const a=await first;a.release();await turn();assert.equal(workers[1].executing,true);
  workers[1].result();const b=await second;assert.equal(budget.active,4,'completed result only retains its own output bytes');b.release();
  assert.equal(scheduler.snapshot().peakGpu,1);assert.equal(scheduler.snapshot().running,0);
 }finally{for(const pool of pools)pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);
});

test('Cancelling after initialization removes the pending execution without touching another pool',async()=>{
 const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),held=await scheduler.acquire({cpu:1}),workers=[];
 const pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>{const worker=new Worker(()=>{});workers.push(worker);return worker;}}),controller=new AbortController();
 const pending=pool.run('a',input,{...options,signal:controller.signal});await turn();assert.equal(scheduler.snapshot().queued,1);
 controller.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(workers[0].terminated,true);assert.equal(scheduler.snapshot().queued,0);assert.equal(scheduler.snapshot().running,1);
 held.release();pool.dispose();assert.equal(budget.total(),0);
});

test('Idle reclamation drops only enough inexpensive model residency for the requested allocation',async()=>{
 const budget=new Budget(512*MiB),pool=new NeuralGraphPool(budget,{maxWorkers:3},{assets:{a:asset,b:asset,c:asset},runtimes,workerFactory:()=>new Worker(w=>w.result())});
 for(const name of ['a','b','c']){const result=await pool.run(name,input,options);result.release();}
 pool.slots.find(slot=>slot.name==='a').initializationMs=1000;
 pool.slots.find(slot=>slot.name==='b').initializationMs=1;
 pool.slots.find(slot=>slot.name==='c').initializationMs=100;
 const release=budget.reserve(budget.limit-budget.total()+1);
 assert.deepEqual(pool.slots.map(slot=>slot.name),['a','c']);assert.ok(budget.total()<=budget.limit);
 release();pool.dispose();assert.equal(budget.total(),0);
});

test('GPU failure releases its execution lease before the useful CPU retry',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(512*MiB),providers=[],pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes:{...runtimes,webgpu:runtimes.wasm},workerFactory:()=>new Worker((worker,job)=>{
  providers.push(job.provider);if(job.provider==='webgpu')worker.onmessage({data:{error:{code:'NEURAL_EXECUTION',message:'device lost'}}});else worker.result();
 })});
 try{const result=await pool.run('a',input,{...options,backend:'auto'});result.release();assert.deepEqual(providers,['webgpu','wasm']);assert.equal(getExecutionScheduler(budget).snapshot().running,0);}
 finally{pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);
});

test('ORT CPU width follows shared capacity between useful jobs without multiplying worker teams',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'crossOriginIsolated',descriptor);else delete globalThis.crossOriginIsolated;});
 const budget=new Budget(512*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),held=await scheduler.acquire({cpu:3}),workers=[],messages=[];
 const pool=new NeuralGraphPool(budget,{maxWorkers:4},{assets:{a:asset},runtimes,workerFactory:()=>{const worker=new Worker((w,job)=>{messages.push(job);assert.equal(scheduler.snapshot().active.cpu,4);w.result();});workers.push(worker);return worker;}});
 const reusable={bank:{data:new Float32Array(16),dims:[16]}},settings={...options,reusableInputs:{bank:'same'}};
 try{
  const first=await pool.run('a',{...input,...reusable},settings);assert.equal(first.metrics.threads,1);first.release();held.release();
  const next=await pool.run('a',{...input,...reusable},settings);assert.equal(next.metrics.threads,4);assert.equal(next.metrics.threadReconfigured,true);assert.equal(next.metrics.reusedInputBytes,0);assert.ok(messages[1].inputs.bank);next.release();
  const final=await pool.run('a',{...input,...reusable},settings);assert.equal(final.metrics.threads,4);assert.equal(final.metrics.threadReconfigured,false);assert.equal(final.metrics.reusedInputBytes,64);final.release();assert.equal(workers.length,2);assert.equal(workers[0].terminated,true);
 }finally{held.release();pool.dispose();}
 assert.equal(scheduler.snapshot().running,0);assert.equal(budget.total(),0);
});

test('GPU inference proceeds while all CPU slots are occupied and retains no CPU slot',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(256*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),held=await scheduler.acquire({cpu:2});
 const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes:{webgpu:{...runtimes.wasm,executor:'noiseprint-plus'}},workerFactory:()=>new Worker(w=>{assert.deepEqual(scheduler.snapshot().active,{cpu:2,gpu:1});w.result();})});
 try{const result=await pool.run('a',input,{...options,backend:'webgpu'});assert.equal(result.metrics.cpuGranted,0);assert.equal(result.metrics.gpuGranted,1);result.release();}
 finally{held.release();pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);
});

test('Hybrid CFA exchanges its GPU admission for CPU work and returns the CPU slot before GPU wait',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(256*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2});let stage=0;
 class Hybrid extends Worker{
  postMessage(job){
   if(job.command==='resource-ready'){
    queueMicrotask(()=>{if(stage===1){assert.deepEqual(scheduler.snapshot().active,{cpu:1,gpu:0});this.onmessage({data:{releaseExecution:true}});stage=2;this.onmessage({data:{executionResource:'gpu'}});}
     else{assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:1});this.result();}});return;
   }super.postMessage(job);
  }
 }
 const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes:{webgpu:{...runtimes.wasm,executor:'cfa'}},workerFactory:()=>new Hybrid(w=>{stage=1;w.onmessage({data:{executionResource:'cpu'}});})});
 try{const result=await pool.run('a',input,{...options,backend:'webgpu'});assert.equal(stage,2);result.release();}
 finally{pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(scheduler.snapshot().running,0);assert.equal(budget.total(),0);
});


test('Opaque ORT WebGPU retains one CPU admission for possible WASM fallback operators',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(256*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:2});
 const pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes:{webgpu:runtimes.wasm},workerFactory:()=>new Worker(w=>{assert.deepEqual(scheduler.snapshot().active,{cpu:1,gpu:1});w.result();})});
 try{const result=await pool.run('a',input,{...options,backend:'webgpu'});assert.equal(result.metrics.cpuGranted,1);result.release();}
 finally{pool.dispose();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);
});

for(const allocationKind of ['array-buffer','gpu',undefined])test('a '+(allocationKind??'unqualified')+' refusal never grows an unrelated neural heap',async()=>{
 const budget=new Budget(512*MiB),caps=[],pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes,workerFactory:()=>new Worker((w,job)=>{caps.push(job.memoryMaximumBytes);w.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Original failed allocation',details:{allocationKind,requestedBytes:4096},cause:{name:'RangeError',message:'Array buffer allocation failed'}}}});})});
 try{await assert.rejects(pool.run('a',input,options),e=>e.code==='MEMORY_ALLOCATION'&&e.details.requestedBytes===4096&&e.cause.message==='Array buffer allocation failed');assert.equal(caps.length,1);}finally{pool.dispose();}assert.equal(budget.total(),0);
});

test('idle neural heap reclamation reports actual Wasm retirement and keeps the returned output owned',async()=>{
 const budget=new Budget(256*MiB),pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{a:asset},runtimes,workerFactory:()=>new Worker(w=>w.result())});
 const result=await pool.run('a',input,options);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,16*MiB);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,4);
 assert.equal(await budget.reclaimAllocation(4,{kind:'wasm'}),16*MiB);assert.equal(pool.slots.length,0);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,0);assert.deepEqual([...result.result.y.data],[2]);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,4);
 result.release();pool.dispose();assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});

test('a retry child inherits its parent admission priority and retires actual custom GPU buffers',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
 const budget=new Budget(256*MiB),parent=budget.beginOperation({owner:'automatic',id:'prepare'}),pressure=budget.beginRecovery({kind:'gpu',operation:parent,requestedBytes:4096}),pool=new NeuralGraphPool(budget,{maxWorkers:2},{assets:{a:asset},runtimes:{webgpu:{...runtimes.wasm,executor:'noiseprint-plus'}},workerFactory:()=>new Worker(w=>w.onmessage({data:{heapBytes:16*MiB,gpuBytes:8192,result:{y:{data:Float32Array.of(2),dims:[1]}}}}))});
 try{const result=await pool.run('a',input,{...options,backend:'webgpu',resourceOperation:parent});assert.equal(budget.resourceSnapshot().domains.gpu.materializedBytes,8192);assert.equal(await budget.reclaimAllocation(1,{kind:'gpu',operation:parent}),8192);assert.equal(budget.resourceSnapshot().domains.gpu.backings,0);assert.deepEqual([...result.result.y.data],[2]);result.release();}
 finally{pool.dispose();pressure();parent.release();if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});
