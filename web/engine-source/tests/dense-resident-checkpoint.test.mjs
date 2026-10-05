import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {DenseImageEngine} from '../src/dense-image.js';
import {DenseFieldPool} from '../src/dense-pool.js';
import {denseDescriptorShape} from '../src/dense-math.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2;
for(const mode of ['null','messageerror'])test('resident '+mode+' releases CPU and preserves only validated hypotheses for explicit resume',async()=>{
 const budget=new Budget(512*MiB),calls=[0,0],workers=[];let fail=true;
 const engine=new DenseImageEngine({width:48,height:40,data:new Uint8Array(48*40*3)},budget,{maxWorkers:1,workerFactory(){const worker={terminate(){this.closed=true;},postMessage(job){calls[job.pass.method]++;queueMicrotask(()=>{if(this.closed)return;if(job.pass.method===1&&fail){mode==='null'?this.onmessage({data:null}):this.onmessageerror({});return;}const shape=denseDescriptorShape(job.width,job.height,job.pass.method,job.pass.patch),n=shape.width*shape.height;this.onmessage({data:{result:{width:shape.width,height:shape.height,targets:new Int32Array(n).fill(-1),distancesSquared:new Float32Array(n).fill(Infinity),allowed:new Uint8Array(n),selected:new Uint8Array(n),comparisons:0n}}});});}};workers.push(worker);return worker;}});let result;
 const params={profile:'PatchMatch Zernike + PatchMatch SIFT',patch:4,coherence:false};
 try{await assert.rejects(engine.analyze(params,{checkpointKey:'resident'}),{code:'WORKER_MESSAGE_FAILED'});assert.deepEqual(calls,[1,1]);assert(workers.every(w=>w.closed));assert(budget.total()>0,'Completed output lost its reservation');const scheduler=getExecutionScheduler(budget,{maxWorkers:1}),lease=await scheduler.acquire({cpu:1});lease.release();fail=false;result=await engine.analyze(params,{checkpointKey:'resident'});assert.deepEqual(calls,[1,2]);assert.equal(result.fields.length,2);engine.clearCheckpoint('resident');assert(budget.total()>0,'Delivered output lost its lease');}finally{await result?.release();engine.dispose();}assert.equal(budget.total(),0);
});

test('resident retainResult refusal returns the split reservation exactly once',async()=>{
 const budget=new Budget(128*MiB),field={targets:new Int32Array(100).fill(-1),distancesSquared:new Float32Array(100),allowed:new Uint8Array(100)},pool=new DenseFieldPool(budget,{maxWorkers:1,workerFactory:()=>({postMessage(job){queueMicrotask(()=>this.onmessage({data:{result:{...job.field,selected:new Uint8Array(100)}}}));},terminate(){}})});
 const result=await pool.run([{width:10,height:10,field,pass:{method:0,patch:4,targetPatch:4}}],{retainResult:()=>false});assert(budget.total()>0,'A declined handoff remains pool-owned until result release');result.release();pool.dispose();assert.equal(budget.total(),0);
});

for(const arrival of ['before-clear','after-clear'])test('clearing a resident checkpoint '+arrival+' cannot publish a late worker result',async()=>{
 const budget=new Budget(256*MiB);let worker,job,ready;const entered=new Promise(resolve=>ready=resolve),engine=new DenseImageEngine({width:48,height:40,data:new Uint8Array(48*40*3)},budget,{maxWorkers:1,workerFactory(){worker={terminate(){this.closed=true;},postMessage(value){job=value;ready();}};return worker;}});
 const run=engine.analyze({patch:4,coherence:false},{checkpointKey:'clearing'}),failed=assert.rejects(run,{code:'CANCELLED'});await entered;
 const shape=denseDescriptorShape(job.width,job.height,job.pass.method,job.pass.patch),n=shape.width*shape.height,reply=()=>worker.onmessage?.({data:{result:{width:shape.width,height:shape.height,targets:new Int32Array(n).fill(-1),distancesSquared:new Float32Array(n).fill(Infinity),allowed:new Uint8Array(n),selected:new Uint8Array(n),comparisons:0n}}});
 if(arrival==='before-clear')reply();engine.clearCheckpoint('clearing');if(arrival==='after-clear')reply();await failed;assert.equal(worker.closed,true);assert.equal(engine.partial,null);assert.equal(budget.total(),0);engine.dispose();
});

for(const mode of ['null','messageerror'])test('the real resident worker handler reports '+mode+' once and rejects subsequent commands',async()=>{
 const old=globalThis.self,messages=[],endpoint={postMessage(data){messages.push(data);}};globalThis.self=endpoint;
 try{await import('../src/dense-worker.js?protocol='+mode);if(mode==='null')endpoint.onmessage({data:null});else endpoint.onmessageerror({});assert.equal(messages.length,1);assert.equal(messages[0].error.code,'WORKER_MESSAGE_FAILED');endpoint.onmessage({data:{}});assert.equal(messages.length,1);}finally{globalThis.self=old;}
});
