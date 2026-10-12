import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoupeImageCache} from '../sherloq-browser/assets/loupe-full-client.js';
import {installLoupeFullWorker} from '../sherloq-browser/assets/loupe-full-worker.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const effects=brightness=>({adjust:{enabled:true,brightness},enhance:{enabled:false},sweep:{enabled:false}});
const input=()=>({width:1,height:1,readPixels:async()=>({width:1,height:1,data:Uint8Array.of(1,2,3)})});
const result=ticket=>({ticket,resultId:ticket,preview:{width:1,height:1,data:Uint8Array.of(10,20,30)},metrics:{computed:['adjust']}});
function fixture(t,{postFailure,constructorFailure}={}){
 const originalWorker=globalThis.Worker,originalDocument=globalThis.document,workers=[];let starts=0;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData(){}};}};}};
 globalThis.Worker=class {
  constructor(url){starts++;if(constructorFailure&&starts===1)throw constructorFailure;this.url=url;this.messages=[];this.terminated=0;workers.push(this);}
  postMessage(message){if(postFailure&&message.action==='build')throw postFailure;this.messages.push(message);if(message.action==='dispose')queueMicrotask(()=>this.onmessage?.({data:{action:'disposed'}}));}
  terminate(){this.terminated++;}
  reply(data){this.onmessage({data});}
  fail(error=Error('script unavailable')){this.onerror({type:'error',message:error.message,error,filename:'https://site.test/loupe-full-worker.js',lineno:3,colno:4});}
 };
 const caches=[];t.after(()=>{for(const cache of caches)cache.dispose();globalThis.Worker=originalWorker;globalThis.document=originalDocument;});
 return {workers,get starts(){return starts;},cache(options){const cache=createLoupeImageCache(options);caches.push(cache);return cache;}};
}

test('fatal preparation failure stays latched during movement; effects and explicit acquire may retry',async t=>{
 const h=fixture(t),states=[],cache=h.cache({state:s=>states.push(s)}),source=input();cache.ensure(source,effects(1));h.workers[0].fail();await tick();
 for(let n=0;n<100;n++)cache.ensure(source,effects(1));assert.equal(h.starts,1);assert.equal(states.filter(s=>s.error).length,1);
 cache.ensure(source,effects(2));assert.equal(h.starts,2);h.workers[1].fail();await tick();
 const pending=cache.acquire(source,effects(2));assert.equal(h.starts,3);h.workers[2].reply(result(1));const lease=await pending;assert.equal(lease.preparedLoupe,true);assert.equal(cache.metrics.builds,1);lease.close();
});

test('changing the input permits a fresh worker, while cancelled results cannot replace the new input',async t=>{
 const h=fixture(t),cache=h.cache(),first=input(),second=input();cache.ensure(first,effects(1));h.workers[0].fail();await tick();cache.ensure(second,effects(1));assert.equal(h.starts,2);h.workers[1].reply(result(1));await tick();assert.equal(cache.current.source,second);
 const third=input();cache.ensure(third,effects(2));const oldTicket=h.workers[1].messages.findLast(m=>m.action==='build').ticket;cache.ensure(second,effects(3));const latestTicket=h.workers[1].messages.findLast(m=>m.action==='build').ticket;
 h.workers[1].reply(result(oldTicket));h.workers[1].reply(result(latestTicket));await tick();assert.equal(cache.current.source,second);assert.equal(cache.current.id,latestTicket);assert.ok(h.workers[1].messages.some(m=>m.action==='release'&&m.resultId===oldTicket));
});

test('immediate explicit retry cannot inherit the failed service pending job with the same ticket',async t=>{
 const h=fixture(t),cache=h.cache(),source=input();cache.ensure(source,effects(1));h.workers[0].fail();const pending=cache.acquire(source,effects(1));assert.equal(h.starts,2);h.workers[1].reply(result(1));(await pending).close();await tick();assert.equal(cache.settled,true);assert.equal(cache.metrics.builds,1);
});

test('constructor and postMessage failures preserve their causes and do not trigger draw retries',async t=>{
 const cause=Object.assign(Error('worker denied'),{code:'SECURITY'}),h=fixture(t,{constructorFailure:cause}),states=[],cache=h.cache({state:s=>states.push(s)}),source=input();
 cache.ensure(source,effects(1));for(let n=0;n<25;n++)cache.ensure(source,effects(1));assert.equal(h.starts,1);assert.equal(states.at(-1).error.cause,cause);assert.equal(states.at(-1).error.details.executionPhase,'worker-startup');
 const pending=cache.acquire(source,effects(1));assert.equal(h.starts,2);h.workers[0].reply(result(1));(await pending).close();
});

test('null responses and messageerror reject pending work and remain latched',async t=>{
 const h=fixture(t),states=[],cache=h.cache({state:s=>states.push(s)}),source=input();cache.ensure(source,effects(1));h.workers[0].reply(null);await tick();
 for(let n=0;n<100;n++)cache.ensure(source,effects(1));assert.equal(h.starts,1);assert.equal(states.at(-1).error.code,'WORKER_MESSAGE_FAILED');
 const cause=Error('structured clone refused'),pending=cache.acquire(source,effects(1));h.workers[1].onmessageerror({error:cause});await assert.rejects(pending,error=>error.code==='WORKER_MESSAGE_FAILED'&&error.cause===cause);await tick();for(let n=0;n<20;n++)cache.ensure(source,effects(1));assert.equal(h.starts,2);
});

test('async source failure is returned with its complete nested cause',async t=>{
 const h=fixture(t),cache=h.cache(),cause=Object.assign(Error('storage unavailable'),{code:'STORAGE_FAILED',details:{status:503}}),failure=Object.assign(Error('pixel read failed',{cause}),{code:'SOURCE_READ'}),source={...input(),readPixels:async()=>{throw failure;}};
 const pending=cache.acquire(source,effects(1));h.workers[0].reply({action:'source',ticket:1,read:7,rect:{x:0,y:0,width:1,height:1}});await tick();const reply=h.workers[0].messages.find(m=>m.action==='source');assert.equal(reply.error.cause.code,'STORAGE_FAILED');assert.equal(reply.error.cause.details.status,503);
 h.workers[0].reply({ticket:1,error:reply.error});await assert.rejects(pending,error=>error.code==='SOURCE_READ'&&error.cause instanceof Error&&error.cause.details.status===503);
});

test('sending a build failure settles the request once without leaving a spinning service',async t=>{
 const cause=Error('DataCloneError'),h=fixture(t,{postFailure:cause}),states=[],cache=h.cache({state:s=>states.push(s)}),source=input();cache.ensure(source,effects(1));await tick();for(let n=0;n<100;n++)cache.ensure(source,effects(1));assert.equal(h.starts,1);assert.equal(states.at(-1).error.code,'WORKER_MESSAGE_FAILED');assert.equal(states.at(-1).error.cause,cause);assert.equal(h.workers[0].terminated,1);
});

test('a shared service failure blocks automatic preparation retries in every affected panel',async t=>{
 const h=fixture(t),a=h.cache(),b=h.cache(),first=input(),second=input();a.ensure(first,effects(1));b.ensure(second,effects(2));assert.equal(h.starts,1);h.workers[0].fail();await tick();
 for(let n=0;n<50;n++){a.ensure(first,effects(1));b.ensure(second,effects(2));}assert.equal(h.starts,1);
 a.ensure(first,effects(3));for(let n=0;n<50;n++)b.ensure(second,effects(2));assert.equal(h.starts,2);
});

test('a retained overview survives a fatal service error; acquire rebuilds only on explicit request',async t=>{
 const h=fixture(t),cache=h.cache(),source=input();cache.ensure(source,effects(1));h.workers[0].reply(result(1));await tick();assert.equal(cache.settled,true);h.workers[0].fail();
 let paints=0;for(let n=0;n<50;n++){cache.ensure(source,effects(1));cache.draw({drawImage(){paints++;}},{left:0,top:0,right:1,bottom:1},1,0);}assert.equal(h.starts,1);assert.equal(paints,50);assert.equal(cache.settled,false);
 const pending=cache.acquire(source,effects(1));assert.equal(h.starts,2);h.workers[1].reply(result(1));(await pending).close();assert.equal(cache.settled,true);
});

function workerRuntime({builder=async()=>({surface:{readSampledWindow:async()=>({pixels:{width:1,height:1,data:Uint8Array.of(3,4,5)},release(){}}),dispose:async()=>{}},metrics:{}}),loadFailure}={}){
 const replies=[],loaded=[],scope={postMessage:message=>replies.push(message)};
 const modules={'loupe-full-image.js':{buildLoupeImage:builder},'cache.js':{Budget:class{constructor(limit){this.limit=limit;}}},'temporary-storage.js':{createTemporarySession:async()=>({dispose(){}})},'errors.js':{serializeEngineError:error=>({code:error?.code??'INTERNAL',message:error?.message??String(error),details:error?.details,cause:error?.cause?{code:error.cause.code,message:error.cause.message,details:error.cause.details}:undefined})},'adjust-math.js':{releaseAdjustWasm(){}}};
 const runtime=installLoupeFullWorker(scope,{loadModule:async url=>{loaded.push(url);if(loadFailure&&url.endsWith('loupe-full-image.js'))throw loadFailure;return modules[url.split('/').at(-1)];}});
 return {scope,replies,loaded,runtime,send:message=>scope.onmessage({data:message})};
}

test('worker protocol is installed before lazy imports; failed import keeps URL and original cause',async()=>{
 const cause=Object.assign(new TypeError('dynamic import failed'),{code:'NETWORK_TRANSIENT'}),h=workerRuntime({loadFailure:cause});assert.equal(h.loaded.length,0);h.send({action:'build',ticket:1,width:1,height:1,effects:effects(1)});await tick();const reply=h.replies.at(-1);assert.equal(reply.ticket,1);assert.equal(reply.fatal,true);assert.equal(reply.error.code,'WORKER_MODULE_LOAD');assert.match(reply.error.details.sourceURL,/loupe-full-image\.js$/);assert.equal(reply.error.details.executionPhase,'initialization');assert.equal(reply.error.cause.code,'NETWORK_TRANSIENT');assert.equal(reply.error.cause.message,'dynamic import failed');assert.equal(h.runtime.pending,0);
});

test('worker keeps source requests and queued jobs while loading its modules only once',async()=>{
 const h=workerRuntime({builder:async source=>{const part=await source.readWindow({x:0,y:0,width:1,height:1});return {surface:{readSampledWindow:async()=>part,dispose:async()=>{}},metrics:{}};}});h.send({action:'build',ticket:1,width:1,height:1,effects:effects(1)});await tick();const request=h.replies.find(m=>m.action==='source');h.send({action:'source',read:request.read,pixels:{width:1,height:1,data:Uint8Array.of(7,8,9)}});await tick();assert.equal(h.replies.at(-1).resultId,1);assert.equal(h.replies.at(-1).metrics.sourceReads,1);assert.equal(h.loaded.length,5);
 h.send({action:'build',ticket:2,width:1,height:1,effects:effects(2)});await tick();const second=h.replies.findLast(m=>m.action==='source');h.send({action:'source',read:second.read,pixels:{width:1,height:1,data:Uint8Array.of(10,11,12)}});await tick();assert.equal(h.replies.at(-1).resultId,2);assert.equal(h.loaded.length,5);h.send({action:'dispose'});await tick();assert.equal(h.replies.at(-1).action,'disposed');
});

test('worker null and messageerror are explicit protocol failures without uncaught promise rejection',()=>{
 const h=workerRuntime();h.send(null);assert.equal(h.replies.at(-1).error.code,'WORKER_MESSAGE_FAILED');assert.equal(h.replies.at(-1).fatal,true);const cause=Error('clone failure');h.scope.onmessageerror({error:cause});assert.equal(h.replies.at(-1).error.cause.message,'clone failure');assert.equal(h.loaded.length,0);
});

test('worker reports async processing rejection without replacing the cause',async()=>{
 const cause=Object.assign(Error('allocator refused'),{code:'MEMORY_ALLOCATION',details:{requestedBytes:1024}}),failure=Object.assign(Error('effect failed',{cause}),{code:'COMPUTE_FAILED'}),h=workerRuntime({builder:async()=>{throw failure;}});h.send({action:'build',ticket:1,width:1,height:1,effects:effects(1)});await tick();assert.equal(h.replies.at(-1).error.code,'COMPUTE_FAILED');assert.equal(h.replies.at(-1).error.cause.code,'MEMORY_ALLOCATION');assert.equal(h.replies.at(-1).error.cause.details.requestedBytes,1024);assert.equal(h.runtime.pending,0);
});

test('primitive async rejection remains its original failure instead of causing a second TypeError',async()=>{
 const h=workerRuntime({builder:async()=>{throw null;}});h.send({action:'build',ticket:1,width:1,height:1,effects:effects(1)});await tick();assert.equal(h.replies.at(-1).error.message,'null');assert.equal(h.runtime.pending,0);
});

test('async release failure is reported with its cause and is fully observed',async()=>{
 const cause=Object.assign(Error('temporary storage unavailable'),{code:'STORAGE_FAILED'}),failure=Object.assign(Error('result disposal failed',{cause}),{code:'CLEANUP_FAILED'}),h=workerRuntime({builder:async()=>({surface:{readSampledWindow:async()=>({pixels:{width:1,height:1,data:Uint8Array.of(1,2,3)},release(){}}),dispose:async()=>{throw failure;}},metrics:{}})});
 h.send({action:'build',ticket:1,width:1,height:1,effects:effects(1)});await tick();h.send({action:'release',resultId:1});await tick();const reply=h.replies.at(-1);assert.equal(reply.fatal,true);assert.equal(reply.error.code,'CLEANUP_FAILED');assert.equal(reply.error.cause.code,'STORAGE_FAILED');
});
