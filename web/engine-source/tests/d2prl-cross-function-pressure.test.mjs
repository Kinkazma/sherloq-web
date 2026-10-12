import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {runWithResourceRecovery} from '../src/resource-recovery.js';
import {byteView} from '../src/memory-range.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
import {getD2prlParameterLease,validateD2prlFloat32} from '../experiments/d2prl/parameter-ownership.js';
const MiB=1024**2;

// Storage is deliberately injected, with tiny real byte buffers. This proves
// shared admission/ownership, not a browser storage or physical RAM benchmark.
function storage(){
 const arrays=new Set(),stats={sessions:0,writes:0,reads:0};
 return{arrays,stats,factory:async()=>{stats.sessions++;return{backend:'indexeddb',snapshot:()=>({fake:true}),async create(length){const bytes=new Uint8Array(length);arrays.add(bytes);return{byteLength:length,stagingBytes:128,async write(source,offset,{reserve}){const release=reserve(128);try{bytes.set(byteView(source),offset);stats.writes++;}finally{release();}},async readInto(target,offset,{reserve}){const release=reserve(64);try{const view=byteView(target);view.set(bytes.subarray(offset,offset+view.byteLength));stats.reads++;return target;}finally{release();}},flush(){},async dispose(){arrays.delete(bytes);}};},async dispose(){arrays.clear();}};}};
}

for(const spill of [false,true])test(`a non-D2 shared function gains admission through idle D2 ${spill?'spill and exact restore':'eviction and exact refetch'} while live borrowers stay pinned`,async()=>{
 const source=Float32Array.from({length:64},(_,i)=>(i-32)/4),payload=new Uint8Array(source.buffer),sha256=createHash('sha256').update(payload).digest('hex'),spec={file:'assets/'+sha256+'.bin',sha256,bytes:payload.byteLength,dtype:'float32',shape:[64]},budget=new Budget(32*MiB),disk=storage(),requests=[];
 const store=createParameterStore({budget,spill,spillWindowBytes:64,temporarySessionFactory:disk.factory,assetBaseUrl:'https://model/',fetchAsset:async()=>{requests.push(1);return new Response(payload);}});
 let borrowed,peer,reloaded;const events=[];
 const peerAllocation=()=>runWithResourceRecovery(({resourceOperation})=>{
  assert.equal(resourceOperation.owner,'noise');resourceOperation.setState('compute');
  const release=budget.reserve(4*MiB);let data,backing;
  try{data=new Uint8Array(4*MiB);data[0]=73;backing=budget.registerBacking('array-buffer',data.byteLength,{owner:'noise',label:'shared-noise-workspace',operation:resourceOperation});resourceOperation.commit();let live=true;return{get data(){return data;},release(){if(!live)return;live=false;const bytes=data.byteLength;data=null;backing();release();budget.notifyBackingRelease('array-buffer',bytes);}};}catch(error){backing?.();release();throw error;}
 },{budget,owner:'noise',operation:'noise:workspace-admission',wait:async()=>{},onRecovery:event=>events.push(structuredClone(event))});
 try{
  borrowed=await store.acquire(spec,{retain:true});const old=borrowed.data,oldLease=getD2prlParameterLease(old);assert.equal((await validateD2prlFloat32(old)).elementsScanned,64);
  budget.setLimit(budget.total()+256*1024);
  await assert.rejects(peerAllocation(),error=>error.code==='MEMORY_LIMIT'&&error.details.recovery.loopDetected);
  assert.deepEqual(borrowed.data,source);assert.equal(getD2prlParameterLease(old),oldLease);assert.equal(store.snapshot().liveLeaseCount,1);assert.equal(store.snapshot().verifiedTensorBytes,spec.bytes);assert.equal(disk.stats.sessions,0);assert.equal(budget.resources.operations.size,0);assert.equal(budget.recovering,false);
  borrowed.release();borrowed=null;events.length=0;peer=await peerAllocation();assert.equal(peer.data[0],73);assert.ok(budget.total()<=budget.limit);assert.equal(budget.resourceSnapshot().domains['array-buffer'].owners.noise.materializedBytes,4*MiB);
  assert.throws(()=>getD2prlParameterLease(old),{code:'INVALID_INPUT'});assert.equal(store.snapshot().verifiedTensorBytes,0);
  if(spill){assert.equal(store.snapshot().spilledEntries,1);assert.equal(disk.stats.sessions,1);assert.equal(events.filter(value=>value.phase==='resource-recovery').length,1);assert.ok(disk.stats.writes>0&&disk.stats.reads>0);}else{assert.equal(store.snapshot().entries,0);assert.equal(store.snapshot().evictedEntries,1);assert.equal(events.length,0);}
  peer.release();peer=null;reloaded=await store.acquire(spec,{retain:true});assert.deepEqual(reloaded.data,source);assert.notEqual(getD2prlParameterLease(reloaded.data),oldLease);assert.equal((await validateD2prlFloat32(reloaded.data)).elementsScanned,64);assert.equal((await validateD2prlFloat32(reloaded.data)).elementsScanned,0);assert.equal(requests.length,spill?1:2);if(spill)assert.equal(store.snapshot().spill.rehydratedBytes,spec.bytes);
 }finally{borrowed?.release();peer?.release();reloaded?.release();await store.dispose();}
 assert.equal(budget.total(),0);assert.equal(budget.resources.operations.size,0);assert.equal(budget.resourceSnapshot().pressures.length,0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].backings,0);assert.equal(budget.resourceSnapshot().domains.wasm.backings,0);assert.equal(disk.arrays.size,0);
});
