import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes,adoptSharedSegmentedBytes} from '../src/segmented-bytes.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
import {getSharedReadCache,createSharedReadCacheClient} from '../src/shared-read-cache.js';
const MiB=1024**2;

test('immutable broker groups useful page reads, preserves seams, and releases pins',async()=>{
 const budget=new Budget(8*MiB),source=await createSegmentedBytes(180000,{budget,storage:'memory'}),expected=Uint8Array.from({length:180000},(_,i)=>i*37%251);source.write(expected);
 let reads=0;const wrapped={byteLength:source.byteLength,storage:source.storage,readInto:async(...args)=>{reads++;return source.readInto(...args);}};
 const publication=await exportByteStore(wrapped,{forceBroker:true,budget}),reader=await readByteStore(publication.descriptor,{budget});
 try{const first=new Uint8Array(4096),second=new Uint8Array(4096),seam=new Uint8Array(12345);await reader.readInto(first,0);await reader.readInto(second,4096);assert.equal(reads,1);await reader.readInto(seam,65530);assert.deepEqual(seam,expected.subarray(65530,65530+seam.length));}
 finally{await reader.dispose();await publication.release();await source.dispose();}assert.equal(budget.total(),0);
});

test('mutable broker serializes the owned backing and flushes before publication',async()=>{
 const budget=new Budget(4*MiB),source=await createSegmentedBytes(100000,{budget,storage:'memory'}),publication=await exportByteStore(source,{writable:true,forceBroker:true,budget}),reader=await readByteStore(publication.descriptor,{budget});
 try{const bytes=Uint8Array.from({length:75000},(_,i)=>i%251);await reader.write(bytes,123);await reader.flush();const out=new Uint8Array(bytes.length);await reader.readInto(out,123);assert.deepEqual(out,bytes);}finally{await reader.dispose();await publication.release();await source.dispose();}assert.equal(budget.total(),0);
});

test('shared mutable publication includes sparse zero banks and borrows one reservation',async()=>{
 const before=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(8*MiB);let source,publication,reader;
 try{source=await createSegmentedBytes(5*MiB,{budget,storage:'memory',shared:true});publication=await exportByteStore(source,{writable:true,budget});assert.equal(publication.descriptor.kind,'shared');reader=await readByteStore(publication.descriptor);const bytes=new Uint8Array([7,8,9]);reader.write(bytes,4*MiB-1);const out=new Uint8Array(3);source.readInto(out,4*MiB-1);assert.deepEqual(out,bytes);assert.equal(budget.total(),source.byteLength);}finally{await reader?.dispose();await publication?.release();await source?.dispose();globalThis.crossOriginIsolated=before;}assert.equal(budget.total(),0);
});

test('shared cache reuses actual pages across clients and waits for retirement acknowledgements',async()=>{
 const before=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connectionA=manager.connect(),connectionB=manager.connect(),a=createSharedReadCacheClient(connectionA.descriptor),b=createSharedReadCacheClient(connectionB.descriptor);let reads=0;
 const source={byteLength:8*MiB,storage:'temporary',readInto(target,offset){reads++;target.fill(offset/4096%251);}},id=manager.storeId(source),ar=a.wrap(id,source),br=b.wrap(id,source);
 try{const out=new Uint8Array(4096);ar.readInto(out,4096);br.readInto(out,4096);assert.equal(reads,1);assert.equal(out[0],1);assert.equal(manager.snapshot().hits,1);const used=budget.total();assert.ok(used>0);await budget.reclaim(budget.limit,{ });assert.equal(budget.total(),32,'Live cache clients retain their accounted statistics');const retirement=manager.snapshot().retirement;assert.equal(retirement.count,1);assert.equal(retirement.releasedBytes,used-32);assert.ok(retirement.ackWaitMs>=0);assert.equal(retirement.last.hitsBefore,1);ar.readInto(out,8192);assert.equal(reads,2);}finally{await a.dispose();await b.dispose();connectionA.release();connectionB.release();globalThis.crossOriginIsolated=before;}assert.equal(budget.total(),0);
});

test('released competing RAM expands useful shared pages and nested workers acknowledge retirement',async()=>{
 const before=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),competing=budget.reserve(80*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),parent=createSharedReadCacheClient(connection.descriptor),childConnection=parent.exportConnection(),child=createSharedReadCacheClient(childConnection.descriptor);
 const source={byteLength:8*MiB,storage:'temporary',readInto(target,offset){target.fill(offset/4096%251);}},id=manager.storeId(source),reader=child.wrap(id,source),page=new Uint8Array(4096);
 try{const initial=manager.snapshot().bytes;for(let i=0;i<600;i++)reader.readInto(page,i*4096);competing();await new Promise(resolve=>setTimeout(resolve,10));assert.ok(manager.snapshot().bytes>initial,'Freed memory did not grow the useful page cache');await budget.reclaim(budget.limit,{});assert.equal(manager.snapshot().bytes,32);assert.equal(budget.total(),32,'Live nested clients retain only shared statistics');reader.readInto(page,4096);assert.equal(page[0],1);}finally{competing();await child.dispose();childConnection.release();await parent.dispose();connection.release();globalThis.crossOriginIsolated=before;}assert.equal(budget.total(),0);
});

test('cold result reclamation preserves useful bytes and excludes active read pins',async()=>{
 const old=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(8*MiB),files=new Set(),session={async create(byteLength){const bytes=new Uint8Array(byteLength);files.add(bytes);return {readInto(target,offset){target.set(bytes.subarray(offset,offset+target.length));},write(source,offset){bytes.set(source,offset);},flush(){},dispose(){files.delete(bytes);}};}};
 const source=await createSegmentedBytes(4*MiB,{budget,storage:'memory',shared:true,temporarySession:session});source.write(new Uint8Array([7,8,9]),123);source.markCold();const pin=source.exportSharedReadOnly();
 try{await budget.reclaim(8*MiB);assert.equal(source.storage,'memory');pin.release();await budget.reclaim(8*MiB);assert.equal(source.storage,'temporary');const out=new Uint8Array(3);await source.readInto(out,123);assert.deepEqual(out,new Uint8Array([7,8,9]));}finally{pin.release();await source.dispose();globalThis.crossOriginIsolated=old;}assert.equal(budget.total(),0);assert.equal(files.size,0);
});

test('forcing the portable immutable broker still pins its source',async()=>{
 const budget=new Budget(MiB),source=await createSegmentedBytes(100,{budget}),publication=await exportByteStore(source,{forceBroker:true,budget}),reader=await readByteStore(publication.descriptor);
 try{assert.throws(()=>source.write(new Uint8Array([7])),{code:'BUSY'});await reader.dispose();await publication.release();source.write(new Uint8Array([8]));}finally{await reader.dispose();await publication.release();await source.dispose();}assert.equal(budget.total(),0);
});

test('adopted worker SAB outputs migrate after publication without a duplicate reservation or recomputation',async()=>{
 const old=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;const budget=new Budget(4*MiB),bytes=new Uint8Array(new SharedArrayBuffer(2*MiB));bytes[123]=77;let writes=0;
 const session={async create(byteLength){const saved=new Uint8Array(byteLength);return {write(source,offset){writes++;saved.set(source,offset);},readInto(target,offset){target.set(saved.subarray(offset,offset+target.length));},flush(){},dispose(){}};}};
 const reservation=budget.reserve(bytes.length),store=await adoptSharedSegmentedBytes({byteLength:bytes.length,chunkBytes:bytes.length,segments:[[0,bytes.buffer]]},{budget,reservation:reservation.split(bytes.length),temporarySession:session});
 try{assert.equal(budget.total(),bytes.length+2*MiB);const pin=store.exportSharedReadOnly();assert.equal(pin.descriptor.segments[0][1],bytes.buffer);pin.release();store.markCold();await budget.reclaim(budget.limit);assert.equal(store.storage,'temporary');assert.equal(budget.total(),2*MiB);assert.equal(writes,1);const out=new Uint8Array(1);await store.readInto(out,123);assert.equal(out[0],77);}finally{await store.dispose();reservation();globalThis.crossOriginIsolated=old;}assert.equal(budget.total(),0);
});

test('segmented I/O and migrations forward the operation-owned staging allocator',async()=>{
 const budget=new Budget(1024),calls=[],reserve=bytes=>{calls.push(bytes);return()=>{};},session={async create(byteLength){const saved=new Uint8Array(byteLength);return {readInto(target,offset,{reserve:allocator}={}){const release=allocator(target.length);target.set(saved.subarray(offset,offset+target.length));release();},write(source,offset,{reserve:allocator}={}){const release=allocator(source.length);saved.set(source,offset);release();},flush(){},dispose(){}};}};
 const store=await createSegmentedBytes(100,{budget,storage:'temporary',temporarySession:session});try{await store.write(new Uint8Array([9,8,7]),11,{reserve});const out=new Uint8Array(3);await store.readInto(out,11,{reserve});assert.deepEqual([...out],[9,8,7]);await store.promote({reserve});await store.spill({reserve});await store.readInto(out,11,{reserve});assert.deepEqual([...out],[9,8,7]);assert.deepEqual(calls,[3,3,100,100,3]);}finally{await store.dispose();}assert.equal(budget.total(),0);
});

test('completed bootstrap writer becomes an immutable pin without disconnecting its reader',async()=>{
 const old=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 try{for(const forceBroker of [false,true]){const budget=new Budget(MiB),store=await createSegmentedBytes(100,{budget,shared:true}),writer=await exportByteStore(store,{writable:true,forceBroker,budget}),reader=await readByteStore(writer.descriptor);let publication,other;try{await reader.write(new Uint8Array([7,8]),11);await reader.flush();await assert.rejects(exportByteStore(store,{budget}),{code:'BUSY'});writer.sealReadOnly();publication=await exportByteStore(store,{budget,forceBroker});other=await readByteStore(publication.descriptor);const a=new Uint8Array(2),b=new Uint8Array(2);await reader.readInto(a,11);await other.readInto(b,11);assert.deepEqual([...a],[7,8]);assert.deepEqual(a,b);assert.throws(()=>store.write(new Uint8Array([9])),{code:'BUSY'});await other.dispose();other=null;await publication.release();publication=null;await reader.dispose();await writer.release();store.write(new Uint8Array([9]));}finally{await other?.dispose();await publication?.release();await reader.dispose();await writer.release();await store.dispose();}assert.equal(budget.total(),0);}}
 finally{globalThis.crossOriginIsolated=old;}
});

test('broker read staging is admitted before a competing heap fills the budget',async()=>{
 const budget=new Budget(131072),store=await createSegmentedBytes(65536,{budget}),publication=await exportByteStore(store,{forceBroker:true,budget}),reader=await readByteStore(publication.descriptor);try{assert.equal(budget.total(),budget.limit);const out=new Uint8Array(4000);await reader.readInto(out,123);assert(out.every(v=>v===0));assert.equal(budget.peak,budget.limit);}finally{await reader.dispose();await publication.release();await store.dispose();}assert.equal(budget.total(),0);
});


test('small and empty broker planes reserve only their possible windows',async()=>{
 for(const size of [0,3]){const budget=new Budget(size*4),store=await createSegmentedBytes(size,{budget}),publication=await exportByteStore(store,{forceBroker:true,budget}),reader=await readByteStore(publication.descriptor,{budget});try{assert.equal(budget.total(),size*4);const bytes=new Uint8Array(size);await reader.readInto(bytes);assert(bytes.every(value=>value===0));assert.equal(budget.total(),size*4);}finally{await reader.dispose();await publication.release();await store.dispose();}assert.equal(budget.total(),0);}
});

test('optional shared cache metadata failures preserve direct transport and later useful admission',async()=>{
 const before=globalThis.crossOriginIsolated,Native=globalThis.SharedArrayBuffer;globalThis.crossOriginIsolated=true;
 const budget=new Budget(1024),manager=getSharedReadCache(budget);let fail=true,allocations=0,connection,client;
 globalThis.SharedArrayBuffer=new Proxy(Native,{construct(target,args){allocations++;if(fail)throw new RangeError('metadata unavailable');return Reflect.construct(target,args);}});
 try{
  assert.equal(budget.total(),0,'An idle manager owns no uncounted SAB');const absent=manager.connect();assert.equal(absent.descriptor,null);absent.release();assert.equal(budget.total(),0);assert.equal(allocations,1);
  fail=false;connection=manager.connect();client=createSharedReadCacheClient(connection.descriptor);assert.equal(budget.total(),32);assert.equal(manager.snapshot().bytes,32);
  const out=new Uint8Array(3);await client.wrap(1,{byteLength:3,readInto(target){target.fill(7);return target;}}).readInto(out,0);assert.deepEqual([...out],[7,7,7]);
 }finally{await client?.dispose();connection?.release();globalThis.SharedArrayBuffer=Native;globalThis.crossOriginIsolated=before;}
 assert.equal(budget.total(),0);
});

test('failed cache growth waits for external memory release and never feeds its own notifications',async()=>{
 const before=globalThis.crossOriginIsolated,Native=globalThis.SharedArrayBuffer;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),client=createSharedReadCacheClient(connection.descriptor),source={byteLength:8*MiB,readInto(out,offset){out.fill(offset/4096%251);return out;}},reader=client.wrap(1,source),page=new Uint8Array(4096);let fail=true,attempts=0,peer=budget.reserve(32*MiB);
 globalThis.SharedArrayBuffer=new Proxy(Native,{construct(target,args){if(args[0]===4*MiB){attempts++;if(fail)throw new RangeError('cache backing unavailable');}return Reflect.construct(target,args);}});
 try{
  for(let i=0;i<600;i++)await reader.readInto(page,i*4096);manager.rebalance();await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(attempts,1,'Own failed reservation must not trigger a retry loop');assert.equal(manager.snapshot().banks,1,'Already useful cache remains alive');
  await reader.readInto(page,599*4096);assert.equal(page[0],599%251);
  for(let i=0;i<4;i++){const transient=budget.reserve(16384);await Promise.resolve();transient();await Promise.resolve();assert.equal(attempts,1,'A small reader scope must not rearm a full-bank allocation');}
  const smallPart=peer.split(16384);smallPart();await Promise.resolve();assert.equal(attempts,1,'A real release below bank size is insufficient');fail=false;peer();peer=null;await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(attempts,2,'Returned external memory restores growth without a permanent cap');assert.equal(manager.snapshot().banks,2);
 }finally{peer?.();await client.dispose();connection.release();globalThis.SharedArrayBuffer=Native;globalThis.crossOriginIsolated=before;}
 assert.equal(budget.total(),0);
});
test('byte broker preserves actual allocation extent and native cause across MessagePort',async()=>{
 const budget=new Budget(1024),cause=new RangeError('Array buffer allocation failed'),error=Object.assign(new Error('Useful page refused'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'array-buffer',requestedBytes:16},cause});
 const publication=await exportByteStore({byteLength:16,readInto(){throw error;}},{forceBroker:true,budget}),reader=await readByteStore(publication.descriptor,{budget});
 try{await assert.rejects(reader.readInto(new Uint8Array(16)),e=>e.code==='MEMORY_ALLOCATION'&&e.details.requestedBytes===16&&e.cause.name==='RangeError'&&e.cause.message===cause.message&&e.cause.stack===cause.stack);}finally{await reader.dispose();await publication.release();}assert.equal(budget.total(),0);
});
