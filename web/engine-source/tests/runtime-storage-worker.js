import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {sharedSegmentedReader} from '../src/shared-segmented-reader.js';
self.onmessage=async({data:{backend}})=>{
 const budget=new Budget(8*1024**2);let session,store,phase='session';
 try{
  session=await createTemporarySession({budget,backend});const selectedBackend=session.backend;store=await createSegmentedBytes(256*1024+19,{budget,chunkBytes:65536,shared:true,temporarySession:session});
  const pattern=new Uint8Array(131);for(let i=0;i<pattern.length;i++)pattern[i]=(i*39+17)&255;await store.write(pattern,65500);
  const expectedShared=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function',lease=store.exportSharedReadOnly();if(!!lease!==expectedShared)throw Error('Shared capability fallback');
  if(lease){const shared=sharedSegmentedReader(lease.descriptor).readInto(new Uint8Array(131),65500);if(shared.some((x,i)=>x!==pattern[i]))throw Error('Shared bank bytes');lease.release();}
  phase='spill';await store.spill();if(store.storage!=='temporary'||budget.retained)throw Error('Spill ownership');const spilled=new Uint8Array(131);await store.readInto(spilled,65500);if(spilled.some((x,i)=>x!==pattern[i]))throw Error('Spill bytes');
  phase='promote';await store.promote();if(store.storage!=='memory'||store.shared!==expectedShared)throw Error('Promotion ownership');const promoted=store.readInto(new Uint8Array(131),65500);if(promoted.some((x,i)=>x!==pattern[i]))throw Error('Promotion bytes');
  await store.dispose();store=null;
  let completePageWrites=false;
  if(backend==='indexeddb'){
   const raw=await session.create(1024**2+17),source=new Uint8Array(2*1024**2+51);source.fill(71);const view=source.subarray(31,31+1024**2+17);await raw.write(view,0);source.fill(0);const tail=new Uint8Array(39);await raw.readInto(tail,1024**2-22);if(tail.some(x=>x!==71))throw Error('Complete IDB page or final partial page changed');await raw.write(Uint8Array.of(8,19),1024**2-1);await raw.readInto(tail,1024**2-22);if(tail[21]!==8||tail[22]!==19||tail.filter((_,i)=>i!==21&&i!==22).some(x=>x!==71))throw Error('Partial write after complete page changed unrelated bytes');await raw.dispose();completePageWrites=true;
  }
  phase='cancelled-spill';const spillCancel=new AbortController(),before=session.snapshot().reservedBytes;
  const interruptedSession={async create(length,options){const raw=await session.create(length,options);return {...raw,async write(bytes,offset){await raw.write(bytes,offset);spillCancel.abort();}};}};
  store=await createSegmentedBytes(257,{budget,chunkBytes:64,shared:true,temporarySession:interruptedSession});await store.write(pattern,19);let cancellation;
  try{await store.spill({signal:spillCancel.signal});}catch(e){cancellation=e.code;}if(cancellation!=='CANCELLED'||store.storage!=='memory'||session.snapshot().reservedBytes!==before)throw Error('Cancelled spill did not roll back');if(store.readInto(new Uint8Array(131),19).some((x,i)=>x!==pattern[i]))throw Error('Cancelled spill lost source');await store.dispose();store=null;
  phase='cancelled-promotion';const promoteCancel=new AbortController(),promotionSession={async create(length,options){const raw=await session.create(length,options);return {...raw,async readInto(bytes,offset){const result=await raw.readInto(bytes,offset);promoteCancel.abort();return result;}};}};
  store=await createSegmentedBytes(257,{budget,chunkBytes:64,storage:'temporary',shared:true,temporarySession:promotionSession});await store.write(pattern,19);cancellation=null;
  try{await store.promote({signal:promoteCancel.signal});}catch(e){cancellation=e.code;}if(cancellation!=='CANCELLED'||store.storage!=='temporary'||budget.retained)throw Error('Cancelled promotion did not roll back');const preserved=new Uint8Array(131);await store.readInto(preserved,19);if(preserved.some((x,i)=>x!==pattern[i]))throw Error('Cancelled promotion lost source');await store.dispose();store=null;
  await session.dispose();session=null;if(budget.total())throw Error('Storage budget leak');postMessage({ok:true,backend,selectedBackend,shared:expectedShared,roundTrip:true,completePageWrites,cancellationRollback:true,peakBytes:budget.peak});
 }catch(error){postMessage({ok:false,backend,phase,code:error.code,name:error.name,message:error.message});}
 finally{await store?.dispose();await session?.dispose();}
};
