import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {sortCandidates} from '../src/candidate-sort.js';import {createCandidateTable,CANDIDATE_CSV_HEADER} from '../src/candidate-table.js';
function session(){let live=0;return {get live(){return live;},async create(n){live++;const data=new Uint8Array(n);let disposed=false;return {readInto(out,offset){out.set(data.subarray(offset,offset+out.length));},write(src,offset){data.set(src,offset);},flush(){},dispose(){if(!disposed){live--;disposed=true;}}};}};}
const params={radius:1,threshold:32,spread:32};
test('Candidate radix sorting stays exact beyond a uint32 image key in both RAM and bounded external paths',async()=>{
 for(const external of [false,true]){
  const budget=new Budget(external?256*1024:2*1024**2),disk=session(),count=3500,rows=new Uint32Array(count*6);
  for(let i=0;i<count;i++){const at=i*6;rows.set([(i*7919)%65000,(i*1543)%65000,i%3,1+i%2,255-i%255,i%255],at);}
  const expected=Array.from({length:count},(_,i)=>Array.from(rows.subarray(i*6,i*6+6))).sort((a,b)=>a[1]-b[1]||a[0]-b[0]||b[2]-a[2]).flat();
  const store=await createSegmentedBytes(rows.byteLength,{budget,temporarySession:disk});await store.write(new Uint8Array(rows.buffer));
  const sorted=await sortCandidates(store,{width:65000,height:65000,budget,temporarySession:disk,forceExternal:external,bucketRows:300});
  assert.equal(sorted.metrics.path,external?'external-radix':'memory-radix');const table=createCandidateTable(sorted.store,{budget,params}),part=await table.readRows({length:count});assert.deepEqual(Array.from(part.data),expected);part.release();
  const csv=await table.readCsv({length:2});assert.ok(new TextDecoder().decode(csv.bytes).startsWith(CANDIDATE_CSV_HEADER));assert.equal(csv.done,false);csv.release();
  const page=await table.readRows({offset:count-1,length:10});assert.equal(page.length,1);assert.equal(page.done,true);page.release();
  const eof=await table.readCsv({offset:count,length:1});assert.equal(eof.bytes.length,0);assert.equal(eof.done,true);eof.release();
  await assert.rejects(table.readRows({offset:-1}),{code:'INVALID_INPUT'});await assert.rejects(table.readRows({length:0}),{code:'INVALID_INPUT'});
  await table.dispose();assert.equal(budget.total(),0);assert.equal(disk.live,0);
 }
});
test('External sort cancellation disposes its extra arrays and leaves input ownership with the caller',async()=>{
 const budget=new Budget(128*1024),disk=session(),rows=new Uint32Array(600*6);for(let i=0;i<600;i++)rows.set([599-i,0,2,1,255,100],i*6);
 const store=await createSegmentedBytes(rows.byteLength,{budget,temporarySession:disk});await store.write(new Uint8Array(rows.buffer));const activeBefore=budget.active;assert.equal(activeBefore,2*rows.byteLength);const controller=new AbortController();
 await assert.rejects(sortCandidates(store,{width:600,height:1,budget,temporarySession:disk,forceExternal:true,bucketRows:500,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});
 assert.equal(budget.active,activeBefore,'Only the caller-owned migration window remains');assert.equal(budget.retained,rows.byteLength);assert.equal(disk.live,0);assert.deepEqual(await store.readInto(new Uint8Array(rows.byteLength)),new Uint8Array(rows.buffer));await store.dispose();assert.equal(budget.total(),0);
});
test('CSV pages handle empty tables and release reservations on cancellation or failed reads',async()=>{
 const budget=new Budget(1024**2),store=await createSegmentedBytes(0,{budget}),table=createCandidateTable(store,{budget,params});const csv=await table.readCsv({length:7});assert.equal(new TextDecoder().decode(csv.bytes),CANDIDATE_CSV_HEADER);assert.equal(csv.done,true);csv.release();
 await assert.rejects(table.readCsv({},{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);await table.dispose();
 let disposed=false;const failed=createCandidateTable({byteLength:24,storage:'temporary',readInto(){throw Object.assign(Error('Read failed'),{code:'STORAGE_IO'});},dispose(){disposed=true;}},{budget,params});
 await assert.rejects(failed.readCsv({length:1}),{code:'STORAGE_IO'});assert.equal(budget.total(),0);await failed.dispose();assert.equal(disposed,true);
});
