import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {resourceAllocationKind} from '../src/errors.js';
const MiB=1024**2,turn=()=>new Promise(resolve=>setImmediate(resolve));
const asset={url:'https://example.invalid/model',bytes:1024,sha256:'a'.repeat(64)},runtime={factoryUrl:'bounded',ortUrl:'ort',wasmUrl:'wasm'};
const inputs={x:{data:Float32Array.of(1),dims:[1]}},options={backend:'cpu',workspaceBytes:MiB,outputBytes:4};
class Worker{
 constructor(){this.messages=[];}
 terminate(){this.dead=true;}
 postMessage(job){this.messages.push(job);}
 emit(data){this.onmessage?.({data});}
 ready(){this.emit({executionReady:true});}
 result(){this.emit({heapBytes:16*MiB,result:{y:{data:Float32Array.of(2),dims:[1],type:'float32'}}});}
}
function fixture(maxWorkers=2){
 const budget=new Budget(512*MiB),workers=[],pool=new NeuralGraphPool(budget,{maxWorkers},{assets:{a:asset},runtimes:{wasm:runtime,webgpu:runtime},workerFactory:()=>{const worker=new Worker();workers.push(worker);return worker;}});
 return {budget,workers,pool,scheduler:getExecutionScheduler(budget),assertEmpty(){assert.equal(budget.total(),0);assert.equal(this.scheduler.snapshot().running,0);assert.equal(this.scheduler.snapshot().queued,0);assert.equal(budget.resourceSnapshot().operations.length,0);}};
}
function fault(worker,kind){if(kind==='messageerror')worker.onmessageerror({});else worker.onmessage({data:kind==='null'?null:{unexpected:true}});}
for(const kind of ['null','messageerror','unexpected'])for(const phase of ['initialization','compute'])test('neural '+kind+' during '+phase+' settles all ownership and allows a fresh worker',{timeout:2000},async()=>{
 const f=fixture();try{
  const pending=f.pool.run('a',inputs,options);await turn();const worker=f.workers[0];if(phase==='compute'){worker.ready();await turn();assert.equal(worker.messages.at(-1).command,'execute');}
  const rejected=assert.rejects(pending,error=>error.code==='WORKER_MESSAGE_FAILED'&&resourceAllocationKind(error)===null);fault(worker,kind);await rejected;
  assert.equal(worker.dead,true);assert.equal(worker.onmessage,null);assert.equal(worker.onmessageerror,null);f.assertEmpty();assert.equal(f.pool.cpuOnly,false);
  const resumed=f.pool.run('a',inputs,options);await turn();f.workers[1].ready();await turn();f.workers[1].result();const output=await resumed;assert.deepEqual([...output.result.y.data],[2]);output.release();
 }finally{f.pool.dispose();}f.assertEmpty();
});
test('neural deserialization failure removes its queued GPU admission without touching a peer',{timeout:2000},async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});const f=fixture(),peer=await f.scheduler.acquire({cpu:0,gpu:1});
 try{const pending=f.pool.run('a',inputs,{...options,backend:'webgpu'});await turn();f.workers[0].ready();await turn();assert.equal(f.scheduler.snapshot().queued,1);const rejected=assert.rejects(pending,{code:'WORKER_MESSAGE_FAILED'});fault(f.workers[0],'messageerror');await rejected;assert.equal(f.scheduler.snapshot().queued,0);assert.equal(f.scheduler.snapshot().running,1);assert.equal(f.scheduler.snapshot().active.gpu,1);assert.equal(f.budget.total(),0);assert.equal(f.budget.resourceSnapshot().operations.length,0);}
 finally{peer.release();f.pool.dispose();if(old)Object.defineProperty(globalThis.navigator,'gpu',old);else delete globalThis.navigator.gpu;}f.assertEmpty();
});
test('neural cancellation drains its active lease and ignores queued late messages',{timeout:2000},async()=>{
 const f=fixture(),controller=new AbortController();try{const pending=f.pool.run('a',inputs,{...options,signal:controller.signal});await turn();f.workers[0].ready();await turn();const late=f.workers[0].onmessage,rejected=assert.rejects(pending,{code:'CANCELLED'});controller.abort();await rejected;late({data:{executionReady:true}});await turn();assert.equal(f.workers[0].dead,true);f.assertEmpty();}finally{f.pool.dispose();}
});
test('neural transport failure retires only its worker while a companion publishes its result',{timeout:2000},async()=>{
 const f=fixture();try{const first=f.pool.run('a',inputs,options),second=f.pool.run('a',inputs,options);await turn();for(const worker of f.workers)worker.ready();await turn();const rejected=assert.rejects(first,{code:'WORKER_MESSAGE_FAILED'});fault(f.workers[0],'null');await rejected;assert.equal(f.scheduler.snapshot().active.cpu,1);assert.equal(f.workers[1].dead,undefined);f.workers[1].result();const output=await second;assert.deepEqual([...output.result.y.data],[2]);output.release();assert.equal(f.scheduler.snapshot().running,0);}finally{f.pool.dispose();}f.assertEmpty();
});
test('neural serialized compute errors retain their cause instead of becoming transport errors',{timeout:2000},async()=>{
 const f=fixture();try{const pending=f.pool.run('a',inputs,options);await turn();f.workers[0].emit({error:{code:'MODEL_IDENTITY',message:'bad digest',details:{expected:'a'},cause:{code:'INTERNAL',message:'original digest'}}});await assert.rejects(pending,error=>error.code==='MODEL_IDENTITY'&&error.details.expected==='a'&&error.cause.message==='original digest');f.assertEmpty();}finally{f.pool.dispose();}
});
for(const kind of ['null','messageerror','unexpected','execute'])test('neural endpoint reports '+kind+' rather than leaving its parent pending',{timeout:2000},async()=>{
 const old=globalThis.self,messages=[],endpoint={postMessage(data){messages.push(data);}};globalThis.self=endpoint;
 try{await import('../src/neural-graph-worker.js?protocol='+kind);if(kind==='execute')endpoint.onmessage({data:{command:'execute'}});else fault(endpoint,kind);await turn();assert.equal(messages.length,1);assert.equal(messages[0].error.code,'WORKER_MESSAGE_FAILED');assert.ok(messages[0].error.details.transport);endpoint.onmessage({data:{}});await turn();assert.equal(messages.length,1);}finally{globalThis.self=old;}
});
