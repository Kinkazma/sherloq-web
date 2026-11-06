import "../../../../../runtime-context.js?v=0.31.0";
import {EngineError,checkAbort,requireValue} from './errors.js';

// This database outlives temporary image/job sessions. A writer generation is
// private until its complete manifest is committed in one IDB transaction.
const STORES=['manifests','writers','headers','chunks'];
const failure=error=>error instanceof EngineError?error:new EngineError(error?.name==='QuotaExceededError'?'STORAGE_QUOTA':'STORAGE_IO','ELA synthesis IndexedDB storage failed.',{cause:error});
const stale=()=>new EngineError('STALE_RESULT','The synthesis cache writer no longer owns this key.');

export async function createElaSynthesisIndexedDb({indexedDB=globalThis.indexedDB,keyRange=globalThis.IDBKeyRange,databaseName='sherloq-ela-synthesis-v1'}={}){
 requireValue(typeof databaseName==='string'&&databaseName.length>0,'A synthesis database name is required.');
 if(!indexedDB||!keyRange)throw new EngineError('STORAGE_UNAVAILABLE','Persistent synthesis storage is unavailable.');
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>{for(const name of STORES)if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(failure(request.error));request.onblocked=()=>reject(new EngineError('STORAGE_BUSY','The synthesis database is blocked.'));
 });
 let closed=false;db.onversionchange=()=>{closed=true;db.close();};
 const range=generation=>keyRange.bound([generation,0],[generation,Number.MAX_SAFE_INTEGER]);
 function transaction(names,mode,action,{signal,isCurrent}={}){
  checkAbort(signal);if(closed)return Promise.reject(new EngineError('DISPOSED','Synthesis storage is closed.'));
  return new Promise((resolve,reject)=>{
   let tx,result,cause,done=false;
   const cleanup=()=>signal?.removeEventListener('abort',abort);
   const abort=()=>{try{checkAbort(signal);}catch(error){cause=error;}try{tx?.abort();}catch{}};
   const fail=error=>{cause=error;try{tx.abort();}catch{}};
   const current=()=>{checkAbort(signal);if(isCurrent&&isCurrent()!==true)throw stale();};
   try{
    // oncomplete is the durability ACK. Request adoption is checked by the
    // cache owner afterwards; an abort too late to abort IDB cannot undo ready.
    tx=db.transaction(names,mode);tx.oncomplete=()=>{if(done)return;done=true;cleanup();resolve(result);};
    tx.onabort=()=>{if(done)return;done=true;cleanup();reject(cause??failure(tx.error));};tx.onerror=()=>{};
    signal?.addEventListener('abort',abort,{once:true});current();
    action(name=>tx.objectStore(name),value=>{result=value;},fail,current);
   }catch(error){if(tx)fail(error);else{cleanup();reject(failure(error));}}
  });
 }
 const get=(store,key)=>transaction([store],'readonly',(s,set)=>{const request=s(store).get(key);request.onsuccess=()=>set(request.result??null);});
 const guardedWrite=(entry,write,hooks)=>transaction(['writers','headers','chunks'],'readwrite',(s,set,fail,current)=>{
  const request=s('writers').get(entry.key);request.onsuccess=()=>{try{current();if(request.result?.generation!==entry.generation)throw stale();write(s);set(true);}catch(error){fail(error);}};
 },hooks);
 return{
  backend:'indexeddb',databaseName,
  begin({key,generation},hooks){return transaction(['writers'],'readwrite',(s,set,fail,current)=>{const request=s('writers').get(key);request.onsuccess=()=>{try{current();set(request.result?.generation??null);s('writers').put({key,generation},key);}catch(error){fail(error);}};},hooks);},
  putChunk({key,generation,sequence,header,bytes},hooks){return guardedWrite({key,generation},s=>{s('headers').put(header,[generation,sequence]);s('chunks').put(bytes,[generation,sequence]);},hooks);},
  putHeader({key,generation,sequence,header},hooks){return guardedWrite({key,generation},s=>s('headers').put(header,[generation,sequence]),hooks);},
  getManifest:key=>get('manifests',key),
  getHeader:(generation,sequence)=>get('headers',[generation,sequence]),
  getChunk:(generation,sequence)=>get('chunks',[generation,sequence]),
  commit({key,generation,manifest},hooks){return transaction(['writers','manifests'],'readwrite',(s,set,fail,current)=>{
   const owner=s('writers').get(key);owner.onsuccess=()=>{try{current();if(owner.result?.generation!==generation)throw stale();const previous=s('manifests').get(key);previous.onsuccess=()=>{try{
    current();const ready=previous.result;
    if(ready&&(ready.canonical!==manifest.canonical||ready.layoutCanonical!==manifest.layoutCanonical||ready.contentSha256!==manifest.contentSha256||ready.byteLength!==manifest.byteLength))throw new EngineError('CACHE_CONFLICT','One synthesis identity produced different exact bytes or layout.');
    if(!ready)s('manifests').put(manifest,key);s('writers').delete(key);set({manifest:ready??manifest,reused:!!ready});
   }catch(error){fail(error);}};}catch(error){fail(error);}};
  },hooks);},
  discard({key,generation}){return transaction(STORES,'readwrite',(s,set)=>{
   const ready=s('manifests').get(key);ready.onsuccess=()=>{if(ready.result?.generation===generation){set(false);return;}const request=s('writers').get(key);request.onsuccess=()=>{if(request.result?.generation===generation)s('writers').delete(key);};s('headers').delete(range(generation));s('chunks').delete(range(generation));set(true);};
  });},
  remove({key,generation}){return transaction(STORES,'readwrite',(s,set)=>{
   const request=s('manifests').get(key);request.onsuccess=()=>{const ready=request.result;if(ready&&(!generation||ready.generation===generation)){s('manifests').delete(key);if(typeof ready.generation==='string'){s('headers').delete(range(ready.generation));s('chunks').delete(range(ready.generation));}}};
   if(!generation){const writer=s('writers').get(key);writer.onsuccess=()=>{if(writer.result){s('headers').delete(range(writer.result.generation));s('chunks').delete(range(writer.result.generation));s('writers').delete(key);}};}set(true);
  });},
  close(){if(!closed){closed=true;db.close();}}
 };
}
