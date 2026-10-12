import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {byteView} from '../src/memory-range.js';
import {createParameterSpill} from '../experiments/d2prl/parameter-spill.js';

function fixture(){
 const budget=new Budget(1024),arrays=new Set(),stats={reads:0,writes:0,removed:0,closed:0};
 const owner=createParameterSpill({budget,windowBytes:8,temporarySessionFactory:async()=>({backend:'indexeddb',snapshot:()=>({fake:true,pageBytes:8}),async create(length){const data=new Uint8Array(length);arrays.add(data);return{byteLength:length,async write(source,offset){stats.writes++;data.set(byteView(source),offset);},async readInto(target,offset){stats.reads++;byteView(target).set(data.subarray(offset,offset+byteView(target).length));},flush(){},async dispose(){if(arrays.delete(data))stats.removed++;}};},async dispose(){stats.closed++;arrays.clear();}})});
 owner.prepare();return{budget,owner,arrays,stats};
}
const spec=data=>({file:'assets/fixture.bin',bytes:data.byteLength,sha256:createHash('sha256').update(data).digest('hex')});
function hasher(){let hash;return{init(){hash=createHash('sha256');},update(bytes){hash.update(bytes);},digest(){return hash.digest('hex');}};}

test('spill rejects a short source lease on a larger backing without reading its neighbours',async()=>{
 const context=fixture(),backing=new Uint8Array(64).fill(0xa7),before=backing.slice(),short=backing.subarray(8,16),identity=spec(backing.subarray(8,32));
 try{
  await assert.rejects(context.owner.save({data:short},identity),error=>error.code==='INVALID_INPUT'&&/source lease extent/.test(error.message));
  assert.deepEqual(backing,before);assert.equal(context.stats.writes,0);assert.equal(context.stats.reads,0);assert.equal(context.stats.removed,1);assert.equal(context.arrays.size,0);assert.equal(context.owner.snapshot().storedParameters,0);
 }finally{await context.owner.dispose();}assert.equal(context.budget.total(),0);
});

test('rehydration rejects a short destination lease before writing adjacent owned bytes',async()=>{
 const context=fixture(),source=Uint8Array.from({length:24},(_,i)=>i+1),identity=spec(source),backing=new Uint8Array(64).fill(0xd9),before=backing.slice();let released=0;
 try{
  const saved=await context.owner.save({data:source},identity),reads=context.stats.reads;
  await assert.rejects(context.owner.restore(saved,identity,{allocate:async()=>({data:backing.subarray(8,16),release(){released++;}}),hasher:hasher()}),error=>error.code==='INVALID_INPUT'&&/destination lease extent/.test(error.message));
  assert.equal(released,1);assert.deepEqual(backing,before);assert.equal(context.stats.reads,reads);assert.equal(context.owner.snapshot().storedParameters,1);
  const restored=await context.owner.restore(saved,identity,{allocate:async()=>({data:backing.subarray(8,32),release(){released++;}}),hasher:hasher()});
  assert.deepEqual(backing.subarray(8,32),source);assert.deepEqual(backing.subarray(0,8),before.subarray(0,8));assert.deepEqual(backing.subarray(32),before.subarray(32));restored.release();
 }finally{await context.owner.dispose();}assert.equal(context.budget.total(),0);assert.equal(context.arrays.size,0);
});
