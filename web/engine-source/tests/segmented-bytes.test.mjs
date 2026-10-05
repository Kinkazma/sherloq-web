import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createSegmentedBytes,copyBlobToSegments} from '../src/segmented-bytes.js';
test('Segmented RAM preserves byte ranges across every seam, holes and ownership',async()=>{
 const budget=new Budget(10000),store=await createSegmentedBytes(1001,{budget,chunkBytes:31}),expected=new Uint8Array(1001);
 try{for(let offset=3;offset<970;offset+=19){const a=Uint8Array.from({length:31},(_,i)=>(i*17+offset)%256);expected.set(a,offset);store.write(a,offset);a.fill(0);}
  for(let offset=0;offset<970;offset++)assert.deepEqual(store.readInto(new Uint8Array(32),offset),expected.slice(offset,offset+32));
  const all=[];await store.visit((data,offset)=>{assert.deepEqual(data,expected.slice(offset,offset+data.length));all.push(data.length);});assert.equal(all.reduce((a,b)=>a+b),1001);assert.equal(budget.active,0);assert.equal(budget.retained,1001);
 }finally{await store.dispose();}assert.equal(budget.total(),0);await store.dispose();assert.throws(()=>store.readInto(new Uint8Array(1)),{code:'DISPOSED'});
});
test('Segmented Blob staging is bounded, cancellable and preserves the source',async()=>{
 const bytes=Uint8Array.from({length:5003},(_,i)=>i*37),blob=new Blob([bytes]),budget=new Budget(6000),store=await createSegmentedBytes(blob.size,{budget,chunkBytes:101});
 try{await copyBlobToSegments(blob,store,{budget});assert.deepEqual(store.readInto(new Uint8Array(bytes.length)),bytes);assert.ok(budget.peak<=5104);const controller=new AbortController();await assert.rejects(copyBlobToSegments(blob,store,{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);}finally{await store.dispose();}assert.equal(budget.total(),0);
});
test('Segmented admission requires an actual storage alternative and rejects invalid ranges',async()=>{
 const budget=new Budget(100);await assert.rejects(createSegmentedBytes(1000,{budget}),{code:'STORAGE_UNAVAILABLE'});await assert.rejects(createSegmentedBytes(1000,{budget,storage:'memory'}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const store=await createSegmentedBytes(10,{budget});try{assert.throws(()=>store.write(new Uint8Array(2),9),{code:'INVALID_INPUT'});assert.throws(()=>store.readInto(new Uint8Array(1),-1),{code:'INVALID_INPUT'});}finally{await store.dispose();}
});
test('Temporary session creation is deferred until admitted RAM no longer fits',async()=>{
 const budget=new Budget(500);let calls=0,created=0,disposed=0;
 const getTemporarySession=async()=>{calls++;return {create:async length=>{created++;const data=new Uint8Array(length);return {write:(bytes,offset)=>data.set(bytes,offset),readInto:(target,offset)=>{target.set(data.subarray(offset,offset+target.length));return target;},dispose:()=>{disposed++;}};}};};
 const ram=await createSegmentedBytes(100,{budget,getTemporarySession});assert.equal(calls,0);
 const disk=await createSegmentedBytes(1000,{budget,getTemporarySession});assert.equal(calls,1);assert.equal(created,1);assert.equal(disk.storage,'temporary');assert.equal(budget.retained,100);
 await disk.write(new Uint8Array([7,19,231]),17);assert.deepEqual(await disk.readInto(new Uint8Array(3),17),new Uint8Array([7,19,231]));await disk.dispose();await ram.dispose();assert.equal(disposed,1);assert.equal(budget.total(),0);
 await assert.rejects(createSegmentedBytes(1000,{budget,getTemporarySession:async()=>{throw Object.assign(new Error('Injected unavailable session'),{code:'STORAGE_UNAVAILABLE'});}}),{code:'STORAGE_UNAVAILABLE'});assert.equal(budget.total(),0);
 const controller=new AbortController();await assert.rejects(createSegmentedBytes(1000,{budget,signal:controller.signal,getTemporarySession:async()=>{controller.abort();return {create:()=>assert.fail('No array after cancellation')};}}),{code:'CANCELLED'});assert.equal(budget.total(),0);
});
test('Recomputable cached pages cannot force a live result out of otherwise admissible RAM',async()=>{
 const budget=new Budget(100);budget.put('old-page',new Uint8Array(90));const result=await createSegmentedBytes(40,{budget});assert.equal(result.storage,'memory');assert.equal(budget.cacheBytes,0);assert.equal(budget.retained,40);assert.ok(budget.peak<=100);await result.dispose();assert.equal(budget.total(),0);
});
