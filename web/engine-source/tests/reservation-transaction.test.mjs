import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError,resourceRecoveryBytes,resourceRecoveryKind,serializeEngineError} from '../src/errors.js';
import {createReservationScope} from '../src/reservation-scope.js';
import {ResourceRecoveryController,runWithResourceRecovery} from '../src/resource-recovery.js';
import {ExecutionScheduler} from '../src/execution-scheduler.js';
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const policy=bytes=>new EngineError('MEMORY_LIMIT','refused',{details:{requestedBytes:bytes}});

test('the observed convolution prefix must be readmitted after its own cleanup, not mistaken for peer credit',{timeout:3000},async()=>{
 // Exact production extents; these are accounting tokens, not allocated buffers.
 const budget=new Budget(1024**3),available=639409552,prefixBytes=379129856,requested=377291776,peerCredit=budget.reserve(budget.limit-available),needed=prefixBytes+requested,returned=peerCredit.split(needed-available),peer=budget.beginOperation({owner:'peer'}),entered=gate(),controller=new ResourceRecoveryController(),events=[];peer.setState('io');let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;const scope=budget.beginReservationScope();let prefix,output;try{prefix=scope.reserve(prefixBytes);output=scope.reserve(requested);return 'exact';}catch(error){throw scope.capture(error);}finally{output?.();prefix?.();scope.close();}},{budget,owner:'d2prl',controller,onRecovery:event=>events.push(structuredClone(event)),onWait:event=>{if(event.stage==='waiting')entered.resolve(event);}});
 try{const waiting=await entered.promise;assert.equal(calls,1);assert.equal(waiting.kind,'policy');assert.equal(waiting.requestedBytes,needed);assert.equal(waiting.current.availableBytes,available);const error=events[0].error;assert.equal(error.details.requestedBytes,requested);assert.equal(error.details.availableBytes,260279696);assert.deepEqual(error.details.admission,{requestedBytes:requested,rollbackBytes:prefixBytes,retryBytes:needed});
  for(let i=0;i<8;i++){peer.commit();await turn();}assert.equal(calls,1);returned();assert.equal(await work,'exact');assert.equal(calls,2);assert.equal(controller.snapshot().totalFailures,1);assert.equal(peer.state,'io');
 }finally{returned();peerCredit();peer.release();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);assert.equal(budget.listeners.size,0);
});

test('nested scopes add only unique captured owners, including splits and a simultaneous peer release',()=>{
 const budget=new Budget(100),parent=budget.beginReservationScope(),child=budget.beginReservationScope(),a=parent.reserve(20),b=child.reserve(30),peer=budget.reserve(10);let error;
 try{child.reserve(50);}catch(value){error=parent.capture(child.capture(value));}
 const b1=b.split(10);peer();a();b1();b();parent.close();child.close();
 assert.deepEqual(error.details.admission,{requestedBytes:50,rollbackBytes:50,retryBytes:100});assert.equal(budget.total(),0);assert.equal(resourceRecoveryBytes(error),100);assert.equal(serializeEngineError(error).details.admission.retryBytes,100);
});

test('tracking the same reservation across nested scopes counts its return only once',()=>{
 const budget=new Budget(100),outer=budget.beginReservationScope(),inner=budget.beginReservationScope(),raw=budget.reserve(40),a=outer.track(raw),b=inner.track(a),error=policy(70);assert.equal(a,b);assert.equal(inner.track(raw),a);
 outer.capture(error);inner.capture(error);inner.capture(error);const part=a.split(10);outer.close();a();assert.equal(error.details.admission.rollbackBytes,30);part();part();inner.close();assert.equal(error.details.admission.rollbackBytes,40);assert.equal(error.details.admission.retryBytes,110);assert.equal(budget.total(),0);
});

test('closing a successful scope keeps its returned output owner alive and freezes old failure evidence',()=>{
 const budget=new Budget(100),scope=budget.beginReservationScope(),owned=scope.reserve(30),error=policy(80);scope.capture(error);scope.close();scope.close();assert.equal(budget.total(),30);assert.equal(error.details.admission.rollbackBytes,0);assert.throws(()=>scope.reserve(1),{code:'DISPOSED'});const part=owned.split(10);owned();part();assert.equal(budget.total(),0);assert.equal(error.details.admission.retryBytes,80);
});

test('a closed successful scope can transfer a still-live owner into a later attempt',()=>{
 const budget=new Budget(100),first=budget.beginReservationScope(),owner=first.reserve(30);first.close();const second=budget.beginReservationScope(),adopted=second.track(owner),error=policy(80);second.capture(error);adopted();second.close();assert.equal(error.details.admission.retryBytes,110);assert.equal(budget.total(),0);
});

test('scheduler-retained credit can transfer into the attempted operation without a second charge',async()=>{
 const budget=new Budget(100),scheduler=new ExecutionScheduler(budget),lease=await scheduler.acquire({cpu:0,bytes:60}),scope=budget.beginReservationScope(),owned=scope.track(lease.retainMemory(60));lease.release();assert.equal(budget.total(),60);let error;
 try{scope.reserve(50);}catch(value){error=value;}owned();scope.close();assert.equal(error.details.admission.retryBytes,110);assert.equal(budget.peak,60);assert.equal(budget.total(),0);scheduler.dispose();
});

test('capturing an external wrapped refusal preserves its cause and includes only returned transient credit',()=>{
 const budget=new Budget(100),scope=budget.beginReservationScope(),transient=scope.reserve(20),kept=scope.reserve(30),inner=policy(60),wrapped=new EngineError('COMPUTE_FAILED','wrapped',{cause:inner}),error=scope.capture(wrapped);transient();scope.close();kept();assert.equal(error.code,'MEMORY_LIMIT');assert.equal(error.cause,wrapped);assert.equal(error.details.admission.retryBytes,80);assert.equal(error.details.requestedBytes,60);assert.equal(budget.total(),0);
});

test('physical refusal and cancellation never manufacture policy rollback credit',()=>{
 const budget=new Budget(100),scope=budget.beginReservationScope(),owned=scope.reserve(40),physical=Object.assign(new RangeError('Array buffer allocation failed'),{details:{requestedBytes:20}}),normalized=scope.capture(physical),cancel=new EngineError('CANCELLED','stopped');assert.equal(scope.capture(cancel),cancel);owned();scope.close();assert.equal(normalized.code,'MEMORY_ALLOCATION');assert.equal(normalized.details.admission,undefined);assert.equal(resourceRecoveryBytes(normalized),20);assert.equal(budget.total(),0);
});

test('cancelling while waiting for the replay peak releases all transaction and recovery bookkeeping',{timeout:3000},async()=>{
 const budget=new Budget(100),peerCredit=budget.reserve(30),peer=budget.beginOperation({owner:'peer'}),entered=gate(),stop=new AbortController();peer.setState('io');let calls=0;
 const work=runWithResourceRecovery(()=>{calls++;const scope=budget.beginReservationScope();let prefix;try{prefix=scope.reserve(40);scope.reserve(40);}finally{prefix?.();scope.close();}},{budget,owner:'reader',signal:stop.signal,onWait:()=>entered.resolve()}),cancelled=assert.rejects(work,{code:'CANCELLED'});
 await entered.promise;stop.abort();await cancelled;assert.equal(calls,1);assert.equal(budget.total(),30);assert.equal(budget.recovering,false);assert.equal(budget.listeners.size,0);assert.equal(budget.resourceWaiters.size,0);peerCredit();peer.release();assert.equal(budget.total(),0);
});

test('fixed admitted allowances report local capacity without waiting for or reclaiming global peers',async()=>{
 const budget=new Budget(1000),scope=createReservationScope(budget.reserve(10)),peer=budget.beginOperation({owner:'peer'});peer.setState('io');let reclaims=0,calls=0;budget.registerAsyncReclaimer(()=>{reclaims++;});
 try{await assert.rejects(runWithResourceRecovery(()=>{calls++;scope.reserve(11);},{budget,owner:'reader',wait:async()=>{assert.equal(budget.recovering,false);},reclaim:()=>assert.fail('No global or custom reclaim for a fixed allowance'),onWait:()=>assert.fail('Global credit cannot expand a fixed allowance')}),error=>{assert.equal(error.details.requestedBytes,11);assert.equal(error.details.availableBytes,10);assert.equal(error.details.budgetBytes,10);assert.equal(error.details.admissionScope,'fixed');assert.equal(resourceRecoveryKind(error),null);return error.details.recovery.loopDetected;});assert.equal(calls,5);assert.equal(reclaims,0);}
 finally{peer.release();scope.close();}assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('the guard compares the replay peak while retaining the original failing reservation diagnostic',()=>{
 const controller=new ResourceRecoveryController(),MiB=1024**2;
 for(let i=0;i<5;i++){const error=policy(4*MiB);error.details.admission={requestedBytes:4*MiB,rollbackBytes:8*MiB,retryBytes:12*MiB};const decision=controller.fail(error,{operation:'same'});assert.equal(decision.memory.requestedBytes,12*MiB);assert.equal(decision.error.details.requestedBytes,4*MiB);assert.equal(decision.consecutiveFailures,i+1);}
});
