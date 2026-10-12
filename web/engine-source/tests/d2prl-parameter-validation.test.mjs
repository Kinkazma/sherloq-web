import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createWasmTensorArena} from '../src/wasm-tensor-arena.js';
import {byteView} from '../src/memory-range.js';
import {createParameterStore} from '../experiments/d2prl/parameter-store.js';
import {getD2prlParameterLease,validateD2prlFloat32} from '../experiments/d2prl/parameter-ownership.js';
const MiB=1024**2;
function fixture({nonfinite=false}={}){const data=Float32Array.from({length:16},(_,i)=>(i-8)/4);if(nonfinite)data[9]=Infinity;const bytes=new Uint8Array(data.buffer),sha256=createHash('sha256').update(bytes).digest('hex');return{data,bytes,spec:{file:'assets/'+sha256+'.bin',sha256,bytes:bytes.length,dtype:'float32',shape:[16]}};}
function fetcher(items,requests=[]){return async url=>{const item=items.find(value=>url.endsWith(value.spec.file));assert.ok(item);requests.push(item.spec.file);return new Response(item.bytes);};}

test('verified parameter validation is reused through borrowed and retained-cache leases then revoked at tensor retirement',async()=>{
 const item=fixture(),budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:fetcher([item])});let first,second;
 try{
  first=await store.acquire(item.spec,{retain:true});const view=first.data,identity=getD2prlParameterLease(view);assert.ok(identity);assert.equal((await validateD2prlFloat32(view)).elementsScanned,16);first.release();first=null;
  assert.equal(getD2prlParameterLease(view),identity,'The owned immutable cache keeps the publication alive');second=await store.acquire(item.spec);assert.equal(second.data,view);assert.equal((await validateD2prlFloat32(second.data)).elementsScanned,0);
  store.clear();assert.equal(getD2prlParameterLease(second.data),identity,'An active borrower protects the tensor despite cache clear');second.release();second=null;assert.throws(()=>getD2prlParameterLease(view),{code:'INVALID_INPUT'});await assert.rejects(validateD2prlFloat32(view),{code:'INVALID_INPUT'});
 }finally{first?.release();second?.release();await store.dispose();}
 assert.equal(budget.total(),0);
});

test('arena address reuse cannot reuse an old finite attestation for newly verified nonfinite bytes',async()=>{
 const good=fixture(),bad=fixture({nonfinite:true}),budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:fetcher([good,bad])});let first,second;
 try{
  first=await store.acquire(good.spec);const old=first.data,oldIdentity=getD2prlParameterLease(old);await validateD2prlFloat32(old);first.release();first=null;
  second=await store.acquire(bad.spec);assert.notEqual(second.data,old);assert.equal(second.data.buffer,old.buffer);assert.equal(second.byteOffset,old.byteOffset);assert.notEqual(getD2prlParameterLease(second.data),oldIdentity);
  assert.throws(()=>getD2prlParameterLease(old),{code:'INVALID_INPUT'});await assert.rejects(validateD2prlFloat32(second.data,{message:'Nonfinite verified parameter fixture'}),error=>error.code==='INVALID_INPUT'&&error.message==='Nonfinite verified parameter fixture');
 }finally{first?.release();second?.release();await store.dispose();}
 assert.equal(budget.total(),0);
});

test('a failed pinned SHA never publishes the partially loaded Float32 tensor',async()=>{
 const item=fixture(),budget=new Budget(64*MiB),arena=createWasmTensorArena({budget}),allocate=arena.allocate.bind(arena);let unpublished;
 arena.allocate=(Type,length,options)=>{const result=allocate(Type,length,options);if(Type===Float32Array)unpublished=result.data;return result;};
 const store=createParameterStore({budget,arena,assetBaseUrl:'https://model/',fetchAsset:async()=>new Response(item.bytes)});
 try{await assert.rejects(store.acquire({...item.spec,sha256:'0'.repeat(64)}),{code:'MODEL_IDENTITY'});assert.ok(unpublished);assert.equal(getD2prlParameterLease(unpublished),null);assert.equal(store.snapshot().entries,0);}finally{await store.dispose();arena.dispose();}
 assert.equal(budget.total(),0);
});

test('int64 and uint8 parameter payloads and new Float32 aliases have no immutable-publication authority',async()=>{
 const item=fixture(),budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:async()=>new Response(item.bytes)});const leases=[];
 try{
  for(const dtype of ['int64','uint8']){const lease=await store.acquire({...item.spec,dtype},{retain:true});leases.push(lease);assert.equal(getD2prlParameterLease(lease.data),null);const alias=new Float32Array(lease.data.buffer,lease.byteOffset,item.spec.bytes/4);assert.equal(getD2prlParameterLease(alias),null);assert.equal((await validateD2prlFloat32(alias)).elementsScanned,16);assert.equal((await validateD2prlFloat32(alias)).elementsScanned,16);}
 }finally{for(const lease of leases)lease.release();await store.dispose();}
 assert.equal(budget.total(),0);
});

test('verified spill revokes before arena release and rehydration publishes a fresh lifetime that scans once',async()=>{
 const item=fixture(),budget=new Budget(32*MiB),arena=createWasmTensorArena({budget}),allocate=arena.allocate.bind(arena);let retired=0;
 arena.allocate=(Type,length,options)=>{const result=allocate(Type,length,options);if(Type===Float32Array){const view=result.data,release=result.release;result.release=()=>{assert.throws(()=>getD2prlParameterLease(view),{code:'INVALID_INPUT'},'Validation authority must be revoked before the extent is returned');retired++;release();};}return result;};
 const temporarySessionFactory=async()=>({backend:'opfs',async create(length){let bytes=new Uint8Array(length);return{byteLength:length,write(source,offset){bytes.set(byteView(source),offset);},readInto(target,offset){const view=byteView(target);view.set(bytes.subarray(offset,offset+view.length));return target;},flush(){},async dispose(){bytes=null;}};},async dispose(){}});
 const requests=[],store=createParameterStore({budget,arena,spill:true,spillWindowBytes:16,temporarySessionFactory,assetBaseUrl:'https://model/',fetchAsset:fetcher([item],requests)});let first,second;
 try{
  first=await store.acquire(item.spec,{retain:true});const old=first.data,identity=getD2prlParameterLease(old);await validateD2prlFloat32(old);first.release();first=null;budget.setLimit(budget.total()+256*1024);
  assert.throws(()=>budget.reserve(4*MiB),{code:'MEMORY_LIMIT'});const recovery=budget.beginRecovery({owner:'parameter-validation-test',kind:'wasm',requestedBytes:4*MiB});try{await budget.reclaim(4*MiB);}finally{recovery();}
  assert.equal(retired,1);assert.throws(()=>getD2prlParameterLease(old),{code:'INVALID_INPUT'});
  second=await store.acquire(item.spec,{retain:true});assert.notEqual(getD2prlParameterLease(second.data),identity);assert.deepEqual(second.data,item.data);assert.equal((await validateD2prlFloat32(second.data)).elementsScanned,16);assert.equal((await validateD2prlFloat32(second.data)).elementsScanned,0);assert.equal(requests.length,1);
 }finally{first?.release();second?.release();await store.dispose();arena.dispose();}
 assert.equal(retired,2);assert.equal(budget.total(),0);
});

test('disposing a store leaves an already borrowed parameter valid until its last lease release',async()=>{
 const item=fixture(),budget=new Budget(64*MiB),store=createParameterStore({budget,assetBaseUrl:'https://model/',fetchAsset:fetcher([item])}),lease=await store.acquire(item.spec,{retain:true}),view=lease.data;
 await validateD2prlFloat32(view);await store.dispose();assert.ok(getD2prlParameterLease(view));assert.equal((await validateD2prlFloat32(view)).elementsScanned,0);lease.release();assert.throws(()=>getD2prlParameterLease(view),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
});
