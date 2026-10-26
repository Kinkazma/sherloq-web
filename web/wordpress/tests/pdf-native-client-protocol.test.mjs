import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfCompositeEffectService} from '../sherloq-browser/assets/pdf-composite-effects.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const bounded=(promise,ms=100)=>new Promise(resolve=>{const timer=setTimeout(()=>resolve({pending:true}),ms);promise.then(value=>{clearTimeout(timer);resolve({value});},error=>{clearTimeout(timer);resolve({error});});});
let caseNumber=0;
function fixture(t,{build,read,source,sendFailure,messageError,runtimeFailure,fatal}={}){
 const originalWorker=globalThis.Worker,sourceReads=[],worker={messages:[],terminated:0,thrown:[],listeners:new Set(),
  addEventListener(name,callback){if(name==='messageerror')this.listeners.add(callback);},removeEventListener(name,callback){this.listeners.delete(callback);},
  terminate(){this.terminated++;},emit(data){try{this.onmessage?.({data});}catch(error){this.thrown.push(error);}},
  postMessage(message){this.messages.push(message);if(sendFailure&&message.action===sendFailure.action)throw sendFailure.cause;
   queueMicrotask(()=>{
    if(message.action==='build'){
     if(messageError){for(const callback of [...this.listeners])callback({error:messageError});this.onmessageerror?.({error:messageError});return;}
     if(runtimeFailure){this.onerror?.({message:runtimeFailure.message,error:runtimeFailure,preventDefault(){}});return;}
     if(fatal){this.emit({fatal:true,error:fatal});return;}
     if(source){this.emit(source(message));return;}
     this.emit(build?build(message):{ticket:message.ticket,resultId:message.ticket,metrics:{}});
    }else if(message.action==='read')this.emit(read?read(message):{ticket:message.ticket,pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)}});
    else if(message.action==='release')this.emit({ticket:message.ticket,released:true});
    else if(message.action==='dispose')this.emit({action:'disposed'});
   });
  }};
 globalThis.Worker=class{constructor(){return worker;}};
 const service=createPdfCompositeEffectService({memoryBudgetBytes:32*1024**2+(++caseNumber)*65536}),input={width:1,height:1,background:false,readPixels:async rect=>{sourceReads.push(rect);return{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)};}},leases=[];
 t.after(async()=>{for(const lease of leases)await bounded(Promise.resolve(lease.close()).catch(()=>{}));await bounded(Promise.resolve(service.close()).catch(()=>{}));globalThis.Worker=originalWorker;});
 return{service,worker,input,sourceReads,async acquire(){const lease=await service.acquire(input,{});leases.push(lease);return lease;}};
}
function rejected(answer,worker,code='WORKER_MESSAGE_FAILED'){
 assert.equal(answer.pending,undefined,'Malformed protocol must settle, rather than remain pending');
 assert.ok(answer.error instanceof Error,'Malformed protocol must reject with Error');
 assert.equal(answer.error.code,code,'Transport error retains its designated code');
 assert.equal(answer.value,undefined,'Malformed reply must publish no lease or pixels');
 assert.equal(worker.terminated,1,'The shared broken worker is retired exactly once');
 assert.deepEqual(worker.thrown,[],'Message handling must not throw outside its observed error path');
}

const buildFaults={
 'missing-result-id':m=>({ticket:m.ticket,metrics:{}}),
 'zero-result-id':m=>({ticket:m.ticket,resultId:0,metrics:{}}),
 'nan-result-id':m=>({ticket:m.ticket,resultId:NaN,metrics:{}}),
 'unsafe-result-id':m=>({ticket:m.ticket,resultId:Number.MAX_SAFE_INTEGER+1,metrics:{}}),
 'missing-metrics':m=>({ticket:m.ticket,resultId:m.ticket}),
 'array-metrics':m=>({ticket:m.ticket,resultId:m.ticket,metrics:[]}),
 'null-metrics':m=>({ticket:m.ticket,resultId:m.ticket,metrics:null}),
 'future-ticket':m=>({ticket:m.ticket+1,resultId:m.ticket,metrics:{}}),
 'unsafe-ticket':m=>({ticket:Number.MAX_SAFE_INTEGER+1,resultId:m.ticket,metrics:{}}),
 'nan-ticket':m=>({ticket:NaN,resultId:m.ticket,metrics:{}}),
 'missing-reply':m=>({ticket:m.ticket})
};
for(const [name,build]of Object.entries(buildFaults))test('regional build rejects '+name+' before publishing a lease',async t=>{const h=fixture(t,{build});rejected(await bounded(h.service.acquire(h.input,{})),h.worker);});
const bytes=(format='rgb8',data=Uint8Array.of(1,2,3),width=1,height=1)=>({width,height,format,data});
const readFaults={
 'missing-pixels':m=>({ticket:m.ticket}),
 'wrong-format':m=>({ticket:m.ticket,pixels:bytes('rgba8',new Uint8Array(4))}),
 'wrong-width':m=>({ticket:m.ticket,pixels:bytes('rgb8',new Uint8Array(6),2,1)}),
 'wrong-height':m=>({ticket:m.ticket,pixels:bytes('rgb8',new Uint8Array(6),1,2)}),
 'array-bytes':m=>({ticket:m.ticket,pixels:bytes('rgb8',[1,2,3])}),
 'clamped-bytes':m=>({ticket:m.ticket,pixels:bytes('rgb8',new Uint8ClampedArray(3))}),
 'short-bytes':m=>({ticket:m.ticket,pixels:bytes('rgb8',new Uint8Array(2))}),
 'long-bytes':m=>({ticket:m.ticket,pixels:bytes('rgb8',new Uint8Array(4))}),
 'future-ticket':m=>({ticket:m.ticket+1,pixels:bytes()}),
 'nan-ticket':m=>({ticket:NaN,pixels:bytes()}),
 'malformed-error':m=>({ticket:m.ticket,error:{code:'X'}})
};
for(const [name,read]of Object.entries(readFaults))test('explicit regional read rejects '+name,async t=>{const h=fixture(t,{read}),lease=await h.acquire();rejected(await bounded(lease.readPixels({x:0,y:0,width:1,height:1})),h.worker);});

const sourceFaults={
 'nan-read':m=>({action:'source',ticket:m.ticket,read:NaN,rect:{x:0,y:0,width:1,height:1}}),
 'unsafe-read':m=>({action:'source',ticket:m.ticket,read:Number.MAX_SAFE_INTEGER+1,rect:{x:0,y:0,width:1,height:1}}),
 'future-build':m=>({action:'source',ticket:m.ticket+1,read:1,rect:{x:0,y:0,width:1,height:1}}),
 'negative-x':m=>({action:'source',ticket:m.ticket,read:1,rect:{x:-1,y:0,width:1,height:1}}),
 'fractional-y':m=>({action:'source',ticket:m.ticket,read:1,rect:{x:0,y:.5,width:1,height:1}}),
 'empty-width':m=>({action:'source',ticket:m.ticket,read:1,rect:{x:0,y:0,width:0,height:1}}),
 'outside-width':m=>({action:'source',ticket:m.ticket,read:1,rect:{x:0,y:0,width:2,height:1}}),
 'unsafe-right':m=>({action:'source',ticket:m.ticket,read:1,rect:{x:Number.MAX_SAFE_INTEGER,y:0,width:1,height:1}})
};
for(const [name,source]of Object.entries(sourceFaults))test('regional source rejects '+name+' before accessing pixels',async t=>{const h=fixture(t,{source});rejected(await bounded(h.service.acquire(h.input,{})),h.worker);assert.deepEqual(h.sourceReads,[],'Malformed request must not access source pixels');assert.equal(h.worker.messages.filter(message=>message.action==='source').length,0,'No source payload may be sent for an invalid request');});
for(const [name,error]of [['missing-message',{code:'X'}],['array',[]],['string','bad-error'],['cyclic',(()=>{const value={code:'X',message:'cyclic'};value.cause=value;return value;})()]])test('regional error rejects malformed '+name,async t=>{const h=fixture(t,{build:message=>({ticket:message.ticket,error})});rejected(await bounded(h.service.acquire(h.input,{})),h.worker);});

test('valid fatal error preserves code, details and nested cause, then retires once',async t=>{const h=fixture(t,{fatal:{code:'WORKER_MODULE_LOAD',message:'module unavailable',details:{sourceURL:'https://example.invalid/native.js',executionPhase:'initialization'},cause:{code:'NETWORK_TRANSIENT',message:'offline',details:{status:503}}}}),answer=await bounded(h.service.acquire(h.input,{}));rejected(answer,h.worker,'WORKER_MODULE_LOAD');assert.equal(answer.error.details.executionPhase,'initialization');assert.equal(answer.error.cause.code,'NETWORK_TRANSIENT');assert.equal(answer.error.cause.details.status,503);});
test('build postMessage failure preserves its cause and rejects once',async t=>{const cause=Error('DataCloneError'),h=fixture(t,{sendFailure:{action:'build',cause}}),answer=await bounded(h.service.acquire(h.input,{}));rejected(answer,h.worker);assert.equal(answer.error.cause,cause);});
test('messageerror rejects pending build with original decode cause',async t=>{const cause=Error('decode refused'),h=fixture(t,{messageError:cause}),answer=await bounded(h.service.acquire(h.input,{}));rejected(answer,h.worker);assert.equal(answer.error.cause,cause);});
test('runtime worker failure preserves cause and rejects pending acquisition',async t=>{const cause=Error('worker died'),h=fixture(t,{runtimeFailure:cause}),answer=await bounded(h.service.acquire(h.input,{}));rejected(answer,h.worker,'WORKER_FAILED');assert.equal(answer.error.cause,cause);});
test('valid regional build and explicit RGB read remain reusable',async t=>{const h=fixture(t),lease=await h.acquire(),rect={x:0,y:0,width:1,height:1};assert.deepEqual(await lease.readPixels(rect),{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)});assert.deepEqual(await lease.readPixels(rect),{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)});assert.equal(h.worker.messages.filter(message=>message.action==='build').length,1);assert.equal(h.worker.terminated,0);assert.deepEqual(h.worker.thrown,[]);await tick();});
