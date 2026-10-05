import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {scheduledWorkerCall} from '../src/scheduled-worker-call.js';
import {createD2prlRecovery,recoverableStage} from '../experiments/d2prl/recovery.js';
import {createFeatureMath} from '../experiments/d2prl/feature-math.js';
import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('D2 waits for independent work without retrying or treating GPU retirement as ArrayBuffer backing',async()=>{
 const budget=new Budget(1024**2),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),peer=await scheduler.acquire({cpu:1,resourceOwner:'other-model'}),events=[],recoveries=[];let attempts=0,waiting;
 const entered=new Promise(resolve=>{waiting=resolve;}),operation=createD2prlRecovery({budget,reclaim:async()=>0,onRecovery:event=>recoveries.push(event),onWait:event=>{events.push(structuredClone(event));if(event.stage==='waiting')waiting();}});
 const pending=operation('owned-output',()=>{if(++attempts===1){const error=new RangeError('Array buffer allocation failed');error.details={requestedBytes:16};throw error;}return 17;});
 try{await entered;assert.equal(attempts,1);assert.equal(recoveries.length,1);assert.equal(budget.recovering,true);budget.notifyBackingRelease('gpu',16);await tick();assert.equal(attempts,1);budget.notifyBackingRelease('array-buffer',16);assert.equal(await pending,17);assert.deepEqual(events.map(event=>event.stage),['waiting','resumed']);assert.ok(events.every(event=>event.owner==='d2prl'&&event.kind==='array-buffer'));assert.equal(events[1].reason,'backing-released');assert.equal(operation.snapshot().recoveries,1);}finally{peer.release();}
 assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('scheduled D2 worker calls carry one owner and cannot be mistaken for an independent producer',async()=>{
 const budget=new Budget(1024**2),owner={budget,profile:{maxWorkers:1},resourceOwner:'d2prl'};let enter,finish;
 const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{finish=resolve;}),pending=scheduledWorkerCall(owner,async()=>{enter();await gate;return 23;});
 try{await entered;assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);assert.equal(budget.resourceProgressSnapshot('other-model','array-buffer').independentProducers,1);finish();assert.equal(await pending,23);}finally{finish();await pending;}
 assert.equal(budget.resourceProgressSnapshot('other-model','array-buffer').independentProducers,0);assert.equal(budget.total(),0);
});

test('native D2 work is visible to peers but its parent does not manufacture progress during output recovery',async()=>{
 const budget=new Budget(64*1024**2),visible=()=>budget.resourceProgressSnapshot('other-model','wasm').independentProducers;
 let copies=0,nativeCalls=0,reclaims=0,at=16;
 const operation=createD2prlRecovery({budget,reclaim:async()=>{reclaims++;assert.equal(visible(),0,'Suspended native parent is not an independent producer');await tick();assert.equal(visible(),0);return 1;}});
 const arena=createWasmTensorArena({budget,memoryFactory:descriptor=>{assert.equal(budget.resourceSnapshot().operations.filter(ticket=>ticket.state==='compute').length,1,'Only the actual output allocation is compute');if(++copies===1){assert.equal(visible(),1);throw new RangeError('WebAssembly.Memory(): could not allocate memory');}return new WebAssembly.Memory(descriptor);}});
 const buffer=new ArrayBuffer(16*1024**2),HEAPU8=new Uint8Array(buffer),HEAPF32=new Float32Array(buffer);
 const stage=await createFeatureMath(async()=>({HEAPU8,HEAPF32,_malloc(bytes){const pointer=at;at+=bytes;return pointer;},_free(){},_d2prl_batchnorm_parameters(){assert.equal(visible(),1);return 1;},_d2prl_affine(input,_a,_b,_c,count,_relu,out){assert.equal(visible(),1,'Native affine is a real useful producer');nativeCalls++;HEAPF32.copyWithin(out/4,input/4,input/4+count);return 1;}}),{budget,arena,operation});
 const guarded=recoverableStage(stage,'feature',operation,undefined,2);let result;
 try{result=await guarded.run('affine',{input:Float32Array.of(1,2,3,4),params:new Float32Array(4),channels:1,height:2,width:2});assert.deepEqual([...result.data],[1,2,3,4]);assert.equal(nativeCalls,1);assert.equal(copies,2);assert.equal(reclaims,1);assert.equal(visible(),0);}
 finally{result?.release();stage.dispose();arena.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('guarded concurrent invocations forward distinct tickets without mutating caller options',async()=>{
 const budget=new Budget(1024),operation=createD2prlRecovery({budget}),options={signal:new AbortController().signal},seen=[];let finish;
 const gate=new Promise(resolve=>{finish=resolve;}),stage={async run(value,context){seen.push(context);context.resourceOperation.setState('compute');await gate;return value;}},guarded=recoverableStage(stage,'concurrent',operation,undefined,1);
 const tasks=[guarded.run(1,options),guarded.run(2,options)];await tick();
 try{assert.equal(seen.length,2);assert.notEqual(seen[0].resourceOperation,seen[1].resourceOperation);assert.ok(seen.every(context=>context.signal===options.signal));assert.equal(options.resourceOperation,undefined);assert.equal(budget.resourceProgressSnapshot('other-model','wasm').independentProducers,2);}
 finally{finish();assert.deepEqual(await Promise.all(tasks),[1,2]);}
 assert.equal(budget.resourceProgressSnapshot('other-model','wasm').independentProducers,0);
});
