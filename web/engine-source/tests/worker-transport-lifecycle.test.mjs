import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {TextRegionEngine} from '../src/text-ocr.js';
import {parallelEnergyPlanes} from '../src/energy-stream-pool.js';
import {ElasticQualityWorkers} from '../src/elastic-quality-workers.js';
import {parallelGhostPlanes} from '../src/ghost-stream-pool.js';
import {parallelStoredGrayLosses} from '../src/jpeg-gray-stream-pool.js';
const MiB=1024**2;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

for(const kind of ['ghost','gray'])test(kind+' publishes a completely closed companion before another close fails',async()=>{
 const original=globalThis.Worker,budget=new Budget(128*MiB),workers=[],published=[];
 globalThis.Worker=class{
  constructor(){workers.push(this);}
  terminate(){this.closed=true;}
  postMessage(data){queueMicrotask(()=>{if(this.closed)return;if(data.action==='open')this.quality=data.quality;const result={heapBytes:16*MiB};if(data.action==='blocks')result.blocks=new Float64Array([this.quality]);if(data.action==='loss')result.loss=this.quality;if(data.action==='close'&&this.quality===30)this.onmessage({data:{error:{code:'COMPUTE_FAILED',message:'Native close failed'}}});else this.onmessage({data:{result}});});}
 };
 const image={surface:{descriptor:{width:16,height:16},async readWindow(){return {pixels:{data:new Uint8Array(16*16*3)},release(){}};}},rgbRecompression:{async retainEncoded(_,entry){await entry.store.dispose();}}};
 try{
  const options={budget,maxWorkers:2,phaseX:0,phaseY:0,onPlane:q=>published.push(q),onQuality:q=>published.push(q)};
  await assert.rejects(kind==='ghost'?parallelGhostPlanes(image,[10,30],2,options):parallelStoredGrayLosses(image,[10,30],2,options),{code:'COMPUTE_FAILED'});
  assert.deepEqual(published,[10]);assert.equal(budget.total(),0);assert.ok(workers.every(worker=>worker.closed));assert.equal(getExecutionScheduler(budget).used.cpu,0);
 }finally{globalThis.Worker=original;}
});

test('OCR rejects malformed success envelopes as transport without publishing undefined',async()=>{
 const budget=new Budget(100),engine=new TextRegionEngine(budget,{maxWorkers:1}),worker={postMessage(){queueMicrotask(()=>this.onmessage({data:{unexpected:true}}));},terminate(){this.closed=true;}};
 await assert.rejects(engine.rpc(worker,{kind:'init'}),{code:'WORKER_MESSAGE_FAILED'});assert.equal(worker.closed,true);assert.equal(engine.pending.size,0);assert.equal(getExecutionScheduler(budget).used.cpu,0);engine.dispose();
});

test('OCR aborts and drains companion input before releasing the batch or recreating a worker',{timeout:5000},async()=>{
 const originalWorker=globalThis.Worker,originalFetch=globalThis.fetch,budget=new Budget(1200*MiB),engine=new TextRegionEngine(budget,{maxWorkers:2}),workers=[],peerEntered=deferred(),peerAborted=deferred(),drain=deferred();let released=0,settled=false;
 globalThis.fetch=async url=>new Response(await fs.readFile(url));
 globalThis.Worker=class{
  constructor(){workers.push(this);}
  terminate(){this.closed=true;}
  postMessage(data){queueMicrotask(()=>{if(this.closed)return;this.onmessage({data:data.kind==='init'?{ready:true,version:'test',heapBytes:16*MiB}:{error:{code:'OCR_FAILED',message:'Native terminal failure'}}});});}
 };
 const language={data:new Uint8Array([1,2,3])};language.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',language.data)),x=>x.toString(16).padStart(2,'0')).join('');
 const image={width:1600,height:32,format:'rgb8',async readWindow(rect,{signal}){
  if(rect.x===64){peerEntered.resolve();signal.addEventListener('abort',()=>peerAborted.resolve(),{once:true});await drain.promise;}else await peerEntered.promise;
  return {pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)},release(){if(rect.x===64)released++;}};
 }};
 const task=engine.detect(image,{language});task.then(()=>{settled=true;},()=>{settled=true;});
 try{
  await peerAborted.promise;assert.equal(settled,false);assert.ok(budget.total()>800*MiB,'worker envelope must remain while input still lives');assert.equal(workers.length,2);drain.resolve();await assert.rejects(task,{code:'OCR_FAILED'});await new Promise(r=>setTimeout(r,10));assert.equal(released,1);assert.equal(workers.length,2);assert.ok(workers.every(worker=>worker.closed));assert.equal(engine.pending.size,0);assert.equal(budget.total(),0);assert.equal(getExecutionScheduler(budget).used.cpu,0);
 }finally{drain.resolve();engine.dispose();globalThis.Worker=originalWorker;globalThis.fetch=originalFetch;}
});

for(const kind of ['energy','ghost','gray'])test(kind+' keeps its failed worker envelope until pending I/O drains',{timeout:3000},async()=>{
 const originalWorker=globalThis.Worker,originalTake=ElasticQualityWorkers.prototype.take,budget=new Budget(128*MiB),blocked=deferred(),drain=deferred();let injected=false,failedState,returnedWhileReading=false;
 ElasticQualityWorkers.prototype.take=async function(...args){const states=await originalTake.apply(this,args);if(!failedState){failedState=states[0];const free=failedState.releaseHeap;failedState.releaseHeap=()=>{if(failedState.ioTasks.size)returnedWhileReading=true;free();};let backing;Object.defineProperty(failedState,'store',{configurable:true,get:()=>backing,set:store=>{backing=store?new Proxy(store,{get(target,key){if(key==='write')return async(...args)=>{blocked.resolve();await drain.promise;return target.write(...args);};return Reflect.get(target,key);}}):store;}});}return states;};
 globalThis.Worker=class{
  terminate(){this.closed=true;}
  postMessage(data){queueMicrotask(()=>{if(this.closed)return;if(data.action==='write'&&!injected){injected=true;this.onmessage({data:{io:'write',id:1,bytes:new Uint8Array([7])}});this.onmessageerror({});return;}const result={heapBytes:16*MiB};if(data.action==='blocks')result.blocks=new Float64Array(1);if(data.action==='loss')result.loss=0;this.onmessage({data:{result}});});}
 };
 const image={surface:{descriptor:{width:16,height:16},async readWindow(){return {pixels:{data:new Uint8Array(16*16*3)},release(){}};}},rgbRecompression:{async retainEncoded(_,entry){await entry.store.dispose();}}};
 const options={budget,maxWorkers:1,phaseX:0,phaseY:0,onPlane:async(_,value)=>{await value?.dispose?.();}};
 const task=kind==='energy'?parallelEnergyPlanes(image,[30],1,options):kind==='ghost'?parallelGhostPlanes(image,[30],1,options):parallelStoredGrayLosses(image,[30],1,options);
 try{await blocked.promise;await new Promise(r=>setTimeout(r,0));assert.equal(returnedWhileReading,false);assert.equal(failedState.retired,false);assert.ok(budget.total()>16*MiB);drain.resolve();await task;assert.equal(returnedWhileReading,false);assert.equal(budget.total(),0);assert.equal(getExecutionScheduler(budget).used.cpu,0);}finally{drain.resolve();ElasticQualityWorkers.prototype.take=originalTake;globalThis.Worker=originalWorker;}
});
