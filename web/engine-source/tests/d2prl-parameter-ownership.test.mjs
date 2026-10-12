import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import {publishD2prlParameter,getD2prlParameterLease,validateD2prlFloat32} from '../experiments/d2prl/parameter-ownership.js';

const bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength).slice();

test('a published Float32 parameter validates once without changing any source bit',async()=>{
 const view=Float32Array.of(0,-0,2**-149,-(2**-149),3.4028234663852886e38),before=bytes(view),revoke=publishD2prlParameter(view),lease=getD2prlParameterLease(view);
 try{assert.ok(Object.isFrozen(lease));assert.deepEqual(await validateD2prlFloat32(view),{lease,elementsScanned:5});assert.deepEqual(await validateD2prlFloat32(view),{lease,elementsScanned:0});assert.deepEqual(bytes(view),before);}
 finally{revoke();}assert.throws(()=>getD2prlParameterLease(view),{code:'INVALID_INPUT'});await assert.rejects(validateD2prlFloat32(view),{code:'INVALID_INPUT'});
});

test('ordinary inputs and aliases retain full finiteness validation on every call',async()=>{
 const view=Float32Array.of(1,2),alias=new Float32Array(view.buffer),revoke=publishD2prlParameter(view);
 try{
  assert.equal(getD2prlParameterLease(alias),null);for(let i=0;i<2;i++)assert.deepEqual(await validateD2prlFloat32(alias),{lease:null,elementsScanned:2});
  const external=Float32Array.of(3,4);for(let i=0;i<2;i++)assert.deepEqual(await validateD2prlFloat32(external),{lease:null,elementsScanned:2});external[1]=NaN;await assert.rejects(validateD2prlFloat32(external),{code:'INVALID_INPUT'});
 }finally{revoke();}
});

test('consumer checkpoints keep their original 8192-element sequence',async()=>{
 const view=new Float32Array(16385),revoke=publishD2prlParameter(view);let checkpoints=0;
 try{await validateD2prlFloat32(view,{checkpoint:()=>{checkpoints++;}});assert.equal(checkpoints,3);await validateD2prlFloat32(view,{checkpoint:()=>{checkpoints++;}});assert.equal(checkpoints,3);}
 finally{revoke();}
});

test('concurrent consumers share one completed validation of a live parameter',async()=>{
 const view=new Float32Array(32),revoke=publishD2prlParameter(view),lease=getD2prlParameterLease(view);let finish;
 const gate=new Promise(resolve=>finish=resolve),first=validateD2prlFloat32(view,{checkpoint:()=>gate}),second=validateD2prlFloat32(view);
 try{finish();assert.deepEqual(await Promise.all([first,second]),[{lease,elementsScanned:32},{lease,elementsScanned:0}]);}
 finally{finish();revoke();}
});

for(const invalid of [Infinity,-Infinity,NaN])test('invalid parameter '+String(invalid)+' never marks a validated lifetime',async()=>{
 const view=Float32Array.of(invalid),revoke=publishD2prlParameter(view);
 try{for(let i=0;i<2;i++)await assert.rejects(validateD2prlFloat32(view,{message:'Nonfinite feature input'}),error=>error.code==='INVALID_INPUT'&&error.message==='Nonfinite feature input');}
 finally{revoke();}
});

test('cancelled validation leaves a fresh scan available for the next useful attempt',async()=>{
 const view=new Float32Array(32),revoke=publishD2prlParameter(view),signal=new AbortController(),lease=getD2prlParameterLease(view);let finish;
 const gate=new Promise(resolve=>finish=resolve),pending=validateD2prlFloat32(view,{signal:signal.signal,checkpoint:()=>gate});
 try{signal.abort();finish();await assert.rejects(pending,{code:'CANCELLED'});assert.deepEqual(await validateD2prlFloat32(view),{lease,elementsScanned:32});await assert.rejects(validateD2prlFloat32(view,{signal:AbortSignal.abort()}),{code:'CANCELLED'});}
 finally{finish();revoke();}
});

test('one cancelled waiter cannot revoke another consumer successful scan',async()=>{
 const view=new Float32Array(32),revoke=publishD2prlParameter(view),signal=new AbortController(),lease=getD2prlParameterLease(view);let finish;
 const gate=new Promise(resolve=>finish=resolve),first=validateD2prlFloat32(view,{checkpoint:()=>gate}),waiter=validateD2prlFloat32(view,{signal:signal.signal});
 try{signal.abort();await assert.rejects(waiter,{code:'CANCELLED'});finish();assert.deepEqual(await first,{lease,elementsScanned:32});assert.deepEqual(await validateD2prlFloat32(view),{lease,elementsScanned:0});}
 finally{finish();revoke();}
});

test('checkpoint failure and mid-validation revocation never publish success',async()=>{
 const view=new Float32Array(32),revoke=publishD2prlParameter(view),lease=getD2prlParameterLease(view);
 try{await assert.rejects(validateD2prlFloat32(view,{checkpoint(){throw new Error('Injected checkpoint failure');}}),/Injected checkpoint failure/);assert.deepEqual(await validateD2prlFloat32(view),{lease,elementsScanned:32});}
 finally{revoke();}
 const next=new Float32Array(32),release=publishD2prlParameter(next);let finish;const gate=new Promise(resolve=>finish=resolve),pending=validateD2prlFloat32(next,{checkpoint:()=>gate});release();finish();await assert.rejects(pending,{code:'INVALID_INPUT'});
});

test('retiring and reusing a Wasm range creates a distinct validation lifetime',async()=>{
 const budget=new Budget(32*1024**2),arena=createWasmTensorArena({budget}),first=arena.allocate(Float32Array,64),old=first.data,revoke=publishD2prlParameter(old),oldLease=getD2prlParameterLease(old);
 await validateD2prlFloat32(old);revoke();revoke();first.release();const next=arena.allocate(Float32Array,64),release=publishD2prlParameter(next.data),lease=getD2prlParameterLease(next.data);
 try{assert.equal(next.data.buffer,old.buffer);assert.equal(next.data.byteOffset,old.byteOffset);assert.notEqual(lease,oldLease);await assert.rejects(validateD2prlFloat32(old),{code:'INVALID_INPUT'});assert.deepEqual(await validateD2prlFloat32(next.data),{lease,elementsScanned:64});}
 finally{release();next.release();arena.dispose();}assert.equal(budget.total(),0);
});

test('detached, shared, non-Float32 and already published parameter views reject ownership',async()=>{
 const view=Float32Array.of(1),revoke=publishD2prlParameter(view);structuredClone(view.buffer,{transfer:[view.buffer]});assert.throws(()=>getD2prlParameterLease(view),{code:'INVALID_INPUT'});await assert.rejects(validateD2prlFloat32(view),{code:'INVALID_INPUT'});revoke();
 for(const input of [Uint8Array.of(1),BigInt64Array.of(1n),new Float32Array(0)])assert.throws(()=>publishD2prlParameter(input),{code:'INVALID_INPUT'});
 if(typeof SharedArrayBuffer==='function')assert.throws(()=>publishD2prlParameter(new Float32Array(new SharedArrayBuffer(4))),{code:'INVALID_INPUT'});
 const next=Float32Array.of(1),release=publishD2prlParameter(next);assert.throws(()=>publishD2prlParameter(next),{code:'INVALID_INPUT'});release();assert.throws(()=>publishD2prlParameter(next),{code:'INVALID_INPUT'});
});
