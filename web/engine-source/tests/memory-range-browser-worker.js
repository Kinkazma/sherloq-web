import {nativeRangeFixture} from './memory-range-native-fixture.js';
import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {wasmRange,byteView,closeMemoryRanges} from '../src/memory-range.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
self.onmessage=async({data:{backend}})=>{
 let session,store,pin,reader;const budget=new Budget(16*1024**2);
 try{
  const baseline=await nativeRangeFixture(),renewed=await nativeRangeFixture({fillHeap:true});
  assert(same(baseline.targets,renewed.targets)&&same(baseline.distances,renewed.distances)&&same(baseline.comparisons,renewed.comparisons),'Asyncify growth changed scientific result');
  assert(renewed.growth.some(event=>event.pending&&event.stack.includes('allocateData')),'No real Asyncify stack allocation growth');
  let legacy;try{await nativeRangeFixture({fillHeap:true,renewable:false});}catch(error){legacy=error.code;}assert(legacy==='MEMORY_RANGE_INVALID','Legacy fixture did not reject its stale view');
  const size=2*1024**2+777,offset=17,memory=new WebAssembly.Memory({initial:96}),module={HEAPU8:new Uint8Array(memory.buffer)},grow=()=>{memory.grow(1);module.HEAPU8=new Uint8Array(memory.buffer);};
  const source=wasmRange(module,0,size),target=wasmRange(module,3*1024**2,size),expected=Uint8Array.from({length:size},(_,i)=>(i*17+23)%251);byteView(source).set(expected);
  session=await createTemporarySession({budget,backend,readCache:false});store=await session.create(size+offset+19);
  const writing=store.write(source,offset);grow();await writing;await store.flush();
  const reading=store.readInto(target,offset);grow();await reading;assert(same(byteView(target),expected),'Multiblock temporary range copy changed bytes');
  // The immutable publication races OPFS seal/reopen or IDB broker RPC.
  const publishing=exportByteStore(store,{budget,forceBroker:backend==='indexeddb'});const duringSeal=store.readInto(target,offset);grow();await duringSeal;pin=await publishing;reader=await readByteStore(pin.descriptor,{budget});
  byteView(target).fill(0);const borrowed=reader.readInto(target,offset);grow();await borrowed;assert(same(byteView(target),expected),'Published range copy changed bytes');
  await reader.dispose();reader=null;await pin.release();pin=null;await store.dispose();store=null;await session.dispose();session=null;closeMemoryRanges(module);assert(budget.total()===0,'Range test leaked reservations');
  self.postMessage({result:{backend,passed:true,asyncifyGrowthEvents:renewed.growth.length,legacyRejected:legacy,comparedBytes:size,budgetFinal:budget.total()}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
 finally{await reader?.dispose();await pin?.release();await store?.dispose();await session?.dispose();}
};
