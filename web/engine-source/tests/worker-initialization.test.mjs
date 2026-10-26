import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createWorkerEngine} from '../src/worker-client.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const downloadFailure=message=>({code:'WORKER_LOAD_FAILED',message,details:{phase:'module-load',moduleURL:'https://example.invalid/index.js',retryable:true},cause:{name:'TypeError',message,stack:'original module download stack'}});
function fixture(t,{init,run,onerror,constructorFailure}={}){
 const old=Object.getOwnPropertyDescriptor(globalThis,'Worker'),workers=[];
 class Worker{
  constructor(url){if(constructorFailure)throw constructorFailure;this.url=String(url);this.commands=[];workers.push(this);this.index=workers.length;}
  terminate(){this.dead=true;}
  postMessage(data){this.commands.push(data);queueMicrotask(()=>{
   if(this.dead)return;
   if(data.method==='init'&&onerror){this.onerror?.(onerror);return;}
   const error=data.method==='init'?init?.(this.index):data.method==='run'?run?.(this.index):undefined;
   this.onmessage?.({data:error?{sequence:data.sequence,error}:data.method==='loadBlob'?{sequence:data.sequence,result:{provenance:{layout:'rgb8'}}}:data.method==='run'?{sequence:data.sequence,result:{done:true}}:{sequence:data.sequence,result:{ready:true}}});
  });}
 }
 Object.defineProperty(globalThis,'Worker',{configurable:true,value:Worker});t.after(()=>{if(old)Object.defineProperty(globalThis,'Worker',old);else delete globalThis.Worker;});
 return {workers,engine:createWorkerEngine({resourceHints:{hardwareConcurrency:2,deviceMemoryGiB:8}})};
}
test('an explicit first module download failure recreates only initialization and shares readiness with concurrent reads',{timeout:2000},async t=>{
 const first=downloadFailure('Failed to fetch dynamically imported module: first'),{engine,workers}=fixture(t,{init:i=>i===1?first:undefined});
 try{
  const loading=engine.loadBlob({id:'kept-source',blob:new Blob(['source'])}),reads=[engine.capabilities(),engine.capabilities()];await loading;const capabilities=await Promise.all(reads);
  assert.equal(workers.length,2);assert.equal(workers[0].dead,true);assert.deepEqual(workers[0].commands.map(x=>x.method),['init']);
  assert.equal(workers[1].commands.filter(x=>x.method==='init').length,1);assert.equal(workers[1].commands.filter(x=>x.method==='loadBlob').length,1);
  assert.ok(workers[1].commands.find(x=>x.method==='loadBlob').args[0].temporarySessionId.startsWith('job-'));assert.equal(workers.flatMap(x=>x.commands).some(x=>x.method==='cancel-and-close'),false,'an unsent storage registration must not trigger cooperative shutdown');
  for(const c of capabilities){assert.equal(c.workerInitialization.attempts,2);assert.equal(c.workerInitialization.recovered,true);assert.equal(c.workerInitialization.firstError.cause.message,first.message);}
  assert.deepEqual(await engine.run({operation:'detail.gradient'}),{done:true});assert.equal(workers.flatMap(x=>x.commands).filter(x=>x.method==='run').length,1);
 }finally{await engine.dispose();}
});
test('two initialization download refusals preserve both causes and do not poison explicit later recovery',{timeout:2000},async t=>{
 const failures=[downloadFailure('Failed to fetch dynamically imported module: first'),downloadFailure('Failed to fetch dynamically imported module: second')],{engine,workers}=fixture(t,{init:i=>failures[i-1]});
 try{
  await assert.rejects(engine.loadBlob({id:'unsent-image'}),error=>error.code==='WORKER_LOAD_FAILED'&&error.imagesCleared===false&&error.cause.cause.message===failures[1].message&&error.details.workerInitialization.firstError.cause.message===failures[0].message&&error.details.workerInitialization.attempts===2);
  assert.equal(workers.length,2);assert.equal(workers.every(x=>x.dead),true);assert.equal(workers.every(x=>x.commands.length===1&&x.commands[0].method==='init'),true);
  assert.deepEqual(await engine.capabilities(),{ready:true});assert.equal(workers.length,3);
 }finally{await engine.dispose();}
});
for(const [label,failure]of [
 ['syntax',{code:'WORKER_LOAD_FAILED',message:'Unexpected token',details:{phase:'module-load',retryable:false},cause:{name:'SyntaxError',message:'Unexpected token'}}],
 ['opaque',{code:'WORKER_FAILED',message:'Worker failed.'}],
 ['memory',{code:'MEMORY_ALLOCATION',message:'Unable to allocate memory',details:{phase:'engine-create',allocationKind:'wasm'}}],
 ['engine logic',{code:'WORKER_INITIALIZATION_FAILED',message:'Invalid engine configuration',details:{phase:'engine-create',retryable:true}}],
 ['CSP',{code:'WORKER_LOAD_FAILED',message:'Content security policy blocked import',details:{phase:'module-load',retryable:false}}],
])test('first '+label+' failure is reported without an automatic replay',{timeout:2000},async t=>{
 const {engine,workers}=fixture(t,{init:i=>i===1?failure:undefined});try{await assert.rejects(engine.run({operation:'detail.gradient'}),e=>e.code===failure.code&&e.imagesCleared===false);assert.equal(workers.length,1);assert.equal(workers[0].dead,true);assert.deepEqual(workers[0].commands.map(x=>x.method),['init']);assert.deepEqual(await engine.run({operation:'detail.gradient'}),{done:true});assert.equal(workers.length,2);assert.equal(workers.flatMap(x=>x.commands).filter(x=>x.method==='run').length,1);}finally{await engine.dispose();}
});
test('a useful calculation error never recreates a worker or repeats its run',{timeout:2000},async t=>{
 const failure=downloadFailure('Failed to fetch dynamically imported module during useful run'),{engine,workers}=fixture(t,{run:()=>failure});try{await assert.rejects(engine.run({operation:'detail.gradient'}),e=>e.code===failure.code);assert.equal(workers.length,1);assert.equal(workers[0].dead,undefined);assert.deepEqual(workers[0].commands.map(x=>x.method),['init','run']);assert.deepEqual(await engine.capabilities(),{ready:true});}finally{await engine.dispose();}
});
test('the first-init retry is not offered again after any successful initialization',{timeout:2000},async t=>{
 const failure=downloadFailure('Failed to fetch dynamically imported module after prior success'),{engine,workers}=fixture(t,{init:i=>i===2?failure:undefined});try{await engine.capabilities();workers[0].onerror({type:'error',message:'Lost existing worker'});await assert.rejects(engine.capabilities(),{code:'WORKER_LOAD_FAILED'});assert.equal(workers.length,2);assert.equal(workers.every(x=>x.dead),true);}finally{await engine.dispose();}
});
test('an early ErrorEvent preserves its source and cause without clearing an unsent image',{timeout:2000},async t=>{
 const cause=Error('Module import failed'),{engine,workers}=fixture(t,{onerror:{type:'error',message:'Startup event detail',filename:'https://example.invalid/dependency.js',lineno:19,colno:4,error:cause}});
 try{await assert.rejects(engine.loadBlob({id:'unsent-image'}),error=>error.code==='WORKER_FAILED'&&error.imagesCleared===false&&error.cause===cause&&error.details.phase==='worker-startup'&&error.details.workerEvent.filename==='https://example.invalid/dependency.js'&&error.details.workerEvent.line===19);assert.equal(workers.length,1);assert.deepEqual(workers[0].commands.map(x=>x.method),['init']);}finally{await engine.dispose();}
});
test('a worker-constructor failure retains its cause and never retries it',{timeout:2000},async t=>{
 const cause=Error('Constructor rejected'),{engine,workers}=fixture(t,{constructorFailure:cause});try{await assert.rejects(engine.capabilities(),e=>e.code==='WORKER_FAILED'&&e.cause===cause&&e.details.phase==='worker-create');assert.equal(workers.length,0);}finally{await engine.dispose();}
});

const source=await readFile(new URL(import.meta.resolve('../src/worker.js')),'utf8'),asModule=code=>'data:text/javascript,'+encodeURIComponent(code);
async function endpoint(indexSource){
 const old=globalThis.self,messages=[],waiters=[],target={postMessage:data=>{messages.push(data);for(const resolve of waiters.splice(0))resolve();}},indexURL=asModule(indexSource);globalThis.self=target;
 const rewritten=source.replaceAll("'./errors.js'",JSON.stringify(new URL('../src/errors.js',import.meta.url).href)).replaceAll("'./worker-message-protocol.js'",JSON.stringify(new URL('../src/worker-message-protocol.js',import.meta.url).href)).replaceAll("'./index.js'",JSON.stringify(indexURL));
 await import(asModule(rewritten+'\n// case '+crypto.randomUUID()));return {target,messages,next:()=>messages.length?Promise.resolve():new Promise(resolve=>waiters.push(resolve)),restore(){globalThis.self=old;}};
}
for(const [name,error,retryable]of [
 ['download',"new TypeError('Failed to fetch dynamically imported module: https://example.invalid/part.js')",true],
 ['opaque',"new TypeError('Load failed')",false],
 ['opaque WebKit',"new TypeError('Importing a module script failed.')",false],
 ['syntax',"new SyntaxError('Unexpected token')",false],
 ['CSP',"new TypeError('Failed to fetch dynamically imported module: CSP blocked')",false],
])test('the installed worker protocol reports '+name+' import failure with module phase and exact cause',{timeout:2000},async()=>{
 const f=await endpoint('throw '+error+';');try{f.target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await f.next();assert.equal(f.messages.length,1);const failure=f.messages[0].error;assert.equal(failure.code,'WORKER_LOAD_FAILED');assert.equal(failure.details.phase,'module-load');assert.equal(failure.details.retryable,retryable);assert.ok(failure.details.moduleURL.startsWith('data:text/javascript,'));assert.ok(failure.cause.stack);assert.equal(failure.cause.name,name==='syntax'?'SyntaxError':'TypeError');}finally{f.restore();}
});
test('engine construction errors remain distinct from module import refusals',{timeout:2000},async()=>{
 const f=await endpoint(`export function createEngine(){throw Error('Invalid engine configuration');}`);try{f.target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await f.next();const error=f.messages[0].error;assert.equal(error.code,'WORKER_INITIALIZATION_FAILED');assert.equal(error.details.phase,'engine-create');assert.equal(error.cause.message,'Invalid engine configuration');assert.equal(error.details.retryable,undefined);}finally{f.restore();}
});
test('engine construction allocation failures retain their domain without becoming a download retry',{timeout:2000},async()=>{
 const f=await endpoint(`export function createEngine(){throw new RangeError('Array buffer allocation failed');}`);try{f.target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await f.next();const error=f.messages[0].error;assert.equal(error.code,'MEMORY_ALLOCATION');assert.equal(error.details.phase,'engine-create');assert.equal(error.cause.name,'RangeError');assert.equal(error.details.retryable,undefined);}finally{f.restore();}
});

for(const ack of[[],[{error:{code:'STORAGE_IO',message:'explicit error'}}]])test('external retirement ACK is handled outside the active run queue: '+JSON.stringify(ack),{timeout:2000},async()=>{const f=await endpoint(`export function createEngine(options){return{capabilities(){return{}},async run(){await options.onExternalCacheReclaim({id:'external-owner',bytes:32});return{done:true};}};}`);try{f.target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await f.next();f.messages.splice(0);f.target.onmessage({data:{sequence:2,method:'run',args:[{}]}});await f.next();const request=f.messages.find(x=>x.externalCacheReclaim).externalCacheReclaim;assert.equal(f.messages.some(x=>x.sequence===2),false);f.target.onmessage({data:{sequence:request.ticket,method:'external-cache-retired',args:ack}});await turn();const answer=f.messages.find(x=>x.sequence===2);assert(answer);if(ack.length)assert.equal(answer.error.code,'STORAGE_IO');else assert.deepEqual(answer.result,{done:true});}finally{f.restore();}});
for(const args of[null,[null],[{error:null}],[{error:NaN}],[{error:{code:1,message:'bad'}}],[{error:{code:'bad',message:null}}]])test('malformed external ACK fails closed: '+JSON.stringify(args),{timeout:2000},async()=>{const f=await endpoint(`export function createEngine(options){return{capabilities(){return{}},async run(){await options.onExternalCacheReclaim({id:'external-owner',bytes:32});return{done:true};}};}`);try{f.target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await f.next();f.messages.splice(0);f.target.onmessage({data:{sequence:2,method:'run',args:[{}]}});await f.next();const request=f.messages.find(x=>x.externalCacheReclaim).externalCacheReclaim;f.target.onmessage({data:{sequence:request.ticket,method:'external-cache-retired',args}});await turn();assert.equal(f.messages.some(x=>x.sequence===2&&x.result),false);assert(f.messages.some(x=>x.fatal?.code==='WORKER_MESSAGE_FAILED'));}finally{f.restore();}});
