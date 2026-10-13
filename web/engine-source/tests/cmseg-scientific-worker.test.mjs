import test from 'node:test';import assert from 'node:assert/strict';import {Worker as NativeWorker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';import {createCmsegCorrelation} from '../experiments/segmentation/cmseg-correlation.js';
test('actual scoped CMSeg SIMD workers retain configured concurrency, reset scope and release every reservation',async()=>{
 const old=globalThis.Worker,closing=[],messages=[];
 globalThis.Worker=class{constructor(module){const worker=new NativeWorker(new URL('./helpers/browser-module-worker.mjs',import.meta.url),{workerData:{module:module.href}});worker.on('message',data=>this.onmessage?.({data}));worker.on('error',e=>this.onerror?.({message:e.message}));this.postMessage=(data,transfer)=>{messages.push({type:data.type,scoped:!!data.scientificMask});worker.postMessage(data,transfer);};this.terminate=()=>closing.push(worker.terminate());}};
 const input=Float32Array.from({length:5*16},(_,i)=>Math.fround(Math.sin(i*.71)+Math.cos(i*.17)*.2)),before=input.slice(),mask=Uint8Array.from({length:16},(_,i)=>Number(i%3===0)),budget=new Budget(512*1024**2);let pool;
 try{for(const maxWorkers of [1,2]){pool=createCmsegCorrelation({budget,maxWorkers,rowsPerJob:4,moduleUrl:new URL('../vendor/segmentation/correlation-fma.js',import.meta.url).href});const result=await pool.run({input,c:5,h:4,w:4,k:8,alpha:2.15,scientificMask:mask});assert.equal(result.workers,maxWorkers);assert.equal(result.shape[1],8);for(let i=0;i<16;i++)if(!mask[i])for(let k=0;k<8;k++)assert.equal(result.data[k*16+i],0);result.release();
  const native=await pool.run({input,c:5,h:4,w:4,k:8,alpha:2.15});assert(native.data.some((v,i)=>!mask[i%16]&&v>0));native.release();pool.dispose();pool=undefined;assert.equal(budget.total(),0);}
  assert(messages.some(m=>m.type==='init'&&m.scoped));assert(messages.some(m=>m.type==='init'&&!m.scoped));assert.deepEqual(input,before);
 }finally{pool?.dispose();globalThis.Worker=old;await Promise.all(closing);}assert.equal(budget.total(),0);
});
