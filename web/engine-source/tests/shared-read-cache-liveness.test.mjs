import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Budget} from '../src/cache.js';
import {getSharedReadCache,createSharedReadCacheClient} from '../src/shared-read-cache.js';
import {EngineError} from '../src/errors.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
const MiB=1024**2,tick=()=>new Promise(resolve=>setImmediate(resolve));

test('retired SAB references disappear while publication envelopes and live clients remain owned',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',new URL('./shared-read-cache-liveness-check.mjs',import.meta.url).pathname]);
 const result=JSON.parse(stdout);assert.equal(result.bankWeakRefsCleared,8);assert.equal(result.statisticsWeakRefsCleared,4);assert.equal(result.budgetBytes,0);
});

test('a cancelled retirement keeps backing until pending reads ACK and excludes newly connected readers',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),parent=createSharedReadCacheClient(connection.descriptor),childConnection=parent.exportConnection(),child=createSharedReadCacheClient(childConnection.descriptor),pressure=budget.beginRecovery(),controller=new AbortController();
 let unblock;const gate=new Promise(resolve=>{unblock=resolve;}),reader=child.wrap(1,{byteLength:8*MiB,async readInto(out){await gate;out.fill(19);}}),target=new Uint8Array(4096),read=reader.readInto(target,0);let late,lateClient;
 try{
  const before=budget.total(),retirement=manager.reclaim({all:true,signal:controller.signal});await tick();assert.equal(manager.snapshot().banks,0);assert.equal(budget.total(),before,'An outstanding read still owns its backing');
  late=manager.connect();assert.equal(late.descriptor.banks.length,0,'A late reader cannot acquire retiring banks');lateClient=createSharedReadCacheClient(late.descriptor);
  controller.abort();await assert.rejects(retirement,{code:'CANCELLED'});assert.equal(budget.total(),before,'Cancellation must not turn pending ownership into free RAM');
  unblock();await read;await manager.retirement;assert.equal(target[0],19);assert.equal(budget.total(),32);assert.equal(manager.snapshot().banks,0);
 }finally{unblock();await read;await child.dispose();childConnection.release();await parent.dispose();connection.release();await lateClient?.dispose();late?.release();pressure();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('an ArrayBuffer retry retires only the needed L2 bank before unrelated idle Wasm credits',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),idle=budget.reserve(32*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),client=createSharedReadCacheClient(connection.descriptor),page=new Uint8Array(4096),reader=client.wrap(1,{byteLength:8*MiB,readInto(out){out.fill(23);}});let evictions=0,attempts=0,useful,reclamation;
 const unregister=budget.registerReclaimer(()=>{evictions++;idle();});
 try{
  for(let i=0;i<600;i++)reader.readInto(page,i*4096);manager.rebalance();await tick();const cacheBytes=manager.snapshot().bytes;assert.ok(cacheBytes>8*MiB);
  await runWithResourceRecovery(()=>{if(++attempts===1)throw new EngineError('MEMORY_ALLOCATION','Array buffer allocation failed',{details:{requestedBytes:MiB,allocationKind:'array-buffer'}});assert.ok(manager.snapshot().banks>0,'Unneeded cache banks remain useful');assert.equal(evictions,0);assert.equal(budget.recovering,true);assert.ok(reclamation.targetedReleasedBytes>=MiB);assert.equal(reclamation.targetedReleasedBytes,cacheBytes-manager.snapshot().bytes);reader.readInto(page,0);assert.equal(page[0],23);useful=budget.reserve(MiB);return 17;},{budget,operation:'useful-page',onReclaim:event=>{reclamation=event.reclamation;}});
  assert.equal(attempts,2);assert.equal(budget.recovering,false);assert.equal(budget.limit,160*MiB);await tick();assert.ok(manager.snapshot().banks>0,'Useful cache growth can return after successful allocation');
 }finally{unregister();useful?.();idle();await client.dispose();connection.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});

test('disposing a relay waits for an already active child retirement before releasing its parent ACK',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),parent=createSharedReadCacheClient(connection.descriptor),childConnection=parent.exportConnection(),child=createSharedReadCacheClient(childConnection.descriptor),pressure=budget.beginRecovery();
 let unblock,closing,retirement;const gate=new Promise(resolve=>{unblock=resolve;}),target=new Uint8Array(4096),reader=child.wrap(1,{byteLength:8*MiB,async readInto(out){await gate;out.fill(29);}}),read=reader.readInto(target,0);
 try{
  const before=budget.total();retirement=manager.reclaim({all:true});
  // Observe that the parent has removed the bank from new publications while
  // its existing child's useful read still prevents the original retirement.
  let removed=false;for(let i=0;i<20&&!removed;i++){await tick();const probe=parent.exportConnection();removed=probe.descriptor.banks.length===0;probe.release();}assert.equal(removed,true);
  closing=parent.dispose();assert.equal(parent.dispose(),closing,'Repeated disposal must await the same ownership transfer');const premature=await Promise.race([closing.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]);
  assert.equal(premature,false,'A new empty retirement must not bypass the original child ACK');assert.equal(budget.total(),before,'Pending child backing remains charged during relay disposal');
  unblock();await read;await closing;await retirement;assert.equal(target[0],29);connection.release();assert.equal(budget.total(),0);
 }finally{unblock();await read;await closing;await retirement;await child.dispose();childConnection.release();await parent.dispose();connection.release();pressure();globalThis.crossOriginIsolated=previous;}
});

test('an owner retirement arriving during relay disposal also waits for the earlier child read',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),parent=createSharedReadCacheClient(connection.descriptor),childConnection=parent.exportConnection(),child=createSharedReadCacheClient(childConnection.descriptor),pressure=budget.beginRecovery();
 let unblock,closing,retirement;const gate=new Promise(resolve=>{unblock=resolve;}),target=new Uint8Array(4096),reader=child.wrap(1,{byteLength:8*MiB,async readInto(out){await gate;out.fill(31);}}),read=reader.readInto(target,0);
 try{
  const before=budget.total();closing=parent.dispose();
  let removed=false;for(let i=0;i<20&&!removed;i++){await tick();const probe=child.exportConnection();removed=probe.descriptor.banks.length===0;probe.release();}assert.equal(removed,true);
  retirement=manager.reclaim({all:true});const premature=await Promise.race([retirement.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]);
  assert.equal(premature,false,'A second empty retire must not acknowledge a still active earlier read');assert.equal(budget.total(),before);
  unblock();await read;await closing;await retirement;assert.equal(target[0],31);connection.release();assert.equal(budget.total(),0);
 }finally{unblock();await read;await closing;await retirement;await child.dispose();childConnection.release();await parent.dispose();connection.release();pressure();globalThis.crossOriginIsolated=previous;}
});

test('dormant cache transport allocates no data banks until an actual paged input activates it',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;const budget=new Budget(160*MiB),manager=getSharedReadCache(budget),pressure=budget.beginRecovery({kind:'array-buffer',owner:'d2prl'}),connection=manager.connect({dormant:true}),client=createSharedReadCacheClient(connection.descriptor);
 try{assert.equal(connection.descriptor.banks.length,0);assert.equal(manager.snapshot().bytes,32);pressure();await tick();assert.equal(manager.snapshot().banks,0,'Ending pressure alone must not eagerly allocate dormant capacity');connection.activate();await tick();assert.ok(manager.snapshot().banks>0);const bytes=manager.snapshot().bytes;assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,bytes);const read=client.wrap(7,{byteLength:4096,readInto(out){out.fill(31);}}),out=new Uint8Array(32);await read.readInto(out,0);assert.equal(out[0],31);const recover=budget.beginRecovery();try{await manager.reclaim({all:true});assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,32);}finally{recover();}}
 finally{pressure();await client?.dispose();connection.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});

test('allocator recovery makes real cache headroom and later external releases restore useful growth',async()=>{
 const previous=globalThis.crossOriginIsolated;globalThis.crossOriginIsolated=true;
 const budget=new Budget(256*MiB),external=budget.reserve(64*MiB),manager=getSharedReadCache(budget),connection=manager.connect(),client=createSharedReadCacheClient(connection.descriptor),page=new Uint8Array(4096),reader=client.wrap(1,{byteLength:256*MiB,readInto(out){out.fill(29);}});
 try{
  for(let round=0;round<4;round++){for(let i=0;i<10000;i++)reader.readInto(page,(i%32768)*4096);manager.rebalance();await tick();}
  const before=manager.snapshot();assert.ok(before.banks>=8);
  const releasePressure=budget.beginRecovery();const freed=await budget.reclaimAllocation(4096,{kind:'array-buffer',recoveryAttempt:1});releasePressure();await tick();
  const after=manager.snapshot();assert.ok(before.banks-after.banks>=Math.ceil(before.banks/8));assert.ok(freed>4096);
  for(let i=0;i<32768;i++)reader.readInto(page,(i+32768)*4096);manager.rebalance();await tick();assert.equal(manager.snapshot().bytes,after.bytes,'Cache cannot consume the headroom it just yielded');
  const useful=budget.reserve(MiB);useful();await tick();assert.equal(manager.snapshot().bytes,after.bytes,'Temporary useful scopes do not grant extra growth');
  external();await tick();assert.ok(manager.snapshot().bytes>after.bytes,'Freed external data funds new cache banks: '+JSON.stringify({before,after,current:manager.snapshot(),budget:budget.total()}));assert.ok(manager.snapshot().bytes-after.bytes<=64*MiB);
  const finalPressure=budget.beginRecovery();await budget.reclaimAllocation(4096,{kind:'array-buffer',recoveryAttempt:4});assert.equal(manager.snapshot().banks,0);finalPressure();await tick();assert.equal(manager.snapshot().banks,0,'Final retry can run with no optional cache');
 }finally{external();await client.dispose();connection.release();globalThis.crossOriginIsolated=previous;}assert.equal(budget.total(),0);
});
