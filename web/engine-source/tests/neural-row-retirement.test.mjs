import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
import {createNeuralInput} from '../src/neural-input.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function source(budget,{gate=null,refuseOnce=null}={}){
 const called=deferred(),data=Uint8Array.of(17,129,248),owners=new Set();let releases=0,reads=0;
 const surface={descriptor:{id:'owned-native-rgb',revision:1,width:1,height:1,format:'rgb8'},async readWindow(){
  reads++;const free=budget.reserve(3);let done=false;
  const owner={pixels:{width:1,height:1,format:'rgb8',data},release(){
   const promise=(async()=>{releases++;called.resolve();if(refuseOnce&&releases===1)throw refuseOnce;await gate?.promise;if(!done){done=true;free();owners.delete(owner);}})();
   // A broken caller must become a causal assertion, not an unhandled-promise
   // infrastructure failure. This does not replace the rejected returned ACK.
   void promise.catch(()=>{});return promise;
  }};owners.add(owner);return owner;
 }};
 return{surface,called,get reads(){return reads;},get releases(){return releases;},async close(){for(const owner of [...owners])await owner.release();}};
}

test('actual segmentation preparation waits for the final asynchronous row ACK',async()=>{
 const budget=new Budget(8*1024**2),gate=deferred(),s=source(budget,{gate}),prepare=createSegmentationPrepare({budget});let done=false,result;
 const pending=prepare.run({width:1,height:1,side:256,readRows:()=>s.surface.readWindow()}).then(v=>{done=true;result=v;return v;});
 try{await s.called.promise;await tick();assert.equal(done,false,'prepared tensor must not escape before the source row ACK');gate.resolve();const out=await pending;assert.equal(out.tensor[0],Math.fround(17/255));}
 finally{gate.resolve();await pending;result?.release();await prepare.dispose();await s.close();}
 assert.equal(budget.total(),0);
});

test('actual canonical neural hash waits for row ACK before memoizing its identity',async()=>{
 const budget=new Budget(8*1024**2),gate=deferred(),s=source(budget,{gate}),input=createNeuralInput(s.surface,{budget});let done=false;
 const pending=input.sha256().then(v=>{done=true;return v;});
 try{await s.called.promise;await tick();assert.equal(done,false,'canonical digest must not escape before row retirement');gate.resolve();assert.equal(await pending,createHash('sha256').update(Uint8Array.of(17,129,248)).digest('hex'));}
 finally{gate.resolve();await pending;await input.dispose?.();await s.close();}
 assert.equal(budget.total(),0);
});

test('a refused preparation row remains owned until prepare.dispose retries the same ACK',async()=>{
 const budget=new Budget(8*1024**2),ack=Object.freeze(new Error('controlled source row refusal')),s=source(budget,{refuseOnce:ack}),prepare=createSegmentationPrepare({budget});let result;
 const pending=prepare.run({width:1,height:1,side:256,readRows:()=>s.surface.readWindow()}).then(v=>(result=v));
 try{await assert.rejects(pending,e=>e===ack);assert.equal(s.releases,1);assert.equal(budget.total(),3,'refused row stays charged, unused tensor is retired');await prepare.dispose();assert.equal(s.releases,2,'exact refused owner retried');assert.equal(budget.total(),0);}
 finally{await pending.catch(()=>{});result?.release();await prepare.dispose();await s.close();}
});

test('a refused canonical hash row is retried before another read and no failed digest is memoized',async()=>{
 const budget=new Budget(8*1024**2),ack=Object.freeze(new Error('controlled hash row refusal')),s=source(budget,{refuseOnce:ack}),input=createNeuralInput(s.surface,{budget});
 try{await assert.rejects(input.sha256(),e=>e===ack);assert.equal(s.reads,1);assert.equal(budget.total(),3);assert.equal(await input.sha256(),createHash('sha256').update(Uint8Array.of(17,129,248)).digest('hex'));assert.equal(s.reads,2,'a failed hash is recomputed after its old lease ACK');assert.equal(s.releases,3);assert.equal(budget.total(),0);}
 finally{await input.dispose?.();await s.close();}
});

test('frozen and falsy primary preparation failures survive a refused source row cleanup',async()=>{
 for(const primary of [Object.freeze(new Error('primary processing failure')),0]){
  const budget=new Budget(8*1024**2),ack=Object.freeze(new Error('controlled row retirement refusal')),s=source(budget,{refuseOnce:ack}),prepare=createSegmentationPrepare({budget});
  try{await assert.rejects(prepare.run({width:1,height:1,side:256,readRows:()=>s.surface.readWindow()},{onProgress(){throw primary;}}),e=>e===primary);assert.equal(budget.total(),3);await prepare.dispose();assert.equal(s.releases,2);assert.equal(budget.total(),0);}
  finally{await prepare.dispose();await s.close();}
 }
});

test('hash disposal coalesces and waits for the outstanding actual source row',async()=>{
 const budget=new Budget(8*1024**2),gate=deferred(),s=source(budget,{gate}),input=createNeuralInput(s.surface,{budget});
 const hash=input.sha256();await s.called.promise;let done=false;const a=input.dispose(),b=input.dispose();assert.equal(a,b);void a.then(()=>{done=true;});await tick();assert.equal(done,false);assert.equal(s.releases,1);
 gate.resolve();await Promise.all([hash,a,b]);assert.equal(budget.total(),0);await assert.rejects(input.sha256(),{code:'INVALID_INPUT'});assert.throws(()=>input.region([0,0,1,1]),{code:'INVALID_INPUT'});
});

test('preparation disposal coalesces a retry after an initial refused row ACK',async()=>{
 const budget=new Budget(8*1024**2),ack=Object.freeze(new Error('first ACK refused')),gate=deferred(),s=source(budget,{refuseOnce:ack,gate}),prepare=createSegmentationPrepare({budget});
 await assert.rejects(prepare.run({width:1,height:1,side:256,readRows:()=>s.surface.readWindow()}),e=>e===ack);const a=prepare.dispose(),b=prepare.dispose();assert.equal(a,b);await tick();assert.equal(s.releases,2);assert.equal(budget.total(),3);gate.resolve();await Promise.all([a,b]);assert.equal(budget.total(),0);
});
