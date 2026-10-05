import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
self.onmessage=async({data:{backend}})=>{
 const budget=new Budget(4*1024**2),chunkBytes=65536,byteLength=4*chunkBytes,Native=globalThis.SharedArrayBuffer;
 let session,store,failed=false,attempts=0,result,failure;const pins=[],readers=[];
 try{
  session=await createTemporarySession({budget,backend,readCache:false});
  store=await createSegmentedBytes(byteLength,{budget,storage:'memory',chunkBytes,shared:true,temporarySession:session});
  const expected=new Uint8Array(byteLength),initial=Uint8Array.from({length:chunkBytes},(_,i)=>(i*13+11)%251),pending=Uint8Array.from({length:chunkBytes+19},(_,i)=>(i*17+5)%251);
  await store.write(initial);expected.set(initial);
  globalThis.SharedArrayBuffer=new Proxy(Native,{construct(target,args){if(args[0]===chunkBytes){attempts++;throw new RangeError('injected browser backing-pool failure');}return Reflect.construct(target,args);}});
  const work=[store.write(pending,32761)];expected.set(pending,32761);
  for(let i=0;i<10;i++){const bytes=new Uint8Array(1000).fill(i+71),offset=2*chunkBytes+i*1000;work.push(store.write(bytes,offset));expected.set(bytes,offset);}
  await Promise.all(work);await store.flush();assert(store.storage==='temporary','No transactional fallback');assert(attempts===1,'A useful RAM allocation was retried');assert(store.allocationRecovery.status==='completed','No completed recovery telemetry');assert(same(await store.readInto(new Uint8Array(byteLength)),expected),'Concurrent recovery lost bytes');
  // Two simultaneous immutable readers exercise direct Chromium OPFS handles
  // or the portable broker; the same descriptor store feeds parallel kernels.
  for(let i=0;i<2;i++){const pin=await exportByteStore(store,{budget});pins.push(pin);readers.push(await readByteStore(pin.descriptor,{budget}));}
  await Promise.all(readers.map(async reader=>assert(same(await reader.readInto(new Uint8Array(byteLength)),expected),'Parallel recovered read changed bytes')));
  result={backend:session.backend,passed:true,concurrentWriters:11,immutableReaders:2,transports:pins.map(pin=>pin.descriptor.kind),allocationAttempts:attempts,recovery:store.allocationRecovery};
  for(const reader of readers)await reader.dispose();readers.length=0;for(const pin of pins)await pin.release();pins.length=0;await store.dispose();store=null;
  assert(budget.total()===0,'Recovered store left a reservation');assert(session.snapshot().reservedBytes===0,'Recovered store left files');
  // A cancellation after the first actual backend write must retain RAM and
  // delete the incomplete file, including on IndexedDB's asynchronous path.
  globalThis.SharedArrayBuffer=Native;const stop=new AbortController(),originalCreate=session.create.bind(session);
  store=await createSegmentedBytes(byteLength,{budget,storage:'memory',chunkBytes,shared:true,temporarySession:session,signal:stop.signal});await store.write(initial);
  session.create=async(...args)=>{const file=await originalCreate(...args);return {...file,async write(...values){await file.write(...values);stop.abort();}};};
  globalThis.SharedArrayBuffer=new Proxy(Native,{construct(target,args){if(args[0]===chunkBytes)throw new RangeError('injected browser backing-pool failure');return Reflect.construct(target,args);}});
  try{await store.write(pending,32761);}catch(error){failed=error.code==='CANCELLED';}assert(failed&&store.storage==='memory','Cancelled migration lost RAM owner');const old=new Uint8Array(byteLength);old.set(initial);assert(same(store.readInto(new Uint8Array(byteLength)),old),'Cancelled write changed previously completed bytes');
  await store.dispose();store=null;assert(budget.total()===0,'Cancelled recovery leaked memory');assert(session.snapshot().reservedBytes===0,'Cancelled recovery leaked files');await session.dispose();session=null;
  result={...result,cancellationPreserved:true,budgetFinal:budget.total()};
 }catch(error){failure={code:error.code,message:error.message,stack:error.stack};}
 finally{globalThis.SharedArrayBuffer=Native;for(const reader of readers)await reader.dispose();for(const pin of pins)await pin.release();await store?.dispose();await session?.dispose();}
 self.postMessage(failure?{error:failure}:{result});
};
