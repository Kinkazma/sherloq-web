import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {tryGlobalHistogram100Gpu,disposeGlobalHistogram100Gpu,globalHistogram100GpuState,globalHistogram100GpuPlan} from '../src/equalization-global-histogram-gpu.js';

const MiB=1024**2,PIPELINES=12*MiB,gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fakeGpu(){
 let lose;const calls={buffers:0,destroyed:0,commands:0,deviceDestroyed:0};
 const device={limits:{maxBufferSize:2**30,maxStorageBufferBindingSize:2**30,maxComputeWorkgroupsPerDimension:65535,maxComputeInvocationsPerWorkgroup:256,maxComputeWorkgroupSizeX:256,maxComputeWorkgroupStorageSize:32768},lost:new Promise(resolve=>lose=resolve),
  queue:{writeBuffer(){},async onSubmittedWorkDone(){}},createShaderModule(){return{async getCompilationInfo(){return{messages:[]};}};},async createComputePipelineAsync(){return{getBindGroupLayout(){return{};}};},
  createBuffer(){calls.buffers++;return{destroy(){calls.destroyed++;}};},createBindGroup(){return{};},pushErrorScope(){},async popErrorScope(){return null;},
  createCommandEncoder(){calls.commands++;throw Error('The controlled source failure must precede GPU submission');},destroy(){calls.deviceDestroyed++;lose({reason:'destroyed'});}};
 return{calls,api:{async requestAdapter(){return{limits:device.limits,async requestDevice(){return device;}};}}};
}
async function environment(gpu,callback){
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),names=['GPUBufferUsage','GPUMapMode'],saved=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu}});globalThis.GPUBufferUsage={STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16};globalThis.GPUMapMode={READ:1};
 try{return await callback();}finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;for(let i=0;i<names.length;i++)if(saved[i])Object.defineProperty(globalThis,names[i],saved[i]);else delete globalThis[names[i]];}
}
const descriptor={width:16,height:16,format:'rgb8'},options=budget=>({budget,backend:'auto',contains:()=>true});

test('a held/refused source-window ACK keeps Histogram workspace and lease until retry',async()=>{
 const budget=new Budget(128*MiB),gpu=fakeGpu(),entered=gate(),ack=gate(),failure=Object.freeze(Object.assign(Error('Source window ACK refused'),{code:'ACK_REFUSED'})),plan=globalHistogram100GpuPlan(16,16,true);let refuse=true,attempts=0;
 await environment(gpu.api,async()=>{
  const source={descriptor,async readWindow(){const free=budget.reserve(768);return{pixels:{...descriptor,data:new Uint8Array(768)},async release(){attempts++;if(attempts===1){entered.resolve();await ack.promise;}if(refuse)throw failure;free();}};}};
  const running=tryGlobalHistogram100Gpu(source,options(budget)),rejected=assert.rejects(running,error=>error===failure);await entered.promise;
  assert(budget.total()>=PIPELINES+plan.workspaceBytes+768,'The pending source ACK retains every credit');ack.resolve();await rejected;
  try{
   assert.equal(globalHistogram100GpuState(budget).pending,1);assert(budget.total()>=PIPELINES+plan.workspaceBytes+768,'A rejected source ACK must not refund the Histogram workspace');
   await assert.rejects(disposeGlobalHistogram100Gpu(budget),error=>error===failure);assert(budget.total()>=PIPELINES+plan.workspaceBytes+768,'A failed device retirement must keep the same pending credit');
  }finally{refuse=false;await disposeGlobalHistogram100Gpu(budget);}
  assert.equal(globalHistogram100GpuState(budget),null);assert.equal(gpu.calls.commands,0);assert.equal(gpu.calls.destroyed,gpu.calls.buffers);assert.equal(budget.total(),0);
 });
});

test('a refused host-stage backing ACK preserves a frozen source error and keeps workspace for retry',async()=>{
 const budget=new Budget(128*MiB),gpu=fakeGpu(),register=budget.registerBacking.bind(budget),primary=Object.freeze(Object.assign(Error('Controlled source failure'),{code:'SOURCE_FAILED'})),cleanup=Object.freeze(Object.assign(Error('Host stage ACK refused'),{code:'ACK_REFUSED'})),plan=globalHistogram100GpuPlan(16,16,true);let refuse=true,stageAttempts=0;
 budget.registerBacking=(kind,bytes,details)=>{const release=register(kind,bytes,details);if(kind!=='array-buffer'||!details.label?.startsWith('Histogram100-'))return release;return async()=>{stageAttempts++;if(refuse)throw cleanup;return release();};};
 await environment(gpu.api,async()=>{
  await assert.rejects(tryGlobalHistogram100Gpu({descriptor,async readWindow(){throw primary;}},options(budget)),error=>error===primary);
  try{
   assert.equal(globalHistogram100GpuState(budget).pending,1);assert(stageAttempts>0);assert(budget.total()>=PIPELINES+plan.workspaceBytes,'A rejected host-stage ACK must retain its complete workspace reservation');
   await assert.rejects(disposeGlobalHistogram100Gpu(budget),error=>error===cleanup);assert(budget.total()>=PIPELINES+plan.workspaceBytes);
  }finally{refuse=false;await disposeGlobalHistogram100Gpu(budget);}
  assert.equal(globalHistogram100GpuState(budget),null);assert.equal(gpu.calls.commands,0);assert.equal(gpu.calls.destroyed,gpu.calls.buffers);assert.equal(budget.total(),0);
 });
});
