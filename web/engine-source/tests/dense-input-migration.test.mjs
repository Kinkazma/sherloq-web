import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportPortableDenseInput,readPortableDenseInput} from '../src/dense-shared-field.js';
import {createDenseInputBarrier} from '../src/dense-input-barrier.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function session({write,flush}={}){let created=0,disposed=0;return {backend:'opfs',get created(){return created;},get disposed(){return disposed;},async create(length){created++;const bytes=new Uint8Array(length);return {async write(source,offset){await write?.();bytes.set(source,offset);},readInto(target,offset){target.set(bytes.subarray(offset,offset+target.length));return target;},async flush(){await flush?.();},dispose(){disposed++;}};}};}
async function fixture({write,flush}={}){
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(1024*1024),temporarySession=session({write,flush}),store=await createSegmentedBytes(96,{budget,storage:'memory',shared:true,chunkBytes:32,temporarySession}),mask=await createSegmentedBytes(2,{budget,storage:'memory',shared:true});
 const bytes=Uint8Array.from({length:96},(_,i)=>(i*17+3)%251);await store.write(bytes);await mask.write(Uint8Array.of(1,1));const publications=[];
 return {budget,temporarySession,store,bytes,async consumer({beforeDetach,immediateControl=true}={}){let input;const publication=await exportPortableDenseInput({first:store,mask,width:2,height:1,dimensions:12},{budget,immediateControl,control:async message=>{if(message.action==='detach'){if(await beforeDetach?.(message)===false)return false;await input.detach([message.id]);return true;}else{await input.attach([{id:message.id,descriptor:structuredClone(message.descriptor,{transfer:message.descriptor.port?[message.descriptor.port]:[]})}]);}}});input=await readPortableDenseInput(structuredClone(publication.value,{transfer:publication.transfer}),{budget});publications.push({publication,input});return input;},async dispose(){for(const {publication,input}of publications){await input.dispose();await publication.release();}await store.dispose();await mask.dispose();assert.equal(budget.total(),0);globalThis.crossOriginIsolated=previous;}};
}

test('two live fields acknowledge every immutable reader before a transactional migration',{timeout:3000},async()=>{
 const f=await fixture(),entered=gate(),ack=gate();try{
  const first=await f.consumer(),second=await f.consumer({beforeDetach:async()=>{entered.resolve();await ack.promise;}});let migrated=false;
  const migration=f.store.spillReadOnly().then(value=>{migrated=true;return value;});await entered.promise;await tick();
  assert.equal(migrated,false);assert.equal(f.store.allocatedBackingBytes,96);assert.equal(f.temporarySession.created,0);assert.equal(f.budget.retained,98);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].pinnedBytes,98);
  ack.resolve();assert.equal(await migration,true);assert.equal(f.store.storage,'temporary');assert.equal(f.store.allocatedBackingBytes,0);assert.equal(f.budget.resourceSnapshot().domains['array-buffer'].materializedBytes,2);
  for(const input of [first,second])assert.deepEqual(await input.first.readInto(new Uint8Array(96)),f.bytes);
 }finally{ack.resolve();await f.dispose();}
});

test('allocation-domain pressure changes automatic storage only for that live recovery',{timeout:3000},async()=>{
 const budget=new Budget(1024),temporarySession=session(),release=budget.beginRecovery({kind:'array-buffer',owner:'d2prl'}),stores=[];
 try{const temporary=await createSegmentedBytes(96,{budget,temporarySession});stores.push(temporary);assert.equal(temporary.storage,'temporary');release();const resident=await createSegmentedBytes(96,{budget,temporarySession});stores.push(resident);assert.equal(resident.storage,'memory');await resident.write(Uint8Array.of(3));assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,96);assert.equal(budget.limit,1024);}
 finally{release();for(const store of stores)await store.dispose();}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});

test('allocation reclamation negotiates a safe boundary independently of detector identity',{timeout:3000},async()=>{
 const f=await fixture();let pauses=0,busy=true;
 try{await f.consumer({beforeDetach:message=>{assert.equal(message.immediate,true);pauses++;return !busy;}});
  await f.budget.reclaim(f.budget.limit,{owner:'d2prl'});assert.equal(pauses,0);
  assert.equal(await f.budget.reclaimAllocation(1,{kind:'array-buffer',owner:'d2prl'}),0);
  assert.equal(f.store.storage,'memory');busy=false;
  assert.equal(await f.budget.reclaimAllocation(1,{kind:'array-buffer',owner:'patchmatch'}),96);
  assert.equal(pauses,2);assert.equal(f.store.storage,'temporary');
 }finally{await f.dispose();}
});

test('busy peer refuses immediate migration and already paused peers regain their authoritative banks',{timeout:3000},async()=>{
 const f=await fixture();try{const first=await f.consumer(),second=await f.consumer({beforeDetach:()=>false});
  assert.equal(await f.store.spillReadOnly({immediate:true}),false);assert.equal(f.store.storage,'memory');assert.equal(f.temporarySession.created,0);
  for(const input of [first,second])assert.deepEqual(await input.first.readInto(new Uint8Array(96)),f.bytes);
 }finally{await f.dispose();}
});

test('allocation reclaim never waits for a reader without immediate boundary negotiation',{timeout:3000},async()=>{
 const f=await fixture();try{await f.consumer({immediateControl:false,beforeDetach:()=>{throw Error('Must not wait for a native command');}});
  assert.equal(await f.budget.reclaimAllocation(1,{kind:'array-buffer',owner:'patchmatch'}),0);assert.equal(f.store.storage,'memory');
 }finally{await f.dispose();}
});

test('immediate pause refuses live kernels but pins the existing recovery boundary before restarting work',{timeout:3000},async()=>{
 const barrier=createDenseInputBarrier(),queued=gate();let detached=0;
 assert.equal(await barrier.tryPause('early',[0]),false);
 barrier.install({detach(){detached++;},attach(){}});
 assert.equal(await barrier.tryPause('busy',[0]),false);assert.equal(barrier.pending,false);
 let complete=false;const waiting=barrier.waitAtBoundary(()=>queued.promise).then(()=>complete=true);
 assert.equal(await barrier.tryPause('self-reclaim',[0]),true);assert.equal(detached,1);queued.resolve();await tick();assert.equal(complete,false);
 await barrier.resume('self-reclaim',[{id:0}]);await waiting;await barrier.finish();
});

for(const failure of ['io','cancel'])test('failed '+failure+' migration restores all live readers on the old authoritative bank',{timeout:3000},async()=>{
 const stop=new AbortController(),f=await fixture({flush:()=>{if(failure==='cancel')stop.abort();else throw Object.assign(Error('Injected temporary I/O failure'),{code:'STORAGE_IO'});}});
 try{const inputs=[await f.consumer(),await f.consumer()];await assert.rejects(f.store.spillReadOnly({signal:stop.signal}),{code:failure==='cancel'?'CANCELLED':'STORAGE_IO'});assert.equal(f.store.storage,'memory');assert.equal(f.store.allocatedBackingBytes,96);assert.equal(f.budget.retained,98);assert.equal(f.temporarySession.disposed,1);for(const input of inputs)assert.deepEqual(input.first.readInto(new Uint8Array(96)),f.bytes);}
 finally{await f.dispose();}
});

test('an unrevocable reader prevents active migration rather than invalidating its SAB',{timeout:3000},async()=>{
 const f=await fixture();let pin;try{await f.consumer();pin=f.store.exportSharedReadOnly();assert.equal(await f.store.spillReadOnly(),false);assert.equal(f.store.storage,'memory');assert.equal(pin.descriptor.segments.length,3);}
 finally{pin?.release();await f.dispose();}
});

test('input gate drains native work, supports overlapping stores, and returns CPU admission during I/O',{timeout:3000},async()=>{
 const barrier=createDenseInputBarrier(),events=[];barrier.install({detach:async ids=>events.push(['detach',...ids]),attach:async entries=>events.push(['attach',...entries.map(e=>e.id)])});
 let paused=false;const waiting=barrier.pause('first',[1]).then(()=>paused=true);await tick();assert.equal(paused,false,'No ACK while a native task is active');
 const boundary=barrier.checkpoint();await waiting;await barrier.pause('second',[2]);assert.equal(barrier.pending,true);
 await barrier.resume('first',[{id:1}]);assert.equal(barrier.pending,true);await barrier.resume('second',[{id:2}]);await boundary;
 const grant=gate();let acquisitions=0,releases=0;const admission=barrier.admit(async()=>{acquisitions++;if(acquisitions===1)await grant.promise;return {release(){releases++;}};});
 await barrier.pause('third',[3]);grant.resolve();await tick();assert.equal(releases,1,'CPU grant must return while descriptors migrate');assert.equal(acquisitions,1);await barrier.resume('third',[{id:3}]);const lease=await admission;lease.release();assert.equal(acquisitions,2);assert.equal(releases,2);await barrier.finish();
 assert.deepEqual(events,[['detach',1],['detach',2],['attach',1],['attach',2],['detach',3],['attach',3]]);
});

test('input gate cancellation releases blocked dispatcher and reader acknowledgements',{timeout:3000},async()=>{
 const stop=new AbortController(),barrier=createDenseInputBarrier({signal:stop.signal});barrier.install({detach(){},attach(){}});const paused=barrier.pause(1,[0]);stop.abort();await assert.rejects(paused,{code:'CANCELLED'});await assert.rejects(barrier.checkpoint(),{code:'CANCELLED'});await assert.rejects(barrier.finish(),{code:'CANCELLED'});
});

test('final publication waits for a migration that first reaches its barrier during kernel shutdown',{timeout:3000},async()=>{
 const barrier=createDenseInputBarrier();let detached=false,finished=false;barrier.install({detach(){detached=true;},attach(){}});const paused=barrier.pause(0,[0]),closing=barrier.finish().then(()=>finished=true);await paused;await tick();assert.equal(detached,true);assert.equal(finished,false);await barrier.resume(0,[{id:0}]);await closing;assert.equal(finished,true);
});

test('an ordinary reclaim queued behind migration exposes its already idle native boundary',{timeout:3000},async()=>{
 const barrier=createDenseInputBarrier(),queued=gate();barrier.install({detach(){},attach(){}});const paused=barrier.pause(0,[0]),wait=barrier.waitAtBoundary(()=>queued.promise);await paused;await barrier.resume(0,[{id:0}]);queued.resolve(17);assert.equal(await wait,17);await barrier.finish();
});

for(const mode of ['queued-start','cancel-ack'])test('field '+mode+' releases immutable publications without waiting for blocked CPU or a terminated worker',{timeout:5000},async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(128*1024**2),temporarySession=session(),first=await createSegmentedBytes(4800,{budget,shared:true,temporarySession}),mask=await createSegmentedBytes(100,{budget,shared:true}),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),stop=new AbortController(),entered=gate();await first.write(new Uint8Array(4800).fill(11));await mask.write(new Uint8Array(100).fill(1));
 const blocked=mode==='queued-start'?await scheduler.acquire({cpu:1,resourceOwner:'d2prl'}):null;let terminated=false,pending,reclamation,result;
 const pool=new DensePagedFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(message){const emit=data=>queueMicrotask(()=>this.onmessage({data}));if(message.input&&mode==='queued-start'){const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});}if(message.inputControl){assert.equal(message.inputControl.action,'detach');entered.resolve();}},terminate(){terminated=true;}})});
 try{
  pending=pool.start({first,mask,width:10,height:10},{storage:'memory',signal:stop.signal});pending.catch(()=>{});await tick();reclamation=budget.reclaimAllocation(1,{kind:'array-buffer',owner:'d2prl'});
  if(mode==='queued-start'){assert.equal(await reclamation,4800);assert.equal(terminated,false);blocked.release();result=await pending;await result.dispose();result=null;}
  else{await entered.promise;stop.abort();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(await reclamation,4800);assert.equal(terminated,true);}
  assert.equal(first.storage,'temporary');assert.deepEqual([...await first.readInto(new Uint8Array(3))],[11,11,11]);assert.equal(budget.resourceSnapshot().operations.length,0);
 }finally{stop.abort();blocked?.release();await pending?.catch(()=>{});await reclamation?.catch(()=>{});await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('retired SAB wrappers are collectible while old publications and reader objects remain alive',{timeout:10000},async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',new URL('./dense-input-migration-liveness-check.mjs',import.meta.url).pathname]);const report=JSON.parse(stdout);assert.equal(report.bankWeakRefsCleared,9);assert.equal(report.retainedEnvelopes,4);assert.equal(report.budgetBytes,0);
});

test('remote worker backing reports transfer adopted banks without a second policy charge',{timeout:3000},async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(128*1024**2),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});let result,policyAtPublication,backingAtPublication,observed=false;
 const pool=new DensePagedFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(message){if(!message.input)return;policyAtPublication=budget.total();backingAtPublication=budget.resourceSnapshot().domains['array-buffer'].materializedBytes;const emit=data=>queueMicrotask(()=>this.onmessage({data}));emit({backing:{arrayBufferBytes:800,wasmBytes:64*1024**2},progress:{phase:'compute',stage:'initialization',completed:100,total:100}});const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({backing:{arrayBufferBytes:800,wasmBytes:0},result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});},terminate(){}})});
 try{result=await pool.start({first,mask,width:10,height:10},{storage:'memory',onProgress(){const snapshot=budget.resourceSnapshot();assert.equal(snapshot.domains['array-buffer'].materializedBytes,backingAtPublication+800);assert.equal(snapshot.domains.wasm.materializedBytes,64*1024**2);assert.equal(budget.total(),policyAtPublication);assert.equal(snapshot.operations.length,1);observed=true;}});assert.equal(observed,true);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,800);assert.equal(budget.resourceSnapshot().domains.wasm.materializedBytes,0);assert.equal(budget.resourceSnapshot().operations.length,0);await result.dispose();result=null;assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);}
 finally{await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});
