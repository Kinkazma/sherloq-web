import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {MedianPool} from '../src/median-pool.js';import {initMedianWasm} from '../src/median-features.js';import {EngineError} from '../src/errors.js';
await initMedianWasm({wasmBinary:await readFile(new URL('../vendor/median/median.wasm',import.meta.url))});
const image={width:128,height:128,format:'rgb8',data:new Uint8Array(128*128*3)},model={metadata:{features:8},async predict(input){return {margins:new Float32Array(input.length/8),scores:new Float32Array(input.length/8),release(){}};}};
test('Median pool starts useful batches at fitting capacity with no calibration and frees workers',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=class{};
 try{for(const maximum of [1,2,8]){const budget=new Budget(256*1024**2),pool=new MedianPool(budget,{maxWorkers:maximum});let batches=0,threads=0;pool.resize=(count,bytes)=>{threads=count;budget.retain(bytes*count);pool.charged=bytes*count;pool.workers=Array.from({length:count},()=>({terminate(){}}));};pool.extractBatch=async blocks=>{batches++;return {features:new Float64Array(blocks.length/4096*8),variances:new Float64Array(blocks.length/4096)};};
  const result=await pool.run(image,model);assert.equal(result.runtime.workers,maximum);assert.equal(result.runtime.scheduling.preflightExecutions,0);assert.equal(result.runtime.scheduling.taskExecutions,1);assert.equal(batches,maximum>1?1:0);assert.equal(threads,maximum>1?maximum:0);assert.equal(budget.total(),0);assert.equal(pool.workers.length,0);
 }}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
test('Median pool releases reservations and only retries recognized resource failures once',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=class{};
 try{for(const code of ['WORKER_FAILED','INVALID_INPUT']){const budget=new Budget(256*1024**2),pool=new MedianPool(budget,{maxWorkers:4});pool.resize=(count,bytes)=>{budget.retain(bytes*count);pool.charged=bytes*count;pool.workers=Array.from({length:count},()=>({terminate(){}}));};pool.extractBatch=()=>{throw new EngineError(code,'injected');};
  if(code==='WORKER_FAILED'){const result=await pool.run(image,model);assert.equal(result.runtime.workers,1);assert.equal(result.runtime.scheduling.taskExecutions,2);assert.equal(result.runtime.scheduling.retry.failedWorkers,4);}else await assert.rejects(pool.run(image,model),{code});assert.equal(budget.total(),0);assert.equal(pool.workers.length,0);
 }
 const budget=new Budget(256*1024**2),pool=new MedianPool(budget,{maxWorkers:4}),controller=new AbortController();pool.resize=(count,bytes)=>{budget.retain(bytes*count);pool.charged=bytes*count;pool.workers=Array.from({length:count},()=>({terminate(){}}));};pool.extractBatch=async()=>{controller.abort();throw new EngineError('CANCELLED','injected');};await assert.rejects(pool.run(image,model,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 }finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
test('Median worker admission preserves bounded source-window headroom without charging it twice',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=class{};
 try{const budget=new Budget(80*1024**2),pool=new MedianPool(budget,{maxWorkers:8});let selected;
  pool.resize=(count,bytes)=>{selected=count;budget.retain(count*bytes);pool.charged=count*bytes;pool.workers=Array.from({length:count},()=>({terminate(){}}));};pool.extractBatch=async blocks=>({features:new Float64Array(blocks.length/4096*8),variances:new Float64Array(blocks.length/4096)});
  const result=await pool.run({width:128,height:128},model,{workerHeadroomBytes:40*1024**2,async readBlocks(start,count){const free=budget.reserve(40*1024**2);try{return new Uint8Array(count*4096);}finally{free();}}});assert.equal(selected,2);assert.equal(result.runtime.workers,2);assert.equal(result.runtime.scheduling.preflightExecutions,0);assert.equal(budget.total(),0);
 }finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
