import test from 'node:test';import assert from 'node:assert/strict';
import {createElaSynthesisIndexedDb} from '../src/ela-synthesis-indexeddb.js';
import {createElaSynthesisCache,elaSynthesisCacheKey} from '../src/ela-synthesis-cache.js';
import {Budget} from '../src/cache.js';
const copy=value=>value===undefined?undefined:structuredClone(value),keyString=key=>JSON.stringify(key),deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

// Small deterministic IDB event/transaction double. Writes become visible only
// at transaction completion, request callbacks may enqueue further requests,
// and all transactions are serialized like conflicting real IDB transactions.
function fakeIndexedDb(){
 const stores=new Map(),transactions=[];let running=false,created=false,readyGate=null,writeError=null;
 const keyRange={bound:(lower,upper)=>({lower,upper})};
 const inside=(key,range)=>Array.isArray(key)&&key[0]===range.lower[0]&&key[1]>=range.lower[1]&&key[1]<=range.upper[1];
 function start(){if(running||!transactions.length)return;running=true;const tx=transactions.shift();tx.start();}
 function transaction(names,mode){
  let aborted=false,complete=false,working,scheduled=false;const operations=[];
  const tx={error:null,oncomplete:null,onabort:null,onerror:null,
   abort(){if(complete)throw Object.assign(Error('Transaction already durable'),{name:'InvalidStateError'});aborted=true;schedule();},
   objectStore(name){assert.ok(names.includes(name));return{
    get(key){return operation(()=>copy(working.get(name).get(keyString(key))?.value));},
    put(value,key){return operation(()=>{if(writeError)throw writeError;working.get(name).set(keyString(key),{key:copy(key),value:copy(value)});return copy(key);});},
    delete(key){return operation(()=>{if(key?.lower){for(const [id,entry]of working.get(name))if(inside(entry.key,key))working.get(name).delete(id);}else working.get(name).delete(keyString(key));});}
   };},
   start(){working=new Map(names.map(name=>[name,new Map([...stores.get(name)].map(([key,value])=>[key,copy(value)]))]));schedule();}
  };
  function operation(run){const request={onsuccess:null,onerror:null,result:undefined,error:null};operations.push({request,run});schedule();return request;}
  function schedule(){if(scheduled||!working)return;scheduled=true;setImmediate(pump);}
  async function finish(){
   complete=true;if(!aborted&&mode==='readwrite')for(const [name,data]of working)stores.set(name,data);
   if(!aborted&&readyGate&&mode==='readwrite'&&names.includes('manifests')&&[...working.get('manifests').values()].some(e=>e.value?.ready)){const gate=readyGate;readyGate=null;gate.entered.resolve();await gate.promise;}
   if(aborted)tx.onabort?.();else tx.oncomplete?.();running=false;start();
  }
  function pump(){scheduled=false;if(aborted){void finish();return;}const op=operations.shift();if(!op){void finish();return;}try{op.request.result=op.run();op.request.onsuccess?.();}catch(error){tx.error=op.request.error=error;op.request.onerror?.();tx.onerror?.();aborted=true;}schedule();}
  transactions.push(tx);queueMicrotask(start);return tx;
 }
 const indexedDB={open(){const request={result:null,error:null};queueMicrotask(()=>{let closed=false;request.result={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore(name){stores.set(name,new Map());},transaction(names,mode){if(closed)throw Error('Closed DB');return transaction(names,mode);},close(){closed=true;},onversionchange:null};if(!created){created=true;request.onupgradeneeded?.();}request.onsuccess?.();});return request;}};
 return{indexedDB,keyRange,stores,set readyGate(value){readyGate=value;},set writeError(value){writeError=value;},get(name,key){return stores.get(name).get(keyString(key))?.value;}};
}
const identity=()=>({sourceSha256:'a'.repeat(64),width:2,height:2,decode:'native-rgb8/v1',domain:{fingerprint:'full'},sourceContexts:[[0,0,2,2]],recipe:'median99HE/1',codecOptions:{codec:'jpeg'},axis:[1,2,3]});
const meta={width:2,height:2,frames:['median'],format:'rgb8',order:'frame-major-row-major-rgb'},rgb=Uint8Array.from({length:12},(_,i)=>i*13);
async function setup(fake=fakeIndexedDb()){const port=await createElaSynthesisIndexedDb({indexedDB:fake.indexedDB,keyRange:fake.keyRange,databaseName:'test-cache'}),budget=new Budget(2*1024**2),cache=createElaSynthesisCache({budget,persistent:port,chunkBytes:5}),key=await elaSynthesisCacheKey(identity());return{fake,port,budget,cache,key};}
async function write(f){const writer=await f.cache.writer({key:f.key,meta});await writer.append({sequence:0,bytes:rgb});return{writer,manifest:await writer.commit()};}
async function read(f){const r=await f.cache.reader({key:f.key}),held=await r.read({offset:0,length:12});try{assert.deepEqual(held.bytes,rgb);}finally{held.release();await r.close();}}

test('stable IDB adapter persists exact bytes across connections and never deletes on close',async()=>{const f=await setup();await write(f);await f.cache.close();assert.equal(f.budget.total(),0);const next=await setup(f.fake);await read(next);await next.cache.close();assert.equal(next.budget.total(),0);});

test('actual adapter discard cannot delete chunks referenced by a ready manifest',async()=>{const f=await setup(),{manifest}=await write(f);assert.equal(await f.port.discard({key:f.key.key,generation:manifest.generation}),false);await read(f);await f.cache.close();assert.equal(f.budget.total(),0);});

test('adapter generation CAS rejects an old writer without deleting the committed winner',async()=>{const f=await setup(),old=await f.cache.writer({key:f.key,meta});await old.append({sequence:0,bytes:rgb});const fresh=await f.cache.writer({key:f.key,meta});await fresh.append({sequence:0,bytes:rgb});const ready=await fresh.commit();await assert.rejects(old.commit(),{code:'STALE_RESULT'});assert.equal((await f.port.getManifest(f.key.key)).generation,ready.generation);await read(f);await f.cache.close();assert.equal(f.budget.total(),0);});

test('adapter has one atomic ready publication and does not expose partial chunk writes',async()=>{const f=await setup(),w=await f.cache.writer({key:f.key,meta});await w.append({sequence:0,bytes:rgb.subarray(0,6)});assert.equal(await f.port.getManifest(f.key.key),null);await w.abort();assert.equal(await f.cache.reader({key:f.key}),null);await f.cache.close();assert.equal(f.budget.total(),0);});

test('quota from a real adapter transaction retains its code and partial state is cleaned',async()=>{const f=await setup(),w=await f.cache.writer({key:f.key,meta});f.fake.writeError=Object.assign(Error('Quota'),{name:'QuotaExceededError'});await assert.rejects(w.append({sequence:0,bytes:rgb}),{code:'STORAGE_QUOTA'});f.fake.writeError=null;await w.abort();assert.equal(await f.port.getManifest(f.key.key),null);await f.cache.close();assert.equal(f.budget.total(),0);});

test('late abort after IDB durability but before its completion event cannot erase ready',async()=>{const f=await setup(),gate=deferred();gate.entered=deferred();const controller=new AbortController(),w=await f.cache.writer({key:f.key,meta,signal:controller.signal});await w.append({sequence:0,bytes:rgb});f.fake.readyGate=gate;const commit=w.commit(),rejected=assert.rejects(commit,{code:'CANCELLED'});await gate.entered.promise;controller.abort();const cleanup=w.abort();gate.resolve();await rejected;await cleanup;assert.equal(w.state,'committed');await read(f);await f.cache.close();assert.equal(f.budget.total(),0);});

test('unavailable IDB returns explicit capability failure before opening a database',async()=>{await assert.rejects(createElaSynthesisIndexedDb({indexedDB:null,keyRange:null}),{code:'STORAGE_UNAVAILABLE'});});
