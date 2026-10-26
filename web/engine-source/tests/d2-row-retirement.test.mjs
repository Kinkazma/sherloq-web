import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createPreparation} from '../experiments/d2prl/prepare.js';
import factory from '../vendor/d2prl/prepare.js';
const wasmBinary=await readFile(new URL(import.meta.resolve('../vendor/d2prl/prepare.wasm')));
const prepare=budget=>createPreparation(()=>factory({wasmBinary}),{budget});
function rows(budget,{refusals=1,primary,hasPrimary=false,gate}={}){
 const owners=new Set(),events=[];let reads=0,releases=0,allow=false;
 return{events,get releases(){return releases;},get reads(){return reads;},allow(){allow=true;},
  async readRows(){reads++;events.push('read'+reads);const free=budget.reserve(3);let done=false;
   const owner={get pixels(){if(hasPrimary)throw primary;return{width:1,height:1,format:'rgb8',data:Uint8Array.of(17,129,248)};},async release(){releases++;events.push('release'+releases);if(!allow&&releases<=refusals)throw ack;await gate?.promise;if(!done){done=true;free();owners.delete(owner);}}};owners.add(owner);return owner;
  },async close(){allow=true;for(const owner of [...owners])await owner.release();}};
}
const ack=Object.freeze(new Error('controlled D2 row ACK refusal'));
test('D2 preparation retains a refused native row until disposal acknowledges it',async()=>{
 const budget=new Budget(96*1024**2),s=rows(budget),p=await prepare(budget);
 try{await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),e=>e===ack);assert.equal(s.releases,1);await p.dispose();assert.equal(s.releases,2,'disposal must retry the exact refused row');assert.equal(budget.total(),0);}
 finally{s.allow();await p.dispose();await s.close();}
});
test('D2 native preparation preserves frozen and falsy primary failures while retaining failed cleanup',async()=>{
 for(const primary of [Object.freeze(new Error('frozen source pixels')),0]){
  const budget=new Budget(96*1024**2),s=rows(budget,{primary,hasPrimary:true}),p=await prepare(budget);
  try{await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),e=>e===primary);assert.equal(s.releases,1);await p.dispose();assert.equal(s.releases,2);assert.equal(budget.total(),0);}
  finally{s.allow();await p.dispose();await s.close();}
 }
});
test('D2 failed disposal keeps its runtime and row charged and can be retried',async()=>{
 const budget=new Budget(96*1024**2),s=rows(budget,{refusals:2}),p=await prepare(budget);
 try{await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),e=>e===ack);const charged=budget.total();assert.ok(charged>3);await assert.rejects(async()=>await p.dispose(),e=>e===ack);assert.equal(budget.total(),charged,'runtime cannot retire before source ACK');assert.equal(s.releases,2);await p.dispose();assert.equal(s.releases,3);assert.equal(budget.total(),0);}
 finally{s.allow();await p.dispose();await s.close();}
});
test('D2 preparation retries its old failed row before allocating and reading another run',async()=>{
 const budget=new Budget(96*1024**2),s=rows(budget),p=await prepare(budget);let out;
 try{await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),e=>e===ack);out=await p.runRows({width:1,height:1,readRows:s.readRows});assert.deepEqual(s.events.slice(0,4),['read1','release1','release2','read2']);assert.ok(out.data.every(Number.isFinite));out.release();out=null;await p.dispose();assert.equal(budget.total(),0);}
 finally{out?.release();s.allow();await p.dispose();await s.close();}
});
test('D2 disposal waits and coalesces failed-row ACK while preventing a new preparation',async()=>{
 let resolve;const gate={promise:new Promise(r=>resolve=r)};const budget=new Budget(96*1024**2),s=rows(budget,{gate}),p=await prepare(budget);
 try{await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),e=>e===ack);const a=p.dispose(),b=p.dispose();assert.equal(a,b);await new Promise(r=>setImmediate(r));assert.equal(s.releases,2);await assert.rejects(p.runRows({width:1,height:1,readRows:s.readRows}),{code:'INVALID_INPUT'});assert.equal(s.reads,1);resolve();await a;assert.equal(budget.total(),0);}
 finally{resolve();s.allow();await p.dispose();await s.close();}
});
