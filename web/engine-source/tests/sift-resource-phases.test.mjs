import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {SiftPool} from '../src/sift-paged.js';
import {SiftPagedResources} from '../src/sift-paged-resources.js';
import {createSiftGaussianGpu,siftGaussianWorkspace} from '../src/sift-paged-gaussian.js';
import {wasmRange} from '../src/memory-range.js';

test('SIFT virtual slots do not finance ten idle heaps while GPU is busy',async()=>{
 const budget=new Budget(1000),owner={profile:{maxWorkers:10},workers:new Set()},pool=new SiftPool(owner,{budget,heap:64,cost:()=>100,provider:'webgpu'});
 await pool.open(10);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains.wasm.reservedBytes,0);assert.equal(pool.records.length,10);pool.close();assert.equal(budget.total(),0);
});
test('SIFT phases return CPU during GPU and retain only their actual backing ownership',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:2}),operation=budget.beginOperation({owner:'sift'}),lease=await scheduler.acquire({cpu:1,gpu:1,bytes:300,operation});
 const memory=lease.retainMemory(300),resource=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:300,lease});assert.ok(Number.isFinite(resource.preparedAt));
 await resource.message({action:'backing',backingId:1,kind:'gpu',bytes:200,label:'pyramid'});
 await resource.message({action:'backing',backingId:2,kind:'gpu-mapped',bytes:100,label:'readback'});
 await resource.phase('gpu');assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:1});assert.equal(budget.total(),300);
 const peer=await scheduler.acquire({cpu:2});assert.equal(scheduler.snapshot().active.cpu,2);peer.release();
 await resource.phase('cpu');assert.deepEqual(scheduler.snapshot().active,{cpu:1,gpu:0});assert.equal(budget.resourceSnapshot().domains.gpu.materializedBytes,200);
 resource.close();memory();operation.release();assert.equal(budget.total(),0);for(const d of Object.values(budget.resourceSnapshot().domains))assert.equal(d.reservedBytes,0);
});
test('SIFT mapped pyramid retries mapping without redispatch and copies into renewed Wasm view',async()=>{
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldUsage=globalThis.GPUBufferUsage,oldMode=globalThis.GPUMapMode;let submits=0,maps=0,destroyed=0,created=0,scopes=0;
 const device={lost:new Promise(()=>{}),createShaderModule:()=>({}),createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),createBindGroup:()=>({}),pushErrorScope(){scopes++;},async popErrorScope(){scopes--;return null;},destroy(){},
 createBuffer({size}){created++;const buffer=new ArrayBuffer(size);let mapped=false,range=false;return {buffer,destroy(){destroyed++;},async mapAsync(){maps++;if(maps===1)throw new RangeError('GPU out of memory');mapped=true;},getMappedRange(){assert.equal(mapped,true);assert.equal(range,false);range=true;return buffer;},unmap(){mapped=false;}};},
 createCommandEncoder(){const copies=[];return {copyBufferToBuffer(a,ao,b,bo,size){copies.push(()=>new Uint8Array(b.buffer,bo,size).set(new Uint8Array(a.buffer,ao,size)));},beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}),finish:()=>copies};},
 queue:{writeBuffer(b,offset,data){new Uint8Array(b.buffer,offset,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(commands){submits++;for(const operations of commands)for(const copy of operations)copy();}}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}}});globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8,UNIFORM:16};globalThis.GPUMapMode={READ:1};
 const memory=new WebAssembly.Memory({initial:1}),module={get HEAPU8(){return new Uint8Array(memory.buffer);}},destination=wasmRange(module,32,32),backings=[];let gpu;
 try{gpu=await createSiftGaussianGpu({phase:async kind=>{if(kind==='cpu')memory.grow(1);},backing:async(kind,bytes)=>{backings.push([kind,bytes]);return()=>{};},recover:async(label,work)=>{try{return await work();}catch(error){assert.equal(label,'sift-gaussian-map');return work();}}});
 await gpu.pyramidInto(Float32Array.of(1,2,3,4),2,2,[Float32Array.of(1)],destination);
 assert.deepEqual(Array.from(new Float32Array(memory.buffer,32,8)),[1,2,3,4,0,0,0,0]);assert.equal(submits,1);assert.equal(maps,2);assert.equal(created,destroyed);assert.equal(scopes,0);
 const expected=siftGaussianWorkspace(2,2,[Float32Array.of(1)]);assert.deepEqual(backings,[['gpu',expected.gpuBytes],['gpu-mapped',32]]);
 }finally{gpu?.dispose();if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.GPUBufferUsage=oldUsage;globalThis.GPUMapMode=oldMode;}
});


test('SIFT closes a phase lease admitted immediately before cancellation',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),operation=budget.beginOperation({owner:'sift'}),resource=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:0});
 const pending=resource.phase('cpu');assert.equal(scheduler.snapshot().active.cpu,1);resource.close();await assert.rejects(pending,{code:'CANCELLED'});operation.release();assert.equal(scheduler.snapshot().active.cpu,0);assert.equal(scheduler.snapshot().running,0);assert.equal(budget.total(),0);
});

test('SIFT closes backing credit admitted immediately before owner cancellation',async()=>{
 const budget=new Budget(1000),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),operation=budget.beginOperation({owner:'sift'}),resource=new SiftPagedResources({budget,scheduler,operation,owner:'sift',workspaceBytes:0});
 const pending=resource.message({action:'backing',backingId:1,kind:'array-buffer',bytes:64,label:'pending-output'});assert.equal(budget.total(),64);resource.close();await assert.rejects(pending,{code:'CANCELLED'});operation.release();assert.equal(scheduler.snapshot().running,0);assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].reservedBytes,0);
});
