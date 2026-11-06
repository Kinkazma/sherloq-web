import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createElaSynthesisCache,elaSynthesisCacheKey} from '../src/ela-synthesis-cache.js';

const clone=value=>value===undefined?value:structuredClone(value),cancel=()=>Object.assign(Error('Cancelled'),{code:'CANCELLED'}),stale=()=>Object.assign(Error('Superseded generation'),{code:'STALE_RESULT'});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity=(extra={})=>({sourceSha256:'a'.repeat(64),width:2,height:2,decode:{decoder:'nativeRGB8/v1',orientation:1},domain:{fingerprint:'full-native',include:[[0,0,2,2]],exclude:[]},sourceContexts:[[0,0,2,2]],recipe:{id:'median99-native-he100/1',order:'raw→HE→median'},codecOptions:{codec:'jpeg',encoder:'native-islow/1'},axis:[{quality:1,plan:'jpeg/q1'},{quality:2,plan:'jpeg/q2'}],...extra});
const meta=(width=2,height=2)=>({width,height,format:'rgb8',frames:['median'],order:'frame-major-row-major-rgb'});
const data=Uint8Array.from({length:12},(_,i)=>i*17%256);
function memoryStorage(){
 const manifests=new Map(),writers=new Map(),headers=new Map(),chunks=new Map(),events=[];let putGate,commitGate,beginGate,commitAlreadyReady=false,putError,readGate;
 const index=(generation,sequence)=>generation+'/'+sequence;
 const current=hooks=>{if(hooks?.signal?.aborted)throw cancel();if(hooks?.isCurrent&&hooks.isCurrent()!==true)throw stale();};
 const removeBanks=generation=>{for(const map of [headers,chunks])for(const key of map.keys())if(key.startsWith(generation+'/'))map.delete(key);};
 const port=()=>({
  async begin({key,generation},hooks){if(beginGate){beginGate.entered.resolve();await beginGate.promise;}current(hooks);const previous=writers.get(key);writers.set(key,generation);events.push(['begin',key,generation]);return previous??null;},
  async putChunk({key,generation,sequence,header,bytes},hooks){if(putGate){putGate.entered.resolve();await putGate.promise;}current(hooks);if(writers.get(key)!==generation)throw stale();if(putError)throw putError;headers.set(index(generation,sequence),clone(header));chunks.set(index(generation,sequence),clone(bytes));events.push(['put',generation,sequence]);},
  async putHeader({key,generation,sequence,header},hooks){current(hooks);if(writers.get(key)!==generation)throw stale();headers.set(index(generation,sequence),clone(header));},
  async getManifest(key){return clone(manifests.get(key)??null);},async getHeader(generation,sequence){return clone(headers.get(index(generation,sequence))??null);},
  async getChunk(generation,sequence){if(readGate){readGate.entered.resolve();await readGate.promise;}return clone(chunks.get(index(generation,sequence))??null);},
  async commit({key,generation,manifest},hooks){
   const publish=()=>{current(hooks);if(writers.get(key)!==generation)throw stale();const old=manifests.get(key);if(old&&(old.canonical!==manifest.canonical||old.layoutCanonical!==manifest.layoutCanonical||old.contentSha256!==manifest.contentSha256))throw Object.assign(Error('Different exact payload'),{code:'CACHE_CONFLICT'});if(!old)manifests.set(key,clone(manifest));writers.delete(key);events.push(['ready',key,generation]);return{manifest:clone(old??manifest),reused:!!old};};
   let result;if(commitAlreadyReady)result=publish();if(commitGate){commitGate.entered.resolve();await commitGate.promise;}return result??publish();
  },
  async discard({key,generation}){if(manifests.get(key)?.generation===generation){events.push(['protected-ready',generation]);return false;}if(writers.get(key)===generation)writers.delete(key);removeBanks(generation);events.push(['discard',generation]);return true;},
  async remove({key,generation}){const old=manifests.get(key);if(old&&(!generation||old.generation===generation)){manifests.delete(key);removeBanks(old.generation);}if(!generation&&writers.has(key)){removeBanks(writers.get(key));writers.delete(key);}},close(){events.push(['close']);}
 });
 return{port,manifests,writers,headers,chunks,events,index,set putGate(v){putGate=v;},set commitGate(v){commitGate=v;},set commitAlreadyReady(v){commitAlreadyReady=v;},set beginGate(v){beginGate=v;},set putError(v){putError=v;},set readGate(v){readGate=v;}};
}
function fixture({storage=memoryStorage(),limit=2*1024**2,chunkBytes=5}={}){const budget=new Budget(limit),cache=createElaSynthesisCache({budget,persistent:storage.port(),chunkBytes});return{storage,budget,cache};}
async function save(cache,key,bytes=data,descriptor=meta(),parts=[bytes.length]){const writer=await cache.writer({key,meta:descriptor});let offset=0;for(const [sequence,n]of parts.entries()){await writer.append({sequence,bytes:bytes.subarray(offset,offset+n)});offset+=n;}return writer.commit();}
async function bytes(reader,offset=0,length=reader.byteLength){const held=await reader.read({offset,length});try{return held.bytes.slice();}finally{held.release();}}

test('identity uses exact source/native recipe/domain/codec/axis; presentation is excluded',async()=>{
 const expected=await elaSynthesisCacheKey(identity()),presentation=await elaSynthesisCacheKey(identity({scale:99,contrast:1,equalization:{method:'clahe'},grayscale:true,layout:'tile'}));assert.deepEqual(presentation,expected);
 const reordered=identity();reordered.decode={orientation:1,decoder:'nativeRGB8/v1'};assert.deepEqual(await elaSynthesisCacheKey(reordered),expected);
 for(const patch of[{sourceSha256:'b'.repeat(64)},{decode:{decoder:'nativeRGB8/v2'}},{domain:{fingerprint:'sameBoundsDifferentExclusions',exclude:[[1,1,1,1]]}},{sourceContexts:[[0,0,1,2]]},{recipe:{id:'median99-native-he100/2'}},{codecOptions:{codec:'png',paletteColors:191}},{axis:[{quality:2,plan:'jpeg/q2'},{quality:1,plan:'jpeg/q1'}]}])assert.notEqual((await elaSynthesisCacheKey(identity(patch))).key,expected.key);
 await assert.rejects(elaSynthesisCacheKey(identity({sourceSha256:'short'})),{code:'INVALID_INPUT'});
});

test('same resolved palette/GIF entries keep their explicit axis multiplicity and selection',async()=>{
 const base=identity({codecOptions:{codec:'source',resolved:'png'},axis:[{quality:1,paletteColors:2},{quality:2,paletteColors:2}]}),one=await elaSynthesisCacheKey(base);assert.notEqual((await elaSynthesisCacheKey({...base,axis:base.axis.slice(0,1)})).key,one.key);assert.notEqual((await elaSynthesisCacheKey({...base,codecOptions:{codec:'png',resolved:'png'}})).key,one.key);
});

test('persisted exact RGB survives RAM eviction, cache close and sourceA-B-A without recompression',async()=>{
 const f=fixture(),a=await elaSynthesisCacheKey(identity()),b=await elaSynthesisCacheKey(identity({sourceSha256:'b'.repeat(64)}));await save(f.cache,a);await save(f.cache,b,new Uint8Array(12).fill(37));let reader=await f.cache.reader({key:a});assert.deepEqual(await bytes(reader),data);await reader.close();assert.ok(f.budget.cacheBytes>0);f.cache.evictRam(a);assert.equal(f.budget.cacheBytes,0);await f.cache.close();assert.equal(f.budget.total(),0);
 const next=fixture({storage:f.storage});reader=await next.cache.reader({key:a});assert.deepEqual(await bytes(reader),data);await reader.close();reader=await next.cache.reader({key:b});assert.deepEqual(await bytes(reader),new Uint8Array(12).fill(37));await reader.close();await next.cache.close();assert.equal(next.budget.total(),0);
});

test('append12, append6+6 and different transport chunking reuse the same logical ready payload',async()=>{
 const f=fixture({chunkBytes:8}),key=await elaSynthesisCacheKey(identity()),first=await save(f.cache,key,data,meta(),[12]),second=await save(f.cache,key,data,meta(),[6,6]);assert.equal(first.generation,second.generation);const other=fixture({storage:f.storage,chunkBytes:3}),third=await save(other.cache,key,data,meta(),[3,3,6]);assert.equal(third.generation,first.generation);assert.equal(third.contentSha256,first.contentSha256);assert.equal(f.storage.manifests.size,1);const r=await other.cache.reader({key});assert.deepEqual(await bytes(r),data);await r.close();await other.cache.close();await f.cache.close();assert.equal(f.budget.total()+other.budget.total(),0);
});

test('caller mutation or transfer after append/read never changes persistent or private RAM bytes',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),input=data.slice(),writer=await f.cache.writer({key,meta:meta()});await writer.append({sequence:0,bytes:input.subarray(0,6)});input.fill(0,0,6);await writer.append({sequence:1,bytes:data.subarray(6)});await writer.commit();const r=await f.cache.reader({key}),held=await r.read({offset:0,length:12});held.bytes.fill(255);held.release();const other=await r.read({offset:0,length:12});structuredClone(other.bytes,{transfer:[other.bytes.buffer]});other.release();assert.deepEqual(await bytes(r),data);await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

for(const kind of ['missing-data','changed-data','changed-header','bad-meta','truncated-chain'])test('corrupt persistence is a MISS, never zero-filled success: '+kind,async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),m=await save(f.cache,key),entry=f.storage.index(m.generation,0);
 if(kind==='missing-data')f.storage.chunks.delete(entry);if(kind==='changed-data')f.storage.chunks.get(entry)[0]^=255;if(kind==='changed-header')f.storage.headers.get(entry).offset=1;if(kind==='bad-meta')f.storage.manifests.get(key.key).meta.width=0;if(kind==='truncated-chain')f.storage.manifests.get(key.key).chunkCount--;
 assert.equal(await f.cache.reader({key}),null);assert.equal(f.storage.manifests.has(key.key),false);assert.equal(f.cache.metrics.corruptions,1);await f.cache.close();assert.equal(f.budget.total(),0);
});

test('post-open storage corruption rejects the read and invalidates it without publishing partial bytes',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),m=await save(f.cache,key),reader=await f.cache.reader({key});f.storage.chunks.get(f.storage.index(m.generation,0))[0]^=1;await assert.rejects(reader.read({offset:0,length:2}),{code:'CACHE_CORRUPT'});assert.equal(f.budget.active,0);assert.equal(f.storage.manifests.has(key.key),false);await reader.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('partial commit, sequence errors and quota failure clean only their private writer generation',async()=>{
 for(const mode of ['partial','sequence','quota']){const f=fixture(),key=await elaSynthesisCacheKey(identity()),w=await f.cache.writer({key,meta:meta()});if(mode==='quota')f.storage.putError=Object.assign(Error('Quota'),{name:'QuotaExceededError',code:'STORAGE_QUOTA'});
  if(mode==='partial'){await w.append({sequence:0,bytes:data.subarray(0,3)});await assert.rejects(w.commit(),{code:'INVALID_INPUT'});}else await assert.rejects(w.append({sequence:mode==='sequence'?1:0,bytes:data}),{code:mode==='sequence'?'INVALID_INPUT':'STORAGE_QUOTA'});
  assert.equal(f.storage.manifests.size+f.storage.writers.size+f.storage.chunks.size+f.storage.headers.size,0);await f.cache.close();assert.equal(f.budget.total(),0);
 }
});

test('abort awaits an in-flight write ACK, then deletes partial chunks and returns every memory lease',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),gate=deferred();gate.entered=deferred();f.storage.putGate=gate;const controller=new AbortController(),w=await f.cache.writer({key,meta:meta(),signal:controller.signal}),pending=w.append({sequence:0,bytes:data}),rejected=assert.rejects(pending,{code:'CANCELLED'});await gate.entered.promise;controller.abort();let done=false;const cleanup=w.abort().then(()=>done=true);await tick();assert.equal(done,false);assert.ok(f.budget.active>0);gate.resolve();await rejected;await cleanup;assert.equal(f.storage.manifests.size+f.storage.chunks.size+f.storage.writers.size,0);assert.equal(f.budget.total(),0);await f.cache.close();
});

test('latest generation wins; stale A cannot overwrite newer A or disturb independent B',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),old=await f.cache.writer({key,meta:meta()});await old.append({sequence:0,bytes:data});const winner=await f.cache.writer({key,meta:meta()});await winner.append({sequence:0,bytes:new Uint8Array(12).fill(13)});const committed=await winner.commit();await assert.rejects(old.commit(),{code:'STALE_RESULT'});const r=await f.cache.reader({key});assert.equal(r.manifest.generation,committed.generation);assert.deepEqual(await bytes(r),new Uint8Array(12).fill(13));await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('source/context revoked before commit never publishes a ready entry',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity());let live=true;const w=await f.cache.writer({key,meta:meta(),isCurrent:()=>live});await w.append({sequence:0,bytes:data});live=false;await assert.rejects(w.commit(),{code:'STALE_RESULT'});assert.equal(f.storage.manifests.size+f.storage.chunks.size,0);await f.cache.close();assert.equal(f.budget.total(),0);
});

for(const operation of ['abort','close'])test(operation+' during a ready-but-unacknowledged commit preserves durable generation and rejects stale adoption',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),gate=deferred();gate.entered=deferred();f.storage.commitGate=gate;f.storage.commitAlreadyReady=true;const w=await f.cache.writer({key,meta:meta()});await w.append({sequence:0,bytes:data});const committing=w.commit(),rejected=assert.rejects(committing,{code:'CANCELLED'});await gate.entered.promise;assert.equal(f.storage.manifests.size,1);let retired=false;const retiring=(operation==='close'?f.cache.close():w.abort()).then(()=>retired=true);await tick();assert.equal(retired,false);gate.resolve();await rejected;await retiring;assert.equal(w.state,'committed');assert.equal(f.storage.manifests.size,1);const next=fixture({storage:f.storage}),r=await next.cache.reader({key});assert.deepEqual(await bytes(r),data);await r.close();await next.cache.close();if(operation!=='close')await f.cache.close();assert.equal(f.budget.total()+next.budget.total(),0);
});

test('a RAM loan stays financed through eviction during an await and is retired only after release',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity());await save(f.cache,key);const first=await f.cache.reader({key});await bytes(first);await first.close();assert.ok(f.budget.cacheBytes>0);let observed=false;const borrow=f.budget.borrowCacheEntry.bind(f.budget);f.budget.borrowCacheEntry=k=>{const loan=borrow(k);if(loan&&!observed){observed=true;assert.ok(f.budget.active>=loan.bytes);const before=f.budget.total();f.cache.evictRam(key);assert.ok(f.budget.total()>=loan.bytes);assert.ok(f.budget.total()<=before);}return loan;};const r=await f.cache.reader({key});assert.deepEqual(await bytes(r),data);assert.equal(observed,true);await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('bounded byte windows work when one complete RGB row exceeds the caller budget',async()=>{
 const f=fixture({limit:256*1024,chunkBytes:1024}),width=100000,key=await elaSynthesisCacheKey(identity({width,height:1})),payload=Uint8Array.from({length:width*3},(_,i)=>i%251);await save(f.cache,key,payload,meta(width,1));const r=await f.cache.reader({key});assert.deepEqual(await bytes(r,274921,19),payload.slice(274921,274940));await assert.rejects(async()=>{for await(const ignored of r.rows())void ignored;},{code:'MEMORY_LIMIT'});await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('logical file length is not a RAM admission cap; no full-file allocation is made by a writer',async()=>{
 const f=fixture({limit:256*1024,chunkBytes:12}),key=await elaSynthesisCacheKey(identity({width:100000,height:100000})),w=await f.cache.writer({key,meta:meta(100000,100000)});await w.append({sequence:0,bytes:data});assert.equal(w.byteLength,12);await w.abort();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('disabled IndexedDB uses only admitted reclaimable RAM and reports persistent:false honestly',async()=>{
 const budget=new Budget(2*1024**2),cache=createElaSynthesisCache({budget,indexedDB:null,chunkBytes:5}),key=await elaSynthesisCacheKey(identity()),manifest=await save(cache,key);assert.equal(manifest.persistent,false);assert.equal(manifest.backend,'memory');const r=await cache.reader({key});assert.equal(r.persistent,false);assert.deepEqual(await bytes(r),data);assert.equal(cache.metrics.memoryHits,1);assert.equal(cache.metrics.persistentHits,0);await r.close();cache.evictRam(key);assert.equal(await cache.reader({key}),null);await cache.close();assert.equal(budget.total(),0);
});

test('quota failure preserves caller-owned native bytes; explicit RAM replay needs no recompression',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity());f.storage.putError=Object.assign(Error('Quota'),{code:'STORAGE_QUOTA'});const native=data.slice(),failed=await f.cache.writer({key,meta:meta()});await assert.rejects(failed.append({sequence:0,bytes:native}),{code:'STORAGE_QUOTA'});assert.deepEqual(native,data);const retry=await f.cache.writer({key,meta:meta(),storage:'memory'});await retry.append({sequence:0,bytes:native});const ready=await retry.commit();assert.equal(ready.persistent,false);const r=await f.cache.reader({key});assert.deepEqual(await bytes(r),native);await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('same scientific bytes reuse ready despite non-scientific restoration snapshot revisions',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity()),one=await save(f.cache,key,data,{...meta(),snapshot:{revision:1,zoneId:'old'}}),two=await save(f.cache,key,data,{...meta(),snapshot:{revision:2,zoneId:'new'}});assert.equal(two.generation,one.generation);assert.equal(two.meta.snapshot.revision,1);const r=await f.cache.reader({key});assert.deepEqual(await bytes(r),data);await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('adoption validates the request once, then source-owned lifetime survives request cancellation',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity());await save(f.cache,key);const controller=new AbortController();let live=true;const r=await f.cache.reader({key,signal:controller.signal,isCurrent:()=>live});assert.equal(r.adopt(),r);controller.abort();live=false;assert.deepEqual(await bytes(r),data);await r.close();await assert.rejects(r.read({offset:0,length:1}),{code:'DISPOSED'});await f.cache.close();assert.equal(f.budget.total(),0);
});

test('a stale request cannot detach its reader proof or publish a source-owned handle',async()=>{
 const f=fixture(),key=await elaSynthesisCacheKey(identity());await save(f.cache,key);const controller=new AbortController(),r=await f.cache.reader({key,signal:controller.signal});controller.abort();assert.throws(()=>r.detachRequest(),{code:'CANCELLED'});await r.close();await f.cache.close();assert.equal(f.budget.total(),0);
});

test('an open adopted RAM reader is the financed exact backing even after optional cache eviction',async()=>{
 const budget=new Budget(2*1024**2),cache=createElaSynthesisCache({budget,indexedDB:null,chunkBytes:5}),key=await elaSynthesisCacheKey(identity());await save(cache,key);const r=await cache.reader({key});r.adopt();const active=budget.active;assert.ok(active>=data.byteLength,'Open RAM source must own active backing credit');cache.evictRam(key);assert.ok(budget.active>=data.byteLength,'Eviction cannot free an open source');assert.deepEqual(await bytes(r),data);await r.close();await cache.close();assert.equal(budget.total(),0);
});

test('concurrent open RAM readers share one backing and the last close retires it after eviction',async()=>{
 const budget=new Budget(2*1024**2),cache=createElaSynthesisCache({budget,indexedDB:null,chunkBytes:5}),key=await elaSynthesisCacheKey(identity());await save(cache,key);const a=await cache.reader({key}),active=budget.active,b=await cache.reader({key});assert.ok(active>=data.byteLength);assert.equal(budget.active,active,'Opening a second view must not duplicate the median backing');cache.evictRam(key);await a.close();assert.ok(budget.active>=data.byteLength);assert.deepEqual(await bytes(b),data);await b.close();cache.evictRam(key);assert.equal(budget.total(),0);await cache.close();
});
