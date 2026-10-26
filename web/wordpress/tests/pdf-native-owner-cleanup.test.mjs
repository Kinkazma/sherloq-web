import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoupeImageCache} from '../sherloq-browser/assets/pdf-native-effects.js';
for(const [index,failure]of [null,0,false,undefined].entries())test('native owner closes worker and reports falsy source cleanup rejection '+index,async t=>{
 const prior=globalThis.Worker,workers=[];
 class Worker{constructor(){this.messages=[];this.terminated=0;workers.push(this);}terminate(){this.terminated++;}postMessage(m){this.messages.push(m);queueMicrotask(()=>{if(m.action==='build')this.onmessage?.({data:{ticket:m.ticket,resultId:m.ticket,metrics:{}}});if(m.action==='release')this.onmessage?.({data:{ticket:m.ticket,released:true}});if(m.action==='dispose')this.onmessage?.({data:{action:'disposed'}});});}}
 globalThis.Worker=Worker;t.after(()=>{globalThis.Worker=prior;});
 let retained=0,released=0;const input={width:1,height:1,retain(){retained++;},async release(){released++;throw failure;},readPixels(){assert.fail('No source calculation is required for this lifecycle test');}},cache=createLoupeImageCache({memoryBudgetBytes:32*1024**2+index*65536});
 const lease=await cache.acquire(input,{});lease.close();const first=cache.dispose();assert.equal(cache.dispose(),first);
 await assert.rejects(first,error=>error instanceof Error&&error.code==='CLEANUP_FAILED'&&error.cause===failure);
 assert.equal(retained,1);assert.equal(released,1);assert.equal(workers.length,1);assert.equal(workers[0].terminated,1);assert.equal(workers[0].messages.filter(m=>m.action==='dispose').length,1);
});
test('a Set of allowed native tiles preserves its previous scope when crossing the stricter wire boundary',async t=>{
 const prior=globalThis.Worker,workers=[];globalThis.Worker=class{constructor(){this.messages=[];workers.push(this);}terminate(){}postMessage(m){this.messages.push(m);queueMicrotask(()=>{if(m.action==='build')this.onmessage?.({data:{ticket:m.ticket,resultId:m.ticket,metrics:{}}});else if(m.action==='release')this.onmessage?.({data:{ticket:m.ticket,released:true}});else if(m.action==='dispose')this.onmessage?.({data:{action:'disposed'}});});}};t.after(()=>{globalThis.Worker=prior;});
 const allowed=new Set(['0:0']),input={width:1,height:1,allowedTiles:allowed,readPixels(){assert.fail('No scientific calculation is needed to qualify scope transport');}},cache=createLoupeImageCache({memoryBudgetBytes:48*1024**2});
 const lease=await cache.acquire(input,{});assert.deepEqual(workers[0].messages.find(m=>m.action==='build').allowedTiles,['0:0']);assert.deepEqual([...input.allowedTiles],['0:0']);lease.close();await cache.dispose();
});
test('host source cleanup failure remains observable after a worker has already failed',async t=>{
 const prior=globalThis.Worker,workers=[];globalThis.Worker=class{constructor(){this.messages=[];this.terminated=0;workers.push(this);}terminate(){this.terminated++;}postMessage(m){this.messages.push(m);}};t.after(()=>{globalThis.Worker=prior;});
 let resolveRead,released=0;const read=new Promise(resolve=>{resolveRead=resolve;}),cleanup=Object.assign(Error('host input release failed'),{code:'RELEASE_FAILED'}),runtime=Error('worker crashed'),input={width:1,height:1,retain(){},async release(){released++;throw cleanup;},readPixels:()=>read},cache=createLoupeImageCache({memoryBudgetBytes:49*1024**2});
 const acquiring=cache.acquire(input,{}),observed=acquiring.catch(error=>error),worker=workers[0],build=worker.messages.find(m=>m.action==='build');
 worker.onmessage({data:{action:'source',ticket:build.ticket,read:1,rect:{x:0,y:0,width:1,height:1}}});worker.onerror({message:'worker crashed',error:runtime});const closing=cache.dispose();
 resolveRead({width:1,height:1,format:'rgb8',data:new Uint8Array(3)});
 await assert.rejects(closing,error=>error===cleanup);const original=await observed;assert.equal(original.code,'WORKER_FAILED');assert.equal(original.cause,runtime);assert.equal(released,1);assert.equal(worker.terminated,1);assert.equal(worker.messages.filter(m=>m.action==='source').length,0);
});
test('the final native lease joins its original close task during delayed input cleanup',async t=>{
 const prior=globalThis.Worker,workers=[];globalThis.Worker=class{constructor(){this.messages=[];this.terminated=0;workers.push(this);}terminate(){this.terminated++;}postMessage(m){this.messages.push(m);queueMicrotask(()=>{if(m.action==='build')this.onmessage?.({data:{ticket:m.ticket,resultId:m.ticket,metrics:{}}});else if(m.action==='release')this.onmessage?.({data:{ticket:m.ticket,released:true}});else if(m.action==='dispose')this.onmessage?.({data:{action:'disposed'}});});}};t.after(()=>{globalThis.Worker=prior;});
 let releaseInput;const gate=new Promise(resolve=>{releaseInput=resolve;}),input={width:1,height:1,retain(){},release:()=>gate,readPixels(){assert.fail('No image analysis is required');}},cache=createLoupeImageCache({memoryBudgetBytes:50*1024**2}),lease=await cache.acquire(input,{}),closingCache=cache.dispose(),closingLease=lease.close();
 assert.equal(lease.close(),closingLease);let finished=false;closingLease.then(()=>{finished=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(workers[0].terminated,0);releaseInput();await closingLease;await closingCache;assert.equal(workers[0].terminated,1);
});
