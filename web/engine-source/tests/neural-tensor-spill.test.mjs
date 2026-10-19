import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createNeuralTensor} from '../src/neural-tensor-store.js';
function session({fail=false}={}){let created=0,removed=0;return {backend:'opfs',get created(){return created;},get removed(){return removed;},async create(length){if(fail)throw Error('storage refusal');created++;const data=new Uint8Array(length);return {async write(bytes,offset){data.set(bytes,offset);},async readInto(target,offset){target.set(data.subarray(offset,offset+target.length));return target;},async flush(){},async dispose(){removed++;}};}};}
test('cold neural feature banks spill losslessly through shared recovery and report their new storage',async()=>{
 const budget=new Budget(1024**2),temporarySession=session(),t=await createNeuralTensor(3,7,11,{budget,chunkBytes:53,storage:'memory',temporarySession,owner:'test'});
 const bits=Uint32Array.from({length:t.length},(_,i)=>[0x80000000,0x3f800001,0x7fc00027,0x00000001,0xff800000][i%5]),values=new Float32Array(bits.buffer);
 await t.writeRows(0,7,values);assert.equal(t.storage,'memory');assert.equal(t.markCold(),t);
 const reclaimed=await budget.reclaim(budget.limit);assert.ok(reclaimed>=values.byteLength);assert.equal(t.storage,'temporary');assert.equal(temporarySession.created,1);
 const actual=new Float32Array(t.length);await t.readInto(actual);assert.deepEqual(new Uint32Array(actual.buffer),bits);await t.dispose();assert.equal(temporarySession.removed,1);assert.equal(budget.total(),0);assert.throws(()=>t.markCold(),{code:'DISPOSED'});
});
test('a failed tensor spill keeps the original authoritative bytes and releases all ownership',async()=>{
 const budget=new Budget(1024**2),t=await createNeuralTensor(2,3,4,{budget,storage:'memory',temporarySession:session({fail:true})}),values=Float32Array.from({length:24},(_,i)=>i+.25);
 await t.writeRows(0,3,values);await assert.rejects(t.spill(),/storage refusal/);assert.equal(t.storage,'memory');const actual=new Float32Array(24);await t.readInto(actual);assert.deepEqual(actual,values);await t.dispose();assert.equal(budget.total(),0);assert.throws(()=>t.spill(),{code:'DISPOSED'});
});
