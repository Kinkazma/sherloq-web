import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {DenseFieldPool,denseJobMemory,planDenseResidentJobs} from '../src/dense-pool.js';
import {createDenseMath,denseDescriptorShape} from '../src/dense-math.js';
const MiB=1024**2;

test('resident planner counts Wasm linear growth and page rounding without changing the native ceiling',()=>{
 const field={targets:new Int32Array(100),distancesSquared:new Float32Array(100),allowed:new Uint8Array(100)},job={width:10,height:10,field,pass:{method:0,patch:8,targetPatch:8}},raw=48*MiB+8000,plan=denseJobMemory(job);
 assert.equal(plan.wasmHeapBytes,Math.ceil((raw+16*MiB)/65536)*65536);assert.equal(plan.workspace,plan.wasmHeapBytes);assert.equal(plan.wasmHeapBytes%65536,0);
 const exact=plan.workspace+plan.output;assert.equal(planDenseResidentJobs([job],exact).fits,true);assert.equal(planDenseResidentJobs([job],exact-1).fits,false);
});

test('real resident native worker reports its grown capacity within the same admitted plan and matches an independent native reference',async()=>{
 const width=192,height=160,patch=3,shape=denseDescriptorShape(width,height,1,patch),gray=Float32Array.from({length:width*height},(_,i)=>(i*11+(i/width|0)*7)%255),mask=new Uint8Array(shape.width*shape.height).fill(1);
 const job={width,height,gray,mask,pass:{method:1,patch,targetPatch:patch,reflection:false,quarterTurn:false},options:{iterations:1,radius:20,minimum:2,seed:739}},plan=denseJobMemory(job),budget=new Budget(plan.workspace+plan.output),closing=[],snapshots=[];
 const pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory:()=>{
  const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/dense-worker.js',import.meta.url).href}});let closed=false;
  const adapter={postMessage(message,transfer){worker.postMessage(message,transfer);},terminate(){if(!closed){closed=true;closing.push(worker.terminate());}}};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;
 }});let result;
 try{
  result=await pool.run([job],{onProgress:event=>{if(event.phase==='complete')snapshots.push(budget.resourceSnapshot());}});
  const actual=result.results[0];assert.ok(actual.heapBytes>32*MiB,'This fixture must exercise actual Wasm growth');assert.equal(actual.heapBytes%65536,0);assert.ok(actual.heapBytes<=plan.wasmHeapBytes);
  assert.equal(snapshots[0].domains.wasm.materializedBytes,actual.heapBytes);assert.equal(snapshots[0].domains.wasm.reservedBytes,plan.wasmHeapBytes);assert.equal(budget.resourceSnapshot().domains.wasm.reservedBytes,0);
  // A separately instantiated native reference uses the identical requested
  // descriptors, options and seed; no production warmup or calibration exists.
  const reference=await createDenseMath({print:()=>{}}),features=reference.features(gray,width,height,{method:1,patch}),expected=reference.field(features.first,features.second,mask,features.width,features.height,{...job.options,dimensions:128});
  assert.deepEqual(actual.targets,expected.targets);assert.deepEqual(actual.distancesSquared,expected.distancesSquared);assert.equal(actual.comparisons,expected.comparisons);
 }finally{result?.release();pool.dispose();await Promise.all(closing);}
 assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().operations.length,0);
});
