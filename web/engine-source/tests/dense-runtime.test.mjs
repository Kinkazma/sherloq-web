import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {denseImageParams,denseImageJobs} from '../src/dense-image.js';
import {planDenseResidentJobs,denseResidentWorkerBytes,DenseFieldPool} from '../src/dense-pool.js';
import {planDensePreparation,planDenseOutputStorage} from '../src/dense-preparation-plan.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportSharedDenseInput,readSharedDenseInput} from '../src/dense-shared-field.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {storeColdDenseField} from '../src/dense-cold-field.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2;

test('surface admission includes all retained fields, source materialization and the real Wasm ceiling',()=>{
 const make=(width,height)=>denseImageJobs({width,height,surface:{descriptor:{format:'rgb8'}}},denseImageParams({profile:'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror'})).jobs;
 const small=planDenseResidentJobs(make(96,80),512*MiB,{sourceBytes:96*80*3,readScratchBytes:96*3});assert.equal(small.fits,true);assert.ok(small.peakBytes>small.workerBytes);assert.ok(small.outputBytes>96*80*8);
 const tight=planDenseResidentJobs(make(96,80),32*MiB,{sourceBytes:96*80*3});assert.equal(tight.fits,false);
 const huge=planDenseResidentJobs(make(12000,8000),64*1024**3,{sourceBytes:12000*8000*3});assert.equal(huge.fits,false);assert.equal(huge.peakBytes,null);assert.match(huge.reason,/WASM|resident/);
});
test('persistent worker admission retains the largest Wasm heap across unlike following jobs',()=>{
 assert.equal(denseResidentWorkerBytes([{workspace:110,wasmHeapBytes:100},{workspace:100,wasmHeapBytes:20}]),180);
});
test('disposing a resident pool cancels queued CPU admission and never creates a late worker',async()=>{
 const budget=new Budget(128*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),hold=await scheduler.acquire({cpu:1});let created=0;
 const pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory(){created++;throw Error('A disposed pool created a worker');}});
 const field={targets:new Int32Array(100),distancesSquared:new Float32Array(100),allowed:new Uint8Array(100)};
 const run=pool.run([{width:10,height:10,field,pass:{method:0,patch:8,targetPatch:8}}]);await Promise.resolve();assert.ok(budget.active>0);pool.dispose();await assert.rejects(run,{code:'CANCELLED'});assert.equal(budget.total(),0);hold.release();await Promise.resolve();assert.equal(created,0);assert.equal(pool.busy,false);await assert.rejects(pool.run([{width:10,height:10,field,pass:{method:0,patch:8,targetPatch:8}}]),/disposed/);
});
test('a persistent resident worker yields its CPU lease to a queued GPU task between hypotheses',async()=>{
 const budget=new Budget(128*MiB),scheduler=getExecutionScheduler(budget,{maxWorkers:1}),events=[];let created=0,terminated=0,other;
 const pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory(){created++;return {postMessage(job){events.push('dense:'+job.index);if(job.index===0)other=scheduler.acquire({cpu:1,gpu:1,label:'another-engine'}).then(lease=>{events.push('gpu');lease.release();});queueMicrotask(()=>this.onmessage({data:{result:{...job.field,selected:new Uint8Array(100)}}}));},terminate(){terminated++;}};}});
 const field={targets:new Int32Array(100),distancesSquared:new Float32Array(100),allowed:new Uint8Array(100)},job={width:10,height:10,field,pass:{method:0,patch:8,targetPatch:8}};
 const result=await pool.run([{...job,index:0},{...job,index:1}]);await other;assert.deepEqual(events,['dense:0','gpu','dense:1']);assert.equal(created,1);assert.equal(terminated,1);assert.equal(result.results.length,2);result.release();pool.dispose();assert.equal(budget.total(),0);
});
test('preparation keeps a fitting hot representation instead of spending its RAM on extra workers',()=>{
 const plan=planDensePreparation({availableBytes:512*MiB,dataBytes:400*MiB,workspaceBytes:40*MiB,ioBytes:8*MiB,total:100,maxWorkers:16});assert.equal(plan.storage,'memory');assert.equal(plan.workers,2);assert.equal(plan.resident,true);
 const external=planDensePreparation({availableBytes:512*MiB,dataBytes:800*MiB,workspaceBytes:40*MiB,ioBytes:8*MiB,total:100,maxWorkers:16});assert.equal(external.resident,false);assert.ok(external.workers>1);
 assert.throws(()=>planDensePreparation({availableBytes:512*MiB,dataBytes:800*MiB,workspaceBytes:40*MiB,ioBytes:8*MiB,total:100,maxWorkers:16,storage:'memory'}),{code:'MEMORY_LIMIT'});
});
test('cold result admission accounts for filtered fields and global coherence scratch',()=>{
 const jobs=denseImageJobs({width:1024,height:768},denseImageParams({profile:'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror'})).jobs;
 const ample=planDenseOutputStorage(jobs,{availableBytes:512*MiB});assert.equal(ample.storage,'auto');assert.ok(ample.filteredBytes>0);assert.ok(ample.scratchBytes>80*MiB);
 const tight=planDenseOutputStorage(jobs,{availableBytes:ample.rawBytes+80*MiB});assert.equal(tight.storage,'temporary');
});
test('worker transport pins and aliases immutable shared inputs without duplicating descriptor banks',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
 const budget=new Budget(64*MiB),first=await createSegmentedBytes(48*100,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});
 try{await first.write(new Uint8Array(first.byteLength).fill(7));await mask.write(new Uint8Array(100).fill(1));const pin=exportSharedDenseInput({first,second:first,mask,width:10,height:10,dimensions:12});assert.ok(pin);assert.equal(pin.value.stores.length,2);assert.throws(()=>first.write(new Uint8Array(1)),{code:'BUSY'});const input=readSharedDenseInput(structuredClone(pin.value)),actual=new Uint8Array(13);input.first.readInto(actual,5);assert.deepEqual(actual,new Uint8Array(13).fill(7));pin.release();first.write(new Uint8Array([9]));}
 finally{await first.dispose();await mask.dispose();if(previous)Object.defineProperty(globalThis,'crossOriginIsolated',previous);else delete globalThis.crossOriginIsolated;assert.equal(budget.total(),0);}
});
test('failed field worker startup releases reservations and all shared input pins',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
 const budget=new Budget(128*MiB),first=await createSegmentedBytes(4800,{budget,shared:true}),mask=await createSegmentedBytes(100,{budget,shared:true});
 try{const before=budget.total(),pool=new DensePagedFieldPool(budget,{maxWorkers:2,workerFactory(){throw Error('startup refused');}});await assert.rejects(pool.start({first,mask,width:10,height:10,dimensions:12}),/startup refused/);assert.equal(pool.active.size,0);assert.equal(budget.total(),before);first.write(new Uint8Array([1]));mask.write(new Uint8Array([1]));}
 finally{await first.dispose();await mask.dispose();if(previous)Object.defineProperty(globalThis,'crossOriginIsolated',previous);else delete globalThis.crossOriginIsolated;assert.equal(budget.total(),0);}
});
test('completed worker fields move to cold storage without discarding or recounting borrowed inputs',async()=>{
 const budget=new Budget(16*MiB),source=new Uint8Array([1,2,3,4,5,6,7,8]),source2=new Uint8Array([11,12,13,14,15,16,17,18]),release=budget.reserve(16);let ownerReleased=false,temporary=0;
 const reader=array=>({byteLength:array.length,storage:'memory',readInto(out,offset=0){out.set(array.subarray(offset,offset+out.length));}});
 const field={targets:reader(source),distancesSquared:reader(source2),allowed:reader(new Uint8Array([1,1])),ownsAllowed:false,async dispose(){ownerReleased=true;release();}};
 const temporarySession={async create(length){temporary++;const bytes=new Uint8Array(length);return {readInto(out,offset=0){out.set(bytes.subarray(offset,offset+out.length));},write(input,offset=0){bytes.set(input,offset);},flush(){},dispose(){temporary--;}};}};
 const cold=await storeColdDenseField(field,{budget,storage:'temporary',temporarySession});assert.equal(ownerReleased,true);assert.equal(cold.allowed,field.allowed);assert.equal(cold.targets.storage,'temporary');assert.equal(budget.total(),0);const out=new Uint8Array(8);await cold.targets.readInto(out);assert.deepEqual(out,source);await cold.distancesSquared.readInto(out);assert.deepEqual(out,source2);await cold.dispose();assert.equal(temporary,0);
});
