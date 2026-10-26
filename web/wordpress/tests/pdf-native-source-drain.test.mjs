import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfCompositeEffectService} from '../sherloq-browser/assets/pdf-composite-effects.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const effects=brightness=>({adjust:{enabled:true,brightness},enhance:{enabled:false},sweep:{enabled:false}});
const rgb=data=>({width:1,height:1,format:'rgb8',data:Uint8Array.from(data)});
function fixture(t){
 const original=globalThis.Worker,workers=[];
 globalThis.Worker=class extends EventTarget{
  constructor(){super();this.messages=[];this.terminated=0;workers.push(this);}
  postMessage(message){this.messages.push(message);if(message.action==='release'&&message.ticket)this.reply({ticket:message.ticket,released:true});if(message.action==='dispose')this.reply({action:'disposed'});}
  reply(data){queueMicrotask(()=>this.onmessage?.({data}));}
  terminate(){this.terminated++;}
 };
 t.after(()=>{globalThis.Worker=original;});return{workers};
}
const settles=promise=>{let settled=false;promise.then(()=>{settled=true;},()=>{settled=true;});return()=>settled;};

test('closing a pending shared native owner reports its own late input release error without failing another owner',async t=>{
 const h=fixture(t),budget=34567901,a=createPdfCompositeEffectService({memoryBudgetBytes:budget}),b=createPdfCompositeEffectService({memoryBudgetBytes:budget}),readGate=deferred(),releaseGate=deferred(),cause=Object.assign(Error('Retired A source release failed'),{code:'STORAGE_FAILED'}),calls={reads:0,retains:0,releases:0},inputA={width:8,height:8,readPixels(){calls.reads++;return readGate.promise;},retain(){calls.retains++;},async release(){calls.releases++;await releaseGate.promise;throw cause;}},inputB={width:8,height:8,readPixels:async()=>rgb([3,5,7])};
 const buildingA=a.acquire(inputA,effects(1)),buildingB=b.acquire(inputB,effects(2));buildingA.catch(()=>{});const worker=h.workers[0],builds=worker.messages.filter(message=>message.action==='build');worker.reply({ticket:builds[1].ticket,resultId:builds[1].ticket,metrics:{}});const leaseB=await buildingB;t.after(async()=>{readGate.resolve(rgb([11,13,17]));releaseGate.resolve();leaseB.close();await Promise.allSettled([a.close(),b.close(),buildingA]);});
 worker.reply({action:'source',ticket:builds[0].ticket,read:1,rect:{x:0,y:0,width:1,height:1}});await tick();assert.equal(calls.reads,1);assert.equal(calls.retains,1);
 const closing=a.close(),isSettled=settles(closing);worker.reply({ticket:builds[0].ticket,error:{code:'CANCELLED',message:'Owner A retired'}});await tick();assert.equal(isSettled(),false);readGate.resolve(rgb([11,13,17]));await tick();assert.equal(calls.releases,1);assert.equal(isSettled(),false);
 releaseGate.resolve();await assert.rejects(closing,error=>error===cause);await assert.rejects(buildingA,error=>error?.code==='CANCELLED'||error===cause);assert.equal(worker.terminated,0,'A retired host cleanup failure must not retire the unrelated owner B.');assert.equal(worker.messages.filter(message=>message.action==='source'&&message.read===1).length,0);
 const reading=leaseB.readPixels({x:0,y:0,width:1,height:1}),read=worker.messages.findLast(message=>message.action==='read');worker.reply({ticket:read.ticket,pixels:rgb([19,23,29])});assert.deepEqual([...(await reading).data],[19,23,29]);leaseB.close();await b.close();assert.equal(worker.messages.filter(message=>message.action==='dispose').length,1);assert.equal(worker.terminated,1);assert.equal(calls.retains,1);assert.equal(calls.releases,1);
});

test('native scientific scoped explicit read keeps its original source until close drains the read',async t=>{
 const h=fixture(t),service=createPdfCompositeEffectService({memoryBudgetBytes:34567902}),originalGate=deferred(),calls={reads:0,retains:0,releases:0},scientificScope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:'a'.repeat(64),fingerprint:'native-client-explicit-read',width:8,height:8,regions:[{x0:4,y0:0,x1:8,y1:8}],excluded:[]},input={width:8,height:8,scientificScope,readPixels(){calls.reads++;return calls.reads===1?Promise.resolve(rgb([43,47,53])):originalGate.promise;},retain(){calls.retains++;},release(){calls.releases++;}};
 const building=service.acquire(input,effects(1)),worker=h.workers[0],build=worker.messages.find(message=>message.action==='build');worker.reply({ticket:build.ticket,resultId:build.ticket,metrics:{}});const lease=await building;t.after(async()=>{originalGate.resolve(rgb([59,61,67]));lease.close();await Promise.allSettled([service.close()]);});assert.equal(calls.retains,1);
 const first=lease.readPixels({x:0,y:0,width:1,height:1}),firstRead=worker.messages.findLast(message=>message.action==='read');worker.reply({ticket:firstRead.ticket,pixels:rgb([1,2,3])});assert.deepEqual([...(await first).data],[43,47,53],'The excluded pixel must come from the genuine scientific scope source read.');
 const reading=lease.readPixels({x:0,y:0,width:1,height:1});reading.catch(()=>{});const secondRead=worker.messages.findLast(message=>message.action==='read');worker.reply({ticket:secondRead.ticket,pixels:rgb([5,7,11])});await tick();assert.equal(calls.reads,2);lease.close();const closing=service.close(),isSettled=settles(closing);await tick();assert.equal(isSettled(),false,'Close must drain the original source read as well as worker reads.');assert.equal(calls.releases,0,'The source base retain cannot be released while its scoped read is pending.');
 originalGate.resolve(rgb([59,61,67]));await assert.rejects(reading,error=>error?.code==='CANCELLED');await closing;assert.equal(calls.retains,1);assert.equal(calls.releases,1);assert.equal(worker.terminated,1);
});
