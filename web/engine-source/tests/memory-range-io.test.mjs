import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativeRangeFixture} from './memory-range-native-fixture.js';
import {Budget} from '../src/cache.js';
import {wasmRange,byteView,closeMemoryRanges} from '../src/memory-range.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
const MiB=1024**2;
function heap(){const memory=new WebAssembly.Memory({initial:4,maximum:16}),module={HEAPU8:new Uint8Array(memory.buffer)};return{module,grow(){memory.grow(1);module.HEAPU8=new Uint8Array(memory.buffer);}};}
test('real Asyncify growth preserves native field targets, distances and comparison count',async()=>{
 const wasmBinary=await readFile(new URL('../vendor/dense-paged/dense-paged.wasm',import.meta.url)),baseline=await nativeRangeFixture({wasmBinary}),result=await nativeRangeFixture({wasmBinary,fillHeap:true});
 assert.deepEqual(result.targets,baseline.targets);assert.deepEqual(result.distances,baseline.distances);assert.deepEqual(result.comparisons,baseline.comparisons);assert.ok(result.growth.some(g=>g.pending&&g.stack.includes('allocateData')));
 await assert.rejects(nativeRangeFixture({wasmBinary,fillHeap:true,renewable:false}),{code:'MEMORY_RANGE_INVALID'});
});
for(const writable of [true,false])test(`broker ${writable?'mutable':'immutable'} read renews a multiblock destination after every await`,async()=>{
 const budget=new Budget(4*MiB),h=heap(),expected=Uint8Array.from({length:180123},(_,i)=>i*7%251),store=await createSegmentedBytes(expected.length,{budget,storage:'memory'});store.write(expected);
 let reads=0;const source={byteLength:store.byteLength,readInto(target,offset){reads++;h.grow();return store.readInto(target,offset);},write:store.write.bind(store),flush:store.flush.bind(store)},pin=await exportByteStore(source,{writable,forceBroker:true,budget}),reader=await readByteStore(pin.descriptor,{budget});
 try{await reader.readInto(wasmRange(h.module,17,expected.length));assert.deepEqual(byteView(wasmRange(h.module,17,expected.length)),expected);assert.equal(reads,3);}finally{await reader.dispose();await pin.release();await store.dispose();}assert.equal(budget.total(),0);
});
test('broker writes all blocks despite growth',async()=>{
 const budget=new Budget(4*MiB),h=heap(),expected=Uint8Array.from({length:180123},(_,i)=>i*11%251),store=await createSegmentedBytes(expected.length,{budget,storage:'memory'});h.module.HEAPU8.set(expected,17);let writes=0;
 const source={byteLength:store.byteLength,readInto:store.readInto.bind(store),write(bytes,offset){writes++;h.grow();return store.write(bytes,offset);},flush(){}},pin=await exportByteStore(source,{writable:true,forceBroker:true,budget}),reader=await readByteStore(pin.descriptor,{budget});
 try{await reader.write(wasmRange(h.module,17,expected.length));const result=new Uint8Array(expected.length);store.readInto(result);assert.deepEqual(result,expected);assert.equal(writes,3);}finally{await reader.dispose();await pin.release();await store.dispose();}assert.equal(budget.total(),0);
});
test('closing a Wasm owner during a broker read rejects the operation without publishing bytes',async()=>{
 const h=heap(),source={byteLength:4,readInto(target){closeMemoryRanges(h.module);target.fill(9);}},pin=await exportByteStore(source,{forceBroker:true}),reader=await readByteStore(pin.descriptor);
 try{await assert.rejects(reader.readInto(wasmRange(h.module,0,4)),{code:'DISPOSED'});assert.deepEqual([...h.module.HEAPU8.subarray(0,4)],[0,0,0,0]);}finally{await reader.dispose();await pin.release();}
});
test('resident segmented transfers remain synchronous with renewable ranges',async()=>{
 const budget=new Budget(MiB),store=await createSegmentedBytes(32,{budget,storage:'memory'}),h=heap();h.module.HEAPU8.fill(7,0,32);assert.equal(store.write(wasmRange(h.module,0,32)),undefined);h.grow();const target=wasmRange(h.module,64,32),result=store.readInto(target);assert.equal(result,target);assert.equal(result?.then,undefined);assert.deepEqual([...byteView(target)],Array(32).fill(7));await store.dispose();assert.equal(budget.total(),0);
});

test('shared cache renews a waiting destination and always unlocks a rejected hit',async()=>{
 const {getSharedReadCache,createSharedReadCacheClient}=await import('../src/shared-read-cache.js');
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*1024**2),manager=getSharedReadCache(budget),connection=manager.connect(),client=createSharedReadCacheClient(connection.descriptor),memory=new WebAssembly.Memory({initial:1}),m={HEAPU8:new Uint8Array(memory.buffer)};let reads=0;
 const source={byteLength:8192,async readInto(out){reads++;await Promise.resolve();memory.grow(1);m.HEAPU8=new Uint8Array(memory.buffer);byteView(out).fill(19);}},reader=client.wrap(manager.storeId(source),source),range=wasmRange(m,32,128);
 try{await reader.readInto(range,0);assert(byteView(range).every(x=>x===19));assert.equal(reads,1);closeMemoryRanges(m);assert.throws(()=>reader.readInto(range,0),{code:'DISPOSED'});const out=new Uint8Array(128);reader.readInto(out,0);assert(out.every(x=>x===19));assert.equal(reads,1,'Rejected range left the shared cache lock held');}
 finally{await client.dispose();connection.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});
