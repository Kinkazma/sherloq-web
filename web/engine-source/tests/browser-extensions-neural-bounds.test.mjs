import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralGraphPool} from '../src/neural-graph-pool.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2,turn=()=>new Promise(r=>setImmediate(r));
const runtime={factoryUrl:'fixture',ortUrl:'fixture',wasmUrl:'fixture'};
const inputs={x:{data:Float32Array.of(1),dims:[1]}},bounds={workspaceBytes:64*MiB,cpuWorkspaceBytes:32*MiB,gpuWasmWorkspaceBytes:8*MiB,outputBytes:4};
class Worker{constructor(){this.jobs=[];}postMessage(job){this.jobs.push(job);}terminate(){this.dead=true;}emit(data){this.onmessage?.({data});}}
function setup(asset){const budget=new Budget(512*MiB),workers=[],pool=new NeuralGraphPool(budget,{maxWorkers:1},{assets:{test:asset},runtimes:{wasm:runtime,webgpu:runtime},workerFactory:()=>{const worker=new Worker();workers.push(worker);return worker;}});return{budget,workers,pool,scheduler:getExecutionScheduler(budget)};}

test('GPU refusal preserves the separately admitted CPU workspace and qualified transform allowance',async()=>{
 const old=Object.getOwnPropertyDescriptor(navigator,'gpu');Object.defineProperty(navigator,'gpu',{value:{},configurable:true});
 const sha='933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59',asset={bytes:1024,sha256:sha,url:'https://example.invalid/never-fetched',graphTransform:{id:'selfdm-native-scope-v2',sourceSha256:sha,maxAddedBytes:256}},f=setup(asset);
 try{
  const job=f.pool.run('test',inputs,{...bounds,backend:'auto'});await turn();const gpu=f.workers[0].jobs[0];assert.equal(gpu.provider,'webgpu');assert.equal(gpu.memoryMaximumBytes,80*MiB);assert.equal(gpu.gpuMaximumBytes,asset.bytes+asset.graphTransform.maxAddedBytes+bounds.workspaceBytes+12);
  f.workers[0].emit({error:{code:'GPU_OUT_OF_MEMORY',message:'Fixture strict bound',details:{allocationKind:'gpu'}}});await turn();assert.equal(f.workers[0].dead,true);const cpu=f.workers[1].jobs[0];assert.equal(cpu.provider,'wasm');assert.equal(cpu.memoryMaximumBytes,112*MiB);assert.equal(cpu.gpuMaximumBytes,0);f.workers[1].emit({executionReady:true});await turn();f.workers[1].emit({heapBytes:16*MiB,result:{y:{data:Float32Array.of(2),dims:[1],type:'float32'}}});const result=await job;assert.equal(result.metrics.wasmHeapBytes,16*MiB);assert.equal(result.metrics.retry.from,'webgpu');result.release();
 }finally{f.pool.dispose();if(old)Object.defineProperty(navigator,'gpu',old);else delete navigator.gpu;}
 assert.equal(f.budget.total(),0);assert.equal(f.scheduler.snapshot().running,0);
});

test('an explicit GPU refusal retains its cause and never silently executes a CPU graph',async()=>{
 const old=Object.getOwnPropertyDescriptor(navigator,'gpu');Object.defineProperty(navigator,'gpu',{value:{},configurable:true});const f=setup({bytes:1024,sha256:'a'.repeat(64),url:'https://example.invalid/never-fetched'});
 try{const job=f.pool.run('test',inputs,{...bounds,backend:'webgpu'});await turn();const rejected=assert.rejects(job,e=>e.code==='GPU_OUT_OF_MEMORY'&&e.details.maximumBytes===17);f.workers[0].emit({error:{code:'GPU_OUT_OF_MEMORY',message:'Fixture strict bound',details:{allocationKind:'gpu',maximumBytes:17}}});await rejected;assert.equal(f.workers.length,1);assert.equal(f.pool.cpuOnly,false);}finally{f.pool.dispose();if(old)Object.defineProperty(navigator,'gpu',old);else delete navigator.gpu;}
 assert.equal(f.budget.total(),0);assert.equal(f.scheduler.snapshot().running,0);
});
