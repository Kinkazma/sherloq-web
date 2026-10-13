import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {runParallelDenseField} from '../src/dense-field-parallel.js';
import {DenseGpuTransport} from '../src/dense-gpu-transport.js';
import {byteView} from '../src/memory-range.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const ranges=(count,dimensions)=>[count*dimensions,count*dimensions,count].map((length,index)=>new Uint8Array(Float32Array.from({length},(_,at)=>(at+index)/8).buffer));
function kernel({sequence=[[8,12],[3,12],[20,12],[2,16]],afterConsumed,returnFault=false,messageFault=false}={}){
 let worker;
 const factory=()=>worker={dead:false,requests:new Map(),terminate(){this.dead=true;},emit(message,transfer=[]){const data=structuredClone(message,{transfer});queueMicrotask(()=>{if(!this.dead)this.onmessage({data});});},postMessage(message,transfer=[]){if(returnFault&&message.gpuResult)throw new DOMException('GPU return failed','DataCloneError');const data=structuredClone(message,{transfer});queueMicrotask(async()=>{
  if(this.dead)return;
  if(data.stores){this.transport=new DenseGpuTransport({reuse:data.reuseGpuTransport,read:byteView,post:message=>this.emit(message),request:(kind,value,transfer=[])=>new Promise((resolve,reject)=>{this.requests.set(value.id,{resolve,reject});this.emit({[kind]:value},transfer);})});this.emit({ready:true});return;}
  if(data.gpuPrepared){const waiting=this.requests.get(data.gpuPrepared.id);this.requests.delete(data.gpuPrepared.id);data.gpuPrepared.error?waiting.reject(Object.assign(new Error(data.gpuPrepared.error.message),{code:data.gpuPrepared.error.code})):waiting.resolve(data.gpuPrepared.allowed);return;}
  if(data.gpuResult){const waiting=this.requests.get(data.gpuResult.id);this.requests.delete(data.gpuResult.id);waiting.resolve(data.gpuResult);return;}
  if(data.gpuDrop){this.emit({gpuDropped:{token:data.gpuDrop.token,retired:this.transport.drop(data.gpuDrop.id)}});return;}
  if(data.task){if(data.task[0]===0){this.transport.dispose();this.emit({finished:true,metrics:{gpuTransport:this.transport.snapshot()}});return;}try{if(!this.ran){this.ran=true;for(const [pairCount,dimensions] of sequence){await this.transport.batch({ranges:ranges(pairCount,dimensions),pairCount,dimensions,distanceDimensions:dimensions});this.transport.consumed();await turn();await afterConsumed?.(this);}}this.emit({done:{comparisons:0n},metrics:{heapBytes:64,gpuTransport:this.transport.snapshot()}});}catch(error){if(!this.dead)this.emit({error:{code:error.code??'GPU_FAILED',message:error.message}});}return;}
 });}};
 return {factory,get worker(){return worker;}};
}
function settings(budget,factory){const values=Array(23).fill(0);values[0]=8;values[1]=4;values[6]=1;values[12]=1;values[21]=32;return {values,stores:Array(19).fill(null),budget,kernelBytes:128,initialWorkers:1,maximum:1,cachePages:1,bootBytes:0,reuseGpuTransport:true,workerFactory:factory};}

test('coordinator reuses charged banks through real transfers and releases every claim at finish',{timeout:3000},async()=>{
 const budget=new Budget(8192),f=kernel(),counts=[];const result=await runParallelDenseField({...settings(budget,f.factory),distanceBatch:async job=>{counts.push([job.pairCount,job.dimensions]);assert.ok(budget.total()>=job.pairCount*(job.dimensions*8+8));return new Float32Array(job.pairCount).fill(NaN);}});
 assert.deepEqual(counts,[[8,12],[3,12],[20,12],[2,16]]);assert.equal(result.kernels[0].gpuTransport.bufferAllocations,6);assert.equal(result.kernels[0].gpuTransport.reusedBuffers,6);assert.equal(result.kernels[0].gpuTransport.retainedBytes,0);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);assert.ok(f.worker.dead);
});

test('another owner obtains room only after idle bank retirement acknowledgement',{timeout:3000},async()=>{
 const budget=new Budget(8192);let evictions=0,pressureDone=false;
 const f=kernel({sequence:[[8,12],[3,12]],afterConsumed:async worker=>{if(pressureDone)return;pressureDone=true;const held=budget.total(),occupy=budget.reserve(budget.limit-held);try{const retired=await budget.reclaim(64,{owner:'unrelated-function'});assert.equal(retired,held);assert.equal(worker.transport.snapshot().retainedBytes,0);assert.equal(worker.transport.cache,null);const other=budget.reserve(64);other();evictions++;}finally{occupy();}}});
 const result=await runParallelDenseField({...settings(budget,f.factory),distanceBatch:job=>new Float32Array(job.pairCount).fill(NaN)});assert.equal(evictions,1);assert.equal(result.kernels[0].gpuTransport.evictions,1);assert.equal(result.kernels[0].gpuTransport.bufferAllocations,6);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});

test('pressure cannot reclaim buffers while the GPU still owns their active views',{timeout:3000},async()=>{
 const budget=new Budget(8192),f=kernel({sequence:[[8,12]]});let observed=false;
 await runParallelDenseField({...settings(budget,f.factory),distanceBatch:async job=>{const active=budget.total(),occupy=budget.reserve(budget.limit-active);try{assert.equal(await budget.reclaim(64,{owner:'unrelated-function'}),0);assert.equal(budget.total(),budget.limit);assert.equal(job.queryDescriptors.length,96);observed=true;}finally{occupy();}return new Float32Array(job.pairCount).fill(NaN);}});assert.ok(observed);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});

test('return transfer failure terminates the worker and retires its active reservation',{timeout:3000},async()=>{
 const budget=new Budget(8192),f=kernel({sequence:[[8,12]],returnFault:true});await assert.rejects(runParallelDenseField({...settings(budget,f.factory),distanceBatch:job=>new Float32Array(job.pairCount).fill(NaN)}),{name:'DataCloneError'});assert.ok(f.worker.dead);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});

for(const mode of ['cancel','messageerror'])test(mode+' drains active GPU use before releasing transport memory',{timeout:3000},async()=>{
 const budget=new Budget(8192),f=kernel({sequence:[[8,12]]}),controller=new AbortController();let entered,unblock,settled=false;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
 const pending=runParallelDenseField({...settings(budget,f.factory),signal:controller.signal,distanceBatch:async job=>{entered();await gate;return new Float32Array(job.pairCount).fill(NaN);}});pending.then(()=>{settled=true;},()=>{settled=true;});await ready;
 if(mode==='cancel')controller.abort();else f.worker.onmessageerror({});await turn();assert.equal(settled,false);assert.ok(budget.total()>0);unblock();await assert.rejects(pending,{code:mode==='cancel'?'CANCELLED':'WORKER_MESSAGE_FAILED'});assert.ok(f.worker.dead);assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});
