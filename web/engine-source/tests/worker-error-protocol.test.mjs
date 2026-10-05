import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerEngine} from '../src/worker-client.js';

test('public worker preserves allocation and recovery diagnostics without destroying the session',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');let stopped=false;
 const failure={code:'MEMORY_ALLOCATION',message:'Array buffer allocation failed',stack:'RangeError: Array buffer allocation failed\n    at evaluateCandidate (d2prl-exact.js:42:7)',details:{operation:'d2prl-patchmatch-evaluate',requestedBytes:4194304,recovery:{consecutive:5,loopDetected:true}},cause:{name:'RangeError',message:'Array buffer allocation failed',stack:'original allocation stack'}};
 class Worker {
  postMessage({sequence,method}){queueMicrotask(()=>this.onmessage({data:method==='run'?{sequence,error:structuredClone(failure)}:{sequence,result:{ready:true}}}));}
  terminate(){stopped=true;}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:Worker});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
 const engine=createWorkerEngine({resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}});
 await assert.rejects(engine.run({operation:'analysis.complete'}),error=>{
  assert.equal(error.code,failure.code);assert.equal(error.message,failure.message);assert.equal(error.stack,failure.stack);
  assert.deepEqual(error.details,failure.details);assert.equal(error.cause.name,failure.cause.name);assert.equal(error.cause.message,failure.cause.message);assert.equal(error.cause.stack,failure.cause.stack);return true;
 });
 assert.equal(stopped,false);assert.deepEqual(await engine.capabilities(),{ready:true});
 await engine.dispose();assert.equal(stopped,true);
});

test('capabilities stays readable during a live public operation; unreadable responses settle pending work',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');let instance,started,holdRead=false;
 const entered=new Promise(resolve=>started=resolve);
 class Worker {
  constructor(){instance=this;this.stopped=false;}
  postMessage({sequence,method}){if(method==='run'){this.runSequence=sequence;started();return;}if(method==='capabilities'&&holdRead)return;queueMicrotask(()=>this.onmessage?.({data:{sequence,result:{ready:true}}}));}
  terminate(){this.stopped=true;}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:Worker});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
 const engine=createWorkerEngine({resourceHints:{hardwareConcurrency:4,deviceMemoryGiB:8}});
 const running=engine.run({operation:'analysis.complete'});await entered;
 assert.deepEqual(await engine.capabilities(),{ready:true});assert.equal(instance.stopped,false);
 holdRead=true;const controller=new AbortController(),read=engine.capabilities({signal:controller.signal});
 const readRejected=assert.rejects(read,{code:'CANCELLED'});await new Promise(resolve=>setImmediate(resolve));controller.abort();await readRejected;
 assert.equal(instance.stopped,false);holdRead=false;assert.deepEqual(await engine.capabilities(),{ready:true});
 const rejected=assert.rejects(running,error=>error.code==='WORKER_MESSAGE_FAILED'&&error.imagesCleared===true);
 instance.onmessage({data:null});await rejected;assert.equal(instance.stopped,true);
 await engine.dispose();
});

for(const fault of ['null','messageerror'])test('public '+fault+' preserves the cooperative storage-close acknowledgement',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');let instance,started;
 const entered=new Promise(resolve=>started=resolve);
 class Worker {
  constructor(){instance=this;this.stopped=false;}
  postMessage({sequence,method}){if(method==='run'){started();return;}queueMicrotask(()=>{if(method==='cancel-and-close'){this.onmessage?.({data:{shutdownPhase:'closed-handles'}});this.onmessage?.({data:{storageClosed:true}});}else this.onmessage?.({data:{sequence,result:method==='loadBlob'?{provenance:{layout:'segmented-scanlines'}}:{ready:true}}});});}
  terminate(){this.stopped=true;}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:Worker});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
 const engine=createWorkerEngine({resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}});
 await engine.loadBlob({id:'source'});
 const running=engine.run({operation:'analysis.complete'});await entered;
 const rejected=assert.rejects(running,error=>error.code==='WORKER_MESSAGE_FAILED'&&error.cancellationMode==='storage-closed-before-worker-termination'&&error.cancellationPhases.includes('closed-handles'));
 if(fault==='null')instance.onmessage({data:null});else instance.onmessageerror({});
 await rejected;assert.equal(instance.stopped,true);await engine.dispose();
});
