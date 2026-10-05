import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbRecompression,rgbRecompressionPlan} from '../src/jpeg-rgb-stream.js';
import {createRgbSurface} from '../src/rgb-surface.js';

const MiB=1024**2;
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function sparseSession({flush}={}){
 return {backend:'opfs',async create(){const writes=new Map();return {
  write(bytes,offset){writes.set(offset,bytes.slice());},
  readInto(target,offset){target.fill(0);for(const [at,bytes]of writes){const start=Math.max(offset,at),end=Math.min(offset+target.length,at+bytes.length);if(start<end)target.set(bytes.subarray(start-at,end-at),start-offset);}return target;},
  async flush(){await flush?.();},dispose(){writes.clear();}
 };}};
}
function observeBacking(budget,readBytes){const events=[],notify=budget.notifyBackingRelease?.bind(budget);budget.notifyBackingRelease=(kind,bytes)=>{assert.equal(readBytes(),0,'Owner references are removed before publishing backing availability');events.push({kind,bytes});notify?.(kind,bytes);};return events;}

test('lazy 576 MB cold store reports only materialized bank bytes after a committed spill',async()=>{
 const capacity=576002048,budget=new Budget(capacity+MiB),entered=gate(),ack=gate(),session=sparseSession({flush:async()=>{entered.resolve();await ack.promise;}});
 const store=await createSegmentedBytes(capacity,{budget,storage:'memory',chunkBytes:4*MiB,temporarySession:session}),events=observeBacking(budget,()=>store.allocatedBackingBytes);
 assert.equal(store.allocatedBackingBytes,0);await store.write(Uint8Array.of(37),7);store.markCold();assert.equal(store.allocatedBackingBytes,4*MiB);assert.equal(budget.retained,capacity);
 let finished=false;const reclaim=budget.reclaimAllocation(MiB,{kind:'array-buffer'}).then(bytes=>{finished=true;return bytes;});
 await entered.promise;assert.equal(finished,false);assert.equal(events.length,0);assert.equal(store.allocatedBackingBytes,4*MiB);assert.equal(budget.retained,capacity);
 ack.resolve();assert.equal(await reclaim,4*MiB);assert.equal(budget.lastAllocationReclaim.targetedReleasedBytes,4*MiB);assert.equal(budget.lastAllocationReclaim.otherAccountedBytes,0);assert.equal(store.allocatedBackingBytes,0);assert.equal(budget.retained,0);assert.deepEqual([...await store.readInto(new Uint8Array(1),7)],[37]);
 assert.deepEqual(events,[{kind:'array-buffer',bytes:4*MiB}]);await store.dispose();await store.dispose();assert.equal(events.length,1);assert.equal(budget.total(),0);
});

test('backing capacity counts exact final banks, excludes holes, and disposal waits for pins',async()=>{
 const budget=new Budget(100),store=await createSegmentedBytes(35,{budget,storage:'memory',chunkBytes:16}),events=observeBacking(budget,()=>store.allocatedBackingBytes);
 store.write(Uint8Array.of(1),34);assert.equal(store.allocatedBackingBytes,3);store.write(Uint8Array.of(2),0);assert.equal(store.allocatedBackingBytes,19);
 const pin=await store.exportReadOnly({forceBroker:true});let done=false;const disposing=store.dispose().then(()=>done=true);await Promise.resolve();assert.equal(done,false);assert.equal(events.length,0);assert.equal(budget.total(),35);
 pin.release();await disposing;await store.dispose();assert.deepEqual(events,[{kind:'array-buffer',bytes:19}]);assert.equal(store.allocatedBackingBytes,0);assert.equal(budget.total(),0);
 const empty=await createSegmentedBytes(35,{budget,storage:'memory',chunkBytes:16});await empty.dispose();assert.equal(events.length,1,'Unused logical capacity has no backing to release');assert.equal(budget.total(),0);
});

test('an aborted spill never publishes the still-owned RAM as freed backing',async()=>{
 const budget=new Budget(100),stop=new AbortController(),session=sparseSession({flush:()=>stop.abort()}),store=await createSegmentedBytes(35,{budget,storage:'memory',chunkBytes:16,temporarySession:session}),events=observeBacking(budget,()=>store.allocatedBackingBytes);
 store.write(Uint8Array.of(3),0);await assert.rejects(store.spill({signal:stop.signal}),{code:'CANCELLED'});assert.equal(store.allocatedBackingBytes,16);assert.equal(budget.total(),35);assert.equal(events.length,0);assert.deepEqual([...store.readInto(new Uint8Array(1))],[3]);
 await store.dispose();assert.deepEqual(events,[{kind:'array-buffer',bytes:16}]);assert.equal(budget.total(),0);
});

test('JPEG allocation reclamation retires actual encoded banks before unrelated Wasm credit',async()=>{
 const source={surface:{descriptor:{width:12000,height:8000}}},capacity=rgbRecompressionPlan(source.surface).encodedCapacityBytes,budget=new Budget(2*capacity+16*MiB),codec=createRgbRecompression(source,budget),stores=[];
 assert.equal(capacity,576002048);const events=[],notify=budget.notifyBackingRelease?.bind(budget);
 for(const quality of [75,90]){const store=await createSegmentedBytes(capacity,{budget,storage:'memory',chunkBytes:4*MiB});store.write(Uint8Array.of(quality));stores.push(store);await codec.retainEncoded(quality,{store,byteLength:1});}
 // The observer sees each store only after its own retirement, not another cache.
 budget.notifyBackingRelease=(kind,bytes)=>{assert.equal(stores[events.length].allocatedBackingBytes,0);events.push({kind,bytes});notify?.(kind,bytes);};
 const wasm=budget.reserve(8*MiB);let unrelated=0;const unregister=budget.registerReclaimer(()=>{unrelated++;wasm();});
 assert.equal(await budget.reclaimAllocation(MiB,{kind:'array-buffer'}),8*MiB);assert.equal(unrelated,0);assert.equal(budget.lastAllocationReclaim.targetedReleasedBytes,8*MiB);assert.equal(budget.lastAllocationReclaim.otherAccountedBytes,0);assert.equal(budget.total(),8*MiB);assert.equal(codec.hasEncoded(75),false);assert.equal(codec.hasEncoded(90),false);
 assert.deepEqual(events,[{kind:'array-buffer',bytes:4*MiB},{kind:'array-buffer',bytes:4*MiB}]);await codec.dispose();assert.equal(events.length,2);unregister();wasm();assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});

test('JPEG allocation reclaim waits for the retired encoded store transport ACK',async()=>{
 const source={surface:{descriptor:{width:16,height:16}}},budget=new Budget(MiB),codec=createRgbRecompression(source,budget),store=await createSegmentedBytes(4096,{budget,storage:'memory',chunkBytes:1024});store.write(Uint8Array.of(2));await codec.retainEncoded(75,{store,byteLength:1});
 const events=observeBacking(budget,()=>store.allocatedBackingBytes),pin=await store.exportReadOnly({forceBroker:true});let done=false;const reclaim=budget.reclaimAllocation(512,{kind:'array-buffer'}).then(bytes=>{done=true;return bytes;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);assert.equal(codec.hasEncoded(75),false);assert.equal(budget.total(),4096);assert.equal(events.length,0);
 let closed=false;const closing=codec.dispose().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false,'Disposal also waits for entries already removed by reclamation');
 pin.release();assert.equal(await reclaim,1024);await closing;assert.equal(budget.total(),0);assert.deepEqual(events,[{kind:'array-buffer',bytes:1024}]);await codec.dispose();assert.equal(events.length,1);
});

test('typed JPEG reclaim preserves the quality actively decoded by the native codec',async()=>{
 const budget=new Budget(64*MiB),data=new Uint8Array(32*32*3),surface=createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width:32,height:32,budget,ownsStore:false}),codec=createRgbRecompression({surface},budget);let checked=false;
 try{await codec.visit(90,{onBand(){}});await codec.visit(75,{async onBand(){if(checked)return;checked=true;await budget.reclaimAllocation(1,{kind:'array-buffer'});assert.equal(codec.hasEncoded(90),false);assert.equal(codec.hasEncoded(75),true);assert.equal(budget.lastAllocationReclaim.targetedReleasedBytes,rgbRecompressionPlan(surface).encodedCapacityBytes);}});assert.equal(checked,true);assert.equal((await codec.visit(75,{onBand(){}})).recompressedCache,true);}
 finally{await codec.dispose();await surface.dispose();}assert.equal(budget.total(),0);assert.equal(budget.asyncReclaimers.size,0);
});
