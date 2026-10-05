import test from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {borrowDenseGpuService} from '../src/dense-gpu-service.js';
test('concurrent fields share one GPU executor and arena, scope owners cannot overlap',async()=>{
 const budget=new Budget(1000);let created=0,disposed=0,running=0,peak=0;
 const create=async()=>{created++;return {metrics:{batches:0},async batch(job){running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,1));running--;return new Float32Array([job.value]);},dispose(){disposed++;}};};
 const a=borrowDenseGpuService(budget,{create}),b=borrowDenseGpuService(budget,{create});const results=await Promise.all([a.batch({value:1}),b.batch({value:2}),a.batch({value:3})]);assert.equal(created,1);assert.equal(peak,1);assert.deepEqual(results.map(r=>r.result[0]),[1,2,3]);a.release();assert.equal(disposed,0);b.release();assert.equal(disposed,1);
});
test('one failed GPU generation is retired before a later field retries; no failed job is replayed',async()=>{
 const budget=new Budget(1000);let created=0,disposed=0,calls=0;const create=async()=>{const id=++created;return {metrics:{},async batch(){calls++;if(id===1)throw Error('GPU lost');return new Float32Array([9]);},dispose(){disposed++;}};};
 const a=borrowDenseGpuService(budget,{create}),b=borrowDenseGpuService(budget,{create});await assert.rejects(a.batch({}),/GPU lost/);const result=await b.batch({});assert.equal(result.result[0],9);assert.equal(created,2);assert.equal(calls,2);a.release();b.release();assert.equal(disposed,2);
});
