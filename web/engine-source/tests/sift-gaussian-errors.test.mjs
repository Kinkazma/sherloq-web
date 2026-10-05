import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiftGaussianGpu} from '../src/sift-paged-gaussian.js';
import {createSiftWorkerResources} from '../src/sift-paged-worker-resources.js';
import {wasmRange} from '../src/memory-range.js';

function fixture(t,{mappedError,scopeErrors=[]}={}){
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldUsage=globalThis.GPUBufferUsage,oldMode=globalThis.GPUMapMode,stats={submits:0,maps:0,ranges:0,created:0,destroyed:0,unmaps:0},requests=[],backings=[];
 const device={lost:new Promise(()=>{}),createShaderModule:()=>({}),createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),createBindGroup:()=>({}),pushErrorScope(){},async popErrorScope(){return scopeErrors.shift()??null;},destroy(){},
  createBuffer({size}){stats.created++;const buffer=new ArrayBuffer(size);return {destroy(){stats.destroyed++;},async mapAsync(){stats.maps++;},getMappedRange(){stats.ranges++;if(stats.ranges===1&&mappedError)throw mappedError;return buffer;},unmap(){stats.unmaps++;}};},
  createCommandEncoder(){return {copyBufferToBuffer(){},beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}),finish:()=>({})};},queue:{writeBuffer(){},submit(){stats.submits++;}}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}}});globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,MAP_READ:8,UNIFORM:16};globalThis.GPUMapMode={READ:1};
 const resources=createSiftWorkerResources(message=>{if(message.resourceRequest){requests.push(message.resourceRequest);queueMicrotask(()=>resources.reply({id:message.resourceRequest.id}));}}),module={HEAPU8:new Uint8Array(new WebAssembly.Memory({initial:1}).buffer)};
 t.after(()=>{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.GPUBufferUsage=oldUsage;globalThis.GPUMapMode=oldMode;assert.equal(stats.created,stats.destroyed);});
 return {stats,requests,backings,destination:bytes=>wasmRange(module,32,bytes),create:()=>createSiftGaussianGpu({recover:resources.recover.bind(resources),backing:async(kind,bytes)=>{backings.push({kind,bytes});return()=>{};}})};
}

test('SIFT getMappedRange allocation refusal preserves GPU work and reports the native ArrayBuffer domain',async t=>{
 const cause=new RangeError('Array buffer allocation failed'),f=fixture(t,{mappedError:cause}),gpu=await f.create();
 try{await gpu.pyramidInto(Float32Array.of(1,2,3,4),2,2,[Float32Array.of(1)],f.destination(32));}finally{gpu.dispose();}
 const recovery=f.requests.filter(r=>r.action==='recover');assert.equal(recovery.length,1);assert.equal(recovery[0].kind,'array-buffer');assert.equal(recovery[0].error.code,'MEMORY_ALLOCATION');assert.equal(recovery[0].error.cause.message,cause.message);assert.equal(recovery[0].bytes,undefined,'Mapping view does not claim another full readback allocation');assert.equal(recovery[0].error.details.requestedBytes,undefined);
 assert.deepEqual({submits:f.stats.submits,maps:f.stats.maps,ranges:f.stats.ranges},{submits:1,maps:1,ranges:2});assert.equal(f.backings.filter(b=>b.kind==='gpu-mapped').length,1);assert.equal(f.requests.filter(r=>r.action==='recovered').length,1);
});

test('SIFT mapping validation is terminal and keeps its exact cause instead of inventing a Wasm refusal',async t=>{
 const cause=new DOMException('Invalid mapped range','OperationError'),f=fixture(t,{mappedError:cause}),gpu=await f.create();
 try{await assert.rejects(gpu.pyramidInto(Float32Array.of(1,2,3,4),2,2,[Float32Array.of(1)],f.destination(32)),error=>error===cause);}finally{gpu.dispose();}
 assert.equal(f.requests.length,0);assert.equal(f.stats.ranges,1);assert.equal(f.stats.unmaps,1);
});

for(const code of ['GPU_OUT_OF_MEMORY','GPU_FAILED'])test('SIFT preserves the underlying '+code+' scope error',async t=>{
 const cause=new Error('Device scope failure'),f=fixture(t,{scopeErrors:code==='GPU_OUT_OF_MEMORY'?[cause,null]:[null,cause]}),gpu=await f.create();
 try{await assert.rejects(gpu.pyramidInto(Float32Array.of(1,2,3,4),2,2,[Float32Array.of(1)],f.destination(32)),error=>error.code===code&&error.cause===cause);}finally{gpu.dispose();}
 assert.equal(f.stats.submits,1);assert.equal(f.requests.length,0);
});

test('SIFT copy bounds remain a terminal input error after mapping',async t=>{
 const f=fixture(t),gpu=await f.create();try{await assert.rejects(gpu.pyramidInto(Float32Array.of(1,2,3,4),2,2,[Float32Array.of(1)],f.destination(16)),{code:'INVALID_INPUT'});}finally{gpu.dispose();}assert.equal(f.requests.length,0);assert.equal(f.stats.ranges,1);
});
