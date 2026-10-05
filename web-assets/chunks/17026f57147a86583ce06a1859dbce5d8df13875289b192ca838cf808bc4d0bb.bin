import "../../runtime-context.js?v=0.14.5";
// Local asynchronous alternative when a dedicated worker cannot open OPFS.
// IndexedDB may be memory-backed in private browser contexts; this is not mmap.
import {EngineError,requireValue,checkAbort} from './errors.js';
const PREFIX='sherloq-temporary-v1-';
const validId=id=>/^job-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const failure=e=>e instanceof EngineError?e:new EngineError(e?.name==='QuotaExceededError'?'STORAGE_QUOTA':'STORAGE_IO','IndexedDB temporary storage failed ('+(e?.name??'unknown')+').');
function open(id){return new Promise((resolve,reject)=>{const r=indexedDB.open(PREFIX+id,1);let created=false;r.onupgradeneeded=()=>{created=true;r.result.createObjectStore('chunks');};r.onsuccess=()=>{if(!created){r.result.close();reject(new EngineError('STORAGE_BUSY','Temporary session ID already exists.'));}else resolve(r.result);};r.onerror=()=>reject(failure(r.error));r.onblocked=()=>reject(new EngineError('STORAGE_BUSY','Temporary database creation blocked.'));});}
export function removeIndexedDbSession(id){
 requireValue(validId(id),'Invalid owned temporary session ID.');
 return new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(PREFIX+id);r.onsuccess=()=>resolve();r.onerror=()=>reject(failure(r.error));r.onblocked=()=>reject(new EngineError('STORAGE_BUSY','An owned temporary database is still open.'));});
}
export async function createIndexedDbSession({signal,maximumBytes=Infinity,budget,pageBytes=1024**2,id:requestedId,readCache=true,readCachePages=2}={}){
 checkAbort(signal);requireValue(budget&&typeof budget.reserve==='function','IndexedDB requires a shared staging budget.');requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>0,'Invalid storage page size.');
 requireValue(maximumBytes===Infinity||Number.isSafeInteger(maximumBytes)&&maximumBytes>=0,'Invalid storage allowance.');
 requireValue(typeof readCache==='boolean'&&(readCachePages===Infinity||Number.isSafeInteger(readCachePages)&&readCachePages>0),'Invalid page-cache option.');
 if(!globalThis.indexedDB)throw new EngineError('STORAGE_UNAVAILABLE','IndexedDB is unavailable.');
 let estimate={};try{estimate=await navigator.storage.estimate();}catch{}
 // Quota and usage are advisory and may be privacy-padded. Only explicit limits
 // govern logical admission; estimates are reported, not substituted for the
 // logical allowance; actual browser quota enforcement still governs every write.
 const available=Number.isFinite(estimate.quota)&&Number.isFinite(estimate.usage)?Math.max(0,estimate.quota-estimate.usage):Infinity,limit=maximumBytes,id=requestedId??'job-'+crypto.randomUUID();requireValue(validId(id),'Invalid owned temporary session ID.');const db=await open(id);
 try{checkAbort(signal);}catch(e){db.close();await removeIndexedDbSession(id);throw e;}
 db.onversionchange=()=>db.close();
 const arrays=new Map();let reserved=0,peak=0,serial=0,disposed=false,disposing,tail=Promise.resolve();
 const cacheEnabled=readCache&&['get','put','remove','clearPrefix'].every(name=>typeof budget[name]==='function'),cachePrefix='temporary-idb/'+id+'/',reads={transactions:0,cacheHits:0,requestedBytes:0};
 const arrayPrefix=record=>cachePrefix+record.id+'/',pageKey=(record,index)=>arrayPrefix(record)+index;
 function touchPage(record,key){const keys=record.cacheKeys;if(!keys)return;keys.delete(key);keys.add(key);while(keys.size>readCachePages){const oldest=keys.values().next().value;keys.delete(oldest);budget.remove(oldest);}}
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Temporary session disposed.');};
 function queue(fn){const p=tail.then(fn);tail=p.catch(()=>{});return p;}
 function transaction(mode,action){return new Promise((resolve,reject)=>{let tx,result,cause;try{tx=db.transaction('chunks',mode);tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure(cause??tx.error));tx.onerror=()=>{};action(tx.objectStore('chunks'),value=>{result=value;},error=>{cause=error;tx.abort();});}catch(e){if(tx)try{tx.abort();}catch{}reject(failure(e));}});}
 function range(record,offset,length){alive();if(record.closed)throw new EngineError('DISPOSED','Temporary array closed.');requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=record.byteLength-length,'Invalid temporary byte range.');}
 return {
  id,backend:'indexeddb',capability:{available:true,asynchronous:true,quotaBytes:estimate.quota??null,usageBytes:estimate.usage??null,estimateIsReservation:false,backingMedium:'browser-managed; not guaranteed disk'},
  snapshot:()=>({reservedBytes:reserved,peakReservedBytes:peak,estimatedAvailableBytes:Number.isFinite(available)?available:null,estimateIsAdmissionLimit:false,logicalLimitBytes:Number.isFinite(limit)?limit:null,openFiles:0,arrays:arrays.size,pageBytes,backend:'indexeddb',readCacheEnabled:cacheEnabled,readCachePages:Number.isFinite(readCachePages)?readCachePages:null,reads:{...reads}}),
  clearReadCache(){if(cacheEnabled)budget.clearPrefix(cachePrefix);},
  async create(byteLength,{signal}={}){
   alive();checkAbort(signal);requireValue(Number.isSafeInteger(byteLength)&&byteLength>=0,'Invalid temporary array length.');if(byteLength>limit-reserved)throw new EngineError('STORAGE_QUOTA','Planned temporary arrays exceed the explicit storage allowance.');
   reserved+=byteLength;peak=Math.max(peak,reserved);const record={id:++serial,byteLength,closed:false,cacheKeys:cacheEnabled&&Number.isFinite(readCachePages)?new Set():null};arrays.set(record.id,record);
   return {
    byteLength,
    readInto(target,offset=0){requireValue(target instanceof Uint8Array,'A byte target is required.');range(record,offset,target.length);return queue(async()=>{let done=0;reads.requestedBytes+=target.length;while(done<target.length){
     const at=offset+done,index=Math.floor(at/pageBytes),within=at%pageBytes,size=Math.min(pageBytes,byteLength-index*pageBytes),n=Math.min(target.length-done,size-within),key=pageKey(record,index);let data=cacheEnabled?budget.get(key):undefined;
     if(data)reads.cacheHits++;
     else{const release=budget.reserve(size);try{reads.transactions++;data=await transaction('readonly',(store,set,abort)=>{const r=store.get([record.id,index]);r.onsuccess=()=>{try{set(r.result??new Uint8Array(size));}catch(e){abort(e);}};});}finally{release();}if(cacheEnabled)budget.put(key,data);}
     if(cacheEnabled)touchPage(record,key);target.set(data.subarray(within,within+n),done);done+=n;
    }return target;});},
    write(source,offset=0){requireValue(source instanceof Uint8Array,'A byte source is required.');range(record,offset,source.length);return queue(async()=>{let done=0;while(done<source.length){const at=offset+done,index=Math.floor(at/pageBytes),within=at%pageBytes,size=Math.min(pageBytes,byteLength-index*pageBytes),n=Math.min(source.length-done,size-within);if(cacheEnabled){const key=pageKey(record,index);budget.remove(key);record.cacheKeys?.delete(key);}const release=budget.reserve(2*size);try{await transaction('readwrite',(store,set,abort)=>{const r=store.get([record.id,index]);r.onsuccess=()=>{try{const page=r.result??new Uint8Array(size);page.set(source.subarray(done,done+n),within);store.put(page,[record.id,index]);}catch(e){abort(e);}};});}finally{release();}done+=n;}});},
    flush:()=>queue(()=>{}),
    dispose(){if(disposed)return disposing;if(record.removing)return record.removing;record.closed=true;record.removing=queue(async()=>{try{await transaction('readwrite',store=>store.delete(IDBKeyRange.bound([record.id,0],[record.id,Number.MAX_SAFE_INTEGER])));arrays.delete(record.id);reserved-=byteLength;}finally{if(cacheEnabled)budget.clearPrefix(arrayPrefix(record));record.cacheKeys?.clear();}});return record.removing;}
   };
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=(async()=>{await tail;try{db.close();await removeIndexedDbSession(id);arrays.clear();reserved=0;}finally{if(cacheEnabled)budget.clearPrefix(cachePrefix);}})();return disposing;}
 };
}
