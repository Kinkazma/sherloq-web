// Actual worker-client RPC ownership, with controlled Worker ACKs. No image
// arithmetic or browser timing is simulated by this transport fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerEngine} from '../src/worker-client.js';
import {checkAbort} from '../src/errors.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(t,{provisionalDisplayOnly=true}={}){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker'),instances=[];
 class Worker{
  constructor(){this.commands=[];this.sources=new Set();this.surfaces=new Set();instances.push(this);}
  terminate(){this.dead=true;this.sources.clear();this.surfaces.clear();}
  reply(sequence,result,error){this.onmessage?.({data:{sequence,...(error?{error}:{result})}});}
  postMessage(command){
   this.commands.push(command);const {method,args,sequence}=command;
   if(method==='cancel-task'||method==='readDisplay'){if(method==='readDisplay')this.read=command;return;}
   queueMicrotask(()=>{
    if(this.dead)return;
    if(method==='load'){this.sources.add(args[0].id);this.reply(sequence,{id:args[0].id,surface:{id:args[0].id,width:4,height:3}});return;}
    if(method==='run'){if(!this.sources.has(args[0].imageId)){this.reply(sequence,null,{code:'NOT_FOUND',message:'Source was lost'});return;}this.surfaces.add(args[0].id);this.reply(sequence,{id:args[0].id,surface:{id:args[0].id,revision:1,width:4,height:3}});return;}
    if(method==='releaseSurface'){if(!this.surfaces.delete(args[0]))this.reply(sequence,null,{code:'NOT_FOUND',message:'Result surface no longer exists'});else this.reply(sequence,{released:true});return;}
    this.reply(sequence,{ready:true,sources:this.sources.size,surfaces:this.surfaces.size});
   });
  }
 }
 Object.defineProperty(globalThis,'Worker',{value:Worker,configurable:true});
 const engine=createWorkerEngine({provisionalDisplayOnly,resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}});
 t.after(async()=>{await engine.dispose();if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
 const native=async(id='preview-result')=>{if(!instances[0]?.sources.size)await engine.load({id:'preview-source'});return engine.run({id,imageId:'preview-source',operation:'detail.echo',params:{radius:2,contrast:90}});};
 async function reading(){const result=await native(),stop=new AbortController();let outcome;const promise=engine.readDisplay({surfaceId:result.id,revision:1,tile:{x:0,y:0,width:4,height:3,step:1}},{signal:stop.signal});const observed=promise.then(value=>{outcome={value};},error=>{outcome={error};});await turn();return{stop,promise,observed,result,worker:instances.at(-1),get outcome(){return outcome;}};}
 return{engine,instances,native,reading};
}

test('provisional read cancellation waits for ACK, releases the same surface, and reuses the same source/worker',async t=>{
 const h=fixture(t),r=await h.reading();r.stop.abort();await turn();
 assert.equal(r.outcome,undefined,'Cancellation must wait until the worker drains the read');assert.equal(r.worker.dead,undefined);assert.equal(h.instances.length,1);
 assert.equal(r.worker.commands.filter(c=>c.method==='cancel-task').length,1);
 await assert.rejects(h.engine.run({id:'too-early',imageId:'preview-source',operation:'detail.echo'}),error=>error.code==='BUSY');
 r.worker.reply(r.worker.read.sequence,null,{code:'CANCELLED',message:'Display read drained'});await r.observed;assert.equal(r.outcome.error.code,'CANCELLED');assert.equal(r.outcome.error.imagesCleared,false);
 assert.deepEqual(await h.engine.releaseSurface(r.result.id),{released:true});const next=await h.native('next-preview');assert.equal(next.id,'next-preview');assert.equal(h.instances.length,1);assert.equal(r.worker.dead,undefined);assert.equal(r.worker.commands.filter(c=>c.method==='load').length,1);assert.deepEqual(await h.engine.releaseSurface(next.id),{released:true});
});

test('a completed read winning cancellation keeps its owned bytes until the stale consumer rejects publication',async t=>{
 const h=fixture(t),r=await h.reading(),pixels={format:'rgb8',width:4,height:3,data:new Uint8Array(36).fill(17)};r.stop.abort();r.worker.reply(r.worker.read.sequence,{pixels});await r.observed;
 assert.deepEqual(r.outcome.value,{pixels});assert.throws(()=>checkAbort(r.stop.signal),error=>error.code==='CANCELLED');assert.equal(r.worker.dead,undefined);await h.engine.releaseSurface(r.result.id);assert.equal((await h.native('successor')).id,'successor');assert.equal(h.instances.length,1);
});

test('an already cancelled display request after a completed run performs no read and does not reset the worker',async t=>{
 const h=fixture(t),result=await h.native(),stop=new AbortController();stop.abort();await assert.rejects(h.engine.readDisplay({surfaceId:result.id,revision:1},{signal:stop.signal}),error=>error.code==='CANCELLED');assert.equal(h.instances[0].commands.some(c=>c.method==='readDisplay'),false);await h.engine.releaseSurface(result.id);assert.equal((await h.native('next')).id,'next');assert.equal(h.instances.length,1);
});

test('repeated short provisional read cancellations never restart or reload the source',async t=>{
 const h=fixture(t);
 for(let i=0;i<8;i++){
  const r=await h.reading();r.stop.abort();await turn();assert.equal(r.outcome,undefined);r.worker.reply(r.worker.read.sequence,null,{code:'CANCELLED',message:'Read cancelled after owned I/O drained'});await r.observed;assert.equal(r.outcome.error.imagesCleared,false);await h.engine.releaseSurface(r.result.id);
 }
 assert.equal(h.instances.length,1);assert.equal(h.instances[0].commands.filter(c=>c.method==='load').length,1);assert.equal(h.instances[0].surfaces.size,0);
});

test('a refused read ACK surfaces its real error without retiring the live source or inventing success',async t=>{
 const h=fixture(t),r=await h.reading();r.stop.abort();r.worker.reply(r.worker.read.sequence,null,{code:'MEMORY_LIMIT',message:'Read workspace could not be admitted'});await r.observed;assert.equal(r.outcome.error.code,'MEMORY_LIMIT');assert.equal(r.outcome.error.imagesCleared,false);assert.equal(r.worker.dead,undefined);await h.engine.releaseSurface(r.result.id);assert.equal((await h.native('retry')).id,'retry');assert.equal(h.instances.length,1);
});

test('explicit disposal while a provisional read waits for ACK closes the worker and rejects its late reply',async t=>{
 const h=fixture(t),r=await h.reading();r.stop.abort();await h.engine.dispose();await r.observed;assert.equal(r.outcome.error.code,'DISPOSED');assert.equal(r.outcome.error.imagesCleared,true);assert.equal(r.worker.dead,true);r.worker.reply(r.worker.read.sequence,{pixels:{data:new Uint8Array(36)}});await turn();assert.equal(r.outcome.error.code,'DISPOSED');await assert.rejects(h.engine.readDisplay({surfaceId:r.result.id}),error=>error.code==='DISPOSED');assert.equal(h.instances.length,1);
});

test('a real transport failure during a cancelled read still performs fatal reset',async t=>{
 const h=fixture(t),r=await h.reading();r.stop.abort();r.worker.onmessageerror();await r.observed;assert.equal(r.outcome.error.code,'WORKER_MESSAGE_FAILED');assert.equal(r.outcome.error.imagesCleared,true);assert.equal(r.worker.dead,true);
});

test('Original/native display cancellation retains its historical worker termination contract',async t=>{
 const h=fixture(t,{provisionalDisplayOnly:false}),r=await h.reading();r.stop.abort();await r.observed;assert.equal(r.outcome.error.code,'CANCELLED');assert.equal(r.outcome.error.imagesCleared,true);assert.equal(r.worker.dead,true);assert.equal(r.worker.commands.some(c=>c.method==='cancel-task'),false);
});

test('the actual worker dispatcher forwards read cancellation and ACKs only after read workspace cleanup',{skip:!process.execArgv.includes('--experimental-test-module-mocks')},async t=>{
 const previousWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker'),previousSelf=Object.getOwnPropertyDescriptor(globalThis,'self');let worker,entered,drain,readAborted=false,readActive=false,source=false;
 const started=new Promise(resolve=>entered=resolve),drained=new Promise(resolve=>drain=resolve);
 t.mock.module('../src/index.js',{namedExports:{createEngine:()=>({capabilities:()=>({source,readActive}),load(){source=true;return{surface:{id:'derived-source'}};},async readDisplay(_request,{signal}){readActive=true;entered();try{await new Promise(resolve=>signal.addEventListener('abort',()=>{readAborted=true;resolve();},{once:true}));await drained;throw Object.assign(Error('Read cancelled'),{code:'CANCELLED'});}finally{readActive=false;}},releaseSurface(){assert.equal(readActive,false,'No release before the read finally/ACK');return{released:true};},dispose(){source=false;}})}});
 class Bridge{
  constructor(){worker=this;this.commands=[];const target={postMessage:data=>queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data:structuredClone(data)});})};this.target=target;Object.defineProperty(globalThis,'self',{value:target,configurable:true});this.ready=import('../src/worker.js?preview-read-cancellation');}
  postMessage(command){this.commands.push(command);this.ready.then(()=>{if(!this.dead)this.target.onmessage({data:structuredClone(command)});});}
  terminate(){this.dead=true;}
 }
 Object.defineProperty(globalThis,'Worker',{value:Bridge,configurable:true});const engine=createWorkerEngine({provisionalDisplayOnly:true,resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}});
 t.after(async()=>{drain();await engine.dispose();for(const [name,descriptor]of [['Worker',previousWorker],['self',previousSelf]])if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 await engine.load({id:'derived-source'});const stop=new AbortController();let settled=false;const read=engine.readDisplay({surfaceId:'preview-result',revision:1},{signal:stop.signal}),rejected=assert.rejects(read,error=>error.code==='CANCELLED'&&error.imagesCleared===false).finally(()=>settled=true);
 await started;stop.abort();await turn();assert.equal(readAborted,true);assert.equal(readActive,true);assert.equal(settled,false);assert.equal(worker.dead,undefined);await assert.rejects(engine.releaseSurface('preview-result'),error=>error.code==='BUSY');drain();await rejected;assert.equal(readActive,false);assert.deepEqual(await engine.releaseSurface('preview-result'),{released:true});assert.deepEqual(await engine.capabilities(),{source:true,readActive:false});assert.equal(worker.commands.filter(c=>c.method==='init').length,1);
});
