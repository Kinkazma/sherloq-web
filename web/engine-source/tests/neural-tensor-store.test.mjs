import {test} from 'node:test';import assert from 'node:assert/strict';
import {createNeuralTensor,neuralRowPlan,neuralChannelStatistics} from '../src/neural-tensor-store.js';import {Budget} from '../src/cache.js';
test('channel-major windows cross byte pages and use complete global reductions',async()=>{
 const budget=new Budget(65536),tensor=await createNeuralTensor(3,7,11,{budget,chunkBytes:53}),whole=Float32Array.from({length:231},(_,i)=>Math.fround(Math.sin(i)*30));
 for(let y=0;y<7;y+=2){const rows=Math.min(2,7-y),data=new Float32Array(rows*11*3);for(let c=0;c<3;c++)data.set(whole.subarray(c*77+y*11,c*77+(y+rows)*11),c*rows*11);await tensor.writeRows(y,rows,data);}
 const part=await tensor.readTokens(9,29);for(let c=0;c<3;c++)assert.deepEqual(part.data.subarray(c*29,(c+1)*29),whole.subarray(c*77+9,c*77+38));part.release();
 const stats=await neuralChannelStatistics(tensor,{budget,windowBytes:84});for(let c=0;c<3;c++){const a=whole.subarray(c*77,(c+1)*77);assert.equal(stats.mean[c],Math.fround(a.reduce((s,v)=>s+v,0)/77));assert.equal(stats.max[c],Math.max(...a));}stats.release();
 const out=new Float32Array(231);await tensor.readInto(out);assert.deepEqual(out,whole);await tensor.dispose();assert.equal(budget.total(),0);
});
test('strided local operators retain halos, align phase and cover outputs exactly once',()=>{
 for(const height of [1,17,32,33,8000])for(const stride of [1,2,4])for(const radius of [1,3,7]){
  let seen=0;for(const p of neuralRowPlan(height,stride,radius,5)){assert.equal(p.top,seen);assert.equal(p.start%stride,0);assert.equal(p.cropTop*stride+p.start,p.top*stride);assert.ok(p.start<=Math.max(0,p.top*stride-radius));assert.ok(p.stop>=Math.min(height,(p.top+p.rows-1)*stride+radius+1));seen+=p.rows;}assert.equal(seen,Math.ceil(height/stride));
 }
});
test('temporary tensors retain >4 GiB offsets without allocating a global buffer',async()=>{
 const budget=new Budget(1024),length=12000*8000*64*4,records=new Map();let removed=0,allocated=0,created=0;
 const temporarySession={async create(size){assert.equal(size,length); // Physical sharding belongs to the shared OPFS session.
const base=allocated;allocated+=size;created++;return {write(bytes,offset){records.set(base+offset,bytes.slice());},readInto(bytes,offset){bytes.set(records.get(base+offset));},dispose(){removed++;}};}};
 const t=await createNeuralTensor(64,8000,12000,{budget,storage:'temporary',temporarySession}),data=Float32Array.from({length:64},(_,i)=>i+.25);await t.writeTokens(96000000-1,1,data);assert.ok(Math.max(...records.keys())>2**32);
 const r=await t.readTokens(96000000-1,1);assert.deepEqual(r.data,data);r.release();await t.dispose();assert.equal(allocated,length);assert.equal(removed,created);assert.equal(budget.total(),0);
});
test('cancelled and failed window reads release their scratch leases',async()=>{
 const budget=new Budget(1024),temporarySession={async create(){return {readInto(){throw Error('io');},dispose(){}};}},t=await createNeuralTensor(2,3,4,{budget,storage:'temporary',temporarySession});
 await assert.rejects(t.readRows(0,2),/io/);assert.equal(budget.active,0);const signal=AbortSignal.abort();await assert.rejects(t.readRows(0,2,{signal}));assert.equal(budget.active,0);await t.dispose();
});
