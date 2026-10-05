import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SiftPointPages,createSiftCheckpoint,runSiftCheckpointStage} from '../src/sift-checkpoint.js';
import {SiftPreparationGate} from '../src/sift-preparation-gate.js';

test('SIFT point append rolls back every published row after failed new page',()=>{
 const budget=new Budget(300),pages=new SiftPointPages(Float32Array,1,n=>budget.reserve(n),{pageRows:4});pages.append(Float32Array.of(1,2,3));
 assert.throws(()=>pages.append(Float32Array.from({length:100},(_,i)=>i+4)),{code:'MEMORY_LIMIT'});assert.equal(pages.length,3);assert.deepEqual([pages.get(0),pages.get(1),pages.get(2)],[1,2,3]);
 pages.append(Float32Array.of(4));assert.equal(pages.length,4);pages.dispose();assert.equal(budget.total(),0);
});
test('SIFT checkpoint stages preserve committed peers across explicit resumption',async()=>{
 const state=createSiftCheckpoint(),prepared=[],outputs=[],pool={async run(jobs,make,accept){for(const job of jobs){const value=await make(job);await accept(value,job);}}};let refuse=true;
 const run=()=>runSiftCheckpointStage(state,pool,'detect',[0,1,2],async i=>{prepared.push(i);return i;},async v=>{if(v===1&&refuse)throw Error('terminal');outputs.push(v);});
 await assert.rejects(run(),/terminal/);refuse=false;await run();assert.deepEqual(prepared,[0,1,2]);assert.deepEqual(outputs,[0,1,2]);await state.dispose();
});
test('useful slow preparation widens look-ahead while fast preparation remains bounded',async()=>{
 const gate=new SiftPreparationGate(10);let admitted=0;const first=await gate.acquire();const waiting=gate.acquire().then(release=>{admitted++;return release;});await Promise.resolve();assert.equal(admitted,0);
 gate.sample('preparation',40);gate.sample('service',10);assert.equal(gate.capacity,5);const second=await waiting;assert.equal(admitted,1);first();second();assert.equal(gate.active.size,0);
});

test('terminal publication failure retains the computed tile and its reservation until resume',async()=>{
 const {SiftPool}=await import('../src/sift-paged.js'),{EngineError}=await import('../src/errors.js');const budget=new Budget(1000),owner={profile:{maxWorkers:1},workers:new Set()},state=createSiftCheckpoint(),savedWorker=globalThis.Worker;let computes=0,refuse=true;
 globalThis.Worker=class{terminate(){}postMessage(message){queueMicrotask(()=>{if(message.kind==='init')this.onmessage({data:{ready:true}});else{computes++;this.onmessage({data:{base:Uint8Array.of(1,2,3,4)}});}});}};
 const makePool=async()=>{const p=new SiftPool(owner,{budget,heap:64,cost:()=>100,provider:'cpu',backend:'cpu',wasm:new Uint8Array(),layers:3,contrast:.04});await p.open(1);return p;};let pool=await makePool();
 const run=()=>runSiftCheckpointStage(state,pool,'publish',[0],async()=>({kind:'prepare',input:Uint8Array.of(7)}),async output=>{if(refuse)throw new EngineError('MEMORY_LIMIT','Publication has no room');assert.deepEqual([...output.base],[1,2,3,4]);});
 try{await assert.rejects(run(),error=>error.details?.recovery?.consecutiveFailures===5);pool.close();assert.equal(computes,1);assert.equal(budget.total(),4);assert.equal(state.pending.size,1);refuse=false;pool=await makePool();await run();assert.equal(computes,1);assert.equal(state.pending.size,0);pool.close();assert.equal(budget.total(),0);}finally{pool.close();await state.dispose();globalThis.Worker=savedWorker;}
});
