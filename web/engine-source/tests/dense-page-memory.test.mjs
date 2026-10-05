import test from 'node:test';
import assert from 'node:assert/strict';
import {planDensePageMemory,densePagedMinimumWorkspace,DENSE_PAGED_WORKSPACE_BYTES} from '../src/dense-paged-memory.js';
const MiB=1024**2;
function shape(n,dimensions=12){return {n,dimensions,lengths:[n*(dimensions===128?32:48),n*(dimensions===128?32:48),n,n*4,n*4,0,0,48000,32000,...(dimensions===128?[n*12,n*12,n,n,n,n,0,n*128]:[])]};}
test('uses admitted RAM beyond the old16MiB descriptor cache without changing work',()=>{
 const inputs={...shape(1024*768),availableBytes:512*MiB};const p=planDensePageMemory(inputs);
 assert.ok(p.cachePages>4096);assert.ok(p.cachePages*4096>=inputs.lengths[0]);assert.ok(p.workspaceBytes<=inputs.availableBytes);assert.ok(p.initialBatchPixels>0);
});
test('real96MP and larger shapes fit the module and shared workspace',()=>{
 for(const n of [96e6,200e6,0x7fffffff])for(const dimensions of [12,128])for(const availableBytes of [32,64,256,512,1536,6144].map(n=>n*MiB)){
  const p=planDensePageMemory({...shape(n,dimensions),availableBytes});
  assert.ok(p.workspaceBytes<=Math.min(availableBytes,DENSE_PAGED_WORKSPACE_BYTES));assert.ok(p.cachePages>=1);assert.ok(p.initialBatchPixels>=0);
 }
});
test('budget occupied by real source and peers reduces caches; no probe allocations',()=>{
 const input={...shape(96e6,128),residentBytes:382082304};
 const big=planDensePageMemory({...input,availableBytes:1000*MiB}),small=planDensePageMemory({...input,availableBytes:600*MiB});
 assert.ok(big.cachePages>small.cachePages);assert.ok(big.initialBatchPixels>small.initialBatchPixels);
});
test('explicit cache and batch choices remain exact and cannot overrun heap',()=>{
 const p=planDensePageMemory({...shape(100000),availableBytes:64*MiB,cachePages:32,initialBatchPixels:257});
 assert.equal(p.cachePages,32);assert.equal(p.initialBatchPixels,257);
 assert.throws(()=>planDensePageMemory({...shape(96e6),availableBytes:6*1024**3,cachePages:1000000}),e=>e.code==='MEMORY_LIMIT');
 assert.throws(()=>planDensePageMemory({...shape(100000),availableBytes:16*MiB}),e=>e.code==='MEMORY_LIMIT');
});
test('small cases allocate no initialization batch and explicit zero is honored',()=>{
 assert.equal(planDensePageMemory({...shape(1000),availableBytes:64*MiB}).initialBatchPixels,0);
 assert.equal(planDensePageMemory({...shape(96e6),availableBytes:512*MiB,initialBatchPixels:0}).initialBatchPixels,0);
});
test('96MP propagation caches reuse initialization RAM without shrinking the native-sized batch',()=>{
 const n=95820081,p=planDensePageMemory({...shape(n,128),availableBytes:1536*MiB-288000000,residentBytes:24703632+383280324});
 assert.equal(p.initialCachePages,4096);assert.ok(p.cachePages>p.initialCachePages);
 assert.ok(p.initialBatchPixels>=1040000);assert.ok(p.workspaceBytes<=DENSE_PAGED_WORKSPACE_BYTES);
 assert.equal(p.workspaceBytes,16*MiB+24703632+383280324+Math.max(p.cacheBytes,p.initialCacheBytes+p.batchBytes));
});

test('96MP non-isolated admission includes every native and cloned candidate pool',()=>{
 const n=96e6;
 for(const dimensions of [12,128])for(const shared of [false,true]){
  const minimum=densePagedMinimumWorkspace(n,{shared}),kernelBytes=minimum.minimumFieldBytes-minimum.poolBytes-64*1024;
  const inputs=shape(n,dimensions),transportBytes=inputs.lengths.reduce((sum,length)=>sum+Math.min(64*1024,length)*3,0);
  const availableBytes=kernelBytes-minimum.bootstrapStagingBytes-transportBytes;
  const p=planDensePageMemory({...inputs,availableBytes,residentBytes:minimum.poolBytes});
  assert.equal(minimum.minimumFieldBytes,32*MiB+(shared?2:3)*minimum.poolBytes);
  assert.ok(p.workspaceBytes<=availableBytes);
  if(!shared){const oldKernelBytes=32*MiB+minimum.poolBytes-64*1024;assert.throws(()=>planDensePageMemory({...shape(n,dimensions),availableBytes:oldKernelBytes-minimum.bootstrapStagingBytes,residentBytes:minimum.poolBytes}),error=>error.code==='MEMORY_LIMIT');}
 }
});
