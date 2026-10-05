import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {runParallelDenseField} from '../src/dense-field-parallel.js';
import {runPagedDenseField} from '../src/dense-paged.js';

function kernels(){
 const workers=[];
 return {workers,workerFactory(){const worker={terminated:false,postMessage(message){queueMicrotask(()=>{
  if(this.terminated)return;
  if(message.stores){this.onmessage({data:{progress:{completed:0}}});this.onmessage({data:{ready:true}});}
  else if(message.task[0]===0)this.onmessage({data:{finished:true,metrics:{heapBytes:60}}});
  else this.onmessage({data:{done:{comparisons:0n},metrics:{heapBytes:60}}});
 });},terminate(){this.terminated=true;}};workers.push(worker);return worker;}};
}
function options(budget,workerFactory){const values=Array(23).fill(0);values[0]=8;values[1]=4;values[6]=1;values[12]=1;values[21]=32;return {values,stores:Array(19).fill(null),budget,kernelBytes:60,initialWorkers:1,maximum:4,cachePages:1,bootBytes:10,workerFactory};}
function failKernel(factory,index,{duringTask=false}={}){const create=factory.workerFactory;factory.workerFactory=()=>{const worker=create(),number=factory.workers.length,post=worker.postMessage.bind(worker);if(number===index)worker.postMessage=message=>{if((!duringTask&&message.stores)||(duringTask&&message.task?.[0]))queueMicrotask(()=>worker.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Injected kernel allocation failure',details:{requestedBytes:60,currentBytes:0},cause:{name:'RangeError',message:'Injected allocation'}}}}));else post(message);};return worker;};return factory;}

test('partial free memory adds every fitting kernel and accounts for retained idle heaps',async()=>{
 const budget=new Budget(170),release=budget.reserve(70),factory=kernels(),requests=[];
 try{
  const result=await runParallelDenseField({...options(budget,factory.workerFactory),acquireCpu:async request=>{requests.push(request);return {cpu:request.maximum,release(){}};}});
  assert.equal(result.workers,2);assert.equal(result.peakActiveKernels,2);assert.equal(result.reservedWorkspaceBytes,130);
  assert.ok(requests.some(request=>request.maximum===4&&request.requiredBudgetBytes===250&&request.kernelBytes===60));
  assert.ok(requests.some(request=>request.maximum===1&&request.requiredBudgetBytes===130));
  assert.equal(budget.total(),70);assert.ok(factory.workers.every(worker=>worker.terminated));
 }finally{release();}assert.equal(budget.total(),0);
});

test('a bootstrap progress exception rejects the field and terminates its kernel',async()=>{
 const budget=new Budget(170),release=budget.reserve(70),factory=kernels(),error=Error('User progress failed');
 try{await assert.rejects(runParallelDenseField({...options(budget,factory.workerFactory),onProgress(){throw error;}}),value=>value===error);assert.equal(factory.workers.length,1);assert.ok(factory.workers[0].terminated);assert.equal(budget.total(),70);}finally{release();}assert.equal(budget.total(),0);
});

test('a refused extra kernel preserves the ready field without repeated allocation attempts',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=failKernel(kernels(),2);let recoveries=0;
 try{const result=await runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{recoveries++;return {releasedBytes:0};}});assert.equal(result.workers,1);assert.equal(result.tasks>0,true);assert.equal(result.lastAllocationFailure.cause.name,'RangeError');assert.equal(factory.workers.length,2);assert.equal(recoveries,1);assert.ok(factory.workers.every(w=>w.terminated));assert.equal(budget.total(),70);}finally{release();}assert.equal(budget.total(),0);
});

test('real recovered memory permits full width again without changing the budget limit',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=failKernel(kernels(),2);let recovered=0;
 try{const result=await runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>({releasedBytes:++recovered===1?60:0})});assert.equal(result.workers,4);assert.equal(result.allocationRecoveries,1);assert.equal(result.peakActiveKernels,4);assert.equal(budget.limit,250);assert.equal(factory.workers.length,5);assert.ok(factory.workers.every(w=>w.terminated));}finally{release();}assert.equal(budget.total(),0);
});

test('a later release reopens a previously refused expansion',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=failKernel(kernels(),2);let grants=0;
 try{const settings=options(budget,factory.workerFactory);settings.values[6]=2;const result=await runParallelDenseField({...settings,recoverMemory:async()=>({releasedBytes:0}),acquireCpu:async({maximum})=>({cpu:maximum,memoryAvailableBytes:++grants>3?60:0,release(){}})});assert.equal(result.workers,4);assert.equal(result.peakActiveKernels,4);assert.equal(factory.workers.length,5);assert.equal(budget.limit,250);}finally{release();}assert.equal(budget.total(),0);
});

test('a failed bootstrap retries locally only after concrete memory recovery',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=failKernel(kernels(),1);let recoveries=0;
 try{const result=await runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{recoveries++;return {releasedBytes:60};}});assert.equal(result.workers,4);assert.equal(recoveries,1);assert.equal(factory.workers.length,5);}finally{release();}assert.equal(budget.total(),0);
});

function refuseCreations({bootstrap=false}={}){
 const factory=kernels(),create=factory.workerFactory;
 factory.workerFactory=()=>{const worker=create(),number=factory.workers.length,post=worker.postMessage.bind(worker);worker.postMessage=message=>{if(message.stores&&(bootstrap||number>1))queueMicrotask(()=>worker.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Repeated kernel allocation refusal',details:{allocationKind:'wasm',requestedBytes:60},cause:{name:'RangeError',message:'Original heap refusal'}}}}));else post(message);};return worker;};return factory;
}
test('repeated bootstrap refusals stop after five comparable failures even if reclaim reports bytes',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=refuseCreations({bootstrap:true});let reclaims=0;
 try{await assert.rejects(runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{reclaims++;return {releasedBytes:1};}}),error=>error.details.recovery?.loopDetected&&error.cause.message==='Original heap refusal');assert.equal(factory.workers.length,5);assert.equal(reclaims,4);assert.ok(factory.workers.every(worker=>worker.terminated));assert.equal(budget.total(),70);}finally{release();}
});
test('repeated optional kernel refusals keep the healthy field progressing and return unused CPU',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=refuseCreations();let reclaims=0,returnedCpu=0;
 try{const result=await runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{reclaims++;return {releasedBytes:1};},acquireCpu:async({maximum})=>({cpu:maximum,releaseCpu(count){returnedCpu+=count;},release(){}})});assert.equal(factory.workers.length,6);assert.equal(reclaims,4);assert.ok(result.committedTasks>0);assert.equal(result.lastAllocationFailure.details.recovery.loopDetected,true);assert.ok(returnedCpu>0);assert.ok(factory.workers.every(worker=>worker.terminated));assert.equal(budget.total(),70);}finally{release();}
});

test('allocation failures during a useful task remain fatal and retain their evidence',async()=>{
 const budget=new Budget(250),release=budget.reserve(70),factory=failKernel(kernels(),1,{duringTask:true});let recoveries=0;
 try{await assert.rejects(runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{recoveries++;return {releasedBytes:60};}}),error=>error.code==='MEMORY_ALLOCATION'&&error.details.requestedBytes===60&&error.cause.name==='RangeError');assert.equal(recoveries,0);assert.ok(factory.workers.every(w=>w.terminated));}finally{release();}assert.equal(budget.total(),0);
});

test('returning uncreated reservations does not itself retry a refused allocation',async()=>{
 const budget=new Budget(250),release=budget.reserve(250),factory=failKernel(kernels(),2);let returned=0;
 try{const settings=options(budget,factory.workerFactory);settings.initialWorkers=4;settings.values[6]=3;const result=await runParallelDenseField({...settings,releaseInitialWorkspace:bytes=>release.split(bytes)(),releaseWorkspace:async bytes=>{budget.limit-=bytes;returned+=bytes;},recoverMemory:async()=>({releasedBytes:0}),acquireCpu:async({maximum})=>({cpu:maximum,memoryAvailableBytes:returned,release(){}})});assert.equal(result.workers,1);assert.equal(factory.workers.length,2);assert.equal(returned,180);assert.equal(budget.total(),70);assert.equal(result.reservedWorkspaceBytes,70);}finally{release();}assert.equal(budget.total(),0);
});

test('dense output migration windows fit before a kernel fills the remaining workspace',async()=>{
 const budget=new Budget(40*1024**2),factory=kernels(),width=128,height=96,n=width*height;
 const source=byteLength=>({byteLength,readInto(bytes){bytes.fill(1);return bytes;}}),first=source(n*48),mask=source(n);
 const result=await runPagedDenseField({first,mask,width,height},{budget,storage:'memory',getTemporarySession:async()=>{throw Error('Memory outputs need no storage session');},iterations:1,fieldWorkerFactory:factory.workerFactory,acquireCpu:async()=>({cpu:1,release(){}})});
 try{assert.ok(budget.peak<=budget.limit);assert.equal(budget.total(),n*8+n*8);assert.ok(factory.workers.every(worker=>worker.terminated));}finally{await result.dispose();}assert.equal(budget.total(),0);
});

function transactionalKernels({permanent=false}={}){
 const workers=[],failed=new Set();
 return {workers,failed,workerFactory(){const worker={terminated:false,postMessage(message){queueMicrotask(()=>{if(this.terminated)return;if(message.stores){this.onmessage({data:{ready:true,transactional:true,boot:{pools:[]}}});return;}const [phase,, ,iteration]=message.task;if(!phase){this.onmessage({data:{finished:true,metrics:{heapBytes:60}}});return;}
 const key=phase+':'+iteration;if(permanent||!failed.has(key)){failed.add(key);this.onmessage({data:{error:{code:'MEMORY_ALLOCATION',message:'Injected private command refusal',details:{allocationKind:'array-buffer',requestedBytes:1},cause:{name:'RangeError',message:'Original allocator'}}}});}else this.onmessage({data:{done:{comparisons:0n,writes:{buffer:new ArrayBuffer(0),records:[],bytes:0}},metrics:{heapBytes:60}}});});},terminate(){this.terminated=true;}};workers.push(worker);return worker;}};
}
test('more than five independent incidents retain command progress and recover without a lifetime ceiling',async()=>{
 const budget=new Budget(300),release=budget.reserve(70),factory=transactionalKernels(),settings=options(budget,factory.workerFactory);settings.values[6]=3;
 try{const result=await runParallelDenseField({...settings,recoverMemory:async()=>({releasedBytes:1})});assert.equal(factory.failed.size,10);assert.equal(result.commandRecoveries,10);assert.ok(result.committedTasks>0);assert.ok(result.peakActiveKernels>1);assert.ok(factory.workers.every(w=>w.terminated));assert.equal(budget.total(),70);}finally{release();}
});
test('five comparable uncommitted failures stop with their original cause and no leaked workers',async()=>{
 const budget=new Budget(300),release=budget.reserve(70),factory=transactionalKernels({permanent:true});let retries=0;
 try{await assert.rejects(runParallelDenseField({...options(budget,factory.workerFactory),recoverMemory:async()=>{retries++;return {releasedBytes:1};}}),error=>error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5&&error.cause.message==='Original allocator');assert.equal(retries,4);assert.ok(factory.workers.every(w=>w.terminated));assert.equal(budget.total(),70);}finally{release();}
});
