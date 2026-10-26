import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoupeImageCache as createClientCache} from '../sherloq-browser/assets/loupe-full-client.js';
import {createPdfCompositeEffectService} from '../sherloq-browser/assets/pdf-composite-effects.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const effects=value=>({adjust:{enabled:true,brightness:value},enhance:{enabled:false},sweep:{enabled:false}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const cancelled=()=>Object.assign(Error('Cancelled fixture request'),{code:'CANCELLED'});
function source({close=()=>{}}={}){
 const calls={forks:0,closes:0,reads:0};
 const pixels=async rect=>{calls.reads++;return{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)};};
 const value={width:8,height:8,readPixels:pixels,fork(){calls.forks++;return{width:8,height:8,readPixels:pixels,readDisplayPixels:pixels,close(){calls.closes++;return close();}};}};
 return{value,calls};
}
// This fixture models the actual new acquire/lease API. It runs no obsolete
// point/build worker and does not perform image arithmetic.
function regionalFixture(){
 const engines=[],jobs=[];
 function createCache(){
  const engine={cancelCalls:0,disposeCalls:0,disposeGate:null,acquire(input,settings){const gate=deferred(),job={input,settings,gate,engine};jobs.push(job);return gate.promise;},cancel(){engine.cancelCalls++;},dispose(){engine.disposeCalls++;return engine.disposeGate?.promise;}};
  engines.push(engine);return engine;
 }
 function complete(job,{closeGate,closeFailure}={}){
  job.input.retain();let refs=1,closeTask=null;const calls={closedHandles:0,reads:0};
  function handle(){let closed=false;return{width:8,height:8,id:jobs.indexOf(job)+1,metrics:{native:true},available:true,prepare:()=>!closed,draw(){},readPixels:async rect=>{calls.reads++;return job.input.readPixels(rect);},fork(){if(closed)return null;refs++;return handle();},close(){if(closed)return closeTask;closed=true;calls.closedHandles++;if(--refs)return;closeTask=(async()=>{await closeGate?.promise;try{if(closeFailure)throw closeFailure;}finally{await job.input.release();}})();closeTask.catch(()=>{});return closeTask;}};}
  const surface=handle();job.surface=surface;job.calls=calls;job.gate.resolve(surface);return job;
 }
 return{engines,jobs,createCache,complete};
}
function pendingState(promise){let settled=false;promise.then(()=>{settled=true;},()=>{settled=true;});return()=>settled;}

test('normal client dispose is one completion until its retained native lease and engine finish',async()=>{
 const h=regionalFixture(),closeGate=deferred(),engineGate=deferred(),input=source(),cache=createClientCache({createCache:h.createCache});
 cache.ensure(input.value,effects(1));h.complete(h.jobs[0],{closeGate});await tick();h.engines[0].disposeGate=engineGate;
 const first=cache.dispose(),second=cache.dispose(),isSettled=pendingState(first);
 assert.equal(first,second);assert.equal(cache.reset(),first);await tick();assert.equal(isSettled(),false);assert.equal(h.engines[0].disposeCalls,1);
 engineGate.resolve();await tick();assert.equal(isSettled(),false,'A closed worker owner does not replace the presentation lease drain.');
 closeGate.resolve();await first;assert.equal(input.calls.closes,1);assert.equal(h.jobs[0].calls.closedHandles,1);assert.equal(cache.current,null);
});

test('reset shares completion, retains its input through a cancelled late build, and permits a later source',async()=>{
 const h=regionalFixture(),firstSource=source(),secondSource=source(),cache=createClientCache({createCache:h.createCache});
 cache.ensure(firstSource.value,effects(1));cache.cancel();
 const first=cache.reset(),second=cache.reset(),isSettled=pendingState(first);assert.equal(first,second);await tick();assert.equal(isSettled(),false);assert.equal(firstSource.calls.closes,0);
 h.complete(h.jobs[0]);await first;assert.equal(firstSource.calls.closes,1);assert.equal(h.jobs[0].calls.closedHandles,1);
 cache.ensure(secondSource.value,effects(2));h.complete(h.jobs[1]);await tick();assert.equal(cache.current.source,secondSource.value);assert.equal(cache.settled,true);
 await cache.dispose();assert.equal(secondSource.calls.closes,1);
});

test('dispose drains every retired same-input build, not only the newest gesture',async()=>{
 const h=regionalFixture(),input=source(),cache=createClientCache({createCache:h.createCache});
 cache.ensure(input.value,effects(1));cache.ensure(input.value,effects(2));assert.equal(h.jobs.length,2);
 const closing=cache.dispose(),isSettled=pendingState(closing);h.jobs[1].gate.reject(cancelled());await tick();assert.equal(isSettled(),false);assert.equal(input.calls.closes,0);
 h.complete(h.jobs[0]);await closing;assert.equal(input.calls.closes,1);assert.equal(h.jobs[0].calls.closedHandles,1);assert.equal(cache.current,null);
});

test('a later source can prepare while reset drains, and final disposal also waits the retired source',async()=>{
 const h=regionalFixture(),a=source(),b=source(),cache=createClientCache({createCache:h.createCache});
 cache.ensure(a.value,effects(1));const resetting=cache.reset();cache.ensure(b.value,effects(2));h.complete(h.jobs[1]);await tick();assert.equal(cache.current.source,b.value);assert.equal(a.calls.closes,0);
 const closing=cache.dispose(),isSettled=pendingState(closing);await tick();assert.equal(isSettled(),false);h.complete(h.jobs[0]);await Promise.all([resetting,closing]);assert.equal(a.calls.closes,1);assert.equal(b.calls.closes,1);
});

test('a rejecting input close is observed, reported by disposal, and cannot skip engine cleanup',async()=>{
 const h=regionalFixture(),cause=Object.assign(Error('Input release rejected'),{code:'STORAGE_FAILED'}),input=source({close:async()=>{throw cause;}}),cache=createClientCache({createCache:h.createCache});
 cache.ensure(input.value,effects(1));h.complete(h.jobs[0]);await tick();const closing=cache.dispose();await assert.rejects(closing,error=>error===cause);assert.equal(cache.dispose(),closing);assert.equal(input.calls.closes,1);assert.equal(h.engines[0].disposeCalls,1);assert.equal(h.jobs[0].calls.closedHandles,1);
});

test('a drained cleanup failure does not poison a later source or its independent reset',async()=>{
 const h=regionalFixture(),cause=Object.assign(Error('First source release rejected'),{code:'STORAGE_FAILED'}),a=source({close:async()=>{throw cause;}}),b=source(),cache=createClientCache({createCache:h.createCache});
 cache.ensure(a.value,effects(1));h.complete(h.jobs[0]);await tick();await assert.rejects(cache.reset(),error=>error===cause);assert.equal(a.calls.closes,1);
 cache.ensure(b.value,effects(2));h.complete(h.jobs[1]);await tick();assert.equal(cache.current.source,b.value);await cache.reset();assert.equal(b.calls.closes,1);await cache.dispose();
});

test('a primitive cleanup rejection is still reported and then retired with its source',async()=>{
 const h=regionalFixture(),a=source({close:async()=>{throw null;}}),b=source(),cache=createClientCache({createCache:h.createCache});cache.ensure(a.value,effects(1));h.complete(h.jobs[0]);await tick();await assert.rejects(cache.reset(),error=>error===null);cache.ensure(b.value,effects(2));h.complete(h.jobs[1]);await tick();await cache.dispose();assert.equal(a.calls.closes,1);assert.equal(b.calls.closes,1);
});

test('cleanup failure of a superseded native result is drained without relatching analysis failure',async()=>{
 const h=regionalFixture(),cause=Object.assign(Error('Retired result failed to release'),{code:'CLEANUP_FAILED'}),input=source(),states=[],cache=createClientCache({createCache:h.createCache,state:value=>states.push(value)});
 cache.ensure(input.value,effects(1));cache.cancel();const closing=cache.dispose();h.complete(h.jobs[0],{closeFailure:cause});await assert.rejects(closing,error=>error===cause);assert.equal(input.calls.closes,1);assert.equal(states.filter(value=>value.error).length,0,'Retired cleanup must not change the explicit retry latch.');
});

test('failure remains latched on movement and explicit acquire still retries the same parameters',async()=>{
 const h=regionalFixture(),input=source(),states=[],cache=createClientCache({createCache:h.createCache,state:value=>states.push(value)});
 cache.ensure(input.value,effects(1));const failure=Object.assign(Error('Worker unavailable'),{code:'WORKER_FAILED'});h.jobs[0].gate.reject(failure);await tick();
 for(let i=0;i<40;i++)cache.ensure(input.value,effects(1));assert.equal(h.jobs.length,1);assert.equal(states.filter(value=>value.error).length,1);
 const acquiring=cache.acquire(input.value,effects(1));assert.equal(h.jobs.length,2);h.complete(h.jobs[1]);const lease=await acquiring;assert.equal(cache.settled,true);lease.close();await cache.dispose();assert.equal(input.calls.closes,1);
});

test('acquire after dispose cannot create a regional cache or retain another input',async()=>{
 const h=regionalFixture(),input=source(),cache=createClientCache({createCache:h.createCache});const closed=cache.dispose();await closed;await assert.rejects(cache.acquire(input.value,effects(1)),error=>error.code==='CANCELLED');assert.equal(cache.ensure(input.value,effects(1)),null);assert.equal(cache.reset(),closed);assert.equal(h.engines.length,0);assert.equal(input.calls.forks,0);
});

// Exercise the production native owner as well as the normal-image facade.
// Only protocol control messages run; no source pixels or mathematical kernels.
function workerFixture(t){
 const original=globalThis.Worker,workers=[];
 globalThis.Worker=class extends EventTarget{
  constructor(){super();this.messages=[];this.terminated=0;workers.push(this);}
  postMessage(message){this.messages.push(message);if(message.action==='release'&&message.ticket)this.reply({ticket:message.ticket,released:true});if(message.action==='dispose')this.reply({action:'disposed'});}
  reply(data){queueMicrotask(()=>this.onmessage?.({data}));}
  terminate(){this.terminated++;}
 };
 t.after(()=>{globalThis.Worker=original;});return{workers};
}

test('shared native service close waits its cancelled acquisition without closing another owner',async t=>{
 const h=workerFixture(t),a=createPdfCompositeEffectService({memoryBudgetBytes:34567890}),b=createPdfCompositeEffectService({memoryBudgetBytes:34567890}),inputA=source(),inputB=source();
 const acquiringA=a.acquire(inputA.value,effects(1)),acquiringB=b.acquire(inputB.value,effects(2));acquiringA.catch(()=>{});acquiringB.catch(()=>{});
 assert.equal(h.workers.length,1);const worker=h.workers[0],builds=worker.messages.filter(message=>message.action==='build');
 worker.reply({ticket:builds[1].ticket,resultId:builds[1].ticket,metrics:{computedTiles:0}});const leaseB=await acquiringB;
 const first=a.close(),second=a.close(),isSettled=pendingState(first);assert.equal(first,second);await tick();assert.equal(isSettled(),false);assert.equal(worker.terminated,0);
 worker.reply({ticket:builds[0].ticket,error:{code:'CANCELLED',message:'Cancelled fixture request'}});await assert.rejects(acquiringA,error=>error.code==='CANCELLED');await first;assert.equal(worker.terminated,0);
 const leaseB2=await b.acquire(inputB.value,effects(2));assert.equal(leaseB2.id,leaseB.id);leaseB2.close();leaseB.close();await b.close();assert.equal(worker.terminated,1);
});

test('the active native owner returns a valid explicit RGB read before closing',async t=>{
 const h=workerFixture(t),service=createPdfCompositeEffectService({memoryBudgetBytes:34567891}),input=source(),acquiring=service.acquire(input.value,effects(1));const worker=h.workers[0],build=worker.messages.find(message=>message.action==='build');
 worker.reply({ticket:build.ticket,resultId:build.ticket,metrics:{computedTiles:0}});const lease=await acquiring,reading=lease.readPixels({x:0,y:0,width:1,height:1}),request=worker.messages.findLast(message=>message.action==='read');
 worker.reply({ticket:request.ticket,pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(7,11,23)}});const pixels=await reading;assert.deepEqual([...pixels.data],[7,11,23]);assert.equal(request.explicit,true);lease.close();await service.close();assert.equal(worker.terminated,1);
});

test('a real native input release failure is observable and cannot strand the shared worker owner',async t=>{
 const h=workerFixture(t),budget=34567894,a=createPdfCompositeEffectService({memoryBudgetBytes:budget}),b=createPdfCompositeEffectService({memoryBudgetBytes:budget}),cause=Object.assign(Error('Native retained input release rejected'),{code:'STORAGE_FAILED'}),calls={retains:0,releases:0},inputA={width:8,height:8,retain(){calls.retains++;},async release(){calls.releases++;throw cause;},async readPixels(rect){return{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)};}},inputB=source();
 const acquiringA=a.acquire(inputA,effects(1)),acquiringB=b.acquire(inputB.value,effects(2)),worker=h.workers[0],builds=worker.messages.filter(message=>message.action==='build');
 assert.equal(h.workers.length,1);for(const build of builds)worker.reply({ticket:build.ticket,resultId:build.ticket,metrics:{computedTiles:0}});const [leaseA,leaseB]=await Promise.all([acquiringA,acquiringB]);
 assert.equal(calls.retains,1);leaseA.close();const closing=a.close();assert.equal(a.close(),closing);await assert.rejects(closing,error=>error===cause);assert.equal(calls.releases,1);assert.equal(worker.terminated,0,'The other cache still owns the shared worker.');
 const secondB=await b.acquire(inputB.value,effects(2));assert.equal(secondB.id,leaseB.id);const reading=secondB.readPixels({x:0,y:0,width:1,height:1}),read=worker.messages.findLast(message=>message.action==='read');worker.reply({ticket:read.ticket,pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(13,17,19)}});assert.deepEqual([...(await reading).data],[13,17,19]);secondB.close();leaseB.close();await b.close();
 assert.equal(worker.messages.filter(message=>message.action==='dispose').length,1,'The failed input release must still release its worker ownership.');assert.equal(worker.terminated,1);assert.equal(calls.retains,1);assert.equal(calls.releases,1);
});

test('closing a pending native build drains its late source and input release while another cache remains open',async t=>{
 const h=workerFixture(t),budget=34567895,a=createPdfCompositeEffectService({memoryBudgetBytes:budget}),b=createPdfCompositeEffectService({memoryBudgetBytes:budget}),readGate=deferred(),releaseGate=deferred(),calls={retains:0,releases:0,reads:0},inputA={width:8,height:8,retain(){calls.retains++;},async release(){calls.releases++;await releaseGate.promise;},readPixels(){calls.reads++;return readGate.promise;}},inputB=source();
 const acquiringA=a.acquire(inputA,effects(1)),acquiringB=b.acquire(inputB.value,effects(2));acquiringA.catch(()=>{});const worker=h.workers[0],builds=worker.messages.filter(message=>message.action==='build');worker.reply({ticket:builds[1].ticket,resultId:builds[1].ticket,metrics:{computedTiles:0}});const leaseB=await acquiringB;
 worker.reply({action:'source',ticket:builds[0].ticket,read:1,rect:{x:0,y:0,width:1,height:1}});await tick();assert.equal(calls.reads,1);assert.equal(calls.retains,1);
 const closing=a.close(),isSettled=pendingState(closing);worker.reply({ticket:builds[0].ticket,error:{code:'CANCELLED',message:'Cancelled pending build'}});await tick();assert.equal(isSettled(),false,'Cancellation of the build does not finish an outstanding native source read.');assert.equal(worker.terminated,0);assert.equal(calls.releases,0);
 readGate.resolve({width:1,height:1,format:'rgb8',data:Uint8Array.of(29,31,37)});await tick();assert.equal(calls.releases,1);assert.equal(isSettled(),false,'The retained input release is part of the owning cache close.');assert.equal(worker.messages.filter(message=>message.action==='source'&&message.read===1).length,0);
 releaseGate.resolve();await closing;await assert.rejects(acquiringA,error=>error.code==='CANCELLED');assert.equal(worker.terminated,0);const secondB=await b.acquire(inputB.value,effects(2));assert.equal(secondB.id,leaseB.id);secondB.close();leaseB.close();await b.close();assert.equal(worker.terminated,1);assert.equal(calls.retains,1);assert.equal(calls.releases,1);
});

test('late native source success or rejection is drained without transfer after its shared owner closes',async t=>{
 const h=workerFixture(t);
 for(const [index,ending]of ['resolve','reject'].entries()){
  const budget=34567892+index,a=createPdfCompositeEffectService({memoryBudgetBytes:budget}),b=createPdfCompositeEffectService({memoryBudgetBytes:budget}),readGate=deferred(),calls={retains:0,releases:0,reads:0},inputA={width:8,height:8,retain(){calls.retains++;},release(){calls.releases++;},readPixels(){calls.reads++;return readGate.promise;}},inputB=source();
  const acquiringA=a.acquire(inputA,effects(1)),acquiringB=b.acquire(inputB.value,effects(2)),worker=h.workers.at(-1),builds=worker.messages.filter(message=>message.action==='build');
  for(const build of builds)worker.reply({ticket:build.ticket,resultId:build.ticket,metrics:{computedTiles:0}});const [leaseA,leaseB]=await Promise.all([acquiringA,acquiringB]);
  worker.reply({action:'source',ticket:builds[0].ticket,read:1,rect:{x:0,y:0,width:1,height:1}});await tick();assert.equal(calls.reads,1);assert.equal(calls.retains,2);
  leaseA.close();const closing=a.close(),isSettled=pendingState(closing);await tick();assert.equal(isSettled(),false,'The source read owns a live retain until it settles.');assert.equal(worker.terminated,0);
  if(ending==='resolve')readGate.resolve({width:1,height:1,format:'rgb8',data:Uint8Array.of(3,5,7)});else readGate.reject(Object.assign(Error('Late source error'),{code:'STORAGE_FAILED'}));
  await closing;assert.equal(calls.releases,2);assert.equal(worker.messages.filter(message=>message.action==='source'&&message.read===1).length,0);assert.equal(worker.terminated,0);leaseB.close();await b.close();assert.equal(worker.terminated,1);
 }
});
