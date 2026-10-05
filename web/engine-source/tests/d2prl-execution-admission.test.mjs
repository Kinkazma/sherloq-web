import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {createSpatial} from '../experiments/d2prl/spatial.js';
import {createPostprocess} from '../experiments/d2prl/postprocess.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function replaceWorker(t,worker){const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker');Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:worker});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'Worker',descriptor);else delete globalThis.Worker;});}

test('D2PRL admits its large workspace only when the shared CPU lane is available',async t=>{
 let spawned=0;
 replaceWorker(t,class{constructor(){spawned++;}terminate(){}postMessage(message){setImmediate(()=>this.onmessage({data:{ok:true,heapBytes:65536,values:new Float32Array(message.outWidth*message.outHeight)}}));}});
 const budget=new Budget(1024**3),scheduler=getExecutionScheduler(budget,{maxWorkers:1});
 const held=await scheduler.acquire({cpu:1}),spatial=createSpatial({budget,moduleUrl:'unused'});
 const resultPromise=spatial.run({input:new Float32Array(4),width:2,height:2,outWidth:3,outHeight:3,nearest:true});
 await tick();assert.equal(spawned,0);assert.equal(budget.active,0,'The complete working envelope is admitted when its CPU lane is available');
 held.release();const result=await resultPromise;assert.equal(spawned,1);assert.equal(result.data.length,9);assert.equal(budget.active,36);
 result.release();spatial.dispose();assert.equal(budget.total(),0);assert.equal(scheduler.snapshot().running,0);
});

test('D2PRL cancellation before admission creates no worker and preserves source ownership',async t=>{
 let spawned=0;replaceWorker(t,class{constructor(){spawned++;}});
 const budget=new Budget(1024**3),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),held=await scheduler.acquire({cpu:1});
 const stage=createPostprocess({budget,moduleUrl:'unused'}),signal=new AbortController(),raw=new Float32Array(12).fill(.25);
 const pending=stage.run({raw,width:2,height:2},{signal:signal.signal});await tick();signal.abort();
 await assert.rejects(pending,{code:'CANCELLED'});assert.equal(spawned,0);assert.equal(raw[0],.25);assert.equal(budget.total(),0);
 held.release();stage.dispose();assert.equal(scheduler.snapshot().running,0);
});
