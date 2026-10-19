import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralGraphPool as FundedPool} from '../src/neural-graph-pool.js';
import {Budget} from '../src/cache.js';
const MiB=1024**2,asset={url:'https://example.invalid/query',sha256:'a'.repeat(64),bytes:1024},runtime={factoryUrl:'runtime',ortUrl:'ort',wasmUrl:'wasm'},x={data:new Float32Array(16),dims:[1,2,1,8]},batch={input:'x',output:'result',counts:[3,3,2]};
async function scenario(Pool,{backend='webgpu',queryBatch=batch,abort=false,error=false,autoFallback=false}={}){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.navigator,'gpu');Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});const budget=new Budget(256*MiB),captures=[],controller=new AbortController(),workers=[],providers=[];
 class Worker {
  postMessage(data) {
   if(data.command==='execute') {
    captures.push({active:budget.active,gpuMaximumBytes:this.job.gpuMaximumBytes,provider:this.job.provider});
    if(abort){controller.abort();return;}
    queueMicrotask(()=>{
     if(this.dead)return;
     if((error||autoFallback)&&this.job.provider==='webgpu')this.onmessage({data:{error:{code:'GPU_OUT_OF_MEMORY',message:'Injected refusal'}}});
     else this.onmessage({data:{heapBytes:16*MiB,gpuBytes:0,logicalExecutions:this.job.queryBatch?.counts.length,result:{result:this.job.inputs.x}}});
    });
    return;
   }
   this.job=data;
   queueMicrotask(()=>{if(!this.dead)this.onmessage({data:{executionReady:true}});});
  }
  terminate(){this.dead=true;}
 }
 const pool=new Pool(budget,{maxWorkers:2},{resourceOwner:'rita',assets:{query:asset},runtimes:{wasm:runtime,webgpu:runtime},workerFactory:()=>{const worker=new Worker();workers.push(worker);return worker;}});
 try{
  for(let i=0;i<(abort||error||autoFallback?1:2);i++){
   const operation=pool.run('query',{x},{backend,signal:controller.signal,workspaceBytes:1024,outputBytes:x.data.byteLength,...(queryBatch?{queryBatch}:{})});
   if(abort||error)await assert.rejects(operation,{code:abort?'CANCELLED':'GPU_OUT_OF_MEMORY'});
   else{const result=await operation;providers.push(result.metrics.provider);result.release();}
  }
  // These assertions deliberately precede dispose(): teardown must not hide
  // an active admission or leave the cancelled/refused worker alive.
  assert.equal(budget.active,0);
  if(abort||error){assert.equal(budget.total(),0);assert.equal(pool.slots.length,0);assert(workers.every(worker=>worker.dead));}
  return{captures,workers:workers.length,deadBeforeDispose:workers.map(worker=>!!worker.dead),remainingBeforeDispose:budget.total(),providers};
 }
 finally{pool.dispose();assert.equal(budget.total(),0);if(descriptor)Object.defineProperty(globalThis.navigator,'gpu',descriptor);else delete globalThis.navigator.gpu;}
}
test('GPU assembly and readback receive an explicit two-output admission on cold and reused jobs',async()=>{const result=await scenario(FundedPool);assert.equal(result.workers,1);const bytes=x.data.byteLength,scratchBytes=2*x.dims[1]*Math.max(...batch.counts)*4;for(const capture of result.captures){assert.equal(capture.active,bytes+2*bytes+scratchBytes+2*bytes);assert(capture.gpuMaximumBytes>=capture.active);}});
test('CPU replay and ordinary GPU jobs do not acquire the assembly allowance',async()=>{const bytes=x.data.byteLength,scratchBytes=2*x.dims[1]*Math.max(...batch.counts)*4;for(const [options,expected]of [[{backend:'cpu'},bytes+2*bytes+scratchBytes],[{queryBatch:null},bytes+2*bytes]]){const result=await scenario(FundedPool,options);assert(result.captures.every(capture=>capture.active===expected));}});
test('abort releases the full assembly admission and retires the relevant worker',async()=>{await scenario(FundedPool,{abort:true});});
test('a GPU allocation failure releases the full assembly admission',async()=>{await scenario(FundedPool,{error:true});});
test('automatic GPU allocation fallback recomputes the CPU job allowance and retires the failed worker before dispose',async()=>{
 const result=await scenario(FundedPool,{backend:'auto',autoFallback:true}),bytes=x.data.byteLength,scratchBytes=2*x.dims[1]*Math.max(...batch.counts)*4;
 assert.deepEqual(result.captures.map(capture=>capture.provider),['webgpu','wasm']);
 assert.deepEqual(result.captures.map(capture=>capture.active),[bytes+2*bytes+scratchBytes+2*bytes,bytes+2*bytes+scratchBytes]);
 assert.equal(result.captures[1].gpuMaximumBytes,0);
 assert.deepEqual(result.providers,['wasm']);
 assert.deepEqual(result.deadBeforeDispose,[true,false]);
 assert(result.remainingBeforeDispose>0,'the successful idle CPU worker remains explicitly funded until dispose');
});
