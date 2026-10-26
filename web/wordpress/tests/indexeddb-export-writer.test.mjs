import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Portable ownership tests: only the IDB session import is replaced. The writer,
// Blob implementation and funded Budget are real; browser IDB remains covered
// separately by the three-engine component tests.
const PAGE=1024**2;
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const code=(value,message)=>Object.assign(Error(message),{code:value});
async function fixture({finalGate,initialGate,writeGate,writeError,disposeError,maximum=Infinity}={}){
 const events=[],held=new Map(),pages=new Set();let serial=0,reads=0,created=0,disposals=0,disposed=false;
 const reserve=async bytes=>{
  events.push(['request',bytes]);if(bytes===3*PAGE&&initialGate)await initialGate.promise;
  if(bytes!==3*PAGE&&finalGate){finalGate.entered.resolve();await finalGate.promise;}
  if(bytes>maximum)throw code('MEMORY_LIMIT','Fixture effective admission refused.');
  const id=++serial;held.set(id,bytes);events.push(['admit',bytes]);let retired=false;
  return async()=>{assert.equal(retired,false,'Underlying lease retires once');retired=true;assert(held.has(id));held.delete(id);events.push(['release',bytes]);};
 };
 const createIndexedDbSession=async({budget,pageBytes,readCache})=>{
  created++;assert.equal(pageBytes,PAGE);assert.equal(readCache,false);assert.equal([...held.values()].reduce((a,b)=>a+b,0),3*PAGE,'Real admission callback completed before storage creation');
  return{id:'portable-owned-idb',async create(length){assert.equal(length,PAGE);const data=new Uint8Array(length);pages.add(data);return{
   async write(bytes,offset){const release=budget.reserve(2*PAGE);try{if(writeGate){writeGate.entered.resolve();await writeGate.promise;}if(writeError)throw writeError;data.set(bytes,offset);}finally{release();}},
   async readInto(target){reads++;const release=budget.reserve(PAGE);try{target.set(data.subarray(0,target.length));}finally{release();}}
  };},async dispose(){if(disposed)return;disposed=true;disposals++;pages.clear();events.push(['dispose']);if(disposeError)throw disposeError;}};
 };
 const key='__idbExportFixture'+crypto.randomUUID().replaceAll('-',''),url=new URL(import.meta.resolve('../sherloq-browser/assets/indexeddb-export-writer.js'));
 globalThis[key]={createIndexedDbSession};
 try{
  const stub='data:text/javascript;base64,'+Buffer.from('export const createIndexedDbSession=globalThis['+JSON.stringify(key)+'].createIndexedDbSession;').toString('base64');
  let source=await readFile(url,'utf8');
  source=source.replace("from './unified-engine/src/indexeddb-storage.js'",'from '+JSON.stringify(stub)).replace("from './unified-engine/src/cache.js'",'from '+JSON.stringify(import.meta.resolve('../sherloq-browser/assets/unified-engine/src/cache.js')));
  const{createIndexedDbExportWriter}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  return{create:options=>createIndexedDbExportWriter({reserve,...options}),events,held,get reads(){return reads;},get created(){return created;},get disposals(){return disposals;},get retainedPages(){return pages.size;}};
 }finally{delete globalThis[key];}
}

test('cross-page backpatch is exact; IO retires before transfer and final N lease lasts until cleanup',async()=>{
 const f=await fixture(),writer=await f.create({mime:'application/test'});await writer.write(new Uint8Array(PAGE).fill(1));await writer.write(Uint8Array.of(2,3,4,5));await writer.write({type:'write',position:PAGE-2,data:Uint8Array.of(6,7,8,9)});await writer.close();const artifact=await writer.finish();
 assert.equal(artifact.storage,'indexeddb');assert.equal(artifact.blob.type,'application/test');assert.equal(artifact.blob.size,PAGE+4);assert.deepEqual(new Uint8Array(await artifact.blob.slice(PAGE-3).arrayBuffer()),Uint8Array.of(1,6,7,8,9,4,5));assert.deepEqual([...f.held.values()],[PAGE+4]);assert.equal(f.retainedPages,0);assert.equal(f.disposals,1);assert(writer.state.stagingPeakBytes<=2*PAGE);
 await artifact.cleanup();await artifact.cleanup();await writer.abort();assert.equal(f.held.size,0);assert.deepEqual(f.events.filter(e=>e[0]==='release').map(e=>e[1]),[3*PAGE,PAGE+4]);
});

test('abort joins delayed final admission and retires its late lease before resolving',async()=>{
 const gate=deferred();gate.entered=deferred();const f=await fixture({finalGate:gate}),writer=await f.create();await writer.write(Uint8Array.of(1,2,3));const pending=writer.finish();const observed=pending.catch(error=>error);await gate.entered.promise;const primary=code('CANCELLED','Fixture abort'),aborting=writer.abort(primary);assert.deepEqual([...f.held.values()],[3*PAGE]);assert.equal(f.disposals,0);gate.resolve();assert.equal(await observed,primary);await aborting;assert.equal(f.held.size,0);assert.equal(f.disposals,1);assert.deepEqual(f.events.filter(e=>e[0]==='release').map(e=>e[1]),[3,3*PAGE]);
});

test('final admission refusal happens before any page read or final Blob construction',async()=>{
 const f=await fixture({maximum:4*PAGE}),writer=await f.create();await writer.seek(8*PAGE);await writer.write(Uint8Array.of(1));await assert.rejects(writer.finish(),{code:'MEMORY_LIMIT'});assert.equal(f.reads,0);assert.equal(f.held.size,0);assert.equal(f.retainedPages,0);assert.equal(f.disposals,1);
});

test('abort acknowledges a pending write before disposing its storage or IO admission',async()=>{
 const gate=deferred();gate.entered=deferred();const f=await fixture({writeGate:gate}),writer=await f.create(),pending=writer.write(Uint8Array.of(1)),observed=pending.catch(error=>error);await gate.entered.promise;const primary=code('CANCELLED','Fixture write abort'),aborting=writer.abort(primary);assert.equal(f.disposals,0);assert.deepEqual([...f.held.values()],[3*PAGE]);gate.resolve();assert.equal(await observed,primary);await aborting;assert.equal(f.held.size,0);assert.equal(f.disposals,1);assert.equal(f.retainedPages,0);
});

test('quota stays the primary failure when storage cleanup also fails; IO still retires',async()=>{
 const primary=code('STORAGE_QUOTA','Fixture quota'),cleanup=code('STORAGE_IO','Fixture deletion'),f=await fixture({writeError:primary,disposeError:cleanup}),writer=await f.create();await assert.rejects(writer.write(Uint8Array.of(1)),error=>error===primary);assert.equal(primary.cleanupFailures[0].code,'STORAGE_IO');assert.equal(f.held.size,0);assert.equal(f.disposals,1);assert.equal(f.retainedPages,0);
});

test('aborted constructor retires a late initial admission without creating storage',async()=>{
 const gate=deferred(),f=await fixture({initialGate:gate}),controller=new AbortController(),pending=f.create({signal:controller.signal}),observed=pending.catch(error=>error),primary=code('CANCELLED','Fixture constructor abort');controller.abort(primary);gate.resolve();assert.equal(await observed,primary);assert.equal(f.created,0);assert.equal(f.held.size,0);assert.deepEqual(f.events.filter(e=>e[0]==='release').map(e=>e[1]),[3*PAGE]);
});
