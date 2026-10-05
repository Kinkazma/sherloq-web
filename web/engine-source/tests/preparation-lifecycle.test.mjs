import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ForgeryscopePreparation} from '../src/forgeryscope-preparation.js';
import {CatnetPreparation} from '../src/catnet-preparation.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const MiB=1024**2;
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function noActivity(budget,scheduler){assert.equal(scheduler.snapshot().running,0);assert.equal(scheduler.snapshot().queued,0);assert.equal(budget.resources.operations.size,0);}
test('Dispose during factory initialization keeps the heap charged until completion',async()=>{
 const budget=new Budget(64*1024**2);let ready;
 const preparation=new ForgeryscopePreparation(budget,()=>new Promise(resolve=>{ready=resolve;}));
 const pending=preparation.admitted(1024,()=>assert.fail('Disposed preparation ran'));
 preparation.dispose();assert.ok(budget.retained>0);ready({});
 await assert.rejects(pending,{code:'DISPOSED'});assert.equal(budget.retained,0);assert.equal(budget.active,0);
});

test('Preparation factory waits without CPU, then its native work queues behind a real owner',async()=>{
 const budget=new Budget(64*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),ready=deferred(),peer=budget.beginOperation({owner:'peer',id:'native-peer'}),peerLease=await scheduler.acquire({cpu:1,operation:peer});let ran=0;
 const preparation=new ForgeryscopePreparation(budget,()=>ready.promise);
 const pending=preparation.admitted(1024,()=>{ran++;assert.equal(scheduler.snapshot().active.cpu,1);assert.ok(budget.resourceProgressSnapshot('peer','policy').operations.some(value=>value.owner==='forgeryscope'&&value.state==='compute'));return 17;});
 assert.ok(budget.resourceProgressSnapshot('peer','policy').operations.some(value=>value.id==='forgeryscope/preparation'&&value.state==='io'));assert.equal(scheduler.snapshot().running,1);
 ready.resolve({});await tick();assert.equal(ran,0);assert.equal(scheduler.snapshot().queued,1);assert.equal(budget.resourceProgressSnapshot('peer','policy').independentProducers,0);
 peerLease.release();peer.release();assert.equal(await pending,17);assert.equal(ran,1);preparation.dispose();noActivity(budget,scheduler);assert.equal(budget.total(),0);
});

test('Cancellation during initialization leaves IO visible until the factory settles',async()=>{
 const budget=new Budget(64*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),ready=deferred(),controller=new AbortController(),preparation=new ForgeryscopePreparation(budget,()=>ready.promise);
 const pending=preparation.admitted(1024,()=>assert.fail('Cancelled native work ran'),controller.signal),rejected=assert.rejects(pending,{code:'CANCELLED'});
 controller.abort();await tick();assert.ok(budget.resourceProgressSnapshot('peer','policy').operations.some(value=>value.state==='io'));assert.equal(scheduler.snapshot().running,0);assert.ok(budget.retained>0);
 ready.resolve({});await rejected;preparation.dispose();noActivity(budget,scheduler);assert.equal(budget.total(),0);
});

for(const action of ['abort','dispose'])test(`Preparation ${action} while queued retires only its own request`,async()=>{
 const budget=new Budget(64*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),controller=new AbortController(),peer=await scheduler.acquire({cpu:1,resourceOwner:'peer'}),preparation=new ForgeryscopePreparation(budget,async()=>({}));
 const pending=preparation.admitted(1024,()=>assert.fail('Cancelled native work ran'),controller.signal),rejected=assert.rejects(pending,{code:'CANCELLED'});
 await tick();assert.equal(scheduler.snapshot().queued,1);if(action==='abort')controller.abort();else preparation.dispose();await rejected;
 assert.equal(scheduler.snapshot().queued,0);assert.equal(scheduler.snapshot().running,1);assert.equal(budget.resources.operations.size,0);preparation.dispose();peer.release();noActivity(budget,scheduler);assert.equal(budget.total(),0);
});

test('Native failure frees pointers and CPU; inherited CAT-Net preparation has its own owner',async()=>{
 const budget=new Budget(64*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),freed=[],failure=new Error('native failure');
 const preparation=new CatnetPreparation(budget,async()=>({_malloc:()=>32,_free:p=>freed.push(p)}));
 await assert.rejects(preparation.admitted(1024,(_m,alloc)=>{assert.ok(budget.resourceProgressSnapshot('peer','policy').operations.some(value=>value.owner==='catnet'&&value.state==='compute'));alloc(8);throw failure;}),error=>error===failure);
 assert.deepEqual(freed,[32]);noActivity(budget,scheduler);preparation.dispose();assert.equal(budget.total(),0);
});

test('Admitted native embedding preserves output bits and releases the CPU before returning',async t=>{
 const moduleUrl=process.env.FORGERYSCOPE_PREPARATION_MODULE?pathToFileURL(process.env.FORGERYSCOPE_PREPARATION_MODULE):new URL('../.build/forgeryscope/prepare.mjs',import.meta.url);
 try{await access(moduleUrl);}catch{t.skip('Optional native preparation fixture is unavailable');return;}
 const create=(await import(moduleUrl.href)).default,budget=new Budget(64*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),image={width:17,height:13,data:Uint8Array.from({length:17*13*3},(_,i)=>i%251)},spec={width:8,height:8,mean:[.4,.5,.6],std:[.2,.3,.4],transform:'longest_max_size'};
 const raw=await create(),input=raw._malloc(image.data.length),output=raw._malloc(8*8*3*4),params=raw._malloc(24);let expected;
 try{raw.HEAPU8.set(image.data,input);raw.HEAPF32.set([...spec.mean,...spec.std],params/4);assert.equal(raw._fg_prepare(input,image.width,image.height,8,8,1,params,params+12,output),1);expected=raw.HEAPU8.slice(output,output+8*8*3*4);}finally{raw._free(params);raw._free(output);raw._free(input);}
 const preparation=new ForgeryscopePreparation(budget,async options=>{const module=await create(options),native=module._fg_prepare;module._fg_prepare=(...args)=>{assert.equal(scheduler.snapshot().active.cpu,1);return native(...args);};return module;});
 let result;try{result=await preparation.embedding(image,spec);assert.deepEqual(new Uint8Array(result.tensor.data.buffer,result.tensor.data.byteOffset,result.tensor.data.byteLength),expected);noActivity(budget,scheduler);}finally{result?.release();preparation.dispose();}assert.equal(budget.total(),0);
});
