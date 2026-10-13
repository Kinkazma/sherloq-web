let sessionFolder;
// Prefer disk-backed browser storage. Returned File stays alive until explicit
// cleanup; the analysis and original file are never changed. No fixed size cap.
export async function createExportSink({memoryBudgetBytes,signal,mime}={}){
 let root,name,handle,writer;
 try{if(navigator.storage?.getDirectory){const storage=await navigator.storage.getDirectory();const parent=await storage.getDirectoryHandle('sherloq-exports',{create:true});
 if(!sessionFolder){sessionFolder='session-'+crypto.randomUUID();if(navigator.locks){for await(const [old] of parent.entries()){if(old.startsWith('session-'))await navigator.locks.request('sherloq-export-'+old,{ifAvailable:true},async lock=>{if(lock)await parent.removeEntry(old,{recursive:true}).catch(()=>{});});}void navigator.locks.request('sherloq-export-'+sessionFolder,()=>new Promise(()=>{}));}}
 root=await parent.getDirectoryHandle(sessionFolder,{create:true});name='export-'+crypto.randomUUID();handle=await root.getFileHandle(name,{create:true});writer=await handle.createWritable();}}
 catch(error){if(name)await root?.removeEntry(name).catch(()=>{});root=null;writer=null;}
 let parts=[],size=0,closed=false;
 const cleanup=async()=>{if(!closed)await writer?.abort().catch(()=>{});closed=true;parts=[];if(root)await root.removeEntry(name).catch(()=>{});};
 return {async write(bytes){if(signal?.aborted||closed)throw Object.assign(Error('Export cancelled'),{code:'CANCELLED'});if(writer)await writer.write(bytes);else{size+=bytes.byteLength;if(size>memoryBudgetBytes)throw Object.assign(Error('Temporary file storage unavailable and export exceeds available memory'),{code:'STORAGE_UNAVAILABLE'});parts.push(new Blob([bytes]));}},async finish(){if(writer){await writer.close();closed=true;return {blob:await handle.getFile(),cleanup};}const blob=new Blob(parts,{type:mime});closed=true;parts=[];return {blob,cleanup};},abort:cleanup};
}
