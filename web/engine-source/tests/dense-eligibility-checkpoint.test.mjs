import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {preparePagedEligibility} from '../src/dense-paged-regions.js';
import {createDenseRegions} from '../src/dense-regions.js';
const MiB=1024**2;

test('native texture checkpoint keeps its single mask and resumes only uncommitted tiles',async()=>{
 const width=300,height=24,budget=new Budget(96*MiB),bytes=Uint8Array.from({length:width*height*3},(_,i)=>(i*23+(i/53|0)*31)&255),store=await createSegmentedBytes(bytes.length,{budget,storage:'memory'});await store.write(bytes);
 const surface=createRgbSurface(store,{width,height,budget}),read=surface.readWindowInto.bind(surface);let failing=true,calls=0,checkpoint,workers=0;const closing=[];
 surface.readWindowInto=async(rect,target,options)=>{calls++;if(failing&&rect.x>0)throw new RangeError('Array buffer allocation failed');return read(rect,target,options);};
 const factory=()=>{workers++;const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/dense-texture-worker.js',import.meta.url).href}}),adapter={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>closing.push(worker.terminate())};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};
 const options={method:0,patch:3,texture:2,budget,storage:'memory',maxWorkers:1,workerFactory:factory,onCheckpoint:value=>{assert.ok(!checkpoint||value===checkpoint);checkpoint=value;}};
 try{
  await assert.rejects(preparePagedEligibility({surface},options),error=>error.details?.recovery?.consecutiveFailures===5);
  assert.equal(checkpoint.textureCheckpoint.completed,1);assert.equal(checkpoint.textureCheckpoint.committed[0],1);assert.equal(calls,6);
  const maskOwner=checkpoint.mask,held=budget.total();assert.equal(held,bytes.length+width*height+1);
  failing=false;const result=await preparePagedEligibility({surface},{...options,checkpoint});assert.equal(result,checkpoint);assert.equal(result.mask,maskOwner);assert.equal(calls,8);assert.equal(result.textureCheckpoint.completed,3);assert.equal(result.textureCheckpoint.complete,true);
  const actual=new Uint8Array(width*height);await result.mask.readInto(actual);const native=await createDenseRegions();const expected=native.allowed({width,height,data:bytes},{method:0,patch:3,texture:2});assert.deepEqual(actual,expected.mask);
  assert.equal(await preparePagedEligibility({surface},{...options,checkpoint}),result);assert.equal(calls,8);assert.equal(workers,2);
  await assert.rejects(preparePagedEligibility({surface},{...options,patch:4,checkpoint}),{code:'INVALID_INPUT'});
 }finally{await checkpoint?.dispose();await checkpoint?.dispose();await surface.dispose();await Promise.all(closing);}
 assert.equal(budget.total(),0);
});
