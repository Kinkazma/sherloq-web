import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError,serializeEngineError,deserializeEngineError} from '../src/errors.js';
import {recompressionCodecWorkspace,runRecompressionCodec,disposeRecompressionCodecs,recompressionCodecMemory} from '../src/recompression-codec-client.js';
import * as codecWorker from '../src/recompression-codec-worker.js';
const MiB=1024**2,stage={codec:'jxl',quality:29,lossless:false},payload={width:1,height:1,stage};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
class FakeWorker{
 static scripts=[];static instances=[];
 constructor(){this.listeners=new Map();this.pending=new Map();this.sequence=0;this.terminated=false;this.script=FakeWorker.scripts.shift();FakeWorker.instances.push(this);}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 postMessage(value){if(value.reply){const item=this.pending.get(value.reply);this.pending.delete(value.reply);if(item)value.error?item.reject(deserializeEngineError(value.error)):item.resolve(value.value);return;}this.id=value.id;this.payload=value.payload;queueMicrotask(()=>this.script(this).catch(error=>this.emit({error:serializeEngineError(error)})));}
 request(name,value){const sequence=++this.sequence;return new Promise((resolve,reject)=>{this.pending.set(sequence,{resolve,reject});this.emit({request:name,sequence,value});});}
 emit(value){if(!this.terminated)this.onmessage?.({data:{id:this.id,...value}});}
 terminate(){this.terminated=true;for(const item of this.pending.values())item.reject(new Error('worker terminated'));this.pending.clear();}
}
async function fake(script,run){const previous=globalThis.Worker;FakeWorker.scripts.push(script);globalThis.Worker=FakeWorker;try{await run();}finally{globalThis.Worker=previous;for(const worker of FakeWorker.instances.splice(0))worker.terminate();FakeWorker.scripts=[];}}

test('the measured full-image JXL peak is covered by the native profile and a funded4GiB parent',()=>{
 const width=3822,height=7716,n=width*height,budget=new Budget(4*1024**3),original=budget.reserve(94234596),runtime=budget.reserve(192*MiB),p=recompressionCodecWorkspace({width,height},stage);
 assert.equal(p.nativeBytes,Math.ceil((64*MiB+80*n)/65536)*65536);assert.equal(p.encodedAllowanceBytes,0);
 assert.equal(p.nativeBytes-2345598976,80805888,'Explicit margin above the real complete q29 heap peak.');
 const workspace=budget.reserve(p.workingBytes),decoded=budget.reserve(n*3);assert(budget.total()<budget.limit);
 decoded();workspace();runtime();original();assert.equal(budget.total(),0);
 const oldBudget=new Budget(2388721664);assert.throws(()=>oldBudget.reserve(p.workingBytes),{code:'MEMORY_LIMIT'});assert.equal(oldBudget.total(),0);
 for(const codec of ['webp','png','bmp','gif','jp2','avif','heic']){const s={codec,lossless:false},v=recompressionCodecWorkspace({width,height},s);assert.equal(v.nativeBytes,Math.ceil(((codec==='heic'?128:64)*MiB+48*n)/65536)*65536);assert.equal(v.encodedAllowanceBytes,16*n+16*MiB);}
});

test('a large JXL Source is not rejected just because its estimate exceeds the native address space',()=>{
 const p=recompressionCodecWorkspace({width:10000,height:10000},stage);assert.equal(p.nativeBytes,4294967296);assert.equal(p.encodedAllowanceBytes,0);assert(Number.isSafeInteger(p.workingBytes));
 const insufficient=new Budget(4*1024**3);assert.throws(()=>insufficient.reserve(p.workingBytes),{code:'MEMORY_LIMIT'});assert.equal(insufficient.total(),0);
});

test('JXL encoded bytes are copied only after an exact asynchronous parent ACK',async()=>{
 const bytes=Uint8Array.of(1,2,3),ack=gate();let copies=0,request;
 bytes.slice=()=>{copies++;return Uint8Array.of(1,2,3);};
 const output=codecWorker.copyRecompressionEncodedOutput(bytes,stage,{request(name,value){request={name,value};return ack.promise;}});
 assert.deepEqual(request,{name:'encoded-output-admission',value:{bytes:3}});assert.equal(copies,0);await tick();assert.equal(copies,0);
 ack.resolve({admittedBytes:3});assert.deepEqual(await output,Uint8Array.of(1,2,3));assert.equal(copies,1);
});

test('refused or invalid encoded ACK never copies; other codecs keep their synchronous copy',async()=>{
 const bytes=Uint8Array.of(1,2),primary=Object.freeze(new EngineError('MEMORY_LIMIT','encoded copy refused'));let copies=0;bytes.slice=()=>{copies++;return Uint8Array.of(1,2);};
 await assert.rejects(codecWorker.copyRecompressionEncodedOutput(bytes,stage,{request(){return Promise.reject(primary);}}),error=>error===primary);
 await assert.rejects(codecWorker.copyRecompressionEncodedOutput(bytes,stage,{request(){return Promise.reject(0);}}),error=>error===0);
 await assert.rejects(codecWorker.copyRecompressionEncodedOutput(bytes,stage,{request(){return {admittedBytes:1};}}),{code:'INVALID_INPUT'});assert.equal(copies,0);
 const result=codecWorker.copyRecompressionEncodedOutput(bytes,{codec:'webp'},{request(){throw Error('unexpected admission');}});assert(result instanceof Uint8Array);assert.equal(copies,1);
});

test('exact encoded credit is admitted internally, retained through done and released with the worker',()=>fake(async worker=>{
 const result=await worker.request('encoded-output-admission',{bytes:12345});assert.deepEqual(result,{admittedBytes:12345});worker.emit({done:true,value:{codecHeapPeakBytes:16*MiB}});
},async()=>{
 const budget=new Budget(256*MiB),plan=recompressionCodecWorkspace(payload,stage);
 await runRecompressionCodec(payload,{budget,exactCapacity:true,onRequest(){throw Error('internal admission must not reach storage');}});
 assert.equal(budget.total(),plan.workingBytes+12345);assert.equal(recompressionCodecMemory(budget).admittedBytes,budget.total());
 disposeRecompressionCodecs(budget);assert.equal(budget.total(),0);
}));

test('encoded credit remains live until an aborted outstanding source request acknowledges',()=>fake(async worker=>{
 await worker.request('encoded-output-admission',{bytes:12345});await worker.request('source-band',{y:0,rows:1,width:1});worker.emit({done:true,value:{}});
},async()=>{
 const budget=new Budget(256*MiB),controller=new AbortController(),entered=gate(),source=gate(),plan=recompressionCodecWorkspace(payload,stage);let settled=false;
 const run=runRecompressionCodec(payload,{budget,signal:controller.signal,exactCapacity:true,onRequest:async()=>{entered.resolve();await source.promise;return {bytes:Uint8Array.of(1,2,3)};}}).finally(()=>settled=true);
 await entered.promise;controller.abort();await tick();assert.equal(settled,false);assert.equal(budget.total(),plan.workingBytes+12345);
 source.resolve();await assert.rejects(run,{code:'CANCELLED'});assert.equal(budget.total(),0);
}));

test('admission rejection preserves falsy and frozen primaries, drains and never retries',async()=>{
 for(const primary of [0,Object.freeze(new EngineError('MEMORY_LIMIT','no copy credit'))])await fake(async worker=>{
  await worker.request('encoded-output-admission',{bytes:12345});worker.emit({done:true,value:{}});
 },async()=>{
  const budget=new Budget(256*MiB),reserve=budget.reserve.bind(budget);let admissions=0;budget.reserve=bytes=>{if(bytes===12345){admissions++;throw primary;}return reserve(bytes);};
  await assert.rejects(runRecompressionCodec(payload,{budget,exactCapacity:true,onRequest(){throw Error('unexpected forwarding');}}),error=>error===primary);
  assert.equal(admissions,1);assert.equal(FakeWorker.instances.length,1);assert.equal(budget.total(),0);
 });
});

test('cancellation before and during exact admission never acknowledges or leaks its copy credit',async()=>{
 const stopped=new AbortController();stopped.abort();const budget0=new Budget(256*MiB);await assert.rejects(runRecompressionCodec(payload,{budget:budget0,signal:stopped.signal}),{code:'CANCELLED'});assert.equal(budget0.total(),0);
 await fake(async worker=>{await worker.request('encoded-output-admission',{bytes:12345});throw Error('cancelled admission must not be acknowledged');},async()=>{
  const budget=new Budget(256*MiB),controller=new AbortController(),reserve=budget.reserve.bind(budget);budget.reserve=bytes=>{const release=reserve(bytes);if(bytes===12345)controller.abort();return release;};
  await assert.rejects(runRecompressionCodec(payload,{budget,signal:controller.signal,exactCapacity:true}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 });
});
