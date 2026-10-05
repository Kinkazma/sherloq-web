import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {preparePagedZernike} from '../src/dense-paged-zernike.js';
const MiB=1024**2;
const image=(width,height,budget)=>({surface:{descriptor:{format:'rgb8',width,height},async readWindow({width,height}){return {pixels:{data:new Uint8Array(width*height*3)},release:budget.reserve(width*height*3)};}}});
const temporarySession={async create(){const parts=new Map();return {write(bytes,offset){parts.set(offset,bytes.slice());},readInto(target,offset){target.fill(0);for(const [at,bytes]of parts){const begin=Math.max(at,offset),end=Math.min(at+bytes.length,offset+target.length);if(end>begin)target.set(bytes.subarray(begin-at,end-at),begin-offset);}},flush(){},dispose(){parts.clear();}};}};

test('dense preparation reclaims a completed plane before committing its hot descriptors to disk',async()=>{
 const budget=new Budget(96*MiB),cold=await createSegmentedBytes(64*MiB,{budget,storage:'memory',temporarySession});cold.markCold();cold.write(new Uint8Array([42]));let result;
 try{
  result=await preparePagedZernike(image(128,128,budget),{budget,temporarySession,maxWorkers:2,workerFactory:()=>({terminate(){},postMessage(job){queueMicrotask(()=>this.onmessage({data:{result:{first:new Float32Array(job.coreWidth*job.coreHeight*12),heapBytes:32*MiB}}}));}})});
  assert.equal(cold.storage,'temporary');assert.equal(result.first.storage,'memory');const byte=new Uint8Array(1);await cold.readInto(byte);assert.equal(byte[0],42);
 }finally{await result?.dispose();await cold.dispose();}
 assert.equal(budget.total(),0);
});

test('an impossible explicit in-memory preparation returns its layout lease without creating a worker',async()=>{
 const budget=new Budget(64*MiB);let created=0;
 await assert.rejects(preparePagedZernike(image(1024,1024,budget),{budget,storage:'memory',workerFactory:()=>{created++;throw Error('No dispatch expected');}}),{code:'MEMORY_LIMIT'});
 assert.equal(created,0);assert.equal(budget.total(),0);
});
