import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {initEchoWasm,echoDerivatives,echoRender} from '../src/echo-math.js';import {segmentedEcho} from '../src/segmented-echo.js';import {AdaptiveConcurrency} from '../src/adaptive-concurrency.js';
await initEchoWasm({wasmBinary:await readFile(new URL('../vendor/echo/echo.wasm',import.meta.url))});
// Scheduling/transfer fault injection; real browser workers are checked separately.
class WorkerFixture{
 static instances=[];static failure=null;
 constructor(){if(WorkerFixture.failure==='start')throw Error('injected');WorkerFixture.instances.push(this);}
 terminate(){this.stopped=true;}
 postMessage(input,transfers){const data=structuredClone(input,{transfer:transfers});Promise.resolve().then(async()=>{
  if(this.stopped)return;if(WorkerFixture.failure){this.onmessage({data:{error:WorkerFixture.failure}});return;}
  const result=data.kind==='derivatives'?await echoDerivatives(data.image,data.start,data.rows,data.radius):{bytes:await echoRender(data.bytes,data.limits,data.params,data.total)};
  if(!this.stopped)this.onmessage({data:result});
 });}
}
const pixels={width:41,height:37,data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3)),format:'rgb8'},p={radius:15,contrast:85,grayscale:true};
async function source(limit){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget})}};}
async function fixture(fn){const original=globalThis.Worker;globalThis.Worker=WorkerFixture;WorkerFixture.instances=[];WorkerFixture.failure=null;try{await fn();}finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}}
test('Echo starts only useful row jobs; transferred windows preserve source ownership and global extrema',()=>fixture(async()=>{
 const raw=await echoDerivatives(pixels,0,pixels.height,p.radius),expected=await echoRender(raw.bytes,raw.limits,p,pixels.width*pixels.height);
 for(const [limit,maximum,workers] of [[512,4,4],[256,8,2],[512,1,1]]){
  const {budget,image}=await source(limit*1024**2),result=await segmentedEcho(image,p,{budget,rowsPerBlock:7,maxWorkers:maximum}),window=await result.surface.readWindow();
  assert.deepEqual(window.pixels.data,expected);window.release();assert.equal(result.metrics.workers,workers);assert.equal(result.metrics.workerJobs,workers>1?12:0);assert.equal(result.metrics.scheduling.preflightExecutions,0);assert.equal(result.metrics.scheduling.taskExecutions,1);
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.ok(budget.peak<=budget.limit);await result.surface.dispose();const original=await image.surface.readWindow();assert.deepEqual(original.pixels,pixels);original.release();await image.surface.dispose();assert.equal(budget.total(),0);
 }
}));
test('Echo cancels workers before releasing partial stores and retries only resource failures once',()=>fixture(async()=>{
 for(const failure of ['start','WORKER_FAILED','INVALID_INPUT']){
  const {budget,image}=await source(512*1024**2),adaptive=new AdaptiveConcurrency();WorkerFixture.failure=failure;
  if(failure==='INVALID_INPUT')await assert.rejects(segmentedEcho(image,p,{budget,rowsPerBlock:7,maxWorkers:4,adaptive}),{code:failure});
  else{const result=await segmentedEcho(image,p,{budget,rowsPerBlock:7,maxWorkers:4,adaptive});assert.equal(result.metrics.workers,1);assert.equal(result.metrics.scheduling.taskExecutions,2);assert.equal(result.metrics.scheduling.retry.failedWorkers,4);assert.equal(adaptive.states.size,1);await result.surface.dispose();}
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);await image.surface.dispose();assert.equal(budget.total(),0);
 }
 WorkerFixture.failure=null;
 for(const threshold of [.2,.8,1]){
  const {budget,image}=await source(512*1024**2),controller=new AbortController();await assert.rejects(segmentedEcho(image,p,{budget,rowsPerBlock:7,maxWorkers:4,signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);await image.surface.dispose();assert.equal(budget.total(),0);
 }
}));
