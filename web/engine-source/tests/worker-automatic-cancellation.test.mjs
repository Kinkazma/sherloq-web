import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineError} from '../src/errors.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks'),turn=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};

test('public worker automatic cancellation retains segmented storage and relays settled checkpoint ownership',
 {skip:!enabled&&'Requires isolated module mocks'},async t=>{
  const oldWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker'),oldSelf=Object.getOwnPropertyDescriptor(globalThis,'self'),instances=[],cleanup=[];let fixture,serial=0;
  t.mock.module('../src/temporary-storage.js',{namedExports:{removeTerminatedTemporarySession:async(id,backend)=>cleanup.push({id,backend})}});
  t.mock.module('../src/index.js',{namedExports:{createEngine:options=>{
   const f=fixture;f.instances++;const state={states:{patchmatch:'done',sift:'cancelled'},completed:['patchmatch'],resumable:['sift'],running:[],attempts:{patchmatch:1,sift:1},errors:{}};
   const frame=()=>({analysisId:'kept-analysis',data:{state:structuredClone(state)}});
   async function useful(request,{signal}){
    f.calls.push(f.method);f.checkpoint=true;f.entered.resolve();
    if(!f.cancel)return frame();
    await new Promise(resolve=>signal.addEventListener('abort',()=>{f.aborted=true;resolve();},{once:true}));
    await f.drain.promise;
    const error=new EngineError('CANCELLED','Useful operation drained owned I/O',{cause:new Error('Original cancellation checkpoint'),details:{phase:'published-checkpoint',retainedAnalysis:{analysisId:'kept-analysis',completed:['patchmatch'],state:structuredClone(state)}}});
    error.stack='EngineError: Useful operation drained owned I/O\n    at actualUsefulCheckpoint (worker.js:1:1)';throw error;
   }
   return {capabilities:()=>({checkpoint:f.checkpoint,source:f.source}),async loadBlob(input){f.source=true;f.session=input.temporarySessionId;options.onTemporarySession({id:f.session,backend:'opfs'});return {provenance:{layout:'segmented-scanlines'}};},run:useful,resumeAutomatic:useful,updateAutomatic:useful,renderAutomatic:useful,exportAutomatic:useful,async dispose(){f.disposed++;f.source=false;f.checkpoint=false;}};
  }}});
  class BridgeWorker{
   constructor(){this.dead=false;this.commands=[];instances.push(this);const target={postMessage:data=>queueMicrotask(()=>{if(!this.dead)this.onmessage?.({data:structuredClone(data)});})};this.target=target;Object.defineProperty(globalThis,'self',{value:target,configurable:true});this.ready=import('../src/worker.js?automatic-cancel='+ ++serial);}
   postMessage(data){this.commands.push(data.method);this.ready.then(()=>{if(!this.dead)this.target.onmessage({data:structuredClone(data)});});}
   terminate(){this.dead=true;}
  }
  Object.defineProperty(globalThis,'Worker',{value:BridgeWorker,configurable:true});
  t.after(()=>{if(oldWorker)Object.defineProperty(globalThis,'Worker',oldWorker);else delete globalThis.Worker;if(oldSelf)Object.defineProperty(globalThis,'self',oldSelf);else delete globalThis.self;});
  t.mock.timers.enable({apis:['setTimeout']});
  const {createWorkerEngine}=await import('../src/worker-client.js');
  const create=method=>{fixture={method,instances:0,calls:[],source:false,checkpoint:false,cancel:true,entered:gate(),drain:gate(),disposed:0};return {f:fixture,engine:createWorkerEngine({resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}})};};
  for(const method of ['run','resumeAutomatic','updateAutomatic','renderAutomatic','exportAutomatic'])await t.test(method+' waits past five seconds and preserves exact retainedAnalysis',async()=>{
   const {f,engine}=create(method),stop=new AbortController();let error,settled=false;
   try{
    await engine.loadBlob({id:'source'});const worker=instances.at(-1),request=method==='run'?{operation:'analysis.complete'}:{analysisId:'kept-analysis'},pending=engine[method](request,{signal:stop.signal});
    const rejected=assert.rejects(pending,caught=>{error=caught;return caught.code==='CANCELLED';}).finally(()=>{settled=true;});await f.entered.promise;stop.abort();await turn();assert.equal(f.aborted,true);assert.ok(worker.commands.includes('cancel-task'));assert.ok(!worker.commands.includes('cancel-and-close'));
    t.mock.timers.tick(6000);await turn();assert.equal(settled,false);assert.equal(worker.dead,false);assert.equal(f.source,true);assert.equal(f.checkpoint,true);assert.deepEqual(await engine.capabilities(),{checkpoint:true,source:true});assert.deepEqual(cleanup,[]);
    f.drain.resolve();await rejected;assert.equal(error.imagesCleared,false);assert.equal(error.message,'Useful operation drained owned I/O');assert.equal(error.cause.message,'Original cancellation checkpoint');assert.match(error.stack,/actualUsefulCheckpoint/);assert.equal(error.details.retainedAnalysis.analysisId,'kept-analysis');assert.deepEqual(error.details.retainedAnalysis.completed,['patchmatch']);assert.equal(error.details.phase,'published-checkpoint');assert.equal(worker.dead,false);
    f.cancel=false;const resumed=await engine.resumeAutomatic({analysisId:error.details.retainedAnalysis.analysisId});assert.equal(resumed.analysisId,'kept-analysis');assert.equal(f.instances,1);assert.deepEqual(cleanup,[]);
   }finally{f.drain.resolve();await engine.dispose();}assert.equal(f.disposed,1);assert.equal(f.source,false);assert.equal(f.checkpoint,false);assert.equal(instances.at(-1).dead,true);assert.deepEqual(cleanup,[]);
  });
  await t.test('explicit dispose during cooperative cancellation drains and closes source ownership',async()=>{
   const {f,engine}=create('run'),stop=new AbortController();await engine.loadBlob({id:'source'});const worker=instances.at(-1),pending=engine.run({operation:'analysis.clones'},{signal:stop.signal});const rejected=assert.rejects(pending,error=>error.code==='DISPOSED'&&error.imagesCleared===true&&!error.details?.retainedAnalysis);await f.entered.promise;stop.abort();await turn();const disposing=engine.dispose();await turn();assert.ok(worker.commands.includes('cancel-and-close'));f.drain.resolve();await disposing;await rejected;assert.equal(f.disposed,1);assert.equal(worker.dead,true);assert.deepEqual(cleanup,[]);
  });
  await t.test('explicit forced shutdown reports cleared images and cleans terminated temporary storage',async()=>{
   const {f,engine}=create('run'),stop=new AbortController();await engine.loadBlob({id:'source'});const worker=instances.at(-1),pending=engine.run({operation:'analysis.complete'},{signal:stop.signal});const rejected=assert.rejects(pending,error=>error.code==='DISPOSED'&&error.imagesCleared===true&&error.cancellationMode==='forced-after-storage-close-timeout'&&!error.details?.retainedAnalysis);await f.entered.promise;stop.abort();await turn();const disposing=engine.dispose();await turn();t.mock.timers.tick(1001);await disposing;await rejected;assert.equal(worker.dead,true);assert.deepEqual(cleanup,[{id:f.session,backend:'opfs'}]);f.drain.resolve();await turn();
  });
 });

test('a completed automatic reply winning cancellation returns its owned success',async t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'Worker');let worker,entered;const started=new Promise(r=>entered=r);
 class Worker{constructor(){worker=this;}terminate(){this.dead=true;}postMessage({sequence,method}){if(method==='run'){this.sequence=sequence;entered();return;}if(method==='cancel-task')return;queueMicrotask(()=>this.onmessage?.({data:{sequence,result:{ready:true}}}));}}
 Object.defineProperty(globalThis,'Worker',{value:Worker,configurable:true});t.after(()=>{if(old)Object.defineProperty(globalThis,'Worker',old);else delete globalThis.Worker;});
 const {createWorkerEngine}=await import('../src/worker-client.js'),engine=createWorkerEngine(),stop=new AbortController();
 const pending=engine.run({operation:'analysis.complete'},{signal:stop.signal});await started;stop.abort();const completed={analysisId:'complete',data:{state:{completed:['sift'],resumable:[]}}};worker.onmessage({data:{sequence:worker.sequence,result:completed}});assert.deepEqual(await pending,completed);assert.equal(worker.dead,undefined);await engine.dispose();assert.equal(worker.dead,true);
});
