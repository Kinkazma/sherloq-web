import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {ElasticWorkerPool} from '../src/elastic-worker-pool.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {runParallelDenseField} from '../src/dense-field-parallel.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {SiftPool} from '../src/sift-paged.js';
const faults=['null','messageerror','unexpected'];
function emitFault(worker,fault){if(fault==='messageerror')worker.onmessageerror({});else worker.onmessage({data:fault==='null'?null:{unexpected:true}});}
for(const fault of faults)test('elastic '+fault+' retires only the bad lane and preserves committed tiles',{timeout:3000},async()=>{
 const budget=new Budget(2000),outputs=[],prepared=new Map(),attempts=new Map(),workers=[];let reclaims=0;budget.reclaim=budget.reclaimAllocation=async()=>{reclaims++;throw Error('Transport failure must not reclaim another owner');};
 const pool=new ElasticWorkerPool(budget,{maxWorkers:3,workerBytes:100,workerFactory:()=>{const worker={dead:false,terminate(){this.dead=true;},postMessage(message,transfer){const data=structuredClone(message,{transfer});queueMicrotask(()=>{if(this.dead)return;const attempt=(attempts.get(data.index)??0)+1;attempts.set(data.index,attempt);if(data.index===2&&attempt<3)emitFault(this,fault);else this.onmessage({data:{result:{value:data.bytes[0],heapBytes:32}}});});}};workers.push(worker);return worker;}});
 try{await pool.run(7,{prepare:async index=>{prepared.set(index,(prepared.get(index)??0)+1);const bytes=Uint8Array.of(index);return {message:{index,bytes},transfer:[bytes.buffer]};},consume:async(index,result)=>{assert.equal(outputs[index],undefined);outputs[index]=result.value;}});assert.deepEqual(outputs,[0,1,2,3,4,5,6]);assert.equal(prepared.get(2),3);for(const i of [0,1,3,4,5,6])assert.equal(prepared.get(i),1);assert.equal(pool.maximum,3);assert.equal(reclaims,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);}finally{pool.dispose();}assert.equal(budget.total(),0);assert.ok(workers.every(worker=>worker.dead));
});
test('five unreadable messages stop one elastic tile without holding CPU or replaying peers',{timeout:3000},async()=>{
 const budget=new Budget(1000);let calls=0;const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:100,workerFactory:()=>({terminate(){},postMessage(){calls++;queueMicrotask(()=>this.onmessage({data:null}));}})});
 try{await assert.rejects(pool.run(1,{prepare:async()=>({message:{}}),consume:async()=>assert.fail('Unreadable result')}),error=>error.code==='WORKER_MESSAGE_FAILED'&&error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);assert.equal(calls,5);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);}finally{pool.dispose();}assert.equal(budget.total(),0);
});
for(const fault of faults)for(const phase of ['bootstrap','compute'])test('dense kernel '+fault+' during '+phase+' terminates pending native commands',{timeout:3000},async()=>{
 const budget=new Budget(1000),workers=[],values=Array(23).fill(0);values[0]=8;values[1]=4;values[6]=1;values[12]=1;values[21]=32;
 const factory=()=>{const worker={terminate(){this.dead=true;},postMessage(message){queueMicrotask(()=>{if(message.stores){if(phase==='bootstrap')emitFault(this,fault);else this.onmessage({data:{ready:true}});}else if(message.task)emitFault(this,fault);});}};workers.push(worker);return worker;};
 await assert.rejects(runParallelDenseField({values,stores:Array(19).fill(null),budget,kernelBytes:100,initialWorkers:1,maximum:1,cachePages:1,bootBytes:0,workerFactory:factory}),{code:'WORKER_MESSAGE_FAILED'});assert.ok(workers.every(worker=>worker.dead));assert.equal(budget.total(),0);
});
for(const fault of faults)test('dense field '+fault+' returns its parent CPU and storage ownership',{timeout:3000},async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;const budget=new Budget(80*1024**2),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});let dead=false;
 const pool=new DensePagedFieldPool(budget,{maxWorkers:1,workerFactory:()=>({terminate(){dead=true;},postMessage(message){if(message.input)queueMicrotask(()=>emitFault(this,fault));}})});
 try{await assert.rejects(pool.start({first,mask,width:10,height:10},{storage:'memory'}),{code:'WORKER_MESSAGE_FAILED'});assert.equal(dead,true);assert.equal(pool.active.size,0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);assert.equal(budget.resourceSnapshot().operations.length,0);}finally{await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

function siftFixture(fault,{always=false}={}){
 const budget=new Budget(10000),owner={budget,profile:{maxWorkers:3},workers:new Set()},attempts=new Map(),prepared=new Map(),workers=[];let reclaims=0;
 budget.reclaimAllocation=async(bytes,{kind})=>{assert.equal(kind,'array-buffer');reclaims++;return bytes;};budget.reclaim=async()=>{throw Error('Unexpected ordinary reclaim');};
 const savedWorker=globalThis.Worker;globalThis.Worker=class{constructor(){workers.push(this);}terminate(){this.dead=true;}postMessage(message,transfer){const data=structuredClone(message,{transfer});queueMicrotask(()=>{if(this.dead)return;if(data.kind==='init'){this.onmessage({data:{ready:true}});return;}const attempt=(attempts.get(data.index)??0)+1;attempts.set(data.index,attempt);if(data.index===2&&(always||attempt<3)){if(fault==='allocation')this.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Array buffer allocation failed',details:{allocationKind:'array-buffer',requestedBytes:128},cause:{code:'INTERNAL',name:'RangeError',message:'original allocation'}}}});else emitFault(this,fault);}else this.onmessage({data:{base:data.input,heapBytes:64}});});}};
 const pool=new SiftPool(owner,{budget,heap:64,cost:()=>100,provider:'cpu',backend:'auto',wasm:new Uint8Array(),layers:3,contrast:.04});
 return {budget,pool,workers,attempts,prepared,get reclaims(){return reclaims;},make:async index=>{prepared.set(index,(prepared.get(index)??0)+1);return {kind:'prepare',index,input:Uint8Array.of(index)};},dispose(){pool.close();globalThis.Worker=savedWorker;assert.equal(budget.total(),0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);}};
}
for(const fault of [...faults,'allocation'])test('SIFT '+fault+' retries only detached input tile at unchanged width',{timeout:3000},async()=>{
 const f=siftFixture(fault),outputs=[];try{await f.pool.open(3);await f.pool.run([0,1,2,3,4,5,6],f.make,async(result,index)=>{assert.equal(outputs[index],undefined);outputs[index]=result.base[0];});assert.deepEqual(outputs,[0,1,2,3,4,5,6]);assert.equal(f.prepared.get(2),3);for(const i of [0,1,3,4,5,6])assert.equal(f.prepared.get(i),1);assert.equal(f.pool.records.length,3);assert.ok(f.pool.records.every(record=>record.heap===64&&record.provider==='cpu'));assert.equal(f.reclaims,fault==='allocation'?2:0);}finally{f.dispose();}assert.ok(f.workers.every(worker=>worker.dead));
});
test('SIFT transport guard terminates after five unreadable replies without global replay',{timeout:3000},async()=>{
 const f=siftFixture('null',{always:true}),completed=[];try{await f.pool.open(3);await assert.rejects(f.pool.run([0,1,2,3,4],f.make,async(result,index)=>completed.push(index)),error=>error.code==='WORKER_MESSAGE_FAILED'&&error.details.recovery.consecutiveFailures===5&&error.details.recovery.loopDetected);assert.equal(f.attempts.get(2),5);assert.ok(completed.includes(0)&&completed.includes(1));assert.equal(f.reclaims,0);}finally{f.dispose();}
});

for(const mode of ['unavailable','lost','numeric'])test('SIFT '+mode+' distinguishes local GPU fallback from numerical failure',{timeout:3000},async()=>{
 const budget=new Budget(10000),owner={budget,profile:{maxWorkers:1},workers:new Set()},savedWorker=globalThis.Worker,providers=[];let provider;
 globalThis.Worker=class{terminate(){}postMessage(message){queueMicrotask(()=>{if(message.kind==='init'){provider=message.provider;providers.push(provider);if(mode==='unavailable'&&provider==='webgpu'){this.onmessage({data:{error:{code:'FEATURE_EXTRACTION_FAILED',message:'WebGPU unavailable'}}});return;}this.onmessage({data:{ready:true}});}else if(mode==='numeric')this.onmessage({data:{error:{code:'FEATURE_EXTRACTION_FAILED',message:'memory access out of bounds'}}});else if(mode==='lost'&&provider==='webgpu')this.onmessage({data:{error:{code:'FEATURE_EXTRACTION_FAILED',message:'WebGPU device lost: test'}}});else this.onmessage({data:{base:Uint8Array.of(9),heapBytes:64}});});}};
 const pool=new SiftPool(owner,{budget,heap:64,cost:()=>100,provider:'webgpu',backend:'auto',wasm:new Uint8Array(),layers:3,contrast:.04});let consumed=0;
 try{await pool.open(1);const run=pool.run([0],async()=>({kind:'prepare',input:Uint8Array.of(9)}),async result=>{assert.equal(result.base[0],9);consumed++;});if(mode==='numeric'){await assert.rejects(run,{code:'FEATURE_EXTRACTION_FAILED'});assert.equal(consumed,0);assert.deepEqual(providers,['webgpu']);}else{await run;assert.equal(consumed,1);assert.deepEqual(providers,['webgpu','cpu']);assert.equal(pool.records.length,1);}}
 finally{pool.close();globalThis.Worker=savedWorker;}assert.equal(budget.total(),0);assert.deepEqual(getExecutionScheduler(budget).snapshot().active,{cpu:0,gpu:0});
});
test('SIFT cancellation during a broken lane retry settles admission and retains committed output',{timeout:3000},async()=>{
 const budget=new Budget(1000),owner={budget,profile:{maxWorkers:1},workers:new Set()},savedWorker=globalThis.Worker,stop=new AbortController();let consumed=0;
 globalThis.Worker=class{terminate(){}postMessage(message){queueMicrotask(()=>{if(message.kind==='init')this.onmessage({data:{ready:true}});else{this.onmessage({data:null});stop.abort();}});}};
 const pool=new SiftPool(owner,{budget,heap:64,cost:()=>100,provider:'cpu',backend:'cpu',signal:stop.signal,wasm:new Uint8Array(),layers:3,contrast:.04});
 try{await pool.open(1);await assert.rejects(pool.run([0],async()=>({kind:'prepare',input:Uint8Array.of(0)}),async()=>consumed++),{code:'CANCELLED'});assert.equal(consumed,0);}finally{pool.close();globalThis.Worker=savedWorker;}assert.equal(budget.total(),0);assert.equal(getExecutionScheduler(budget).snapshot().active.cpu,0);
});
