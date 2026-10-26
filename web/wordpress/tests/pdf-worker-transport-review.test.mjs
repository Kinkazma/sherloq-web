import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfRetainedStorage} from '../sherloq-browser/assets/pdf-retained-storage.js';
import {createPdfCompositeEffectService} from '../sherloq-browser/assets/pdf-composite-effects.js';

const bounded=promise=>new Promise(resolve=>{const timer=setTimeout(()=>resolve({pending:true}),80);promise.then(value=>{clearTimeout(timer);resolve({value});},error=>{clearTimeout(timer);resolve({error});});});
const faults=['null','array','future','nan-ticket','missing-result','malformed-error','messageerror','send-error','runtime-error','wrong-format'];
class FakeWorker {
 constructor(fault,composite=false){this.fault=fault;this.composite=composite;this.terminated=0;this.listeners=new Set();this.thrown=[];this.messages=[];}
 addEventListener(name,callback){if(name==='messageerror')this.listeners.add(callback);}
 removeEventListener(name,callback){this.listeners.delete(callback);}
 terminate(){this.terminated++;}
 emit(data){try{this.onmessage?.({data});}catch(error){this.thrown.push(error);}}
 postMessage(message){
  this.messages.push(message);
  if(message.action==='read'){
   if(this.fault==='send-error')throw Error('send refused');
   queueMicrotask(()=>{
    if(this.fault==='messageerror'){for(const callback of [...this.listeners])callback({});this.onmessageerror?.({});return;}
    if(this.fault==='runtime-error'){this.onerror?.({message:'worker died',preventDefault(){}});return;}
    const pixels={width:1,height:1,format:'rgba8',data:new Uint8Array(4)};
    const data=this.fault==='wrong-format'?(this.composite?{ticket:message.ticket,pixels}:{ticket:message.ticket,result:{pixels}}):
     this.fault==='null'?null:this.fault==='array'?[]:this.fault==='future'?{ticket:message.ticket+1,result:{}}:
     this.fault==='nan-ticket'?{ticket:NaN,result:{}}:this.fault==='malformed-error'?{ticket:message.ticket,error:{code:'X'}}:{ticket:message.ticket};
    this.emit(data);
   });return;
  }
  // The regional build must succeed first: every composite fault is injected
  // on readPixels, rather than passing through an obsolete point() call or an
  // unrelated malformed-build TypeError.
  queueMicrotask(()=>this.emit(this.composite?
   message.action==='build'?{ticket:message.ticket,resultId:message.ticket,metrics:{}}:
   message.action==='release'?{ticket:message.ticket,released:true}:
   message.action==='dispose'?{action:'disposed'}:{ticket:message.ticket}:
   {ticket:message.ticket,result:message.action==='close'?{closed:true,activeBytes:0,retainedBytes:0,cacheBytes:0}:
    message.action==='create'?{storage:'memory',bytes:3}:{}}));
 }
}
for(const kind of ['storage','composite'])for(const fault of faults)test(kind+' rejects '+fault+' and retires its broken worker',async()=>{
 const worker=new FakeWorker(fault,kind==='composite');let service,lease;const originalWorker=globalThis.Worker;
 try{
  if(kind==='storage')service=createPdfRetainedStorage({memoryBudgetBytes:128*1024**2,workerFactory:()=>worker});
  else{globalThis.Worker=class{constructor(){return worker;}};service=createPdfCompositeEffectService({memoryBudgetBytes:128*1024**2});}
  if(kind==='storage')await service.create('page',1,1,128);
  else{lease=await service.acquire({width:1,height:1,background:false,readPixels:async()=>({width:1,height:1,format:'rgb8',data:new Uint8Array(3)})},{});assert.equal(lease.width,1);assert.equal(lease.height,1);assert.equal(worker.messages.filter(message=>message.action==='build').length,1);}
  const answer=await bounded(kind==='storage'?service.read('page',{x:0,y:0,width:1,height:1}):lease.readPixels({x:0,y:0,width:1,height:1}));
  // Preserve all ten retained-storage safety assertions; strengthen both paths
  // on the regional path with a typed error, single retirement and no pixels.
  assert.equal(answer.pending,undefined,'Request must settle');
  assert.ok(answer.error,'A malformed transport must not succeed');
  assert.ok(worker.terminated>=1,'Worker must be retired');
  if(kind==='composite'){
   assert.equal(answer.error.code,fault==='runtime-error'?'WORKER_FAILED':'WORKER_MESSAGE_FAILED');
   assert.equal(answer.value,undefined,'No pixels may be published');
   assert.equal(worker.terminated,1,'Broken worker is retired exactly once');
   assert.deepEqual(worker.thrown,[],'Protocol failures must not escape the message handler');
  }
 }finally{
  await bounded(Promise.resolve(lease?.close()).catch(()=>{}));
  await bounded(Promise.resolve(service?.close()).catch(()=>{}));
  globalThis.Worker=originalWorker;
 }
});
