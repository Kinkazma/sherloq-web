import test from 'node:test';
import assert from 'node:assert/strict';
import {installWorkerMessageProtocol,workerMessageFailure} from '../src/worker-message-protocol.js';
import {Budget} from '../src/cache.js';
import {ExecutionScheduler} from '../src/execution-scheduler.js';
import {resourceAllocationKind,serializeEngineError,deserializeEngineError} from '../src/errors.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));

for(const event of ['null','messageerror'])test(event+' fails one pending RPC, releases its CPU lease, and poisons only that endpoint',async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget,{maxWorkers:2}),endpoint={postMessage(){}},other=await scheduler.acquire({cpu:1,bytes:20});let reject,handled=0,failures=0;
 const protocol=installWorkerMessageProtocol(endpoint,()=>handled++,{label:'fixture',onFailure:error=>{failures++;reject(error);}});
 const pending=scheduler.run({cpu:1,bytes:30},()=>new Promise((_,fail)=>{reject=fail;}));await turn();const rejected=assert.rejects(pending,error=>error.code==='WORKER_MESSAGE_FAILED'&&error.details.transport.event===(event==='null'?'message':'messageerror')&&resourceAllocationKind(error)===null);
 if(event==='null')endpoint.onmessage({data:null});else endpoint.onmessageerror({});await rejected;endpoint.onmessage({data:{kind:'late'}});endpoint.onmessageerror({});assert.equal(handled,0);assert.equal(failures,1);assert.equal(protocol.failed,true);assert.throws(()=>protocol.post({kind:'reuse'}),{code:'WORKER_MESSAGE_FAILED'});assert.equal(scheduler.snapshot().active.cpu,1);assert.equal(budget.total(),20);protocol.dispose();other.release();scheduler.dispose();assert.equal(budget.total(),0);
});

test('unexpected asynchronous handler rejection is delivered instead of orphaning its caller',async()=>{
 const endpoint={},failure=new RangeError('Array buffer allocation failed');let observed;
 installWorkerMessageProtocol(endpoint,async()=>{await turn();throw failure;},{onFailure:error=>{observed=error;}});endpoint.onmessage({data:{kind:'compute'}});await turn();await turn();assert.equal(observed.code,'MEMORY_ALLOCATION');assert.equal(observed.cause,failure);assert.equal(resourceAllocationKind(observed),'array-buffer');
});

test('opaque transport retry preserves its cause, skips all memory reclaim and stops at five refusals',async()=>{
 const budget=new Budget(100),error=workerMessageFailure('ocr','message','null-data');let attempts=0,reclaims=0;budget.registerAsyncReclaimer(()=>{reclaims++;return 0;});
 await assert.rejects(runWithResourceRecovery(()=>{attempts++;throw deserializeEngineError(serializeEngineError(error));},{budget,owner:'sift',reclaim:()=>{reclaims++;return 0;}}),caught=>caught.code==='WORKER_MESSAGE_FAILED'&&caught.details.transport.reason==='null-data'&&caught.details.recovery.consecutiveFailures===5);
 assert.equal(attempts,5);assert.equal(reclaims,0);assert.equal(budget.recovering,false);assert.equal(budget.total(),0);
});


test('unrelated policy-memory changes cannot reset an opaque transport obstruction',async()=>{
 const budget=new Budget(1000);let attempts=0;
 await assert.rejects(runWithResourceRecovery(()=>{attempts++;throw workerMessageFailure('jpeg');},{budget,memory:()=>({budgetBytes:1000,activeReservationBytes:attempts*100,availableBytes:1000-attempts*100})}),error=>error.details.recovery.consecutiveFailures===5);assert.equal(attempts,5);assert.equal(budget.total(),0);
});
