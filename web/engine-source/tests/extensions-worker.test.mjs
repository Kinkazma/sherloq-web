import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineError} from '../src/errors.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks'),turn=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};

test('extension worker RPC shares useful hooks and drains cancellation without clearing segmented originals',{skip:!enabled&&'Requires isolated module mocks'},async t=>{
 const oldWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker'),oldSelf=Object.getOwnPropertyDescriptor(globalThis,'self'),workers=[],cleanup=[];let state,serial=0;
 t.mock.module('../src/temporary-storage.js',{namedExports:{removeTerminatedTemporarySession:async(id,backend)=>cleanup.push({id,backend})}});
 t.mock.module('../src/index.js',{namedExports:{createEngine:options=>{
  const s=state;
  async function useful(input,{signal,onProgress}){s.entered.resolve();onProgress?.({phase:'useful-extension',fraction:.5});if(s.cancel){await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));s.aborted=true;await s.drain.promise;throw new EngineError('CANCELLED','Extension owned I/O drained.');}return{status:'ok',surface:{id:'kept-result'}};}
  return{capabilities:()=>({source:s.source,loaded:s.loaded}),async loadBlob(input){s.source=true;options.onTemporarySession({id:input.temporarySessionId,backend:'opfs'});return{provenance:{layout:'segmented-scanlines'}};},async loadExtensionModels(input,hooks){s.loaded=true;assert.ok(hooks.signal instanceof AbortSignal);return{methods:['bfree'],sharedResources:true};},async unloadExtensionModels(){s.loaded=false;},runExtensions:useful,run:useful,async dispose(){s.source=false;s.disposed++;}};
 }}});
 class BridgeWorker{constructor(){this.commands=[];workers.push(this);this.target={postMessage:data=>queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data:structuredClone(data)});})};Object.defineProperty(globalThis,'self',{value:this.target,configurable:true});this.ready=import('../src/worker.js?extensions='+ ++serial);}postMessage(data){this.commands.push(data.method);this.ready.then(()=>{if(!this.dead)this.target.onmessage({data:structuredClone(data)});});}terminate(){this.dead=true;}}
 Object.defineProperty(globalThis,'Worker',{value:BridgeWorker,configurable:true});t.after(()=>{if(oldWorker)Object.defineProperty(globalThis,'Worker',oldWorker);else delete globalThis.Worker;if(oldSelf)Object.defineProperty(globalThis,'self',oldSelf);else delete globalThis.self;});t.mock.timers.enable({apis:['setTimeout']});
 const{createWorkerEngine}=await import('../src/worker-client.js');
 for(const method of ['runExtensions','run'])await t.test(method,async()=>{
  state={source:false,loaded:false,cancel:true,entered:gate(),drain:gate(),disposed:0};const engine=createWorkerEngine(),s=state,stop=new AbortController(),events=[];
  try{await engine.loadBlob({id:'original'});await engine.loadExtensionModels({baseURL:'https://example.invalid/'});const worker=workers.at(-1),pending=engine[method]({id:'test',imageId:'original',operation:'jpeg.comprint'},{signal:stop.signal,onProgress:e=>events.push(e)});let settled=false;const rejected=assert.rejects(pending,error=>error.code==='CANCELLED'&&error.imagesCleared===false&&error.message==='Extension owned I/O drained.').finally(()=>settled=true);await s.entered.promise;stop.abort();await turn();t.mock.timers.tick(6000);await turn();assert.equal(settled,false);assert.equal(worker.dead,undefined);assert.equal(s.aborted,true);assert.ok(worker.commands.includes('cancel-task'));assert.ok(!worker.commands.includes('cancel-and-close'));assert.deepEqual(await engine.capabilities(),{source:true,loaded:true});assert.equal(events[0].phase,'useful-extension');s.drain.resolve();await rejected;s.cancel=false;assert.equal((await engine.runExtensions({id:'retry',imageId:'original'})).status,'ok');await engine.unloadExtensionModels();assert.deepEqual(await engine.capabilities(),{source:true,loaded:false});assert.deepEqual(cleanup,[]);}finally{s.drain.resolve();await engine.dispose();}assert.equal(s.disposed,1);assert.equal(workers.at(-1).dead,true);
 });
});

test('a completed extension reply winning cancellation retains its published surfaces',async t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'Worker');let worker,entered;const started=new Promise(r=>entered=r);
 class Worker{constructor(){worker=this;}terminate(){this.dead=true;}postMessage({sequence,method}){if(method==='runExtensions'){this.sequence=sequence;entered();return;}if(method==='cancel-task')return;queueMicrotask(()=>this.onmessage?.({data:{sequence,result:{ready:true}}}));}}
 Object.defineProperty(globalThis,'Worker',{value:Worker,configurable:true});t.after(()=>{if(old)Object.defineProperty(globalThis,'Worker',old);else delete globalThis.Worker;});
 const{createWorkerEngine}=await import('../src/worker-client.js'),engine=createWorkerEngine(),stop=new AbortController(),pending=engine.runExtensions({id:'complete',imageId:'original'},{signal:stop.signal});await started;stop.abort();const value={status:'ok',results:[{surface:{id:'published'}}]};worker.onmessage({data:{sequence:worker.sequence,result:value}});assert.deepEqual(await pending,value);assert.equal(worker.dead,undefined);await engine.dispose();
});
