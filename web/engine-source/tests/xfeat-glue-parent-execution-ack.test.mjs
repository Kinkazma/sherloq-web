import test from 'node:test';
import assert from 'node:assert/strict';
import {XfeatGlobalGlueEngine as SparseGlueEngine} from '../src/xfeat-glue-global.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(release){
 globalThis.Worker=class{constructor(){queueMicrotask(()=>this.onmessage({data:{glueReady:true}}));}postMessage(data){queueMicrotask(()=>{if(data.glueJob)this.onmessage({data:{glueComplete:{id:data.glueJob.id,cleanupAck:true,result:{metadata:{},confidence:Float32Array.of(.5)}}}});else if(data.closeGlue)this.onmessage({data:{glueClosed:{...data.closeGlue,cleanupAck:true,retirement:{unacknowledgedDevices:0}}}});});}terminate(){}};
 const budget=new Budget(32*1024**2),ordinary=budget.beginOperation.bind(budget);
 budget.beginOperation=(...args)=>{const operation=ordinary(...args);return Object.create(operation,{release:{value:()=>release(operation)}});};
 const engine=new SparseGlueEngine(budget,{maxWorkers:1}),scheduler=getExecutionScheduler(budget,{maxWorkers:1});
 return{engine,budget,scheduler,run(signal){return engine.ownedJob({provider:'webgpu',maximumHeapBytes:1024,threads:1},{threads:1,freeWorker:engine.context?undefined:budget.reserve(1024),workerBytes:1024,signal});}};
}
test('Actual dual parent waits for a deferred operation release before returning result',async()=>{
 const gate=deferred(),entered=deferred();let settled=false;
 const f=fixture(async operation=>{entered.resolve();await gate.promise;operation.release();});
 const task=f.run().finally(()=>settled=true);await entered.promise;await new Promise(r=>setImmediate(r));
 try{assert.equal(settled,false,'A physical child ACK must not hide the still-pending parent execution release');assert.equal(f.engine.pendingOwners.size,1);}
 finally{gate.resolve();await task;await f.engine.dispose();}
 assert.equal(f.budget.total(),0);assert.equal(f.scheduler.used.gpu,0);
});
test('Actual dual parent preserves refused asynchronous operation ACK as a retryable debt',async()=>{
 const primary=Object.freeze({executionAck:true});let refused=true;
 const f=fixture(async operation=>{if(refused)throw primary;operation.release();});
 try{await assert.rejects(f.run(),error=>error===primary);assert.equal(f.engine.pendingOwners.size,1);assert.ok(f.budget.total()>0);}
 finally{refused=false;await f.engine.dispose();}
 assert.equal(f.budget.total(),0);assert.equal(f.scheduler.used.gpu,0);
});
test('Cancellation before reusing a context retains an independent refused execution ACK',async()=>{
 const primary=Object.freeze({executionAck:true});let refused=false;
 const f=fixture(async operation=>{if(refused)throw primary;operation.release();});
 await f.run();const blocker=await f.scheduler.acquire({cpu:1,gpu:1});refused=true;const controller=new AbortController(),task=f.run(controller.signal);controller.abort();
 try{await assert.rejects(task,{code:'CANCELLED'});assert.equal(f.engine.pendingOwners.size,1);assert.equal(f.engine.context.state.borrowers,0);assert.equal(f.engine.context.state.closed,false);assert.equal(f.scheduler.used.gpu,1);}
 finally{refused=false;blocker.release();await f.engine.dispose();}
 assert.equal(f.budget.total(),0);assert.equal(f.scheduler.used.gpu,0);
});
