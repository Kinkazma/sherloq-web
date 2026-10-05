import {byteView,byteLength} from '../src/memory-range.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';

function allocationFault(t,{shared=true,bankBytes=16}={}){
 const name=shared?'SharedArrayBuffer':'Uint8Array',Native=globalThis[name],isolated=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');
 let enabled=false,attempts=0;
 globalThis[name]=new Proxy(Native,{construct(target,args){if(enabled&&args.length===1&&args[0]===bankBytes){attempts++;throw new RangeError('injected backing pool exhaustion');}return Reflect.construct(target,args);}});
 Object.defineProperty(globalThis,'crossOriginIsolated',{configurable:true,value:shared});
 t.after(()=>{globalThis[name]=Native;if(isolated)Object.defineProperty(globalThis,'crossOriginIsolated',isolated);else delete globalThis.crossOriginIsolated;});
 return {enable(){enabled=true;},disable(){enabled=false;},get attempts(){return attempts;}};
}
function session({write,flush}={}){
 const state={created:0,disposed:0,writes:0};
 return {state,backend:'indexeddb',snapshot:()=>({pageBytes:16}),async create(length){state.created++;const saved=new Uint8Array(length);let disposed=false;return {
  stagingBytes:32,
  async write(source,offset,{reserve}={}){const release=reserve?.(32);try{state.writes++;await write?.(source,offset);saved.set(byteView(source),offset);}finally{release?.();}},
  readInto(target,offset,{reserve}={}){const release=reserve?.(16);try{byteView(target).set(saved.subarray(offset,offset+byteLength(target)));return target;}finally{release?.();}},
  async flush(){await flush?.();},
  dispose(){if(!disposed){disposed=true;state.disposed++;}}
 };}};
}

for(const shared of [true,false])test(`a real ${shared?'shared':'ordinary'} bank failure preserves prior data and concurrent writes at a full budget`,async t=>{
 const fault=allocationFault(t,{shared}),budget=new Budget(96);let started,finish;
 const entering=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve),disk=session({write:async()=>{started();await gate;}});
 const store=await createSegmentedBytes(64,{budget,storage:'memory',chunkBytes:16,shared,temporarySession:disk}),expected=new Uint8Array(64);
 const old=Uint8Array.of(1,3,5,7),first=Uint8Array.from({length:34},(_,i)=>100+i),second=Uint8Array.of(9,11,13);
 store.write(old,4);expected.set(old,4);assert.equal(budget.total(),budget.limit);fault.enable();
 const one=store.write(first,6);await entering;const two=store.write(second,53);let readDone=false;
 const read=store.readInto(new Uint8Array(64)).then(bytes=>{readDone=true;return bytes;});
 assert.equal(readDone,false);assert.deepEqual({...store.allocationRecovery,cause:undefined},{count:1,status:'copying',bytesPreserved:16,cause:undefined});assert.match(store.allocationRecovery.cause,/injected backing pool exhaustion/);assert.equal(store.storage,'memory');assert.equal(budget.retained,64,'RAM remains owned before storage ACK');
 finish();await Promise.all([one,two]);expected.set(first,6);expected.set(second,53);
 assert.equal(store.storage,'temporary');assert.equal(store.allocationRecovery.status,'completed');assert.equal(budget.retained,0);assert.equal(budget.active,32);assert.equal(fault.attempts,1,'No RAM trial after the useful allocation failed');
 assert.deepEqual(await store.readInto(new Uint8Array(64)),expected);await read;
 await store.write(Uint8Array.of(17),63);expected[63]=17;assert.deepEqual(await store.readInto(new Uint8Array(64)),expected);
 await store.dispose();assert.equal(disk.state.created,1);assert.equal(disk.state.disposed,1);assert.equal(budget.total(),0);assert.equal(budget.peak,96);
});

for(const failure of ['write','flush','cancel'])test(`failed ${failure} during allocation recovery preserves the complete old RAM source`,async t=>{
 const fault=allocationFault(t),budget=new Budget(96),controller=new AbortController();
 const options=failure==='flush'?{flush:()=>{throw Object.assign(Error('quota'),{code:'STORAGE_QUOTA'});}}:{write:()=>{if(failure==='cancel')controller.abort();else throw Object.assign(Error('quota'),{code:'STORAGE_QUOTA'});}};
 const disk=session(options),store=await createSegmentedBytes(64,{budget,storage:'memory',chunkBytes:16,shared:true,temporarySession:disk,signal:controller.signal}),old=Uint8Array.of(1,2,3,4),expected=new Uint8Array(64);
 store.write(old,4);expected.set(old,4);const replacement=new Uint8Array(30).fill(99);fault.enable();
 await assert.rejects(store.write(replacement,5),{code:failure==='cancel'?'CANCELLED':'STORAGE_QUOTA'});
 assert.equal(store.storage,'memory');assert.equal(store.allocationRecovery.status,'failed');assert.deepEqual(store.readInto(new Uint8Array(64)),expected,'No earlier bytes were overwritten by the failed pending write');assert.equal(budget.total(),96);assert.equal(disk.state.disposed,1);
 await store.dispose();assert.equal(budget.total(),0);
});

test('mutable SAB materialization falls back before publishing and preserves a parallel broker',async t=>{
 const fault=allocationFault(t),budget=new Budget(512),disk=session(),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory',temporarySession:disk});
 store.write(Uint8Array.of(7),3);fault.enable();const publication=await exportByteStore(store,{writable:true,budget}),reader=await readByteStore(publication.descriptor,{budget});
 try{assert.equal(publication.descriptor.kind,'broker');assert.equal(store.storage,'temporary');await reader.write(Uint8Array.of(8,9),31);await reader.flush();const out=await store.readInto(new Uint8Array(64));assert.equal(out[3],7);assert.deepEqual([...out.subarray(31,33)],[8,9]);assert.equal(fault.attempts,1);}finally{await reader.dispose();await publication.release();await store.dispose();}
 assert.equal(budget.total(),0);assert.equal(disk.state.disposed,1);
});

test('an already published mutable broker survives its backing allocation failure',async t=>{
 const fault=allocationFault(t),budget=new Budget(512),disk=session(),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory',temporarySession:disk}),publication=await exportByteStore(store,{writable:true,forceBroker:true,budget}),reader=await readByteStore(publication.descriptor,{budget});
 try{await reader.write(Uint8Array.of(3),1);fault.enable();await reader.write(Uint8Array.of(5,7),31);await reader.flush();const out=new Uint8Array(64);await reader.readInto(out);assert.equal(out[1],3);assert.deepEqual([...out.subarray(31,33)],[5,7]);assert.equal(store.storage,'temporary');assert.equal(fault.attempts,1);}finally{await reader.dispose();await publication.release();await store.dispose();}
 assert.equal(budget.total(),0);
});

test('without temporary storage allocation errors retain useful diagnostics and old bytes',async t=>{
 const fault=allocationFault(t),budget=new Budget(64),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory'});store.write(Uint8Array.of(7),0);fault.enable();
 assert.throws(()=>store.write(Uint8Array.of(1),17),error=>error.code==='MEMORY_ALLOCATION'&&/16 bytes, bank 1, 64 total bytes, 16 allocated bank bytes, shared backing; injected backing pool exhaustion/.test(error.message));assert.equal(store.readInto(new Uint8Array(1))[0],7);await store.dispose();assert.equal(budget.total(),0);
});

test('disposal waits for allocation recovery and rejects queued writes without losing ownership',async t=>{
 const fault=allocationFault(t),budget=new Budget(96);let entered,finish;
 const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>finish=resolve),disk=session({write:async()=>{entered();await gate;}}),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory',temporarySession:disk});
 store.write(Uint8Array.of(3),1);fault.enable();const one=assert.rejects(store.write(Uint8Array.of(4),17),{code:'DISPOSED'});await started;
 const two=assert.rejects(store.write(Uint8Array.of(5),33),{code:'DISPOSED'});let closed=false;const closing=store.dispose().then(()=>closed=true);
 await Promise.resolve();assert.equal(closed,false);assert.equal(budget.total(),96);finish();await Promise.all([one,two,closing]);assert.equal(disk.state.disposed,1);assert.equal(budget.total(),0);
});

test('a published direct SAB remains pinned until every worker releases it',async t=>{
 allocationFault(t);for(const mutable of [false,true]){const budget=new Budget(96),disk=session(),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory',temporarySession:disk}),pin=mutable?store.exportSharedMutable():store.exportSharedReadOnly(),error=Object.assign(Error('allocation elsewhere'),{code:'MEMORY_ALLOCATION'});
 assert.throws(()=>store.recoverAllocation(error),value=>value===error);assert.equal(store.storage,'memory');assert.equal(disk.state.created,0);pin.release();await store.dispose();assert.equal(budget.total(),0);}
});

test('allocation recovery uses its prefunded window rather than the narrow pending-write scope',async t=>{
 const fault=allocationFault(t),budget=new Budget(96),disk=session(),store=await createSegmentedBytes(64,{budget,chunkBytes:16,shared:true,storage:'memory',temporarySession:disk});let borrowed=0;
 store.write(Uint8Array.of(3),1);fault.enable();await store.write(Uint8Array.of(7),17,{reserve:bytes=>{borrowed++;assert.ok(bytes<=1,'Pending-write scope cannot hold a historical bank');return()=>{};}});
 assert.equal(borrowed,0);assert.equal(store.storage,'temporary');const out=await store.readInto(new Uint8Array(64));assert.equal(out[1],3);assert.equal(out[17],7);assert.equal(budget.peak,96);await store.dispose();assert.equal(budget.total(),0);
});
