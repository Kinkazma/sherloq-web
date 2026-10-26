// The index retains handles and sizes, never the whole lot's result Blobs.
// Files belong to this open batch only and are removed by reset/dispose.
const ROOT='sherloq-batch-temporary-v1';
const storageError=error=>Object.assign(Error(error?.name==='QuotaExceededError'?'Stockage temporaire plein : les sorties précédentes restent disponibles.':'Stockage temporaire du lot indisponible : '+error.message),{code:error?.name==='QuotaExceededError'?'STORAGE_QUOTA':'STORAGE_IO',cause:error});
export async function createBatchTemporaryDirectory({rootFactory=()=>navigator.storage.getDirectory(),locks=globalThis.navigator?.locks}={}){
 let parent,directory;const id='batch-'+crypto.randomUUID();
 let unlock,lease;const key=name=>ROOT+':'+name;
 try{
  if(locks){const ready=new Promise(resolve=>{lease=locks.request(key(id),async()=>{const held=new Promise(done=>unlock=done);resolve();await held;});});await Promise.race([ready,lease]);}
  parent=await (await rootFactory()).getDirectoryHandle(ROOT,{create:true});directory=await parent.getDirectoryHandle(id,{create:true});
  // A dead tab releases its Web Lock. Never reclaim another live batch's
  // directory; older sessions are removed only when their lock is available.
  if(locks&&typeof parent.entries==='function')for await(const [name]of parent.entries())if(name!==id&&/^batch-[a-f0-9-]{36}$/.test(name))await locks.request(key(name),{ifAvailable:true},async lock=>{if(lock)try{await parent.removeEntry(name,{recursive:true});}catch(error){if(!['NotFoundError','NoModificationAllowedError','InvalidStateError'].includes(error.name))throw error;}});
 }catch(error){if(directory)await parent.removeEntry(id,{recursive:true}).catch(()=>{});unlock?.();await lease?.catch(()=>{});throw storageError(error);}
 return {directory,async cleanup(){try{await parent.removeEntry(id,{recursive:true});}finally{unlock?.();await lease;}}};
}
async function createOpfsBatchArtifactStore(options={}){
 const temporary=await createBatchTemporaryDirectory(options),{directory}=temporary,records=new Map(),pending=new Set();let serial=0,disposed=false;
 const alive=()=>{if(disposed)throw Object.assign(Error('Stockage du lot fermé.'),{code:'DISPOSED'});};
 const remove=async record=>{try{await directory.removeEntry(record.name);}catch(error){if(error.name!=='NotFoundError')throw storageError(error);}};
 return {
  get size(){return records.size;},has:path=>records.has(path),keys:()=>records.keys(),
  snapshot:()=>({kind:'origin-private-files',backend:'opfs',files:records.size,bytes:[...records.values()].reduce((n,r)=>n+r.size,0),retainedResultBlobBytes:0}),
  async get(path){alive();const record=records.get(path);if(!record)return;try{const file=await record.handle.getFile();return file.slice(0,file.size,record.type);}catch(error){throw storageError(error);}},
  async set(path,blob){alive();const name='output-'+(++serial);const task=(async()=>{let handle,writer;
   try{handle=await directory.getFileHandle(name,{create:true});writer=await handle.createWritable();await writer.write(blob);await writer.close();writer=null;alive();
    const previous=records.get(path);if(previous)await remove(previous);records.set(path,{name,handle,size:blob.size,type:blob.type});return this;
   }catch(error){await writer?.abort().catch(()=>{});await directory.removeEntry(name).catch(()=>{});throw storageError(error);}
   })();pending.add(task);try{return await task;}finally{pending.delete(task);}
  },
  async delete(path){alive();const record=records.get(path);if(!record)return false;await remove(record);records.delete(path);return true;},
  async clear(){alive();const old=[...records.values()];records.clear();for(const record of old)await remove(record);},
  async dispose(){if(disposed)return;disposed=true;await Promise.allSettled([...pending]);records.clear();await temporary.cleanup();}
 };
}

// Retry only setup: an open OPFS store never migrates after a write failure.
export async function createBatchArtifactStore(options={}){
 try{return await createOpfsBatchArtifactStore(options);}
 catch(error){if(error.code!=='STORAGE_IO'||!(options.indexedDB??globalThis.indexedDB))throw error;const{createIndexedDbBatchArtifactStore}=await import('./batch-artifacts-idb.js?v=0.25.0');return createIndexedDbBatchArtifactStore({...options,fallback:{from:'opfs',code:error.code,message:error.message}});}
}
