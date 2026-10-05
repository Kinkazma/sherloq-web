import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createCandidateWorkspace,propagateOffsets,wrapOffsets,randomCandidates,searchBounds} from '../experiments/d2prl/candidates.js';
import {NativeRandom} from '../experiments/d2prl/random.js';
import {createD2prlRecovery} from '../experiments/d2prl/recovery.js';
import {EngineError} from '../src/errors.js';
import {Budget} from '../src/cache.js';
const hash=value=>createHash('sha256').update(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)).digest('hex');

test('owned candidate workspace matches pinned Torch propagation and RNG at the full 448 grid',async()=>{
 const reference=JSON.parse(await readFile(new URL('../fixtures/d2prl/candidates.json',import.meta.url))),compressed=await readFile(new URL('../fixtures/d2prl/'+reference.payload.file,import.meta.url)),payload=new Uint8Array(gunzipSync(compressed));
 assert.equal(hash(compressed),reference.payload.compressedSha256);assert.equal(hash(payload),reference.payload.sha256);
 let operations=0;
 for(const row of reference.records.filter(row=>row.side===448)){
  const bytes=payload.slice(row.input.offset,row.input.offset+row.input.bytes),values=new Float32Array(bytes.buffer),n=row.side**2,pair={x:values.subarray(0,n),y:values.subarray(n)},workspace=createCandidateWorkspace(row.side),hooks={allocate:count=>workspace.allocate(count)};
  assert.equal(hash(bytes),row.input.sha256);
  try{
   workspace.begin();const propagated=await propagateOffsets(pair,row.side,hooks),propagation=row.operations.find(op=>op.operation==='propagate');
   for(const [i,axis]of['x','y'].entries())assert.equal(hash(propagated[axis]),propagation.outputs[i].sha256,row.name+' propagation '+axis);operations++;
   const buffers=[propagated.x.buffer,propagated.y.buffer],wrapped=await wrapOffsets(propagated,row.side,{inPlace:true}),expected=row.operations.find(op=>op.operation==='propagateWrap');
   for(const [i,axis]of['x','y'].entries()){assert.equal(wrapped[axis].buffer,buffers[i]);assert.equal(hash(wrapped[axis]),expected.outputs[i].sha256,row.name+' wrap '+axis);}operations++;
   const randomReference=row.operations.find(op=>op.operation==='random'),random=new NativeRandom(randomReference.initial),bounds=await searchBounds(pair,row.side);
   try{workspace.begin();const sampled=await randomCandidates(pair,bounds,row.side,random,hooks);for(const [i,axis]of['x','y'].entries()){assert.equal(sampled[axis].buffer,buffers[i]);assert.equal(hash(sampled[axis]),randomReference.outputs[i].sha256,row.name+' random '+axis);}assert.deepEqual(random.snapshot(),randomReference.final);operations++;
    const copied=await wrapOffsets(sampled,row.side),owned=await wrapOffsets(sampled,row.side,{inPlace:true});for(const axis of['x','y'])assert.equal(hash(owned[axis]),hash(copied[axis]));operations++;
   }finally{random.dispose();}
   assert.equal(hash(bytes),row.input.sha256,'Committed offsets changed');assert.deepEqual(workspace.snapshot(),{allocations:2,allocatedBytes:26*n*4,residentBytes:26*n*4});
  }finally{workspace.dispose();assert.equal(workspace.snapshot().residentBytes,0);}
 }
 assert.equal(operations,12);
});

test('a partial candidate growth stays owned for retry, and subsequent useful work reuses both banks',async()=>{
 const side=8,n=side**2,pair={x:Float32Array.from({length:n},(_,i)=>i%3-.5),y:Float32Array.from({length:n},(_,i)=>i%7-3)},source=[hash(pair.x),hash(pair.y)],workspace=createCandidateWorkspace(side),budget=new Budget(1024**2),events=[],reclaims=[],operation=createD2prlRecovery({budget,onRecovery:event=>events.push(event),reclaim:async({error})=>{reclaims.push(error.details.requestedBytes);return error.details.requestedBytes;}}),Native=globalThis.Float32Array;
 let attempts=0,largeAllocations=0;
 globalThis.Float32Array=new Proxy(Native,{construct(target,args){if(args[0]===13*n&&++largeAllocations===2)throw new RangeError('Array buffer allocation failed');return Reflect.construct(target,args);}});
 try{
  const generate=()=>{attempts++;workspace.begin();return propagateOffsets(pair,side,{allocate:count=>workspace.allocate(count)});};
  const result=await operation('owned-propagation',generate);assert.equal(attempts,2);assert.equal(largeAllocations,3);assert.equal(events.length,1);assert.deepEqual(reclaims,[13*n*4]);assert.equal(events[0].error.details.requestedBytes,13*n*4);
  const banks=[result.x.buffer,result.y.buffer];for(let i=0;i<4;i++){const next=await generate();assert.equal(next.x.buffer,banks[0]);assert.equal(next.y.buffer,banks[1]);}
  assert.equal(largeAllocations,3);assert.deepEqual([hash(pair.x),hash(pair.y)],source);assert.equal(workspace.snapshot().residentBytes,26*n*4);
 }finally{globalThis.Float32Array=Native;workspace.dispose();}
 assert.equal(workspace.snapshot().residentBytes,0);assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
});

test('candidate wrapping never publishes a partially mutated committed input on cancellation',async()=>{
 const side=32,n=side**2,pair={x:new Float32Array(n).fill(-100),y:new Float32Array(n).fill(99)},before=[hash(pair.x),hash(pair.y)],workspace=createCandidateWorkspace(side),controller=new AbortController();
 try{workspace.begin();const generated=await propagateOffsets(pair,side,{allocate:count=>workspace.allocate(count)});controller.abort();await assert.rejects(wrapOffsets(generated,side,{inPlace:true,signal:controller.signal}),{code:'CANCELLED'});assert.deepEqual([hash(pair.x),hash(pair.y)],before);}finally{workspace.dispose();}
 assert.equal(workspace.snapshot().residentBytes,0);
});


test('D2 reclaims the explicitly failed domain with exact constructor bytes and one refusal event',async()=>{
 for(const [error,expectedKind]of[[new RangeError('Array buffer allocation failed'),'array-buffer'],[new EngineError('GPU_OUT_OF_MEMORY','GPU buffer refused'),'gpu'],[new EngineError('MEMORY_LIMIT','Policy admission refused'),null]]){
  const budget=new Budget(1024**2),reports=[],events=[],requests=[],ordinary=[];error.details={requestedBytes:192};
  budget.reclaimAllocation=async(bytes,{kind,onReclaim})=>{requests.push({bytes,kind});onReclaim?.({kind,requestedBytes:bytes,targetedReleasedBytes:bytes,otherAccountedBytes:0,ownersVisited:1,completed:true});return bytes;};
  budget.reclaim=async bytes=>{ordinary.push(bytes);return 192;};
  const operation=createD2prlRecovery({budget,onRecovery:event=>events.push(event),onReclaim:event=>reports.push(event)});let attempts=0;
  assert.equal(await operation('owned-allocation',()=>{if(!attempts++)throw error;return 123;},{bytes:4096}),123);
  assert.equal(events.length,1);assert.equal(operation.snapshot().recoveries,1);assert.equal(events[0].error.details.requestedBytes,192);
  assert.deepEqual(requests,expectedKind?[{bytes:192,kind:expectedKind}]:[]);assert.equal(ordinary.length,expectedKind?0:1);assert.equal(reports.length,expectedKind?1:0);if(expectedKind)assert.equal(reports[0].phase,'resource-reclaimed');
  assert.equal(budget.total(),0);assert.equal(budget.recovering,false);
 }
});
