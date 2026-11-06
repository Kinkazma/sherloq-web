import "../../runtime-context.js?v=0.31.0";
import {EngineError,checkAbort,requireValue} from './errors.js';
import {createElaSynthesisIndexedDb} from './ela-synthesis-indexeddb.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';

const HASH=/^[a-f0-9]{64}$/,SCHEMA='sherloq.ela-synthesis-cache/1',DEFAULT_CHUNK=1024**2;
const stale=()=>new EngineError('STALE_RESULT','This synthesis cache consumer is no longer current.');
const corrupt=message=>new EngineError('CACHE_CORRUPT',message);
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){requireValue(Number.isFinite(value),'Cache identities require finite numbers.');return JSON.stringify(value);}
 if(Array.isArray(value)){requireValue(Object.keys(value).length===value.length,'Cache identities cannot contain sparse arrays.');return '['+value.map(canonical).join(',')+']';}
 requireValue(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype,'Cache identities require plain JSON data.');
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function textDigest(value,budget){const text=typeof value==='string'?value:canonical(value),release=budget?.reserve(8*text.length+256);try{return await digest(new TextEncoder().encode(text));}finally{release?.();}}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function current(signal,isCurrent){checkAbort(signal);if(isCurrent&&isCurrent()!==true)throw stale();}
async function contentHasher(budget){
 // The pinned hash-wasm SHA256 binary owns a fixed two-page memory (no grow).
 const release=budget.reserve(2*65536);let state;
 try{state=await createSHA256();return{update:bytes=>state.update(bytes),digest:()=>state.digest('hex'),release(){state=null;release();}};}catch(error){release();throw error;}
}
function layout(meta){
 requireValue(meta&&Number.isSafeInteger(meta.width)&&meta.width>0&&Number.isSafeInteger(meta.height)&&meta.height>0,'Native synthesis dimensions are required.');
 requireValue(meta.format==='rgb8'&&meta.order==='frame-major-row-major-rgb'&&Array.isArray(meta.frames)&&meta.frames.length===1&&meta.frames[0]==='median','Only the exact RGB8 median frame is supported.');
 const byteLength=meta.width*meta.height*3;requireValue(Number.isSafeInteger(byteLength),'Synthesis byte length exceeds exact integer addressing.');
 const text=canonical(meta),layoutCanonical=canonical({width:meta.width,height:meta.height,format:meta.format,frames:meta.frames,order:meta.order});return{meta:JSON.parse(text),metaCanonical:text,layoutCanonical,byteLength};
}
function keyDescriptor(key){requireValue(key&&HASH.test(key.key)&&typeof key.canonical==='string','Use the canonical synthesis key descriptor.');return key;}
const optionalStorageError=error=>['STORAGE_UNAVAILABLE','STORAGE_BUSY','STORAGE_IO','STORAGE_QUOTA'].includes(error?.code);
function memoryTransport(budget){
 const prefix='ela-synthesis-memory/'+crypto.randomUUID()+'/',owners=new Map(),latest=new Map(),manifestKeys=new Set(),generations=new Map(),pins=new Map(),activeKeys=new Map();
 const pageKey=(generation,sequence)=>prefix+'page/'+generation+'/'+sequence,manifestKey=key=>prefix+'ready/'+key;
 const refused=()=>new EngineError('CACHE_NOT_ADMITTED','The optional RAM synthesis cache was not admitted; the caller still owns its native result.');
 const check=hooks=>current(hooks?.signal,hooks?.isCurrent);
 const page=(generation,sequence)=>pins.get(generation)?.pages.get(sequence)?.entry??budget.get(pageKey(generation,sequence));
 function retire(generation){const held=pins.get(generation);if(held){held.retire=true;held.discoverable=false;return;}budget.clearPrefix(prefix+'page/'+generation+'/');generations.delete(generation);const owner=owners.get(generation);if(owner){owner.release();owners.delete(generation);if(latest.get(owner.key)===generation)latest.delete(owner.key);}}
 function getManifest(key){const active=activeKeys.get(key);if(active)return active.discoverable?structuredClone(active.manifest):null;const value=budget.get(manifestKey(key)),manifest=value?.manifest;if(!manifest)return null;for(let i=0;i<manifest.chunkCount;i++)if(!page(manifest.generation,i)){budget.remove(manifestKey(key));manifestKeys.delete(key);retire(manifest.generation);return null;}return structuredClone(manifest);}
 return{
  backend:'memory',
  async begin({key,generation},hooks){check(hooks);const release=budget.reserve(2*(key.length+generation.length)+256),previous=latest.get(key);owners.set(generation,{key,release});latest.set(key,generation);generations.set(generation,key);return previous??null;},
  async putChunk({key,generation,sequence,header,bytes},hooks){check(hooks);if(latest.get(key)!==generation)throw stale();if(!budget.put(pageKey(generation,sequence),{byteLength:bytes.byteLength+2048,header:structuredClone(header),data:bytes}))throw refused();},
  async putHeader({key,generation,sequence,header},hooks){check(hooks);if(latest.get(key)!==generation)throw stale();const page=budget.get(pageKey(generation,sequence));if(!page)throw refused();page.header=structuredClone(header);},
  async getManifest(key){return getManifest(key);},async getHeader(generation,sequence){return structuredClone(page(generation,sequence)?.header??null);},async getChunk(generation,sequence){const held=page(generation,sequence);return held?new Uint8Array(held.data):null;},
  pin(manifest){
   let held=pins.get(manifest.generation);
   if(!held){const ready=budget.borrowCacheEntry(manifestKey(manifest.key));if(!ready||ready.entry.manifest.generation!==manifest.generation){ready?.restore();return null;}const pages=new Map();for(let i=0;i<manifest.chunkCount;i++){const loan=budget.borrowCacheEntry(pageKey(manifest.generation,i));if(!loan){for(const previous of pages.values())previous.restore();ready.restore();return null;}pages.set(i,loan);}held={manifest:freeze(structuredClone(manifest)),ready,pages,refs:0,retire:false,discoverable:true};pins.set(manifest.generation,held);activeKeys.set(manifest.key,held);}
   held.refs++;let released=false;
   return{manifest:held.manifest,release(){if(released)return;released=true;if(--held.refs)return;pins.delete(manifest.generation);if(activeKeys.get(manifest.key)===held)activeKeys.delete(manifest.key);for(const loan of [held.ready,...held.pages.values()])if(!loan.restore())throw new EngineError('CACHE_CONFLICT','The published RAM synthesis backing lost its accounting owner.');if(held.retire){budget.remove(manifestKey(manifest.key));manifestKeys.delete(manifest.key);retire(manifest.generation);}}};
  },
  async commit({key,generation,manifest},hooks){check(hooks);if(latest.get(key)!==generation)throw stale();const ready=activeKeys.get(key)?.manifest??getManifest(key);if(ready){if(ready.canonical!==manifest.canonical||ready.layoutCanonical!==manifest.layoutCanonical||ready.contentSha256!==manifest.contentSha256)throw new EngineError('CACHE_CONFLICT','One synthesis key produced different exact RAM bytes.');return{manifest:ready,reused:true};}
   for(let i=0;i<manifest.chunkCount;i++)if(!budget.get(pageKey(generation,i)))throw refused();
   const copy=structuredClone(manifest);if(!budget.put(manifestKey(key),{byteLength:2*canonical(copy).length+2048,manifest:copy}))throw refused();manifestKeys.add(key);if(!getManifest(key))throw refused();const owner=owners.get(generation);owner?.release();owners.delete(generation);latest.delete(key);return{manifest:structuredClone(copy),reused:false};
  },
  async discard({key,generation}){if(getManifest(key)?.generation===generation)return false;retire(generation);return true;},
  async remove({key,generation}){const ready=getManifest(key);if(ready&&(!generation||ready.generation===generation)){budget.remove(manifestKey(key));manifestKeys.delete(key);retire(ready.generation);}if(!generation&&latest.has(key))retire(latest.get(key));},
  evict(key){for(const [generation,identity]of [...generations])if(!key||identity===key)retire(generation);for(const identity of [...manifestKeys])if(!key||identity===key){budget.remove(manifestKey(identity));manifestKeys.delete(identity);}},
  close(){if(pins.size)throw new EngineError('BUSY','Published RAM synthesis readers still own this backing.');budget.clearPrefix(prefix);for(const owner of owners.values())owner.release();owners.clear();latest.clear();manifestKeys.clear();generations.clear();}
 };
}
export async function elaSynthesisCacheKey(identity,{budget,signal}={}){
 current(signal);requireValue(identity&&HASH.test(identity.sourceSha256),'The exact Original SHA256 is required.');
 requireValue(Number.isSafeInteger(identity.width)&&identity.width>0&&Number.isSafeInteger(identity.height)&&identity.height>0,'Original dimensions are required.');
 for(const name of ['decode','domain','sourceContexts','recipe','codecOptions','axis'])requireValue(identity[name]!==undefined,'Missing synthesis identity: '+name);
 requireValue(Array.isArray(identity.sourceContexts)&&Array.isArray(identity.axis)&&identity.axis.length>0,'An explicit native context list and ordered quality axis are required.');
 // Deliberately select scientific identity only. Gain, equalization menus,
 // viewport/layout and all other presentation parameters are never hashed.
 const value={schema:SCHEMA,sourceSha256:identity.sourceSha256,width:identity.width,height:identity.height,decode:identity.decode,domain:identity.domain,sourceContexts:identity.sourceContexts,recipe:identity.recipe,codecOptions:identity.codecOptions,axis:identity.axis},text=canonical(value),key=await textDigest(text,budget);current(signal);return Object.freeze({key,canonical:text});
}

export function createElaSynthesisCache({budget,persistent,indexedDB,keyRange,databaseName,chunkBytes=DEFAULT_CHUNK}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&typeof budget.get==='function'&&typeof budget.put==='function','Synthesis cache requires the shared memory budget.');
 requireValue(Number.isSafeInteger(chunkBytes)&&chunkBytes>0,'Invalid synthesis transport chunk size.');
 const prefix='ela-synthesis/'+crypto.randomUUID()+'/',writers=new Set(),readers=new Set(),ramLoans=new Map(),ramRevisions=new Map(),memory=memoryTransport(budget);let storage= persistent?Promise.resolve(persistent):null,closed=false,closing,ramEpoch=0;
 const metrics={ramHits:0,memoryHits:0,persistentHits:0,misses:0,corruptions:0,commits:0,discardedWrites:0,verifiedBytes:0,cleanupFailures:0};
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Synthesis cache is closed.');};
 function transport(){alive();if(!storage){const promise=createElaSynthesisIndexedDb({indexedDB,keyRange,databaseName});storage=promise;promise.catch(()=>{if(storage===promise)storage=null;});}return storage;}
 async function selectTransport(mode='auto'){requireValue(['auto','memory','indexeddb'].includes(mode),'Invalid synthesis cache storage selection.');if(mode==='memory')return memory;try{return await transport();}catch(error){if(mode==='indexeddb'||!optionalStorageError(error))throw error;metrics.lastStorageError=error.code;return memory;}}
 const ramKey=(key,generation,sequence)=>prefix+key+'/'+generation+'/'+sequence;
 const forget=(key,generation)=>{if(key)ramRevisions.set(key,(ramRevisions.get(key)??0)+1);else ramEpoch++;budget.clearPrefix(prefix+(key?key+'/':'')+(generation?generation+'/':''));};
 const headSeed=(key,metaCanonical)=>textDigest([SCHEMA,key.key,key.canonical,metaCanonical],budget);
 const headerHash=header=>textDigest([header.sequence,header.offset,header.byteLength,header.sha256,header.nextHash],budget);
 async function verifyKey(key){const given=keyDescriptor(key);key=Object.freeze({key:given.key,canonical:given.canonical});requireValue(await textDigest(key.canonical,budget)===key.key,'Synthesis key does not match its canonical scientific identity.');return key;}
 function remember(identity,generation,sequence,bytes){
  const key=ramKey(identity,generation,sequence);if(budget.get(key))return;
  // Optional retention cannot spend another native owner's credit. The IDB
  // chunk is already durable; a refusal simply leaves it persistent-only.
  if(budget.total()+bytes.byteLength>budget.limit)return;
  budget.put(key,{byteLength:bytes.byteLength,data:bytes});
 }
 async function chunk(db,manifest,header,{signal,isCurrent}={}){
  current(signal,isCurrent);const cacheKey=ramKey(manifest.key,manifest.generation,header.sequence);let borrowed=ramLoans.get(cacheKey);
  if(!borrowed){const loan=budget.borrowCacheEntry(cacheKey);if(loan){borrowed={loan,pins:0,epoch:ramEpoch,revision:ramRevisions.get(manifest.key)??0};ramLoans.set(cacheKey,borrowed);}}
  if(borrowed){metrics.ramHits++;borrowed.pins++;let released=false;return{bytes:borrowed.loan.entry.data,cached:true,release(){if(released)return;released=true;if(--borrowed.pins)return;ramLoans.delete(cacheKey);if(!borrowed.loan.restore())throw new EngineError('CACHE_CONFLICT','A borrowed synthesis chunk could not return to its RAM owner.');if(borrowed.epoch!==ramEpoch||borrowed.revision!==(ramRevisions.get(manifest.key)??0))budget.remove(cacheKey);}};}
  const release=budget.reserve(3*header.byteLength+512);let bytes;
  try{bytes=await db.getChunk(manifest.generation,header.sequence);current(signal,isCurrent);if(!(bytes instanceof Uint8Array)||bytes.byteLength!==header.byteLength||await digest(bytes)!==header.sha256)throw corrupt('A synthesis chunk is missing or has changed.');current(signal,isCurrent);metrics.verifiedBytes+=bytes.byteLength;return{bytes,release};}catch(error){release();throw error;}
 }
 async function invalidate(db,manifest,key){metrics.corruptions++;forget(key,manifest.generation);try{await db.remove({key,generation:manifest.generation});}catch(error){metrics.cleanupFailures++;metrics.lastCleanupError=error?.code??'STORAGE_IO';}}
 return{
  metrics,
  async writer({key,meta,signal,isCurrent,storage:storageMode='auto'}={}){
   alive();current(signal,isCurrent);key=await verifyKey(key);const spec=layout(meta),db=await selectTransport(storageMode);current(signal,isCurrent);const parentSignal=signal,controller=new AbortController();signal=controller.signal;
   const forwardAbort=()=>controller.abort(parentSignal.reason);parentSignal?.addEventListener('abort',forwardAbort,{once:true});if(parentSignal?.aborted)forwardAbort();
   const generation=crypto.randomUUID();let previous;
   try{previous=await db.begin({key:key.key,generation},{signal,isCurrent});current(parentSignal,isCurrent);if(previous){await db.discard({key:key.key,generation:previous});forget(key.key,previous);}}catch(error){try{await db.discard({key:key.key,generation});}catch(cleanup){error.cleanupError=cleanup;}throw error;}finally{parentSignal?.removeEventListener('abort',forwardAbort);}
   let state='writing',bytesWritten=0,sequence=0,appendSequence=0,tail=Promise.resolve(),aborting,pending=null,pendingLength=0,pendingRelease,hasher;
   const usable=()=>{alive();current(signal,isCurrent);requireValue(state==='writing','Synthesis writer is not writable.');};
   const enqueue=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result.catch(async error=>{try{await owner.abort();}catch(cleanup){error.cleanupError=cleanup;}throw error;});};
   const detach=()=>parentSignal?.removeEventListener('abort',onAbort);
   const onAbort=()=>{controller.abort(parentSignal.reason);void owner.abort().catch(()=>{});};
   const releaseStaging=()=>{pending=null;pendingLength=0;pendingRelease?.();pendingRelease=null;hasher?.release();hasher=null;};
   async function flushChunk(){
    if(!pendingLength)return;usable();const count=pendingLength,release=budget.reserve(3*count+512);
    try{const part=new Uint8Array(count);part.set(pending.subarray(0,count));const sha256=await digest(part);usable();const header={sequence,offset:bytesWritten,byteLength:count,sha256};await db.putChunk({key:key.key,generation,sequence,header,bytes:part},{signal,isCurrent});usable();bytesWritten+=count;sequence++;pendingLength=0;}finally{release();}
   }
   const owner={
    get state(){return state;},get byteLength(){return bytesWritten+pendingLength;},
    append({sequence:ordinal,bytes}={}){return enqueue(async()=>{usable();requireValue(ordinal===appendSequence,'Synthesis append sequence must be continuous from zero.');requireValue(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytesWritten+pendingLength<=spec.byteLength-bytes.byteLength,'Invalid or oversized synthesis chunk.');
     if(!pending){const size=Math.min(chunkBytes,spec.byteLength);pendingRelease=budget.reserve(size);try{pending=new Uint8Array(size);}catch(error){pendingRelease();pendingRelease=null;throw error;}}
     if(!hasher)hasher=await contentHasher(budget);usable();hasher.update(bytes);
     for(let at=0;at<bytes.byteLength;){usable();const count=Math.min(pending.length-pendingLength,bytes.byteLength-at);pending.set(bytes.subarray(at,at+count),pendingLength);pendingLength+=count;at+=count;if(pendingLength===pending.length)await flushChunk();}
     appendSequence++;return bytesWritten+pendingLength;
    });},
    commit(){return enqueue(async()=>{usable();requireValue(bytesWritten+pendingLength===spec.byteLength,'A partial synthesis cannot become a ready cache entry.');await flushChunk();let nextHash=await headSeed(key,spec.metaCanonical);
     try{for(let index=sequence-1;index>=0;index--){usable();const old=await db.getHeader(generation,index);if(!old)throw corrupt('A synthesis writer lost its chunk header.');const header={...old,nextHash};header.hash=await headerHash(header);await db.putHeader({key:key.key,generation,sequence:index,header},{signal,isCurrent});nextHash=header.hash;}
      usable();const manifest={schema:SCHEMA,ready:true,key:key.key,canonical:key.canonical,generation,meta:spec.meta,metaCanonical:spec.metaCanonical,layoutCanonical:spec.layoutCanonical,byteLength:spec.byteLength,chunkCount:sequence,headHash:nextHash,contentSha256:hasher.digest(),persistent:db.backend!=='memory',backend:db.backend??'indexeddb'};const answer=await db.commit({key:key.key,generation,manifest},{signal,isCurrent});
      // Durability and UI adoption are separate. Once IDB acknowledges ready,
      // a late abort/source change may reject this caller but cannot erase it.
      state='committed';writers.delete(owner);detach();releaseStaging();metrics.commits++;if(answer.reused){await db.discard({key:key.key,generation});forget(key.key,generation);}current(signal,isCurrent);return freeze(answer.manifest);
     }catch(error){if(state!=='committed')state='failed';throw error;}
    });},
    abort(){if(state==='committed'||state==='aborted')return Promise.resolve();if(aborting)return aborting;state='aborting';controller.abort();detach();return aborting=(async()=>{await tail;if(state==='committed')return;await db.discard({key:key.key,generation});forget(key.key,generation);releaseStaging();state='aborted';writers.delete(owner);metrics.discardedWrites++;})().finally(()=>{aborting=null;});}
   };writers.add(owner);parentSignal?.addEventListener('abort',onAbort,{once:true});if(parentSignal?.aborted)onAbort();return owner;
  },
  async reader({key,signal,isCurrent}={}){
   alive();current(signal,isCurrent);key=await verifyKey(key);let db=memory,manifest=await memory.getManifest(key.key);if(!manifest){try{db=await selectTransport();manifest=await db.getManifest(key.key);}catch(error){if(!optionalStorageError(error))throw error;metrics.lastStorageError=error.code;}}current(signal,isCurrent);if(!manifest){metrics.misses++;return null;}
   const backingPin=db.backend==='memory'?db.pin(manifest):null;if(db.backend==='memory'&&!backingPin){metrics.misses++;return null;}if(backingPin)manifest=backingPin.manifest;
   let spec,readerClosed=false,tail=Promise.resolve(),cursor=null;
   const usable=()=>{alive();current(signal,isCurrent);if(readerClosed)throw new EngineError('DISPOSED','Synthesis reader is closed.');};
   const fail=async error=>{if(error?.code==='CACHE_CORRUPT'){await invalidate(db,manifest,key.key);metrics.misses++;}throw error;};
   async function headerAt(index,expectedHash,offset){
    usable();const h=await db.getHeader(manifest.generation,index);usable();if(!h||h.sequence!==index||h.offset!==offset||!Number.isSafeInteger(h.byteLength)||h.byteLength<=0||h.offset>manifest.byteLength-h.byteLength||!HASH.test(h.sha256)||!HASH.test(h.nextHash)||await headerHash(h)!==expectedHash)throw corrupt('A synthesis header is missing, reordered or corrupt.');return h;
   }
   try{
    try{spec=layout(manifest.meta);}catch(error){throw corrupt('The synthesis RGB metadata is invalid.');}if(manifest.schema!==SCHEMA||manifest.ready!==true||manifest.key!==key.key||manifest.canonical!==key.canonical||manifest.metaCanonical!==spec.metaCanonical||manifest.layoutCanonical!==spec.layoutCanonical||manifest.byteLength!==spec.byteLength||!Number.isSafeInteger(manifest.chunkCount)||manifest.chunkCount<=0||!HASH.test(manifest.headHash)||!HASH.test(manifest.contentSha256)||typeof manifest.generation!=='string')throw corrupt('The synthesis ready manifest is invalid.');
    let expected=manifest.headHash,offset=0;const hash=await contentHasher(budget);
    // Verify completeness before exposing a hit. Large entries use constant
    // staging space; later reads can retain individual verified chunks in RAM.
    try{for(let i=0;i<manifest.chunkCount;i++){const h=await headerAt(i,expected,offset),held=await chunk(db,manifest,h,{signal,isCurrent});try{hash.update(held.bytes);offset+=h.byteLength;expected=h.nextHash;}finally{held.release();}}
     if(offset!==manifest.byteLength||expected!==await headSeed(key,spec.metaCanonical)||hash.digest()!==manifest.contentSha256)throw corrupt('The synthesis chain is incomplete.');usable();if(db.backend==='memory')metrics.memoryHits++;else metrics.persistentHits++;
    }finally{hash.release();}
   }catch(error){backingPin?.release();if(error?.code==='CACHE_CORRUPT'){await invalidate(db,manifest,key.key);metrics.misses++;return null;}throw error;}
   function enqueue(fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}
   async function readInto(target,offset){
    usable();requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=manifest.byteLength-target.byteLength,'Invalid synthesis byte window.');
    let start=cursor&&offset>=cursor.offset?{...cursor}:{index:0,offset:0,expected:manifest.headHash},written=0;
    try{while(written<target.byteLength){const h=await headerAt(start.index,start.expected,start.offset),end=h.offset+h.byteLength;if(offset+written<end){const held=await chunk(db,manifest,h,{signal,isCurrent});try{usable();const at=offset+written-h.offset,count=Math.min(target.byteLength-written,h.byteLength-at);target.set(held.bytes.subarray(at,at+count),written);written+=count;if(!held.cached)remember(manifest.key,manifest.generation,h.sequence,held.bytes);}finally{held.release();}}
      cursor={...start};start={index:start.index+1,offset:end,expected:h.nextHash};}usable();return target;
    }catch(error){return fail(error);}
   }
   const owner={
    meta:freeze(spec.meta),byteLength:manifest.byteLength,manifest:freeze(manifest),persistent:manifest.persistent===true,backend:manifest.backend,
    // Publication transfers this verified reader to a source/result owner.
    // A request cancelled after that transfer must not revoke its native data.
    detachRequest(){usable();signal=undefined;isCurrent=undefined;return owner;},
    adopt(){return owner.detachRequest();},
    readInto:(target,offset=0)=>enqueue(()=>readInto(target,offset)),
    read({offset=0,length}={}){return enqueue(async()=>{usable();requireValue(Number.isSafeInteger(length)&&length>=0,'A bounded synthesis read length is required.');const release=budget.reserve(length);try{const bytes=new Uint8Array(length);await readInto(bytes,offset);let done=false;return{bytes,release(){if(!done){done=true;release();}}};}catch(error){release();throw error;}});},
    async *stream(){for(let offset=0;offset<manifest.byteLength;){const held=await owner.read({offset,length:Math.min(chunkBytes,manifest.byteLength-offset)});try{yield{...held,offset};}finally{held.release();}offset+=held.bytes.length;}},
    async *rows({frame=0,y=0,height=spec.meta.height-y,rowsPerBlock=1}={}){requireValue(frame===0&&Number.isSafeInteger(y)&&y>=0&&Number.isSafeInteger(height)&&height>=0&&y<=spec.meta.height-height&&Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid synthesis row window.');for(let row=y;row<y+height;){const count=Math.min(rowsPerBlock,y+height-row),held=await owner.read({offset:row*spec.meta.width*3,length:count*spec.meta.width*3});try{yield{y:row,height:count,width:spec.meta.width,format:'rgb8',data:held.bytes,release:held.release};}finally{held.release();}row+=count;}},
    async close(){readerClosed=true;await tail;backingPin?.release();readers.delete(owner);}
   };readers.add(owner);return owner;
  },
  evictRam(key){if(key)keyDescriptor(key);forget(key?.key);memory.evict(key?.key);},
  async remove(key){key=keyDescriptor(key);forget(key.key);await memory.remove({key:key.key});try{const db=await transport();await db.remove({key:key.key});}catch(error){if(!optionalStorageError(error))throw error;metrics.lastStorageError=error.code;}},
  close(){if(closing)return closing;closed=true;closing=(async()=>{const outcomes=await Promise.allSettled([...writers].map(w=>w.abort()));await Promise.all([...readers].map(r=>r.close()));forget();const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;memory.close();if(storage)(await storage).close();})();void closing.catch(()=>{closing=null;});return closing;}
 };
}
