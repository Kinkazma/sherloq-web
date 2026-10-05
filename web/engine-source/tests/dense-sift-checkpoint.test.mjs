import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';

test('native SIFT keeps committed tiles across terminal transpose and horizontal publication failures',{timeout:30000},async()=>{
 const budget=new Budget(256*1024**2),width=272,height=264,store=await createSegmentedBytes(width*height*3,{budget,storage:'memory'});await store.write(Uint8Array.from({length:store.byteLength},(_,i)=>(Math.imul(i,23)+i%97)&255));
 const surface=createRgbSurface(store,{width,height,budget}),image={surface},closing=[],calls={gradients:0,columns:0,transpose:0,factors:0},events=[];let checkpoint,baseline,resumed,fault='transpose',refusals=0,patched=false;
 const factory=()=>{const worker=new Worker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:new URL('../src/dense-sift-stream-worker.js',import.meta.url).href}}),adapter={postMessage(data,transfer){calls[data.stage]++;worker.postMessage(data,transfer);},terminate:()=>closing.push(worker.terminate())};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;};
 const options={budget,patch:8,support:8,fullBounds:true,maxWorkers:1,workerFactory:factory,onProgress:e=>events.push(e),onCheckpoint:state=>{
  checkpoint=state;if(patched||!state.stores.hist)return;patched=true;
  for(const name of ['vertical','hist']){const write=state.stores[name].write.bind(state.stores[name]);state.stores[name].write=(bytes,offset,options)=>{
   const phase=fault==='transpose'?'sift-transpose':'sift-horizontal',bitmap=state.phases[phase]?.bitmap;
   if(fault&&bitmap?.[0]&1&&name===(fault==='transpose'?'vertical':'hist')&&offset>0){refusals++;throw new EngineError('MEMORY_ALLOCATION','Injected SIFT output bank refusal',{details:{allocationKind:'array-buffer',requestedBytes:4096}});}return write(bytes,offset,options);
  };}
 }};
 try{
  await assert.rejects(preparePagedSift(image,options),e=>e.code==='MEMORY_ALLOCATION'&&e.details.recovery.loopDetected);assert.equal(refusals,5);assert.ok(checkpoint.phases['sift-transpose'].bitmap[0]&1);const gradients=calls.gradients,transposes=calls.transpose;
  fault='horizontal';refusals=0;await assert.rejects(preparePagedSift(image,{...options,checkpoint}),e=>e.code==='MEMORY_ALLOCATION'&&e.details.recovery.loopDetected);assert.equal(refusals,5);assert.equal(calls.gradients,gradients);assert.ok(checkpoint.phases['sift-horizontal'].bitmap[0]&1);const transposeDone=calls.transpose;assert.ok(transposeDone>transposes);
  fault=null;resumed=await preparePagedSift(image,{...options,checkpoint});assert.equal(calls.gradients,gradients);assert.equal(calls.transpose,transposeDone);
  baseline=await preparePagedSift(image,{budget,patch:8,support:8,fullBounds:true,maxWorkers:1,workerFactory:factory});for(const key of ['hist','norms','turns','diverse','bounds','boundSamples']){const a=new Uint8Array(baseline[key].byteLength),b=new Uint8Array(a.length);await baseline[key].readInto(a);await resumed[key].readInto(b);assert.deepEqual(b,a,key);}assert.deepEqual(resumed.weights,baseline.weights);assert.equal(events.filter(e=>e.phase==='resource-terminal').length,2);
 }finally{await resumed?.dispose();await baseline?.dispose();await checkpoint?.dispose();await surface.dispose();await Promise.all(closing);}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});
