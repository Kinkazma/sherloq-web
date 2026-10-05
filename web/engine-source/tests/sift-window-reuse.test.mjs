import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SiftPool} from '../src/sift-paged.js';
import {EngineError,serializeEngineError} from '../src/errors.js';
import {siftReplyWithInput} from '../src/sift-input-transport.js';

function fixture(t,{signal,handle,transformReply,onEvent,events=[],budgetBytes=2048,heap=64,cost=320,inputBytes=128}={}){
 const saved=globalThis.Worker,budget=new Budget(budgetBytes),owners=[],snapshots=[],stats={created:0,terminated:0,tasks:0},register=budget.registerBacking.bind(budget);
 budget.registerBacking=(kind,bytes,options)=>{const release=register(kind,bytes,options);if(options?.label==='sift-input-window')owners.push({id:release.id,bytes});return release;};
 globalThis.Worker=class{
  constructor(){this.alive=true;stats.created++;}
  terminate(){if(this.alive){this.alive=false;stats.terminated++;}}
  postMessage(value,transfer=[]){const message=structuredClone(value,{transfer});queueMicrotask(async()=>{if(!this.alive)return;
   if(message.kind==='init'){this.onmessage?.({data:{ready:true}});return;}
   stats.tasks++;snapshots.push(budget.resourceSnapshot({allocations:true}));
   const normal=()=>({base:message.input.slice(),heapBytes:32});
   const result=handle?await handle(message,{normal,stats,worker:this}):normal();if(!this.alive)return;
   if(result===null){this.onmessage?.({data:null});return;}
   const packet=siftReplyWithInput(message,result),returned=structuredClone(packet.message,{transfer:packet.transfer});message.input=null;this.onmessage?.({data:transformReply?transformReply(returned):returned});
  });}
 };
 const owner={profile:{maxWorkers:1},workers:new Set()},pool=new SiftPool(owner,{budget,heap,cost:()=>cost,inputBytes,provider:'cpu',backend:'cpu',wasm:new Uint8Array(),layers:3,contrast:.04,signal,onProgress:e=>{events.push(e);onEvent?.(e);}});
 t.after(()=>{pool.close();globalThis.Worker=saved;assert.equal(budget.total(),0);for(const domain of Object.values(budget.resourceSnapshot().domains))assert.equal(domain.reservedBytes,0);assert.equal(budget.resourceSnapshot().operations.length,0);});
 return {budget,pool,owners,snapshots,stats,events};
}
const make=(job,{allocateInput})=>{const input=allocateInput(Float32Array,job.length);for(let i=0;i<input.length;i++)input[i]=job.id+i/4;return {kind:'prepare',input};};

test('SIFT reuses returned windows, grows only when necessary, and never double charges its phase',async t=>{
 const {budget,pool,owners,snapshots,stats}=fixture(t),jobs=[16,8,32,12].map((length,id)=>({length,id})),outputs=[];
 await pool.open(1);await pool.run(jobs,make,async(result,job)=>{assert.equal('returnedInput' in result,false);outputs.push([...result.base]);assert.ok(budget.total()<=320);});
 for(const [index,job]of jobs.entries())assert.deepEqual(outputs[index],Array.from({length:job.length},(_,i)=>job.id+i/4));
 assert.deepEqual(owners.map(v=>v.bytes),[64,128]);assert.equal(stats.created,1);assert.equal(stats.tasks,4);
 const banks=snapshots.map(s=>s.allocations.filter(a=>a.label==='sift-input-window'));assert.deepEqual(banks.map(x=>x.length),[1,1,1,1]);assert.equal(banks[0][0].id,banks[1][0].id);assert.equal(banks[2][0].id,banks[3][0].id);assert.ok(banks.every(x=>x[0].pins===1));
 assert.equal(budget.total(),64+128,'Only the worker and reusable extent remain between tasks');assert.equal(pool.records[0].inputWindow.busy,false);
 await budget.reclaimAllocation(1,{kind:'array-buffer',owner:'other'});assert.equal(pool.records[0].inputWindow.byteLength,0);assert.equal(budget.total(),64);
});

test('SIFT returns a failed worker input before retry and retains already published tiles',async t=>{
 let failed=false;const {pool,owners,stats}=fixture(t,{handle:(message,{normal})=>{if(message.input[0]===1&&!failed){failed=true;return {error:serializeEngineError(new EngineError('MEMORY_ALLOCATION','Array buffer allocation failed',{details:{allocationKind:'array-buffer',requestedBytes:64}}))};}return normal();}}),output=[];
 await pool.open(1);await pool.run([0,1,2].map(id=>({id,length:16})),make,async(result,job)=>output.push([job.id,...result.base]));
 assert.deepEqual(output.map(row=>row[0]),[0,1,2]);assert.equal(stats.tasks,4);assert.ok(owners.length>=1);assert.equal(pool.metrics.retries,1);assert.equal(pool.records[0].inputInFlight,false);
});

test('SIFT lost transport retires its inaccessible input and restarts only the failed tile',async t=>{
 let failed=false;const {pool,owners,stats}=fixture(t,{handle:(message,{normal})=>{if(message.input[0]===1&&!failed){failed=true;return null;}return normal();}}),output=[];
 await pool.open(1);await pool.run([0,1,2].map(id=>({id,length:16})),make,async(_,job)=>output.push(job.id));
 assert.deepEqual(output,[0,1,2]);assert.equal(stats.tasks,4);assert.equal(stats.created,2);assert.equal(owners.length,2);assert.equal(pool.metrics.retries,1);
});

test('SIFT cancellation settles a transferred input before pool disposal returns its credit',async t=>{
 const controller=new AbortController();let entered;const started=new Promise(r=>{entered=r;});const {pool,budget,stats}=fixture(t,{signal:controller.signal,handle:()=>{entered();return new Promise(()=>{});}});
 await pool.open(1);const work=pool.run([{id:0,length:16}],make,async()=>assert.fail('Cancelled tile must not publish'));await started;
 assert.equal(pool.records[0].inputInFlight,true);assert.equal(budget.resourceSnapshot().domains['array-buffer'].pinnedBytes,64);controller.abort();await assert.rejects(work,{code:'CANCELLED'});
 assert.equal(stats.terminated,1);assert.equal(pool.records[0].inputWindow.byteLength,0);assert.equal(budget.total(),0);
});

test('SIFT allocation refusal preserves exact extent and cause, then retries only the useful window',async t=>{
 const {pool,events}=fixture(t);let failed=false;
 class FaultArray extends Float32Array{constructor(...args){if(args.length===1&&!failed){failed=true;throw new RangeError('injected Array buffer allocation failed');}super(...args);}}
 await pool.open(1);let count=0;await pool.run([0],async(_,{allocateInput})=>{const input=allocateInput(FaultArray,17);input.fill(6);return {kind:'prepare',input};},async result=>{count++;assert.deepEqual([...result.base],Array(17).fill(6));});
 const refusal=events.find(e=>e.phase==='resource-recovery');assert.equal(refusal.error.details.requestedBytes,68);assert.equal(refusal.error.details.allocationKind,'array-buffer');assert.match(refusal.error.cause.message,/injected/);assert.equal(count,1);assert.equal(pool.metrics.retries,1);
});

test('SIFT invalid return acknowledgement retires the inaccessible backing and retries transport',async t=>{
 let failed=false;const {pool,owners,stats}=fixture(t,{transformReply:returned=>{if(!failed){failed=true;returned.returnedInput.buffer=new ArrayBuffer(8);}return returned;}}),outputs=[];
 await pool.open(1);await pool.run([{id:0,length:16}],make,async result=>outputs.push([...result.base]));
 assert.deepEqual(outputs,[Array.from({length:16},(_,i)=>i/4)]);assert.equal(owners.length,2);assert.equal(stats.created,2);assert.equal(pool.metrics.retries,1);assert.equal(pool.metrics.failures[0].code,'WORKER_MESSAGE_FAILED');
});

test('SIFT reusable input admission settles after a peer returns credit without losing publication',{timeout:3000},async t=>{
 let entered;const waiting=new Promise(resolve=>{entered=resolve;});const events=[],{pool,budget,owners}=fixture(t,{budgetBytes:300,heap:128,cost:256,inputBytes:100,events,onEvent:event=>{if(event.phase==='resource-wait'&&event.waitStage==='waiting')entered(event);}}),peerCredit=budget.reserve(100),peer=budget.beginOperation({owner:'peer'});peer.setState('io');let fault=true,reads=0;
 const acquire=pool.scheduler.acquire.bind(pool.scheduler);pool.scheduler.acquire=async request=>{if(request.label==='sift-prepare'&&fault){fault=false;budget.reserve(request.bytes)();}return acquire(request);};
 try{await pool.open(1);const outputs=[],work=pool.run([{id:0,length:25}],async(job,hooks)=>{reads++;return make(job,hooks);},async result=>outputs.push([...result.base]));work.catch(()=>{});
  // The peer really owns these bytes until its asynchronous useful work ends.
  const event=await waiting;assert.equal(event.requestedBytes,156);assert.equal(reads,1);assert.equal(budget.total(),200);assert.equal(pool.records[0].inputWindow.busy,true);assert.equal(pool.scheduler.snapshot().active.cpu,0);peerCredit();peer.commit();await work;
  assert.deepEqual(outputs,[Array.from({length:25},(_,i)=>i/4)]);assert.equal(reads,2);assert.equal(owners.length,1,'The prepared backing remains owned throughout admission recovery');assert.equal(events.filter(event=>event.phase==='resource-recovery').length,1);assert.equal(pool.records[0].inputInFlight,false);
 }finally{peerCredit();peer.release();pool.scheduler.acquire=acquire;}
});
