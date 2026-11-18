// Bounded encoded-byte artifacts when a browser cannot open OPFS. Private
// contexts may back IndexedDB with RAM; this is not a disk/mmap guarantee.
const PREFIX='sherloq-batch-artifacts-v1-',CHUNK_BYTES=1024**2;
const failure=error=>typeof error?.code==='string'?error:Object.assign(Error(error?.name==='QuotaExceededError'?'Stockage temporaire plein : les sorties précédentes restent disponibles.':'Stockage temporaire du lot (IndexedDB) indisponible : '+error.message),{code:error?.name==='QuotaExceededError'?'STORAGE_QUOTA':'STORAGE_IO',cause:error});
export async function createIndexedDbBatchArtifactStore({indexedDB=globalThis.indexedDB,fallback}={}){
 if(!indexedDB)throw failure(Error('IndexedDB unavailable.'));const name=PREFIX+crypto.randomUUID(),records=new Map();let disposed=false,disposing,tail=Promise.resolve(),serial=0,activeTransactions=0,startedTransactions=0,completedTransactions=0,failedTransactions=0;
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('chunks');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(failure(request.error));request.onblocked=()=>reject(failure(Error('Owned temporary database creation blocked.')));});
 db.onversionchange=()=>db.close();
 const alive=()=>{if(disposed)throw Object.assign(Error('Stockage du lot fermé.'),{code:'DISPOSED'});};
 const queue=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
 const transaction=(mode,action)=>new Promise((resolve,reject)=>{
  let tx,value,cause,counted=false,settled=false;
  const settle=error=>{if(settled)return;settled=true;if(counted)activeTransactions--;if(error){failedTransactions++;reject(failure(error));}else{completedTransactions++;resolve(value);}};
  try{tx=db.transaction('chunks',mode);counted=true;activeTransactions++;startedTransactions++;tx.oncomplete=()=>settle();tx.onabort=()=>settle(cause??tx.error??Error('Transaction aborted.'));tx.onerror=()=>{};action(tx.objectStore('chunks'),result=>value=result,error=>{cause=error;tx.abort();});}catch(error){try{tx?.abort();}catch{}settle(error);}
 });
 const remove=record=>transaction('readwrite',store=>{for(let i=0;i<record.chunks;i++)store.delete([record.id,i]);});
 return {
  get size(){return records.size;},has:path=>records.has(path),keys:()=>records.keys(),
  snapshot:()=>({kind:'indexeddb-chunks',backend:'indexeddb',backingMedium:'browser-managed; not guaranteed disk',files:records.size,bytes:[...records.values()].reduce((n,r)=>n+r.size,0),retainedResultBlobBytes:0,maximumChunkBytes:CHUNK_BYTES,activeTransactions,transactions:{started:startedTransactions,completed:completedTransactions,failed:failedTransactions},...fallback?{fallback}:{}}),
  get(path){alive();return queue(async()=>{
   const record=records.get(path);if(!record)return;const parts=[];
   for(let index=0;index<record.chunks;index++){
    const bytes=await transaction('readonly',(store,set)=>{const request=store.get([record.id,index]);request.onsuccess=()=>set(request.result);}),expected=Math.min(CHUNK_BYTES,record.size-index*CHUNK_BYTES);
    if(!(bytes instanceof Uint8Array)||bytes.byteLength!==expected)throw failure(Error('Stored artifact chunk length or type differs.'));
    // Each native Blob part owns only this bounded read. No full encoded
    // artifact is materialized as a JavaScript ArrayBuffer.
    parts.push(new Blob([bytes]));
   }
   return new Blob(parts,{type:record.type});
  });},
  set(path,blob){alive();if(!(blob instanceof Blob))throw TypeError('Artifact must be a Blob.');return queue(async()=>{
   const record={id:++serial,size:blob.size,type:blob.type,chunks:Math.ceil(blob.size/CHUNK_BYTES)};let written=0;
   try{
    for(let index=0;index<record.chunks;index++){const bytes=new Uint8Array(await blob.slice(index*CHUNK_BYTES,Math.min(blob.size,(index+1)*CHUNK_BYTES)).arrayBuffer());await transaction('readwrite',store=>store.put(bytes,[record.id,index]));written++;}
    const previous=records.get(path);if(previous)await remove(previous);records.set(path,record);return this;
   }catch(error){try{await remove({...record,chunks:written});}catch(cleanupError){error.cleanupError=cleanupError;}throw failure(error);}
  });},
  delete(path){alive();return queue(async()=>{const record=records.get(path);if(!record)return false;await remove(record);records.delete(path);return true;});},
  clear(){alive();return queue(async()=>{await transaction('readwrite',store=>store.clear());records.clear();});},
  dispose(){if(disposing)return disposing;disposed=true;disposing=(async()=>{await tail;db.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=()=>resolve();request.onerror=()=>reject(failure(request.error));request.onblocked=()=>reject(failure(Error('Owned temporary database is still open.')));});records.clear();})();return disposing;}
 };
}
