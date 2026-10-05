import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2;
test('a field receives a partial memory grant and yields only its GPU coordinator CPU',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(320*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});let result,initial,expanded,gpuSnapshot,stagingBefore;
 const pool=new DensePagedFieldPool(budget,{maxWorkers:4,workerFactory(){return {postMessage(message){
  const emit=data=>queueMicrotask(()=>this.onmessage({data}));
  if(message.input){initial=message.options.workspaceBytes;emit({gpuRequest:{id:1,action:'reserve'}});}
  else if(message.gpuGrant?.id===1){assert.equal(message.gpuGrant.bytes,25*MiB);stagingBefore=budget.total();emit({gpuRequest:{id:5,action:'staging-reserve',bytes:4*MiB}});}
  else if(message.gpuGrant?.id===5){assert.equal(message.gpuGrant.bytes,4*MiB);assert.equal(message.gpuGrant.token,5);assert.equal(budget.total(),stagingBefore+4*MiB);emit({cpuRequest:{id:1,maximum:4,workspaceBytes:384*MiB+48,kernelBytes:96*MiB}});}
  else if(message.cpuGrant){expanded=message.cpuGrant.workspaceBytes;assert.equal(message.cpuGrant.cpu,3);assert.ok(expanded>initial&&expanded<384*MiB);emit({gpuRequest:{id:2,action:'acquire'}});}
  else if(message.gpuGrant?.id===2){gpuSnapshot=scheduler.snapshot();assert.deepEqual(gpuSnapshot.active,{cpu:2,gpu:1});emit({gpuRequest:{id:3,action:'release'}});}
  else if(message.gpuGrant?.id===3){assert.deepEqual(scheduler.snapshot().active,{cpu:3,gpu:0});stagingBefore=budget.total();emit({gpuRequest:{id:6,action:'staging-free',token:5}});}
  else if(message.gpuGrant?.id===6){assert.equal(budget.total(),stagingBefore-4*MiB);emit({gpuRequest:{id:4,action:'free'}});}
  else if(message.gpuGrant?.id===4){emit({cpuRelease:1});const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});}
 },terminate(){}};}});
 try{result=await pool.start({first,mask,width:10,height:10,dimensions:12},{storage:'memory'});assert.ok(gpuSnapshot);assert.deepEqual(scheduler.snapshot().active,{cpu:0,gpu:0});await result.dispose();result=null;assert.equal(budget.total(),first.byteLength+mask.byteLength);}finally{await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('unused kernel workspace is returned and a later useful grant can grow it again',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;const budget=new Budget(320*MiB),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});let result,beforeReturn,expanded,returned=false,reexpanded=false;
 const pool=new DensePagedFieldPool(budget,{maxWorkers:4,workerFactory(){return {postMessage(message){
  const emit=data=>queueMicrotask(()=>this.onmessage({data}));
  if(message.input)emit({cpuRequest:{id:1,maximum:4,workspaceBytes:256*MiB+48,kernelBytes:64*MiB}});
  else if(message.cpuGrant?.id===1){expanded=message.cpuGrant.workspaceBytes;beforeReturn=budget.total();emit({memoryRequest:{id:1,action:'release-unused',bytes:128*MiB}});}
  else if(message.memoryGrant){assert.equal(budget.total(),beforeReturn-128*MiB);returned=true;emit({cpuRelease:1});emit({cpuRequest:{id:2,maximum:2,workspaceBytes:128*MiB+48,kernelBytes:64*MiB}});}
  else if(message.cpuGrant?.id===2){assert.equal(message.cpuGrant.workspaceBytes,expanded-128*MiB);assert.equal(message.cpuGrant.cpu,2);emit({cpuRelease:2});emit({cpuRequest:{id:3,maximum:4,workspaceBytes:256*MiB+48,kernelBytes:64*MiB}});}
  else if(message.cpuGrant?.id===3){assert.equal(message.cpuGrant.workspaceBytes,expanded);assert.equal(message.cpuGrant.cpu,4);reexpanded=true;emit({cpuRelease:3});const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});}
 },terminate(){}};}});
 try{result=await pool.start({first,mask,width:10,height:10,dimensions:12},{storage:'memory'});assert.ok(returned&&reexpanded);assert.equal(budget.total(),first.byteLength+mask.byteLength+1600);await result.dispose();result=null;}finally{await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('memory RPC hides blocked field activity without surrendering its CPU quota',{timeout:3000},async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(320*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:4}),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});
 let result,entered,unblock;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
 const reclaim=budget.reclaim.bind(budget);budget.reclaim=async(...args)=>{entered();await gate;return reclaim(...args);};
 const pool=new DensePagedFieldPool(budget,{maxWorkers:4,workerFactory(){return {postMessage(message){
  const emit=data=>queueMicrotask(()=>this.onmessage({data}));
  if(message.input){assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,1);assert.equal(budget.resourceProgressSnapshot('patchmatch','array-buffer').independentProducers,0);emit({memoryRequest:{id:1,bytes:MiB}});}
  else if(message.memoryGrant){setTimeout(()=>{assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,1);const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});},0);}
 },terminate(){}};}});
 let pending;
 try{
  pending=pool.start({first,mask,width:10,height:10,dimensions:12},{storage:'memory'});await started;
  assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);
  assert.deepEqual(scheduler.snapshot().active,{cpu:1,gpu:0});
  const opportunity=await budget.waitForResourceOpportunity({owner:'d2prl',kind:'array-buffer',bytes:MiB});assert.equal(opportunity.reason,'no-independent-producer');
  unblock();result=await pending;assert.equal(budget.resourceProgressSnapshot('d2prl','array-buffer').independentProducers,0);await result.dispose();result=null;
 }finally{unblock();await pending?.catch(()=>{});await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}
 assert.equal(budget.total(),0);
});

test('field allocation RPC preserves backing domain and failed extent through parent reclamation',async()=>{
 const {EngineError,serializeEngineError}=await import('../src/errors.js'),previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(320*MiB),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true}),requests=[];let result;
 budget.reclaimAllocation=async(bytes,options)=>{requests.push({bytes,kind:options.kind,owner:options.owner});return bytes;};
 const error=serializeEngineError(new EngineError('MEMORY_ALLOCATION','Native child refused output',{cause:new RangeError('Array buffer allocation failed'),details:{allocationKind:'array-buffer',requestedBytes:7*MiB,label:'field-output'}}));
 const pool=new DensePagedFieldPool(budget,{maxWorkers:2,workerFactory:()=>({postMessage(message){const emit=data=>queueMicrotask(()=>this.onmessage({data}));if(message.input)emit({memoryRequest:{id:1,bytes:7*MiB,error}});else if(message.memoryGrant){assert.equal(message.memoryGrant.releasedBytes,7*MiB);const descriptor=()=>({kind:'shared',byteLength:400,chunkBytes:400,segments:[[0,new SharedArrayBuffer(400)]]});emit({result:{width:10,height:10,comparisons:0n,metrics:{},ownsAllowed:false,stores:{targets:descriptor(),distancesSquared:descriptor()}}});}},terminate(){}})});
 try{result=await pool.start({first,mask,width:10,height:10,dimensions:12},{storage:'memory'});assert.deepEqual(requests,[{bytes:7*MiB,kind:'array-buffer',owner:'patchmatch'}]);}finally{await result?.dispose();await first.dispose();await mask.dispose();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});
