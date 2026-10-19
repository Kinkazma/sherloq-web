import test from 'node:test';
import assert from 'node:assert/strict';
import {ritaAttentionBytes,ritaQueryPlan} from '../src/rita-query-plan.js';
const MiB=1024**2,GiB=1024*MiB,limits={maxStorageBufferBindingSize:4*GiB-4,maxBufferSize:4*GiB-4};
test('CPU, GPU fallback and unmeasured device preserve every historical window',()=>{
 for(const budget of [128*MiB,2*GiB,4*GiB,8*GiB,25*GiB])for(const options of [{backend:'cpu',gpuAvailable:true,gpuDeviceLimits:limits},{backend:'auto',gpuAvailable:true,cpuOnly:true,gpuDeviceLimits:limits},{backend:'auto',gpuAvailable:false,gpuDeviceLimits:limits},{backend:'auto',gpuAvailable:true},{backend:'auto',gpuAvailable:true,gpuDeviceLimits:{maxStorageBufferBindingSize:Infinity,maxBufferSize:4*GiB}}])assert.equal(ritaAttentionBytes(budget,options),Math.min(256*MiB,Math.floor(budget/8)));
});
test('only an observed GPU grows to the measured 512 MiB maximum, within budget/8',()=>{
 for(const [budget,expected]of [[128*MiB,16*MiB],[2*GiB,256*MiB],[3*GiB,384*MiB],[4*GiB,512*MiB],[8*GiB,512*MiB],[25*GiB,512*MiB]])assert.equal(ritaAttentionBytes(budget,{backend:'webgpu',gpuAvailable:true,gpuDeviceLimits:limits}),expected);
});
test('both actual buffer limits bound each score tensor, leaving alignment margin',()=>{
 const block={heads:5,query:'q'},keys=106032,channels=320;
 for(const cap of [64*MiB,128*MiB,256*MiB])for(const invert of [false,true]){
  const gpuDeviceLimits={maxStorageBufferBindingSize:invert?2*GiB:cap,maxBufferSize:invert?cap:2*GiB},bytes=ritaAttentionBytes(25*GiB,{backend:'webgpu',gpuAvailable:true,gpuDeviceLimits}),plan=ritaQueryPlan(block,keys,channels,bytes,{backend:'webgpu',gpuAvailable:true});
  assert.ok(bytes<=512*MiB);assert.ok(plan.queries*keys*block.heads*4<cap-64*1024);
 }
});
test('invalid budgets are rejected and malformed device observations never enable growth',()=>{
 for(const value of [0,-1,Infinity,NaN,1.5])assert.throws(()=>ritaAttentionBytes(value));
 for(const gpuDeviceLimits of [{},{maxStorageBufferBindingSize:128*MiB},{maxStorageBufferBindingSize:128*MiB,maxBufferSize:-1},{maxStorageBufferBindingSize:64*1024,maxBufferSize:GiB}])assert.equal(ritaAttentionBytes(8*GiB,{gpuAvailable:true,gpuDeviceLimits}),256*MiB);
});
