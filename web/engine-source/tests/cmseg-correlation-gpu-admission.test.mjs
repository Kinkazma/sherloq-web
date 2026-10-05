import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../vendor/segmentation/cmseg-correlation-gpu/post.js';
import addnoiseFactory from '../vendor/segmentation/cmseg-addnoise-correlation-gpu/post.js';
import {Budget} from '../src/cache.js';
import {createCmsegCorrelationGpu} from '../experiments/segmentation/cmseg-correlation-gpu.js';

test('The staged postprocessor admits every supported largest tile within a real32MiB heap ceiling',async()=>{
  for(const build of [factory,addnoiseFactory])for(const[c,h,w,k]of [[24,128,128,24],[32,64,64,32],[96,32,32,96]]){
    const m=await build(),n=h*w,pointers=[];
    try{
      // Match simultaneous init ownership, including original and normalized
      // features and the largest supported256-row tile, not just the runtime64.
      for(const floats of [c*n,c*n,h,w,n,2*n,n,k*n,256*n]){const p=m._malloc(floats*4);assert(p>0);pointers.push(p);}
      assert(m.HEAPU8.length<=32*1024**2);
      assert.equal(m._malloc(33*1024**2),0,'Maximum memory must actually prevent growth beyond its budget');
      assert(m.HEAPU8.length<=32*1024**2);
    }finally{for(const p of pointers)m._free(p);}
  }
});

test('Hybrid refuses geometry, pre-abort and missing worker headroom before creating a worker or GPU',async()=>{
  const budget=new Budget(32*1024**2),pool=createCmsegCorrelationGpu({budget,moduleUrl:'unused-before-admission'}),abort=new AbortController();
  const job={input:new Float32Array(32*64*64),c:32,h:64,w:64,k:32,alpha:5};abort.abort();
  try{
    await assert.rejects(pool.run({...job,k:31}),{code:'INVALID_INPUT'});
    await assert.rejects(pool.run(job,{signal:abort.signal}),{code:'CANCELLED'});
    await assert.rejects(pool.run(job),{code:'MEMORY_LIMIT'});
    assert.equal(budget.total(),0);
  }finally{pool.dispose();}
});
