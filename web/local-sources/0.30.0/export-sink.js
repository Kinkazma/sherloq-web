let sessionFolder;
// Prefer disk-backed browser storage. Adopt the owner before storage can create
// a file; failed opening cleanup fences that owner until its explicit retry.
export async function createExportSink({memoryBudgetBytes,signal,mime,onOwner}={}){
 let root,name,handle,writer,parts=[],size=0,closed=false,removed=false,retiring=false,cleanupTask,openingFailure,resolveOpening;
 const openingDone=new Promise(resolve=>resolveOpening=resolve),operations=new Set();
 const cancelled=()=>Object.assign(Error('Export cancelled'),{code:'CANCELLED'});
 const ready=()=>{if(openingFailure)throw openingFailure;if(signal?.aborted||retiring||closed)throw cancelled();};
 const operation=action=>{const task=Promise.resolve().then(action);operations.add(task);task.then(()=>operations.delete(task),()=>operations.delete(task));return task;};
 const cleanup=()=>{if(cleanupTask)return cleanupTask;retiring=true;return cleanupTask=(async()=>{await openingDone;await Promise.allSettled([...operations]);if(!closed){await writer?.abort();closed=true;}if(root&&!removed){await root.removeEntry(name);removed=true;}parts=[];})().catch(error=>{cleanupTask=null;throw error;});};
 const owner={get storage(){return writer?'opfs':'memory';},ready,
  write:bytes=>operation(async()=>{ready();if(writer)await writer.write(bytes);else{size+=bytes.byteLength;if(size>memoryBudgetBytes)throw Object.assign(Error('Temporary file storage unavailable and export exceeds available memory'),{code:'STORAGE_UNAVAILABLE'});parts.push(new Blob([bytes]));}}),
  finish:()=>operation(async()=>{ready();if(writer){await writer.close();closed=true;return{blob:await handle.getFile(),storage:'opfs',cleanup};}const blob=new Blob(parts,{type:mime});closed=true;parts=[];return{blob,storage:'memory',cleanup};}),abort:cleanup};
 try{
  onOwner?.(owner);
  try{if(navigator.storage?.getDirectory){const storage=await navigator.storage.getDirectory();const parent=await storage.getDirectoryHandle('sherloq-exports',{create:true});
   if(!sessionFolder){sessionFolder='session-'+crypto.randomUUID();if(navigator.locks){for await(const [old] of parent.entries()){if(old.startsWith('session-'))await navigator.locks.request('sherloq-export-'+old,{ifAvailable:true},async lock=>{if(lock)await parent.removeEntry(old,{recursive:true}).catch(()=>{});});}void navigator.locks.request('sherloq-export-'+sessionFolder,()=>new Promise(()=>{}));}}
   root=await parent.getDirectoryHandle(sessionFolder,{create:true});name='export-'+crypto.randomUUID();handle=await root.getFileHandle(name,{create:true});writer=await handle.createWritable();}}
  catch(primary){
   if(name)try{await root?.removeEntry(name);removed=true;}catch(secondary){openingFailure=Object.assign(Error('Temporary export storage did not acknowledge its failed opening cleanup.',{cause:primary}),{code:'EXPORT_STORAGE_OPEN_FAILED',downloadCleanupErrors:[secondary]});if(onOwner)throw openingFailure;}
   if(!openingFailure){root=null;writer=null;}
  }
 }finally{resolveOpening();}
 return owner;
}
