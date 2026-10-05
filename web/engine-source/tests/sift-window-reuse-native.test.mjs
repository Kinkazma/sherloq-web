import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NativeWorker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {SiftPool} from '../src/sift-paged.js';
import {EngineError} from '../src/errors.js';
import create from '../vendor/sift-paged/sift-paged.js';
import {continuationFixture,continuationRun} from './helpers/sift-continuation-oracle.js';
const wasm=new Uint8Array(await readFile(new URL('../vendor/sift-paged/sift-paged.wasm',import.meta.url)));
for(const [layers,w,h] of [[3,603,439],[4,517,515]])test('returned SIFT input windows preserve native continuation, ranking and descriptors, layers '+layers,{timeout:60000},async()=>{
 const input=await continuationFixture(create,wasm,layers,w,h),saved=globalThis.Worker,closing=[];
 globalThis.Worker=class{constructor(url){this.worker=new NativeWorker(new URL('./helpers/sift-native-worker.mjs',import.meta.url),{workerData:{module:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({error,message:error.message}));}postMessage(data,transfer){this.worker.postMessage(data,transfer);}terminate(){closing.push(this.worker.terminate());}};
 try{
  const original=await continuationRun(input,{layers,wasm,canonical:true}),reused=await continuationRun(input,{layers,wasm,canonical:true,reuseInput:true});
  assert.deepEqual(reused.outputs,original.outputs);assert.deepEqual(reused.ranking,original.ranking);assert.equal(reused.rounds,original.rounds);assert.equal(reused.escapes,original.escapes);
  assert.ok(reused.windowAllocations.length<reused.executions-1,'Useful windows must reuse existing backings');
  console.log(JSON.stringify({layers,w,h,seeds:input.seeds.length,rounds:reused.rounds,escapes:reused.escapes,executions:reused.executions,windowAllocations:reused.windowAllocations.length,allocatedWindowBytes:reused.windowAllocations.reduce((a,b)=>a+b,0),pyramidBuilds:reused.builds,pyramidCacheHits:reused.hits,rankedPoints:reused.ranking.points.length/7,g2nnPairs:reused.ranking.pairs.length/4,exact:true}));
 }finally{globalThis.Worker=saved;await Promise.all(closing);}
});

test('a refused pre-dispatch read retains an exact native pyramid and reuses it after retry',{timeout:60000},async()=>{
 const layers=3,w=603,h=439,input=await continuationFixture(create,wasm,layers,w,h),saved=globalThis.Worker,closing=[],budget=new Budget(256*1024**2);let created=0,failed=false;
 globalThis.Worker=class{constructor(url){created++;this.worker=new NativeWorker(new URL('./helpers/sift-native-worker.mjs',import.meta.url),{workerData:{module:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({error,message:error.message}));}postMessage(data,transfer){this.worker.postMessage(data,transfer);}terminate(){closing.push(this.worker.terminate());}};
 const owner={profile:{maxWorkers:1},workers:new Set()},pool=new SiftPool(owner,{budget,heap:96*1024**2,cost:()=>160*1024**2,inputBytes:input.base.byteLength,wasm,layers,contrast:.001,provider:'cpu',backend:'cpu'}),answers=[];
 try{await pool.open(1);await pool.run([0,1,2],async(id,{allocateInput})=>{
  const pixels=allocateInput(Float32Array,input.base.length);pixels.set(input.base);
  if(id===1&&!failed){failed=true;throw new EngineError('MEMORY_ALLOCATION','Array buffer allocation failed during window read',{details:{allocationKind:'array-buffer',requestedBytes:64}});}
  return {kind:'refine',cacheKey:'same-native-pyramid',input:pixels,width:w,height:h,x0:0,y0:0,globalWidth:w,globalHeight:h,octave:0,state:input.seeds[0].state};
 },async value=>answers.push({state:[...value.state],status:value.status,points:[...new Uint32Array(value.points.buffer,value.points.byteOffset,value.points.length)]}));
 assert.equal(created,1);assert.equal(pool.metrics.executions,3);assert.equal(pool.metrics.retries,1);assert.equal(pool.metrics.pyramidBuilds,1);assert.equal(pool.metrics.pyramidCacheHits,2);assert.deepEqual(answers[1],answers[0]);assert.deepEqual(answers[2],answers[0]);
 }finally{pool.close();globalThis.Worker=saved;await Promise.all(closing);}assert.equal(budget.total(),0);for(const domain of Object.values(budget.resourceSnapshot().domains))assert.equal(domain.reservedBytes,0);
});
