import test from 'node:test';import assert from 'node:assert/strict';
import {EngineError,normalizeResourceError,isRecoverableResourceError,serializeEngineError,deserializeEngineError} from '../src/errors.js';
import {ResourceRecoveryController,runWithResourceRecovery} from '../src/resource-recovery.js';
const fault=()=>new RangeError('Array buffer allocation failed');
const memory={budgetBytes:100*1024**2,retainedBytes:80*1024**2,activeReservationBytes:10*1024**2};
test('allocator failures normalize without treating invalid arguments or coding errors as memory pressure',()=>{
 for(const error of [fault(),new RangeError('WebAssembly.Memory(): could not allocate memory'),Object.assign(Error('device ran out of memory'),{name:'GPUOutOfMemoryError'}),new EngineError('MEMORY_LIMIT','admission')])assert.equal(isRecoverableResourceError(error),true);
 for(const error of [new RangeError('Invalid typed array length: -1'),new RangeError('Maximum call stack size exceeded'),new RangeError('Offset is outside the bounds of the DataView'),new TypeError('undefined is not a function'),new WebAssembly.RuntimeError('memory access out of bounds'),new EngineError('INVALID_INPUT','Array buffer allocation failed')]){assert.equal(isRecoverableResourceError(error),false);assert.equal(normalizeResourceError(error),error);}
});
test('normalization and wire errors preserve original stack, nested cause and details',()=>{
 const original=fault();original.cause=Object.assign(Error('native allocator'),{details:{bank:7}});original.details={requestedBytes:4096};const normalized=normalizeResourceError(original,{operation:'tensor'}),restored=deserializeEngineError(serializeEngineError(normalized,'COMPUTE_FAILED'));
 assert.equal(restored.code,'MEMORY_ALLOCATION');assert.equal(restored.stack,original.stack);assert.equal(restored.cause.name,'RangeError');assert.equal(restored.cause.cause.message,'native allocator');assert.equal(restored.cause.cause.details.bank,7);assert.deepEqual(restored.details,{requestedBytes:4096,operation:'tensor'});
 const wrapped=new EngineError('COMPUTE_FAILED','Tensor failed',{cause:original});assert.equal(normalizeResourceError(wrapped).code,'MEMORY_ALLOCATION');
});
test('five failures with small memory jitter form one obstruction',()=>{
 const controller=new ResourceRecoveryController();let decision;
 for(let i=0;i<5;i++){decision=controller.fail(fault(),{operation:'conv',phase:'rows',checkpoint:32,memory:{...memory,activeReservationBytes:memory.activeReservationBytes+i*8192}});assert.equal(decision.consecutiveFailures,i+1);assert.equal(decision.retry,i<4);}
 assert.equal(decision.error.details.recovery.loopDetected,true);assert.equal(isRecoverableResourceError(decision.error),false);assert.equal(new ResourceRecoveryController().fail(deserializeEngineError(serializeEngineError(decision.error))).retry,false,'An outer provider must not restart an exhausted inner loop');
});
test('distinct recoveries have no lifetime limit and committed progress resets the streak',async()=>{
 const controller=new ResourceRecoveryController(),completed=[];let invocations=0;
 const result=await runWithResourceRecovery(async()=>{if(invocations++<9){completed.push(invocations);throw fault();}return completed.slice();},{controller,operation:'rows',checkpoint:()=>completed.length,memory:()=>memory,wait:async()=>{}});
 assert.deepEqual(result,[1,2,3,4,5,6,7,8,9]);assert.equal(controller.snapshot().totalFailures,9);assert.equal(controller.snapshot().consecutiveFailures,0);
 for(let i=0;i<4;i++)assert.equal(controller.fail(fault(),{operation:'next',checkpoint:{key:'next',completed:3}}).retry,true);
 assert.equal(controller.fail(fault(),{operation:'next',checkpoint:{key:'next',completed:4}}).consecutiveFailures,1);
});
test('replayed checkpoints and attempt numbers cannot reset the high-water mark',()=>{
 const controller=new ResourceRecoveryController();controller.progress({key:'read',completed:100});
 for(let i=0;i<5;i++){controller.progress({key:'read',completed:10+i});const decision=controller.fail(fault(),{operation:'layer',phase:'output',memory:{...memory,attempt:i}});assert.equal(decision.retry,i<4);}
});
test('different useful operations and substantially different capacity start a new streak',()=>{
 const controller=new ResourceRecoveryController();for(let i=0;i<9;i++)assert.equal(controller.fail(fault(),{operation:'layer'+i,phase:'output',memory}).consecutiveFailures,1);
 assert.equal(controller.fail(fault(),{operation:'layer8',phase:'input',memory}).consecutiveFailures,2);
 assert.equal(controller.fail(fault(),{operation:'layer8',phase:'input',memory:{...memory,retainedBytes:20*1024**2}}).consecutiveFailures,1);
});
test('recovery pressure protects reclaim through the successful useful retry and is released once',async()=>{
 let held=0,reclaims=0,calls=0,released=0;const budget={beginRecovery(){held++;return()=>{held--;released++;};},snapshot:()=>memory};
 assert.equal(await runWithResourceRecovery(async()=>{if(calls++===0){assert.equal(held,0);throw fault();}assert.equal(held,1);return 7;},{budget,reclaim:async()=>{assert.equal(held,1);reclaims++;},wait:async()=>{assert.equal(held,1);}}),7);
 assert.equal(calls,2);assert.equal(reclaims,1);assert.equal(held,0);assert.equal(released,1);
});
test('terminal unrelated errors and cancellation release recovery pressure without another operation',async()=>{
 let held=0,calls=0;const budget={beginRecovery(){held++;return()=>held--;},snapshot:()=>memory},stop=new AbortController();
 await assert.rejects(runWithResourceRecovery(async()=>{calls++;throw fault();},{budget,signal:stop.signal,reclaim:async()=>stop.abort()}),{code:'CANCELLED'});assert.equal(calls,1);assert.equal(held,0);
 const bug=new TypeError('bad shape');await assert.rejects(runWithResourceRecovery(async()=>{throw bug;},{budget}),error=>error===bug);assert.equal(held,0);
});
test('five stable failures yield between retries and stop without an outer restart',async()=>{
 let calls=0,waits=0;await assert.rejects(runWithResourceRecovery(async()=>{calls++;throw fault();},{operation:'same',memory:()=>memory,wait:async()=>{waits++;await new Promise(resolve=>setImmediate(resolve));}}),error=>error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);
 assert.equal(calls,5);assert.equal(waits,4);
});

test('generic engine wrappers normalize only explicit allocator evidence and retain exhausted local guards',()=>{
 for(const code of ['NEURAL_EXECUTION','NUMERIC_RANGE','GPU_FAILED']){
  assert.equal(normalizeResourceError(new EngineError(code,'Array buffer allocation failed')).code,'MEMORY_ALLOCATION');
  const bug=new EngineError(code,'Invalid typed array length: -1');assert.equal(normalizeResourceError(bug),bug);
 }
 const inner=fault();inner.code='MEMORY_ALLOCATION';inner.details={recovery:{loopDetected:true,consecutiveFailures:5}};
 const wrapped=normalizeResourceError(new EngineError('NEURAL_EXECUTION','Evaluator failed',{cause:inner}));
 assert.equal(wrapped.details.recovery.loopDetected,true);assert.equal(isRecoverableResourceError(wrapped),false);
});
test('public recovery events are plain cloneable diagnostics without AbortSignal or Error instances',async()=>{
 let calls=0,event;const stop=new AbortController();
 await runWithResourceRecovery(async()=>{if(calls++===0)throw fault();return 1;},{signal:stop.signal,wait:async internal=>assert.equal(internal.signal,stop.signal),onRecovery:value=>event=structuredClone(value)});
 assert.equal(Object.hasOwn(event,'signal'),false);assert.equal(event.phase,'resource-recovery');assert.equal(event.error instanceof Error,false);assert.equal(event.error.code,'MEMORY_ALLOCATION');assert.equal(event.error.cause.name,'RangeError');assert.equal(event.decision.error.cause.message,'Array buffer allocation failed');
});
test('a successful owned result survives a cancellation race for caller cleanup',async()=>{
 const stop=new AbortController();let held=1,released=0;const owner={value:7,release(){held--;released++;}};
 const result=await runWithResourceRecovery(async()=>{stop.abort();return owner;},{signal:stop.signal});
 assert.equal(result,owner);assert.equal(held,1);result.release();assert.equal(held,0);assert.equal(released,1);
});

test('allocator failures in reclaim share the suspended operation guard and keep pressure held',async()=>{
 let calls=0,reclaims=0,held=0;const budget={beginRecovery(){held++;return()=>held--;},snapshot:()=>memory};
 await assert.rejects(runWithResourceRecovery(async()=>{calls++;throw fault();},{budget,reclaim:async()=>{reclaims++;assert.equal(held,1);throw fault();},wait:async()=>{}}),error=>error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);
 assert.equal(calls,1);assert.equal(reclaims,4);assert.equal(held,0);
 calls=0;reclaims=0;const events=[];
 assert.equal(await runWithResourceRecovery(async()=>{if(calls++===0)throw fault();return 9;},{budget,reclaim:async()=>{if(reclaims++===0)throw fault();return 1;},wait:async()=>{},onRecovery:event=>events.push(event.recoveryStage)}),9);
 assert.equal(calls,2);assert.equal(reclaims,3,'The original reclaim resumes after its internal refusal was recovered');assert.deepEqual(events,['operation','reclaim']);assert.equal(held,0);
});
test('storage failures during reclaim remain terminal without replaying useful work',async()=>{
 let calls=0;const disk=new EngineError('STORAGE_IO','Disk unavailable');
 await assert.rejects(runWithResourceRecovery(async()=>{calls++;throw fault();},{reclaim:async()=>{throw disk;},wait:async()=>assert.fail('No retry for disk error')}),error=>error===disk);assert.equal(calls,1);
});

test('alternating startup and compute phases cannot hide the same stalled operation',()=>{
 const controller=new ResourceRecoveryController();
 for(let i=0;i<5;i++){const decision=controller.fail(fault(),{operation:'tile-4',phase:i%2?'worker-start':'compute',checkpoint:32,memory});assert.equal(decision.consecutiveFailures,i+1);assert.equal(decision.retry,i<4);assert.equal(decision.phase,i%2?'worker-start':'compute');}
});

test('explicit transient network errors share the five-failure guard without any memory reclaim',async()=>{
 const fault=()=>new EngineError('NETWORK_TRANSIENT','connection interrupted'),budget={beginRecovery(){assert.fail('Network does not create memory pressure');},reclaim(){assert.fail('Network does not reclaim memory');}};let calls=0,waits=0;
 await assert.rejects(runWithResourceRecovery(()=>{calls++;throw fault();},{budget,wait:async()=>waits++}),error=>error.details.recovery.loopDetected&&error.details.recovery.consecutiveFailures===5);
 assert.equal(calls,5);assert.equal(waits,4);
 assert.equal(isRecoverableResourceError(new EngineError('MODEL_HASH','hash differs')),false);
});

test('wrapping an already dispatched transaction preserves its child dependency',async()=>{
 const {Budget}=await import('../src/cache.js'),budget=new Budget(100),parent=budget.beginOperation({owner:'patchmatch',id:'hypothesis'}),child=budget.beginOperation({owner:'patchmatch',id:'native-field',parent});
 child.setState('recovery');
 try{await runWithResourceRecovery(async()=>{assert.equal(parent.state,'waiting-child');const record=budget.resourceSnapshot().operations.find(value=>value.key===parent.key);assert.deepEqual(record.dependencies,[child.key]);assert.equal(budget.resourceProgressSnapshot('sift','wasm').independentProducers,0);},{budget,resourceOperation:parent});}
 finally{child.release();parent.release();}
 assert.equal(budget.resourceSnapshot().operations.length,0);
});

test('an exhausted reclamation publishes its terminal cause while the computation remains suspended',async()=>{
 const events=[];let calls=0;
 await assert.rejects(runWithResourceRecovery(()=>{calls++;throw fault();},{reclaim:async()=>{throw fault();},wait:async()=>{},onRecovery:event=>events.push(structuredClone(event))}),error=>error.details.recovery.loopDetected);
 assert.equal(calls,1);const terminal=events.filter(event=>event.phase==='resource-terminal');assert.equal(terminal.length,1);assert.equal(terminal[0].recoveryStage,'reclaim');assert.equal(terminal[0].error.cause.name,'RangeError');assert.equal(terminal[0].decision.consecutiveFailures,5);
});

test('successive failures in distinct backing domains replace obsolete recovery pressure',async()=>{
 const {Budget}=await import('../src/cache.js');const budget=new Budget(1024),seen=[];let attempt=0;
 const result=await runWithResourceRecovery(()=>{if(++attempt<=2)throw new EngineError('MEMORY_ALLOCATION','refused',{details:{allocationKind:attempt===1?'array-buffer':'gpu',requestedBytes:4}});return 7;},{budget,owner:'mixed',operation:'mixed-allocation',reclaim:async()=>{seen.push(budget.resourceSnapshot().pressures.map(value=>value.kind));return 4;}});
 assert.equal(result,7);assert.deepEqual(seen,[['array-buffer'],['gpu']]);assert.equal(budget.recovering,false);
});
