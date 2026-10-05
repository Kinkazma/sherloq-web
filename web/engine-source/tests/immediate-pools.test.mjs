import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {LutPool} from '../src/lut-pool.js';import {QualityPool} from '../src/quality-pool.js';import {ZeroPool} from '../src/zero-pool.js';import {NoisesnifferPool} from '../src/noisesniffer-pool.js';
import {FrequencyGpu} from '../src/frequency-gpu.js';
test('Fresh CPU pools dispatch requested work once: no baseline, probe or repeated candidate',async()=>{
 const previous=globalThis.Worker;globalThis.Worker=class{};
 try{for(const Type of [LutPool,QualityPool,ZeroPool,NoisesnifferPool]){
  const pool=new Type(new Budget(2**33),{maxWorkers:8}),calls=[];
  pool.resize=async count=>{pool.workers=Array.from({length:count},()=>({terminate(){}}));};pool.install=async()=>{};
  pool.execute=async(...args)=>{calls.push(args);if(Type===QualityPool)return args[1].map(q=>[q,q]);if(Type===NoisesnifferPool)return {means:new Float64Array(1),variance:new Float32Array(1),valid:new Uint8Array(1)};return new Uint8Array(3);};
  // A serial pass here would be a hidden baseline, not the requested dispatch.
  if(Type===QualityPool)pool.serial=()=>{throw Error('Unexpected preflight serial work');};
  const image={width:1024,height:1024,format:'rgb8',data:new Uint8Array(3*1024**2)};
  let result;if(Type===LutPool)result=await pool.run(image.data,image.data,{},new Uint8Array(1));
  else if(Type===QualityPool)result=await pool.run(image);
  else if(Type===ZeroPool)result=await pool.run(new Float64Array(1024**2),1024,1024);
  else result=await pool.run(image,3);
  const scheduling=result.scheduling??result.runtime.scheduling;assert.equal(calls.length,1,Type.name);assert.equal(scheduling.taskExecutions,1);assert.equal(scheduling.preflightExecutions,0);assert.equal(scheduling.priorUsefulSamples,0);
  if(Type===QualityPool)assert.deepEqual(calls[0][1],Array.from({length:100},(_,i)=>i+1));pool.dispose();
 }}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
test('Fresh GPU preparation creates only its required device/pipeline and dispatches no probe',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),calls=[];
 const limits={maxStorageBufferBindingSize:128*1024**2,maxBufferSize:256*1024**2,maxComputeWorkgroupsPerDimension:65535};
 const device={limits,createShaderModule(){calls.push('shader');return {};},async createComputePipelineAsync(){calls.push('pipeline');return {};},destroy(){calls.push('destroy');}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{async requestAdapter(){calls.push('adapter');return {limits,async requestDevice(options){assert.deepEqual(options.requiredLimits,{maxStorageBufferBindingSize:limits.maxStorageBufferBindingSize,maxBufferSize:limits.maxBufferSize});calls.push('device');return device;}};}}}});
 const budget=new Budget(128*1024**2),gpu=new FrequencyGpu(budget,{});
 try{await gpu.prepare();assert.deepEqual(calls,['adapter','device','shader','pipeline']);assert.equal(gpu.qualification.preflightExecutions,0);assert.equal(budget.retained,32*1024**2);}finally{gpu.dispose();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
 assert.equal(budget.total(),0);
});
