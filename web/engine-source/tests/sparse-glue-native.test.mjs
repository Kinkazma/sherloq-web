import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import create from '../vendor/sparse-glue-paged/attention.js';
import {PagedGlueAttention,glueCSR} from '../src/sparse-glue-paged-attention.js';

test('paged SparseGlue native CPU attention and assignment publish owned copies and recover from malloc refusal',async()=>{
 const engine=new PagedGlueAttention();engine.cpu=await create({wasmBinary:await readFile(new URL('../vendor/sparse-glue-paged/attention.wasm',import.meta.url))});
 const edges=Int32Array.of(0,0,0,1),csr0=glueCSR(edges,1,0),csr1=glueCSR(edges,2,1),q=Float32Array.of(0,0),k=Float32Array.of(0,0,0,0),v=Float32Array.of(2,4,4,6);
 try{
  const out=await engine.attention(q,k,v,csr0,1,2);assert.deepEqual([...out],[3,5]);assert.notEqual(out.buffer,engine.cpu.HEAPU8.buffer);
  const assigned=await engine.assignment(q,k,Float32Array.of(0),Float32Array.of(0,0),edges,csr0,csr1);assert.deepEqual([...assigned],[.5,.5]);
  const malloc=engine.cpu._malloc;engine.cpu._malloc=()=>0;try{await assert.rejects(engine.attention(q,k,v,csr0,1,2),error=>error.code==='MEMORY_ALLOCATION'&&error.details.allocationKind==='wasm'&&error.details.requestedBytes===8);assert.equal(engine.pointers.length,0);}finally{engine.cpu._malloc=malloc;}
  assert.deepEqual(await engine.attention(q,k,v,csr0,1,2),out);
 }finally{engine.dispose();}
});

test('paged SparseGlue closes both GPU scopes on a rejected readback and preserves the allocator cause',async t=>{
 const saved=new Map();for(const [key,value]of Object.entries({GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16},GPUMapMode:{READ:1}})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true});}
 t.after(()=>{for(const [key,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const engine=new PagedGlueAttention(),buffers=[],scopes=[],mappingCause=new DOMException('Mapping failed','OperationError');let fail=true;
 engine.device={queue:{writeBuffer(){},submit(){}},pushErrorScope(kind){scopes.push(kind);},async popErrorScope(){const kind=scopes.pop();return fail&&kind==='out-of-memory'?{message:'GPU allocator refused readback'}:null;},
  createBuffer({size}){const buffer={data:new ArrayBuffer(size),destroyed:false,async mapAsync(){if(fail)throw mappingCause;},getMappedRange(){return this.data;},unmap(){structuredClone(this.data,{transfer:[this.data]});},destroy(){this.destroyed=true;}};buffers.push(buffer);return buffer;},
  createBindGroup(){return {};},createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},copyBufferToBuffer(){},finish(){return {};}};}};
 engine.pipelines=Object.fromEntries(['dot','normalize','accumulate'].map(key=>[key,{getBindGroupLayout(){return {};}}]));
 const run=()=>engine.gpuPage(Float32Array.of(0,0),Float32Array.of(0,0),Float32Array.of(2,4),Int32Array.of(0,1),Int32Array.of(0),Int32Array.of(0),1,1,1,2);
 await assert.rejects(run(),error=>error.code==='MEMORY_ALLOCATION'&&error.details.allocationKind==='gpu'&&error.cause===mappingCause);
 assert.equal(scopes.length,0);assert.ok(buffers.every(b=>b.destroyed));
 fail=false;const output=await run();assert.equal(output.length,2);assert.deepEqual([...output],[0,0]);assert.equal(scopes.length,0);assert.ok(buffers.every(b=>b.destroyed));
});
