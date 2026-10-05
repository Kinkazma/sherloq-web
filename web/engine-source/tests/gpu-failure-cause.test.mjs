import test from 'node:test';import assert from 'node:assert/strict';
import {createHammingGpu} from '../src/cloning-hamming-gpu.js';import {createFrequencyGpu} from '../src/frequency-gpu-kernel.js';import {Budget} from '../src/cache.js';
function fixture(t){
 const originals=[],define=(target,key,value)=>{originals.push([target,key,Object.getOwnPropertyDescriptor(target,key)]);Object.defineProperty(target,key,{value,configurable:true});};t.after(()=>{for(const [target,key,descriptor]of originals){if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];}});
 define(globalThis,'GPUBufferUsage',{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16});define(globalThis,'GPUMapMode',{READ:1});
 const buffers=[],scopes=[];let memory=false;
 const device={limits:{maxBufferSize:256*1024**2,maxStorageBufferBindingSize:128*1024**2,maxComputeWorkgroupsPerDimension:65535},queue:{writeBuffer(){},submit(){}},createBuffer({size}){const buffer={destroyed:false,destroy(){this.destroyed=true;},async mapAsync(){memory=true;throw new DOMException('mapping refused','OperationError');},unmap(){},getMappedRange(){return new ArrayBuffer(size);}};buffers.push(buffer);return buffer;},createShaderModule(){return {};},async createComputePipelineAsync(){return {getBindGroupLayout(){return {};}};},createBindGroup(){return {};},createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},copyBufferToBuffer(){},finish(){return {};}};},pushErrorScope(kind){scopes.push(kind);},async popErrorScope(){return scopes.pop()==='out-of-memory'&&memory?{message:'allocator exhausted'}:null;},destroy(){}};
 define(globalThis.navigator,'gpu',{async requestAdapter(){return {limits:device.limits,async requestDevice(){return device;}};}});return {buffers,scopes};
}
for(const kind of ['hamming','frequency'])test(kind+' keeps GPU allocator cause when readback rejects first',async t=>{
 const {buffers,scopes}=fixture(t),budget=new Budget(16*1024**2);let gpu;
 try{gpu=kind==='hamming'?await createHammingGpu(new Uint8Array(64),32,{account:bytes=>budget.reserve(bytes)}):await createFrequencyGpu();await assert.rejects(kind==='hamming'?gpu.batch(0,1):gpu.run(new Float32Array(4),2,2,new Float32Array([1])),error=>error.code==='MEMORY_ALLOCATION'&&error.details.allocationKind==='gpu'&&error.cause.name==='OperationError'&&error.details.gpuScope.message==='allocator exhausted');assert.equal(scopes.length,0);}finally{gpu?.dispose();}assert.ok(buffers.every(buffer=>buffer.destroyed));assert.equal(budget.total(),0);
});
