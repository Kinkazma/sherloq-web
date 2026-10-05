import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createWasmTensorArena,isWasmTensorView} from '../src/wasm-tensor-arena.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
import {resourceAllocationKind} from '../src/errors.js';
const MiB=1024**2;
test('Wasm tensor leases keep stable views across new banks and owner disposal',()=>{
 const budget=new Budget(128*MiB),arena=createWasmTensorArena({budget}),first=arena.allocate(Float32Array,2*MiB),view=first.data;view.fill(.25);
 const second=arena.allocate(Float32Array,4*MiB),third=arena.allocate(Uint16Array,17*MiB);assert.equal(arena.snapshot().banks,3);assert.equal(view.byteLength,8*MiB);assert.equal(view[123],.25);assert.ok(isWasmTensorView(view));
 const held=budget.total();arena.dispose();assert.equal(budget.total(),held);first.release();first.release();assert.throws(()=>first.data,{code:'INVALID_INPUT'});second.release();assert.ok(third.data.every(x=>x===0));third.release();assert.equal(budget.total(),0);
});
test('released ranges coalesce and reused tensors preserve new-array zero semantics',()=>{
 const budget=new Budget(32*MiB),arena=createWasmTensorArena({budget}),a=arena.allocate(Float32Array,1024),b=arena.allocate(Float32Array,1024),buffer=a.data.buffer;a.data.fill(3);b.data.fill(4);a.release();b.release();
 const c=arena.allocate(Float32Array,2048);assert.equal(c.data.buffer,buffer);assert.ok(c.data.every(x=>x===0));assert.equal(arena.snapshot().banks,1);assert.equal(arena.snapshot().allocations,3);assert.equal(arena.snapshot().reuses,2);c.release();arena.dispose();assert.equal(budget.total(),0);
});
test('retirement excludes live tensors and reports only the Wasm domain',async()=>{
 const budget=new Budget(128*MiB),events=[],original=budget.notifyBackingRelease.bind(budget);budget.notifyBackingRelease=(kind,bytes)=>{events.push({kind,bytes});original(kind,bytes);};
 const arena=createWasmTensorArena({budget}),a=arena.allocate(Float32Array,8*MiB),b=arena.allocate(Float32Array,8*MiB);a.release();assert.equal(await budget.reclaimAllocation(32*MiB,{kind:'wasm'}),32*MiB);assert.deepEqual(events,[{kind:'wasm',bytes:32*MiB}]);assert.equal(b.data.byteLength,32*MiB);b.release();arena.dispose();assert.equal(budget.total(),0);
});
test('allocation refusal and cancellation publish no bank and return reservations',()=>{
 const budget=new Budget(128*MiB);let failures=0;const arena=createWasmTensorArena({budget,memoryFactory:()=>{failures++;throw new RangeError('WebAssembly.Memory(): could not allocate memory');}});
 assert.throws(()=>arena.allocate(Float32Array,1024),e=>e.code==='MEMORY_ALLOCATION'&&e.details.allocationKind==='wasm'&&e.details.requestedBytes===16*MiB);assert.equal(failures,1);assert.equal(budget.total(),0);assert.equal(arena.snapshot().banks,0);
 const signal=AbortSignal.abort();assert.throws(()=>arena.allocate(Float32Array,1024,{signal}),{code:'CANCELLED'});assert.equal(failures,1);arena.dispose();assert.equal(budget.total(),0);
});
test('zero:false reuses a dirty range and full output publication overwrites every sentinel',()=>{
 const budget=new Budget(32*MiB),arena=createWasmTensorArena({budget}),old=arena.allocate(Float32Array,4096);old.data.fill(NaN);const backing=old.data.buffer;old.release();const next=arena.allocate(Float32Array,4096,{zero:false});assert.equal(next.data.buffer,backing);assert.ok(next.data.every(Number.isNaN));next.data.set(Float32Array.from({length:4096},(_,i)=>i/4));assert.ok(next.data.every((v,i)=>v===i/4));next.release();arena.dispose();assert.equal(budget.total(),0);
});
test('one bank is counted once and remains pinned until its final slice is returned',()=>{
 const budget=new Budget(32*MiB),arena=createWasmTensorArena({budget}),a=arena.allocate(Float32Array,1024),b=arena.allocate(Float32Array,1024);let stats=budget.resourceSnapshot().domains.wasm;assert.equal(stats.backings,1);assert.equal(stats.materializedBytes,16*MiB);assert.equal(stats.pinnedBytes,16*MiB);assert.equal(stats.reclaimableBytes,0);a.release();assert.equal(budget.resourceSnapshot().domains.wasm.pinnedBytes,16*MiB);arena.dispose();assert.equal(budget.resourceSnapshot().domains.wasm.backings,1);b.release();assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);assert.equal(budget.total(),0);
});
test('refused standalone helper admission registers no orphaned arena reclaimer',async()=>{
 for(const [name,method] of [['feature-math','createFeatureMath'],['neural-math','createNeuralMath'],['dlf','createDlf'],['prepare','createPreparation']]){const budget=new Budget(1),factory=()=>assert.fail('Factory before admission'),create=(await import('../experiments/d2prl/'+name+'.js'))[method];await assert.rejects(create(factory,{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.reclaimers.size,0,name);assert.equal(budget.asyncReclaimers.size,0,name);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);assert.equal(budget.total(),0);}
});
test('policy refusal can resume into a returned range without a new bank or returned global credit',{timeout:3000},async()=>{
 const budget=new Budget(16*MiB),arena=createWasmTensorArena({budget}),a=arena.allocate(Uint8Array,8*MiB),b=arena.allocate(Uint8Array,8*MiB),peer=budget.beginOperation({owner:'peer'});peer.setState('io');let signalWaiting,calls=0;const waiting=new Promise(resolve=>signalWaiting=resolve);
 const work=runWithResourceRecovery(()=>{calls++;return arena.allocate(Uint8Array,4*MiB,{label:'next-tensor'});},{budget,owner:'reader',onRecovery:event=>{assert.equal(event.error.code,'MEMORY_LIMIT');assert.equal(resourceAllocationKind(event.error),null);assert.equal(event.error.details.requestedBytes,16*MiB);assert.equal(event.error.details.availableBytes,0);assert.equal(event.error.details.reuseBytes,4*MiB);assert.equal(typeof event.error.details.reuseScope,'string');},onWait:event=>{assert.equal(event.kind,'policy');if(event.stage==='waiting')signalWaiting();}});
 let result;try{await waiting;a.release();result=await work;assert.equal(calls,2);assert.equal(result.byteLength,4*MiB);assert.equal(budget.total(),16*MiB);assert.equal(arena.snapshot().banks,1);}
 finally{result?.release();a.release();b.release();peer.release();arena.dispose();}assert.equal(budget.total(),0);assert.equal(budget.listeners.size,0);assert.equal(budget.resourceListeners.size,0);
});
test('an allocator refusal inside admission keeps its original reclaimer domain and extent',()=>{
 const error=Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:64,allocationKind:'array-buffer'}}),budget={reserve(){throw error;}},arena=createWasmTensorArena({budget});
 assert.throws(()=>arena.allocate(Uint8Array,1024),value=>value===error);assert.deepEqual(error.details,{requestedBytes:64,allocationKind:'array-buffer'});arena.dispose();
});
