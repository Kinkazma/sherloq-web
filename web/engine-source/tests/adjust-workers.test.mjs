import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {initAdjustWasm} from '../src/adjust-math.js';import {adjustStage} from '../src/adjust-stage.js';import {segmentedAdjust} from '../src/segmented-adjust.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {initCvWasm} from '../src/opencv.js';
import {AdaptiveConcurrency} from '../src/adaptive-concurrency.js';
await initAdjustWasm({wasmBinary:await readFile(new URL('../vendor/adjust/adjust.wasm',import.meta.url))});
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
// Only scheduling/ownership faults are injected. Chrome separately executes real children.
class WorkerFixture{
 static instances=[];static failure=null;
 constructor(){if(WorkerFixture.failure==='start')throw Error('injected');WorkerFixture.instances.push(this);}
 terminate(){this.stopped=true;}
 postMessage(input,transfers){const data=structuredClone(input,{transfer:transfers});assert.equal(input.image.data.byteLength,0);Promise.resolve().then(async()=>{
  if(this.stopped)return;if(WorkerFixture.failure&&WorkerFixture.failure!=='histogram'){this.onmessage({data:{error:WorkerFixture.failure}});return;}
  const result=await adjustStage(data);
  if(WorkerFixture.failure==='histogram')result.histogram[0]++;
  if(!this.stopped)this.onmessage({data:result});
 });}
}
const pixels={width:41,height:37,data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3)),format:'rgb8'},params=OPENCV_OPERATIONS['inspection.adjust'].validate({sharpen:100,brightness:23,saturation:-17,hue:180,gamma:11,shadows:-25,highlights:30,equalize:4,threshold:0,invert:true});
async function source(limit){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget})}};}
async function fixture(fn){const original=globalThis.Worker;globalThis.Worker=WorkerFixture;WorkerFixture.instances=[];WorkerFixture.failure=null;try{await fn();}finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}}
test('Adjustment admits only useful workers and owned windows; all equalization modes and global histograms remain exact',()=>fixture(async()=>{
 for(const [limit,maximum,workers] of [[512,4,4],[256,8,2],[512,1,1]])for(let equalize=0;equalize<6;equalize++){
  const p={...params,equalize},expected=(await OPENCV_OPERATIONS['inspection.adjust'].compute(pixels,p,{})).pixels.data;
  const {budget,image}=await source(limit*1024**2),result=await segmentedAdjust(image,p,{budget,rowsPerBlock:7,maxWorkers:maximum}),window=await result.surface.readWindow();
  assert.deepEqual(window.pixels.data,expected);window.release();assert.equal(result.metrics.workers,workers);assert.equal(result.metrics.workerJobs,workers>1?6:0);assert.equal(result.metrics.scheduling.preflightExecutions,0);assert.equal(result.metrics.scheduling.taskExecutions,1);
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.ok(budget.peak<=budget.limit);await result.surface.dispose();const original=await image.surface.readWindow();assert.deepEqual(original.pixels,pixels);original.release();await image.surface.dispose();assert.equal(budget.total(),0);
 }
}));
test('Adjustment retries only resource failures once and cancels before releasing windows/stores',()=>fixture(async()=>{
 for(const failure of ['start','WORKER_FAILED','MEMORY_LIMIT','INVALID_INPUT','histogram']){
  const {budget,image}=await source(512*1024**2),adaptive=new AdaptiveConcurrency();WorkerFixture.failure=failure;
  if(['INVALID_INPUT','histogram'].includes(failure))await assert.rejects(segmentedAdjust(image,params,{budget,rowsPerBlock:7,maxWorkers:4,adaptive}),{code:'INVALID_INPUT'});
  else{const result=await segmentedAdjust(image,params,{budget,rowsPerBlock:7,maxWorkers:4,adaptive});assert.equal(result.metrics.workers,1);assert.equal(result.metrics.scheduling.taskExecutions,2);assert.equal(result.metrics.scheduling.retry.failedWorkers,4);assert.equal(adaptive.states.size,1);await result.surface.dispose();}
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);await image.surface.dispose();assert.equal(budget.total(),0);
 }
 WorkerFixture.failure=null;
 for(const phase of ['read',.2,.8,1]){
  const {budget,image}=await source(512*1024**2),controller=new AbortController();
  if(phase==='read'){const read=image.surface.readWindow;let reads=0;image.surface.readWindow=(r,h)=>{if(++reads===2)controller.abort();return read(r,h);};}
  await assert.rejects(segmentedAdjust(image,params,{budget,rowsPerBlock:7,maxWorkers:4,signal:controller.signal,onProgress:f=>{if(typeof phase==='number'&&f>=phase)controller.abort();}}),{code:'CANCELLED'});
  assert.ok(WorkerFixture.instances.every(w=>w.stopped));assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);await image.surface.dispose();assert.equal(budget.total(),0);
 }
}));
