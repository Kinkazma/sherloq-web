import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {sharedSegmentedReader} from '../src/shared-segmented-reader.js';

function temporary({failWrite,afterRead}={}){
 const state={created:0,disposed:0,written:0};
 return {state,async create(length){state.created++;const data=new Uint8Array(length);return {
  write(source,offset){if(failWrite?.())throw Object.assign(new Error('quota'),{code:'STORAGE_QUOTA'});data.set(source,offset);state.written+=source.length;},
  readInto(target,offset){target.set(data.subarray(offset,offset+target.length));afterRead?.();return target;},
  flush(){},dispose(){state.disposed++;}
 };}};
}
function isolated(t,value=true){const before=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');Object.defineProperty(globalThis,'crossOriginIsolated',{configurable:true,value});t.after(()=>{if(before)Object.defineProperty(globalThis,'crossOriginIsolated',before);else delete globalThis.crossOriginIsolated;});}

test('segmented migration preserves sparse holes, seams and ownership without a second RAM image',async()=>{
 // One payload plus its two-page migration window and one bank fit; two payloads do not.
 const budget=new Budget(201*3+17),session=temporary(),store=await createSegmentedBytes(201,{budget,chunkBytes:17,temporarySession:session});
 assert.equal(store.storage,'memory');assert.equal(budget.active,402);
 const expected=new Uint8Array(201);expected.set([2,7,11,19,31],15);expected.set([83,91],198);store.write(expected.subarray(15,20),15);store.write(expected.subarray(198,200),198);
 assert.equal(await store.spill(),true);assert.equal(store.storage,'temporary');assert.equal(budget.retained,0);assert.equal(session.state.written,48);
 assert.deepEqual(await store.readInto(new Uint8Array(201)),expected);assert.equal(await store.spill(),false);
 assert.equal(await store.promote(),true);assert.equal(store.storage,'memory');assert.equal(budget.retained,201);assert.equal(session.state.disposed,1);assert.deepEqual(store.readInto(new Uint8Array(201)),expected);assert.ok(budget.peak<=budget.limit);
 await store.dispose();assert.equal(budget.total(),0);assert.equal(session.state.disposed,1);
});

test('failed spill and cancelled promotion preserve the authoritative source and release destination memory',async()=>{
 const budget=new Budget(1024),cancel=new AbortController(),session=temporary({failWrite:()=>true}),source=await createSegmentedBytes(91,{budget,chunkBytes:16,temporarySession:session});source.write(Uint8Array.of(19,43),17);
 await assert.rejects(source.spill(),{code:'STORAGE_QUOTA'});assert.equal(source.storage,'memory');assert.equal(budget.retained,91);assert.deepEqual(source.readInto(new Uint8Array(2),17),Uint8Array.of(19,43));assert.equal(session.state.disposed,1);await source.dispose();
 const disk=await createSegmentedBytes(91,{budget,chunkBytes:16,storage:'temporary',temporarySession:temporary({afterRead:()=>cancel.abort()})});await disk.write(Uint8Array.of(19,43),17);
 await assert.rejects(disk.promote({signal:cancel.signal}),{code:'CANCELLED'});assert.equal(disk.storage,'temporary');assert.equal(budget.total(),0);assert.deepEqual(await disk.readInto(new Uint8Array(2),17),Uint8Array.of(19,43));await disk.dispose();
});

test('a shared read lease freezes writes and migration, pins disposal, and is read by another worker without cloning banks',async t=>{
 isolated(t);const budget=new Budget(1024),store=await createSegmentedBytes(91,{budget,chunkBytes:16,shared:true});store.write(Uint8Array.of(1,7,21,99),14);
 const first=store.exportSharedReadOnly(),second=store.exportSharedReadOnly();assert.ok(first.descriptor.segments.every(([,bank])=>bank instanceof SharedArrayBuffer));assert.equal(first.descriptor.segments[0][1],second.descriptor.segments[0][1]);
 const local=sharedSegmentedReader(first.descriptor);assert.deepEqual(local.readInto(new Uint8Array(8),12),Uint8Array.of(0,0,1,7,21,99,0,0));
 const moduleUrl=new URL('../src/shared-segmented-reader.js',import.meta.url).href;
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.on('message',async d=>{const {sharedSegmentedReader}=await import(${JSON.stringify(moduleUrl)});const out=sharedSegmentedReader(d).readInto(new Uint8Array(d.byteLength));parentPort.postMessage(out,[out.buffer]);});`,{eval:true});
 try{const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(first.descriptor);});assert.deepEqual(result,store.readInto(new Uint8Array(91)));}finally{await worker.terminate();}
 assert.throws(()=>store.write(Uint8Array.of(0)),{code:'BUSY'});assert.throws(()=>store.spill(),{code:'BUSY'});
 await local.dispose();await local.dispose();assert.throws(()=>local.readInto(new Uint8Array(1)),{code:'DISPOSED'});
 let disposed=false;const closing=store.dispose().then(()=>{disposed=true;});await Promise.resolve();assert.equal(disposed,false);assert.equal(budget.retained,91);first.release();first.release();assert.equal(first.descriptor.segments.length,0);await Promise.resolve();assert.equal(disposed,false);second.release();await closing;assert.equal(budget.total(),0);
});

test('shared storage has an ordinary memory fallback and validates bank descriptors',async t=>{
 isolated(t,false);const budget=new Budget(1024),store=await createSegmentedBytes(20,{budget,shared:true});store.write(Uint8Array.of(3));assert.equal(store.shared,false);assert.equal(store.exportSharedReadOnly(),null);await store.dispose();assert.equal(budget.total(),0);
 assert.throws(()=>sharedSegmentedReader({byteLength:8,chunkBytes:4,segments:[[0,new SharedArrayBuffer(3)]]}),{code:'INVALID_INPUT'});
 assert.throws(()=>sharedSegmentedReader({byteLength:8,chunkBytes:4,segments:[[0,new SharedArrayBuffer(4)],[0,new SharedArrayBuffer(4)]]}),{code:'INVALID_INPUT'});
});

test('migration cannot race outstanding temporary I/O and disposal waits before deleting its backing',async()=>{
 let finish,deleted=false;const budget=new Budget(1024),store=await createSegmentedBytes(20,{budget,storage:'temporary',temporarySession:{async create(){return {readInto(target){return new Promise(resolve=>{finish=()=>resolve(target);});},dispose(){deleted=true;}};}}});
 const read=store.readInto(new Uint8Array(20));assert.throws(()=>store.promote(),{code:'BUSY'});const closing=store.dispose();await Promise.resolve();assert.equal(deleted,false);finish();await read;await closing;assert.equal(deleted,true);assert.equal(budget.total(),0);
});
