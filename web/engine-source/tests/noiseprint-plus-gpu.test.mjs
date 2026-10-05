import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoiseprintPlusGPU} from '../src/noiseprint-plus-gpu.js';

function gpuEnvironment(t){
 const descriptors=new Map(),define=(target,key,value)=>{descriptors.set([target,key],Object.getOwnPropertyDescriptor(target,key));Object.defineProperty(target,key,{value,configurable:true});};
 t.after(()=>{for(const [[target,key],descriptor]of descriptors){if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];}});
 define(globalThis,'GPUBufferUsage',{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16});define(globalThis,'GPUMapMode',{READ:1});
 const buffers=[],writes=[],submissions=[],pipelines=[];let fences=0,destroyed=false,error,readError;
 const device={
  limits:{maxBufferSize:2**30,maxStorageBufferBindingSize:2**30},lost:new Promise(()=>{}),
  queue:{writeBuffer(buffer,offset,data){assert.equal(buffer.destroyed,false);writes.push({buffer,data});new Uint8Array(buffer.data,offset,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(commands){submissions.push(...commands);},async onSubmittedWorkDone(){fences++;}},
  createBuffer({size,usage}){const buffer={size,usage,data:new ArrayBuffer(size),destroyed:false,destroy(){this.destroyed=true;},async mapAsync(){if(readError){const failure=readError;readError=null;throw failure;}},getMappedRange(offset=0,size=this.data.byteLength){return this.data.slice(offset,offset+size);},unmap(){}};buffers.push(buffer);return buffer;},
  createShaderModule({code}){return {code};},async createComputePipelineAsync(options){const pipeline={...options,getBindGroupLayout(){return {};}};pipelines.push(pipeline);return pipeline;},createBindGroup(options){return options;},
  createCommandEncoder(){const passes=[];return {beginComputePass(){const pass={};passes.push(pass);return {setPipeline(pipeline){pass.pipeline=pipeline;},setBindGroup(index,bind){pass.bind=bind;},dispatchWorkgroups(x,y){pass.workgroups=[x,y];},end(){}};},copyBufferToBuffer(){},finish(){return {passes};}};},
  pushErrorScope(){},async popErrorScope(){const next=error;error=undefined;return next;},destroy(){destroyed=true;}
 };
 define(globalThis.navigator,'gpu',{async requestAdapter(){return {limits:device.limits,async requestDevice(){return device;}};}});
 return {buffers,writes,submissions,pipelines,get fences(){return fences;},get destroyed(){return destroyed;},failMemory(){error={message:'injected GPU memory pressure'};},failReadback(){error={message:'injected GPU memory pressure'};readError=new DOMException('Mapping failed','OperationError');}};
}
const program=()=>({initializers:{weights:{dims:[1,1,3,3],offset:0},bias:{dims:[1],offset:9}},nodes:[{op:'Conv',inputs:['input','weights','bias']},...Array.from({length:16},()=>({op:'Relu',inputs:['x']}))]});
const input={data:Float32Array.of(1,2,3,4),dims:[1,1,2,2]};

test('GPU graph preserves ordered passes with two activation buffers and bounded command batches',async t=>{
 const env=gpuEnvironment(t),gpu=await createNoiseprintPlusGPU(),model=program(),weights=new Float32Array(10);
 const first=await gpu.run(model,weights,input);
 assert.deepEqual(first.dims,[1,1,2,2]);assert.deepEqual(env.submissions.map(batch=>batch.passes.length),[8,8,1]);assert.equal(env.fences,0);
 const passes=env.submissions.flatMap(batch=>batch.passes),arena=new Set();
 for(let i=0;i<passes.length;i++){
  const bindings=new Map(passes[i].bind.entries.map(entry=>[entry.binding,entry.resource.buffer])),source=bindings.get(0),output=bindings.get(3);arena.add(source);arena.add(output);
  assert.notEqual(source,output);if(i)assert.equal(source,passes[i-1].bind.entries.find(entry=>entry.binding===3).resource.buffer);
 }
 assert.equal(arena.size,2);assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,7,'weights and bounded activation/readback arena remain resident');
 const initialCount=env.buffers.length;await gpu.run(model,weights,input);
 assert.equal(env.buffers.length-initialCount,0,'second useful window allocates no weights or activation buffers');assert.equal(gpu.metrics.arenaReuses,1);assert.equal(env.pipelines.length,2);
 gpu.dispose();gpu.dispose();assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,0);assert.equal(env.destroyed,true);
 await assert.rejects(gpu.run(model,weights,input),{code:'DISPOSED'});
});

test('Replacing model identity and failed useful execution release retained GPU resources',async t=>{
 const env=gpuEnvironment(t),gpu=await createNoiseprintPlusGPU(),weights=new Float32Array(10),a=program(),b=program();
 await gpu.run(a,weights,input);const firstWeights=env.buffers.filter(buffer=>!buffer.destroyed);
 await gpu.run(b,weights,input);assert.ok(firstWeights.every(buffer=>buffer.destroyed));
 env.failMemory();await assert.rejects(gpu.run(b,weights,input),{code:'MEMORY_ALLOCATION'});assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,0);
 await gpu.run(b,weights,input);assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,7);gpu.dispose();
});


test('Smaller useful windows reuse the arena and expose only the current output extent',async t=>{
 const env=gpuEnvironment(t),gpu=await createNoiseprintPlusGPU(),model=program(),weights=new Float32Array(10);
 await gpu.run(model,weights,input);const count=env.buffers.length;
 const result=await gpu.run(model,weights,{data:Float32Array.of(3),dims:[1,1,1,1]});
 assert.equal(result.data.length,1);assert.equal(env.buffers.length,count);assert.equal(gpu.metrics.arenaReuses,1);gpu.dispose();
});


test('a rejected GPU readback retains the allocator domain and mapping cause before closing its scopes',async t=>{
 const env=gpuEnvironment(t),gpu=await createNoiseprintPlusGPU();env.failReadback();
 await assert.rejects(gpu.run(program(),new Float32Array(10),input),error=>error.code==='MEMORY_ALLOCATION'&&error.details.allocationKind==='gpu'&&error.cause.name==='OperationError'&&error.details.gpuScope.message==='injected GPU memory pressure');
 assert.equal(env.buffers.filter(buffer=>!buffer.destroyed).length,0);gpu.dispose();
});
