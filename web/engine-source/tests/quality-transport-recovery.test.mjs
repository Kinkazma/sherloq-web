import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {QualityTransportQueue,runWithWorkerTransportRecovery} from '../src/worker-transport-recovery.js';
import {workerMessageFailure} from '../src/worker-message-protocol.js';

test('quality retries retain successful companions and stop the same failed quality at five refusals',async()=>{
 const budget=new Budget(100),discarded=[],queue=new QualityTransportQueue([10,30,50],{budget,label:'ghost',discard:async state=>discarded.push(state.qualityJob.quality)}),done=[],calls=new Map();let terminal;
 while(queue.pending.length){const active=Array.from({length:Math.min(2,queue.pending.length)},()=>({}));queue.assign(active);try{const values=await queue.call(active,state=>{const q=state.qualityJob.quality;calls.set(q,(calls.get(q)??0)+1);if(q===30)throw workerMessageFailure('ghost');return q;});for(const state of active)done.push(values.get(state));}catch(error){terminal=error;break;}}
 assert.deepEqual(done,[10,50]);assert.equal(calls.get(10),1);assert.equal(calls.get(50),1);assert.equal(calls.get(30),5);assert.equal(discarded.length,5);assert.equal(terminal.code,'WORKER_MESSAGE_FAILED');assert.equal(terminal.details.recovery.consecutiveFailures,5);assert.equal(budget.total(),0);
});

test('separate qualities can each recover without a lifetime retry ceiling',async()=>{
 const budget=new Budget(100),queue=new QualityTransportQueue([0,1,2,3,4,5,6],{budget,label:'gray',discard:async()=>{}}),seen=new Set(),done=[];
 while(queue.pending.length){const active=Array.from({length:Math.min(3,queue.pending.length)},()=>({}));queue.assign(active);await queue.call(active,state=>{const q=state.qualityJob.quality;if(!seen.has(q)){seen.add(q);throw workerMessageFailure('gray');}return q;});for(const state of active)done.push(state.qualityJob.quality);}
 assert.deepEqual(done.sort(),[0,1,2,3,4,5,6]);assert.equal(queue.recoveries,7);assert.equal(budget.total(),0);
});

test('transport cleanup completes before retry and cancellation creates no replacement',async()=>{
 const budget=new Budget(100),stop=new AbortController();let attempts=0,disposed=0;
 await assert.rejects(runWithWorkerTransportRecovery(()=>{attempts++;try{throw workerMessageFailure('ocr');}finally{disposed++;}},{budget,signal:stop.signal,onRecovery:()=>stop.abort()}),{code:'CANCELLED'});
 assert.equal(attempts,1);assert.equal(disposed,1);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('transport-only local boundary leaves real allocation faults to their domain recovery owner',async()=>{
 const budget=new Budget(100);let attempts=0;
 await assert.rejects(runWithWorkerTransportRecovery(()=>{attempts++;throw new RangeError('Array buffer allocation failed');},{budget}),error=>error.message==='Array buffer allocation failed');assert.equal(attempts,1);assert.equal(budget.recovering,false);
});
