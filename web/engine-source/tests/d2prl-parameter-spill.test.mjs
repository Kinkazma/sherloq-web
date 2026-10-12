import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
import {byteView} from '../src/memory-range.js';
import {EngineError,checkAbort} from '../src/errors.js';
import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
const MiB=1024**2;
function fixture(length=256){const data=Uint8Array.from({length},(_,i)=>(i*11)%251),sha256=createHash('sha256').update(data).digest('hex');return{data,spec:{file:'assets/'+sha256+'.bin',sha256,bytes:length,dtype:'float32',shape:[length/4]}};}
function gate(){let enter,finish;return{entered:new Promise(resolve=>enter=resolve),pending:new Promise(resolve=>finish=resolve),enter:()=>enter(),finish:()=>finish()};}
// Deliberately fake browser storage. It exercises byte/I/O/ownership contracts,
// with synthetic page staging; it does not qualify OPFS, IndexedDB or disk RAM.
function fakeStorage(options={}){
 const stats={sessions:0,arraysCreated:0,arraysDisposed:0,sessionsDisposed:0,maxWriteBytes:0,maxReadBytes:0},arrays=new Set(),foreign=new Uint8Array([9,8,7]);let blocked=false,readBlocked=false;
 const factory=async({signal,pageBytes})=>{
  checkAbort(signal);if(options.unavailable)throw new EngineError('STORAGE_UNAVAILABLE','Fake unavailable');stats.sessions++;
  let closed=false;return{backend:'indexeddb',snapshot:()=>({fake:true,pageBytes,reservedBytes:[...arrays].reduce((sum,array)=>sum+array.data.length,0)}),
   async create(length){if(options.quota)throw new EngineError('STORAGE_QUOTA','Fake quota');const value={data:new Uint8Array(length)};arrays.add(value);stats.arraysCreated++;
    return{byteLength:length,stagingBytes:2*Math.min(pageBytes,length),
     async write(source,offset,{reserve}={}){const bytes=byteView(source),release=reserve(2*Math.min(pageBytes,length));try{stats.maxWriteBytes=Math.max(stats.maxWriteBytes,bytes.length);if(options.writeGate&&!blocked){blocked=true;options.writeGate.enter();await options.writeGate.pending;}if(options.writeIo)throw new EngineError('STORAGE_IO','Fake write failure');value.data.set(bytes,offset);if(options.corruptWrite)value.data[offset]^=1;}finally{release();}},
     async readInto(target,offset,{reserve}={}){const release=reserve(Math.min(pageBytes,length));try{const bytes=byteView(target);stats.maxReadBytes=Math.max(stats.maxReadBytes,bytes.length);if(options.readGate&&options.armReadGate&&!readBlocked){readBlocked=true;options.readGate.enter();await options.readGate.pending;}if(options.readIo)throw new EngineError('STORAGE_IO','Fake read failure');bytes.set(value.data.subarray(offset,offset+bytes.length));return target;}finally{release();}},
     flush(){},async dispose(){if(options.deleteIo)throw new EngineError('STORAGE_IO','Fake delete failure');if(!arrays.delete(value))return;stats.arraysDisposed++;}
    };
   },async dispose(){if(closed)return;closed=true;stats.sessionsDisposed++;arrays.clear();if(options.closeIo)throw new EngineError('STORAGE_IO','Fake session close failure');}
  };
 };
 return{factory,stats,arrays,foreign};
}
function setup(options={},settings={}){const item=fixture(),budget=settings.budget??new Budget(32*MiB),storage=fakeStorage(options),requests=[];const store=createParameterStore({budget,arena:settings.arena,spill:true,spillWindowBytes:64,temporarySessionFactory:storage.factory,assetBaseUrl:'https://model/',fetchAsset:async()=>{requests.push(1);return new Response(item.data);}});return{item,budget,storage,requests,store};}
async function loadIdle(context){const lease=await context.store.acquire(context.item.spec,{retain:true}),view=lease.data;lease.release();context.budget.setLimit(context.budget.total()+256*1024);return view;}
async function pressure(context,{signal}={}){
 assert.throws(()=>context.budget.reserve(4*MiB),{code:'MEMORY_LIMIT'},'A useful admission really fails before any fake storage opens');
 const release=context.budget.beginRecovery({owner:'parameter-spill-test',kind:'wasm',requestedBytes:4*MiB});
 try{return await context.budget.reclaim(4*MiB,{signal,owner:'parameter-spill-test'});}finally{release();}
}
const exact=(lease,item)=>assert.deepEqual(new Uint8Array(lease.data.buffer,lease.byteOffset,lease.byteLength),item.data);

test('no-pressure parameter spill path remains lazy and releases legacy accounting synchronously',async()=>{
 const context=setup(),lease=await context.store.acquire(context.item.spec,{retain:true});lease.release();assert.equal(context.storage.stats.sessions,0);assert.equal(context.store.snapshot().spill.sessionsCreated,0);assert.equal(context.store.dispose(),undefined);assert.equal(context.budget.total(),0);
});

test('fake storage spills only after refused admission and republishes exact verified bytes in bounded windows',async()=>{
 const context=setup();let lease;
 try{
  await loadIdle(context);assert.equal(context.storage.stats.sessions,0);assert.ok(await pressure(context)>=16*MiB);
  const spilled=context.store.snapshot();assert.equal(spilled.residentBytes,0);assert.equal(spilled.spilledEntries,1);assert.equal(spilled.spill.storedBytes,256);assert.equal(spilled.spill.spillReadbackBytes,256);
  lease=await context.store.acquire(context.item.spec,{retain:true});exact(lease,context.item);assert.equal(context.requests.length,1);assert.equal(context.store.snapshot().spill.rehydratedBytes,256);assert.ok(context.storage.stats.maxWriteBytes<=64);assert.ok(context.storage.stats.maxReadBytes<=64);assert.ok(context.budget.total()<=context.budget.limit);
 }finally{lease?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);assert.equal(context.storage.arrays.size,0);assert.equal(context.storage.stats.sessionsDisposed,1);assert.deepEqual(context.storage.foreign,new Uint8Array([9,8,7]));
});

for(const mode of ['unavailable','quota','writeIo','readIo','corruptWrite'])test(`fake ${mode} spill failure preserves useful work by retiring only idle cache and verified refetch`,async()=>{
 const context=setup({[mode]:true});let lease;
 try{
  await loadIdle(context);assert.ok(await pressure(context)>0);assert.equal(context.store.snapshot().entries,0);assert.equal(context.store.snapshot().storageFallbacks,1);assert.equal(context.store.snapshot().lastStorageFallback.phase,'spill');
  lease=await context.store.acquire(context.item.spec,{retain:true});exact(lease,context.item);assert.equal(context.requests.length,2);assert.equal(context.store.snapshot().spill.storedBytes,0);
 }finally{lease?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);assert.equal(context.storage.arrays.size,0);assert.deepEqual(context.storage.foreign,new Uint8Array([9,8,7]));
});

test('fake disk corruption after spill never publishes the candidate and falls back to pinned verified bytes',async()=>{
 const context=setup();let lease;
 try{
  await loadIdle(context);await pressure(context);[...context.storage.arrays][0].data[17]^=1;
  lease=await context.store.acquire(context.item.spec,{retain:true});exact(lease,context.item);assert.equal(context.requests.length,2);assert.equal(context.store.snapshot().lastStorageFallback.code,'STORAGE_INTEGRITY');assert.equal(context.store.snapshot().lastStorageFallback.phase,'rehydrate');assert.equal(context.store.snapshot().spill.rehydratedBytes,0);assert.equal(context.store.snapshot().spill.storedBytes,0);
 }finally{lease?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);
});

test('fake spill cancellation before publication retains the old RAM and removes only its incomplete candidate',async()=>{
 const hold=gate(),context=setup({writeGate:hold}),controller=new AbortController();let lease;
 try{
  const view=await loadIdle(context),pending=pressure(context,{signal:controller.signal}),rejected=assert.rejects(pending,{code:'CANCELLED'});await hold.entered;assert.equal(context.store.snapshot().verifiedTensorBytes,256);controller.abort();hold.finish();await rejected;
  assert.equal(context.store.snapshot().verifiedTensorBytes,256);assert.equal(context.store.snapshot().spill.storedBytes,0);assert.equal(context.storage.arrays.size,0);
  lease=await context.store.acquire(context.item.spec,{retain:true});assert.equal(lease.data,view);exact(lease,context.item);assert.equal(context.requests.length,1);
 }finally{hold.finish();lease?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);
});

test('a live lease stays pinned under fake pressure and a new consumer waits for independent migration IO',async()=>{
 const hold=gate(),context=setup({writeGate:hold});let live,reloaded;
 try{
  live=await context.store.acquire(context.item.spec,{retain:true});context.budget.setLimit(context.budget.total()+256*1024);assert.equal(await pressure(context),0);assert.equal(context.storage.stats.sessions,0);exact(live,context.item);live.release();live=null;
  const pending=pressure(context);await hold.entered;let published=false;const acquiring=context.store.acquire(context.item.spec,{retain:true}).then(value=>{published=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(published,false);assert.equal(context.store.snapshot().liveLeaseCount,0);
  hold.finish();await pending;reloaded=await acquiring;exact(reloaded,context.item);assert.equal(context.requests.length,1);assert.equal(context.store.snapshot().liveLeaseCount,1);
 }finally{hold.finish();live?.release();reloaded?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);assert.equal(context.storage.arrays.size,0);
});

test('a refused rehydration allocation preserves verified fake storage for an explicit exact resume',async()=>{
 const budget=new Budget(32*MiB);let refuse=false;const arena=createWasmTensorArena({budget,memoryFactory:descriptor=>{if(refuse)throw new RangeError('WebAssembly.Memory(): could not allocate memory');return new WebAssembly.Memory(descriptor);}}),context=setup({}, {budget,arena});let lease;
 try{
  await loadIdle(context);await pressure(context);refuse=true;await assert.rejects(context.store.acquire(context.item.spec,{retain:true}),{code:'MEMORY_ALLOCATION'});assert.equal(context.store.snapshot().spilledEntries,1);assert.equal(context.store.snapshot().liveLeaseCount,0);assert.equal(context.store.snapshot().verifiedTensorBytes,0);
  refuse=false;lease=await context.store.acquire(context.item.spec,{retain:true});exact(lease,context.item);assert.equal(context.requests.length,1);
 }finally{lease?.release();await context.store.dispose();arena.dispose();}
 assert.equal(budget.total(),0);
});

test('fake rehydration cancellation publishes no pointer and keeps its committed spill readable',async()=>{
 const hold=gate(),options={readGate:hold},context=setup(options),controller=new AbortController();let lease;
 try{
  await loadIdle(context);await pressure(context);options.armReadGate=true;const pending=context.store.acquire(context.item.spec,{retain:true,signal:controller.signal}),rejected=assert.rejects(pending,{code:'CANCELLED'});await hold.entered;assert.equal(context.store.snapshot().liveLeaseCount,0);controller.abort();hold.finish();await rejected;
  assert.equal(context.store.snapshot().spilledEntries,1);assert.equal(context.store.snapshot().verifiedTensorBytes,0);
  lease=await context.store.acquire(context.item.spec,{retain:true});exact(lease,context.item);assert.equal(context.store.snapshot().liveLeaseCount,1);assert.equal(context.store.snapshot().spill.rehydratedBytes,256);assert.equal(context.requests.length,1);
 }finally{hold.finish();lease?.release();await context.store.dispose();}
 assert.equal(context.budget.total(),0);
});

test('disposing during fake migration waits for IO settlement and retires its RAM and session once',async()=>{
 const hold=gate(),context=setup({writeGate:hold});let closing;
 try{
  await loadIdle(context);const pending=pressure(context),rejected=assert.rejects(pending,error=>['CANCELLED','DISPOSED'].includes(error.code));await hold.entered;closing=context.store.dispose();assert.equal(context.store.dispose(),closing);assert.ok(context.budget.total()>0);hold.finish();await rejected;await closing;
 }finally{hold.finish();await closing;}
 assert.equal(context.budget.total(),0);assert.equal(context.storage.stats.sessionsDisposed,1);assert.equal(context.storage.arrays.size,0);assert.equal(context.budget.resources.operations.size,0);
});

for(const mode of ['deleteIo','closeIo'])test(`fake ${mode} cleanup failure remains observable while owned workspace accounting is released`,async()=>{
 const context=setup({[mode]:true});await loadIdle(context);await pressure(context);const closing=context.store.dispose();assert.equal(context.store.dispose(),closing);await assert.rejects(closing,{code:'STORAGE_IO'});assert.equal(context.budget.total(),0);assert.equal(context.storage.arrays.size,0);assert.deepEqual(context.storage.foreign,new Uint8Array([9,8,7]));
});

test('two fake parameter spill owners share one charged migration workspace per Budget',async()=>{
 const budget=new Budget(64*MiB),first=setup({}, {budget}),second=setup({}, {budget});let live,reloaded;
 try{
  const idle=await first.store.acquire(first.item.spec,{retain:true});idle.release();live=await second.store.acquire(second.item.spec,{retain:true});budget.setLimit(budget.total()+256*1024);await pressure(first);live.release();live=null;budget.setLimit(budget.total()+256*1024);await pressure(second);
  const a=first.store.snapshot().spill,b=second.store.snapshot().spill;assert.equal(a.ownedWorkspacePolicyBytes,192);assert.equal(b.ownedWorkspacePolicyBytes,0);assert.equal(a.sharedWindowCapacityBytes,192);assert.equal(b.sharedWindowCapacityBytes,192);assert.equal(budget.total(),192);
  await first.store.dispose();assert.equal(budget.total(),192,'The second owner keeps the one common workspace alive');budget.setLimit(64*MiB);reloaded=await second.store.acquire(second.item.spec,{retain:true});exact(reloaded,second.item);assert.equal(second.requests.length,1);assert.equal(second.storage.stats.sessionsDisposed,0);
 }finally{live?.release();reloaded?.release();await first.store.dispose();await second.store.dispose();}
 assert.equal(budget.total(),0);assert.equal(first.storage.stats.sessionsDisposed,1);assert.equal(second.storage.stats.sessionsDisposed,1);
});
