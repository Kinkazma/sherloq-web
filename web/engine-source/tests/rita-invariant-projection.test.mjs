import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ritaSegmentedNetwork} from '../src/rita-segmented-network.js';
import {ritaSourceTensors,ritaInitialMask} from '../src/rita-source-tensors.js';
const MiB=1024**2;
function fixture({fail,gpuMemory,height=32,memoryMiB=64,provider}={}){
 const budget=new Budget(memoryMiB*MiB),calls=[],queryGroups=[],stages=[64,128,320,512].map((channels,i)=>({channels,stride:i?2:4,radius:i?1:3,patchImage:'s'+i+'i',patchMask:'s'+i+'m',norm:'s'+i+'n',fuse:'s'+i+'f',upFused:'s'+i+'u',upMask:'s'+i+'g',blocks:[{heads:[1,2,5,8][i],sr:[8,4,2,1][i],kv:'s'+i+'k',query:'s'+i+'q',mlp:'s'+i+'p'}]})),manifest={stages,assets:{s0i:{sha256:'a'.repeat(64)}},decode:'decode',final:'final'},surface={descriptor:{width:64,height},async readWindow(r){return {pixels:{data:new Uint8Array(r.width*r.height*3).fill(73)},release(){}};}},rgb=ritaSourceTensors(surface,{budget}).rgb;
 const pool={cpuOnly:false,profile:{maxWorkers:10},async run(name,feeds,options={}){calls.push(name);if(options.queryBatch)assert.ok(options.queryBatch.counts.length>=2&&options.queryBatch.counts.length<=16,'pool accepts only real batches; singleton must use the old path');const group=name.endsWith('q')?{name,counts:options.queryBatch?.counts??[feeds.x.dims[3]],batchPresent:!!options.queryBatch,bytes:feeds.x.data.byteLength,keyShape:feeds.key.dims,success:false}:null;if(group)queryGroups.push(group);fail?.(name,feeds,calls,options);if(group)group.success=true;let dims;
  if(name==='decode')dims=[1,4,feeds.c1.dims[2],feeds.c1.dims[3]];else if(name==='final')dims=[1,4,feeds.grid.dims[1],feeds.grid.dims[2]];
  else{const index=Number(name[1]),stage=stages[index],kind=name[2],x=feeds.x??feeds.g;if(kind==='i'||kind==='m')dims=[1,stage.channels,Math.floor((x.dims[2]-(2*stage.radius+1))/stage.stride)+1,Math.ceil(x.dims[3]/stage.stride)];else if(kind==='k')dims=[1,2*stage.channels,Math.floor(x.dims[2]/stage.blocks[0].sr),Math.floor(x.dims[3]/stage.blocks[0].sr)];else if(kind==='u'||kind==='g')dims=[1,64,x.dims[2]*2**index,x.dims[3]*2**index];else dims=x.dims;}
  const data=new Float32Array(dims.reduce((n,x)=>n*x,1));data.fill(name==='s0i'?.125:.25);let released=false;return {result:{result:{data,dims}},metrics:{provider:provider?.(name,calls,options)??'test',milliseconds:0,memoryMaximumBytes:0,modelCacheHit:true,sessionCacheBytes:16*MiB,logicalExecutions:options.queryBatch?.counts.length??1,gpuMemory:gpuMemory?.(name,calls)},release(){assert.equal(released,false);released=true;}};
 }};
 return {budget,calls,queryGroups,stages,manifest,pool,surface,rgb,async run(iteration,options={}){return ritaSegmentedNetwork(options.rgb??rgb,ritaInitialMask(64,height,{budget}),iteration,{manifest,pool,budget,backend:'cpu',...options});}};
}
async function clear(map){for(const tensor of map.values())await tensor.dispose();map.clear();}
test('only the complete stage1 RGB projection is reused between autoregressive passes, while all later stages run',async()=>{
 const f=fixture(),invariantFeatures=new Map();try{for(let iteration=0;iteration<3;iteration++){const result=await f.run(iteration,{invariantFeatures});assert.ok(result.executionResources.sessionCacheHits>0);assert.equal(result.executionResources.maximumSessionCacheBytes,16*MiB);await result.release();}
  assert.equal(f.calls.filter(n=>n==='s0i').length,1);for(const name of ['s0m','s1i','s2i','s3i'])assert.equal(f.calls.filter(n=>n===name).length,3);assert.equal(invariantFeatures.size,1);const cached=[...invariantFeatures.values()][0],row=await cached.readRows(0,1);assert.ok(row.data.every(v=>v===.125));row.release();assert.ok(f.budget.total()>0);cached.markCold();
 }finally{await clear(invariantFeatures);}assert.equal(f.budget.total(),0);
});
test('a caller without an invariant owner retains the legacy projection/release behavior',async()=>{
 const f=fixture();for(let iteration=0;iteration<2;iteration++){const result=await f.run(iteration);await result.release();assert.equal(f.budget.total(),0);}assert.equal(f.calls.filter(n=>n==='s0i').length,2);
});
test('different original source, graph identity, backend or window plan cannot reuse an invariant projection',async()=>{
 const f=fixture(),invariantFeatures=new Map();try{const run=async options=>{const out=await f.run(0,{invariantFeatures,...options});await out.release();};await run();await run({rgb:ritaSourceTensors(f.surface,{budget:f.budget}).rgb});await run({backend:'auto'});f.manifest.assets.s0i.sha256='b'.repeat(64);await run();await run({windowBytes:16*MiB});assert.equal(f.calls.filter(n=>n==='s0i').length,5);assert.equal(invariantFeatures.size,5);}finally{await clear(invariantFeatures);}assert.equal(f.budget.total(),0);
});
test('a graph failure after a complete projection preserves its owner for a same-source retry without leaking step tensors',async()=>{
 let refuse=true;const f=fixture({fail:name=>{if(refuse&&name==='s0m')throw Object.assign(Error('mask failed'),{code:'WORKER_FAILED'});}}),invariantFeatures=new Map();try{await assert.rejects(f.run(0,{invariantFeatures}),{code:'WORKER_FAILED'});assert.equal(invariantFeatures.size,1);const retained=f.budget.total();assert.ok(retained>0);refuse=false;const result=await f.run(0,{invariantFeatures});await result.release();assert.equal(f.calls.filter(n=>n==='s0i').length,1);assert.equal(f.budget.total(),retained);}finally{await clear(invariantFeatures);}assert.equal(f.budget.total(),0);
});
test('an incomplete projection is never committed to the invariant owner',async()=>{
 let projections=0;const f=fixture({fail:name=>{if(name==='s0i'&&++projections===2)throw Object.assign(Error('projection failed'),{code:'WORKER_FAILED'});}}),invariantFeatures=new Map();await assert.rejects(f.run(0,{invariantFeatures,windowBytes:64*1024}),{code:'WORKER_FAILED'});assert.equal(projections,2);assert.equal(invariantFeatures.size,0);assert.equal(f.budget.total(),0);
});
test('cancellation after committing the RGB projection releases every other bank and leaves the explicit owner disposable',async()=>{
 const controller=new AbortController(),f=fixture({fail:name=>{if(name==='s0m'){controller.abort();throw Object.assign(Error('cancelled'),{code:'CANCELLED'});}}}),invariantFeatures=new Map();await assert.rejects(f.run(0,{invariantFeatures,signal:controller.signal}),{code:'CANCELLED'});assert.equal(invariantFeatures.size,1);await clear(invariantFeatures);assert.equal(f.budget.total(),0);
});
test('a GPU-to-CPU fallback during RGB projection does not cache a mixture under the next pass CPU identity',async()=>{
 const f=fixture({fail:name=>{if(name==='s0i')f.pool.cpuOnly=true;}}),invariantFeatures=new Map();const result=await f.run(0,{invariantFeatures});await result.release();assert.equal(invariantFeatures.size,0);assert.equal(f.budget.total(),0);
});

test('network GPU ledger aggregates explicit per-worker maxima without claiming total device memory',async()=>{
 const f=fixture({gpuMemory:(_name,calls)=>calls.length%2?{peakBufferBytes:100,maximumBytes:200,unmeasuredTextureStorage:false}:{peakBufferBytes:150,maximumBytes:250,unmeasuredTextureStorage:true}}),result=await f.run(0);assert.equal(result.executionResources.gpuBufferLedgerObserved,true);assert.equal(result.executionResources.maximumWorkerGpuBufferBytes,150);assert.equal(result.executionResources.maximumWorkerGpuAdmissionBytes,250);assert.equal(result.executionResources.unmeasuredGpuTextureStorage,true);await result.release();assert.equal(f.budget.total(),0);
});

test('query transport grouping preserves every original graph window and counts logical executions separately',async()=>{
 const f=fixture(),result=await f.run(0,{attentionBytes:128});const first=f.queryGroups.filter(g=>g.name==='s0q');assert.equal(first.length,16);assert.ok(first.every(g=>g.counts.length===16&&g.counts.every(count=>count===1)&&g.bytes<=2*MiB));assert.equal(first.reduce((n,g)=>n+g.counts.length,0),256);assert.equal(result.executions.find(e=>e.name==='s0q').calls,256);assert.equal(result.executionResources.queryTransportJobs,f.queryGroups.length);assert.equal(result.executionResources.queryLogicalExecutions,f.queryGroups.reduce((n,g)=>n+g.counts.length,0));assert.ok(result.executionResources.queryLogicalExecutions>result.executionResources.queryTransportJobs);await result.release();assert.equal(f.budget.total(),0);
});
test('transport pressure reduces the number of grouped windows before changing any original query count',async()=>{
 const progress=[],f=fixture({fail:(name,_feeds,_calls,options)=>{if(name==='s0q'&&(options.queryBatch?.counts.length??1)>2)throw Object.assign(Error('batch staging refused'),{code:'MEMORY_LIMIT'});}}),result=await f.run(0,{attentionBytes:16*1024,onProgress:event=>progress.push(event)}),first=f.queryGroups.filter(g=>g.name==='s0q');assert.deepEqual([...new Set(first.filter(g=>!g.success).map(g=>g.counts.length))],[16,8,4]);assert.ok(first.every(g=>g.counts.every(count=>count===3||count===1)));assert.ok(first.filter(g=>g.success).every(g=>g.counts.length<=2));assert.equal(first.filter(g=>g.success).reduce((n,g)=>n+g.counts.reduce((a,b)=>a+b,0),0),256);assert.ok(progress.some(e=>e.phase==='rita-query-batch-memory-retry'));assert.ok(!progress.some(e=>e.phase==='rita-query-memory-retry'));const committed=progress.filter(e=>e.phase==='rita-global-attention'&&e.model==='s0q').map(e=>e.completed);assert.equal(committed.at(-1),256);assert.ok(committed.every((v,i)=>!i||v>committed[i-1]));await result.release();assert.equal(f.budget.total(),0);
});
test('failed single-window admission retains the original query-size recovery only after grouping is exhausted',async()=>{
 const progress=[],f=fixture({fail:(name,feeds)=>{if(name==='s0q'&&feeds.x.dims[3]>128)throw Object.assign(Error('query workspace refused'),{code:'MEMORY_LIMIT'});}}),result=await f.run(0,{attentionBytes:MiB,onProgress:event=>progress.push(event)});assert.ok(progress.some(e=>e.phase==='rita-query-batch-memory-retry'));assert.ok(progress.some(e=>e.phase==='rita-query-memory-retry'));const successful=f.queryGroups.filter(g=>g.name==='s0q'&&g.success);assert.equal(successful.reduce((n,g)=>n+g.counts.reduce((a,b)=>a+b,0),0),256);assert.ok(successful.every(g=>g.counts.length===1&&g.counts[0]<=128));assert.ok(f.queryGroups.filter(g=>g.name==='s0q').every(g=>JSON.stringify(g.keyShape)===JSON.stringify(f.queryGroups[0].keyShape)));await result.release();assert.equal(f.budget.total(),0);
});

test('a singleton query and the final singleton group use the original strict pool path with no queryBatch flag',async()=>{
 const f=fixture({height:64}),result=await f.run(0,{attentionBytes:4224*31}),first=f.queryGroups.filter(g=>g.name==='s0q');assert.equal(first.length,2);assert.equal(first[0].batchPresent,true);assert.equal(first[0].counts.length,16);assert.equal(first[1].batchPresent,false);assert.deepEqual(first[1].counts,[16]);assert.equal(first.reduce((n,g)=>n+g.counts.reduce((a,b)=>a+b,0),0),512);assert.ok(f.queryGroups.some(g=>!g.batchPresent));assert.ok(f.queryGroups.every(g=>g.batchPresent===(g.counts.length>1)));assert.equal(result.executionResources.queryTransportJobs,f.queryGroups.length);await result.release();assert.equal(f.budget.total(),0);
});

test('an automatic GPU-to-CPU fallback discards the enlarged-window result before any target commit',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{}}});
 try{
  const progress=[],seen=[],f=fixture({memoryMiB:8192,provider:(name,_calls,options)=>{if(name==='s0q'){seen.push(options.backend);return 'wasm';}return 'webgpu';}});f.pool.gpuDeviceLimits={maxStorageBufferBindingSize:1024*MiB,maxBufferSize:1024*MiB};
  const result=await f.run(0,{backend:'auto',onProgress:e=>progress.push(e)});
  assert.deepEqual(seen,['auto','cpu']);assert.equal(progress.filter(e=>e.phase==='rita-query-provider-replan').length,1);assert.ok(progress.filter(e=>e.phase==='rita-query-provider-replan').every(e=>e.completed===0&&e.uncommittedResultDiscarded));
  await result.release();assert.equal(f.budget.total(),0);
 }finally{if(saved)Object.defineProperty(globalThis,'navigator',saved);else delete globalThis.navigator;}
});

test('a provider fallback after committed GPU windows restarts the block with the full historical CPU tail',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{}}});
 try{
  let queries=0;const progress=[],f=fixture({provider:name=>name==='s0q'?(++queries===1?'webgpu':'wasm'):'test'});f.pool.gpuDeviceLimits={maxStorageBufferBindingSize:64*1024+1,maxBufferSize:MiB};
  const result=await f.run(0,{backend:'auto',onProgress:e=>progress.push(e)}),groups=f.queryGroups.filter(g=>g.name==='s0q'),replan=progress.find(e=>e.phase==='rita-query-provider-replan');
  assert.equal(groups.length,3);assert.equal(groups[0].counts.reduce((a,b)=>a+b,0),16);assert.equal(groups[1].counts.reduce((a,b)=>a+b,0),16);assert.deepEqual(groups[2].counts,[256]);
  assert.equal(replan.discardedGpuPrefix,16);assert.equal(replan.completed,0);assert.deepEqual(progress.filter(e=>e.phase==='rita-global-attention'&&e.model==='s0q').map(e=>e.completed),[16,256]);
  await result.release();assert.equal(f.budget.total(),0);
 }finally{if(saved)Object.defineProperty(globalThis,'navigator',saved);else delete globalThis.navigator;}
});
