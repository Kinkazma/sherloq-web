import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createCmsegDotGpu} from '../experiments/segmentation/cmseg-dot-gpu.js';

test('Resident correlation constructor releases every buffer and reservation when bind group construction fails',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),usage=globalThis.GPUBufferUsage;
  const budget=new Budget(64*1024**2),buffers=[];let scopes=0,destroyed=0;
  const device={lost:new Promise(()=>{}),pushErrorScope(){scopes++;},async popErrorScope(){scopes--;return null;},
    createShaderModule(){return{async getCompilationInfo(){return{messages:[]};}};},
    async createComputePipelineAsync(){return{getBindGroupLayout(){return{};}};},
    createBuffer(){const record={destroyed:false};buffers.push(record);return{destroy(){record.destroyed=true;}};},
    createBindGroup(){throw Error('Injected bind failure');},queue:{writeBuffer(){}},destroy(){destroyed++;}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{async requestAdapter(){return{limits:{maxStorageBufferBindingSize:64*1024**2,maxBufferSize:64*1024**2},async requestDevice(){return device;}};}}}});
  globalThis.GPUBufferUsage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8,UNIFORM:16};
  try{
    await assert.rejects(createCmsegDotGpu({budget,input:new Float32Array(96*32*32),c:96,h:32,w:32}),/Injected bind failure/);
    assert.equal(buffers.length,4);assert(buffers.every(b=>b.destroyed));assert.equal(destroyed,1);assert.equal(scopes,0);assert.equal(budget.total(),0);
    await assert.rejects(createCmsegDotGpu({budget,input:new Float32Array(1),c:96,h:32,w:32}),{code:'INVALID_INPUT'});
    assert.equal(budget.total(),0);
  }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;if(usage===undefined)delete globalThis.GPUBufferUsage;else globalThis.GPUBufferUsage=usage;}
});
