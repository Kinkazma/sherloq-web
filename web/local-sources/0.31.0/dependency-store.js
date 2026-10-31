import {createExtensionResourceResolver} from './extension-resource-relay.js?v=0.31.0';
import {readPinnedDependencyResponse} from './extension-resource-client.js?v=0.31.0';
import {sha256} from './dependency-core.js?v=0.31.0';
const DB='sherloq-dependency-library-v1';
export async function libraryValue(key,value){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('settings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('settings',arguments.length>1?'readwrite':'readonly'),s=tx.objectStore('settings'),r=arguments.length>1?s.put(value,key):s.get(key);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||r.error);});}finally{db.close();}
}
export async function libraryFile(folder,path,create=false){
 const names=path.split('/');if(names.some(n=>!n||n==='.'||n==='..'))throw Error('Invalid library file path');
 for(const name of names.slice(0,-1))folder=await folder.getDirectoryHandle(name,{create});
 return folder.getFileHandle(names.at(-1),{create});
}
export async function saveLibraryFile(folder,path,file,load,{signal}={}){
 const handle=await libraryFile(folder,path,true),writer=await handle.createWritable();
 try{for(const hash of file.chunks){signal?.throwIfAborted();await writer.write(await load(hash));}await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
}
export function createChunkLoader(manifest,{base,scope,fetcher=fetch,folder=()=>libraryValue('folder'),archive,cacheStorage=globalThis.caches,concurrency=2,cacheWrites=true,extensionResource}={}){
 const extension=extensionResource??createExtensionResourceResolver(manifest,{scope,cacheStorage,cacheWrites});
 const active=new Map(),waiters=[];let running=0,reserved=0,cachePromise,cacheKeysPromise;
 const locations=new Map();for(const [path,file] of Object.entries(manifest.files)){let offset=0;for(const h of file.chunks){if(!locations.has(h))locations.set(h,[]);locations.get(h).push({path,offset});offset+=manifest.chunks[h];}}
 const byteBudget=128*1024*1024;
 function pump(){for(let i=0;i<waiters.length&&running<concurrency;){const w=waiters[i];if(reserved+w.bytes>byteBudget){i++;continue;}waiters.splice(i,1);running++;reserved+=w.bytes;w.resolve();}}
 const cache=()=>cachePromise??=cacheStorage?.open('sherloq-dependency-chunks-v1').catch(()=>null);
 const key=h=>new URL('./__dependency_chunks__/'+h,scope).href;
 const verify=async(h,b)=>{if(b.byteLength!==manifest.chunks[h]||await sha256(b)!==h)throw Error('Dependency integrity failure: '+h);return b;};
 async function read(h,observe=()=>{}){
  const report=value=>{try{observe({chunk:h,expectedBytes:manifest.chunks[h],...value});}catch{}};
  if(!Object.hasOwn(manifest.chunks,h))throw Error('Unknown dependency chunk');
  const c=await cache(),url=key(h);let cached=await c?.match(url).catch(()=>null),localCause;const localFailures=[];
  const localFailure=(source,error)=>{localCause=error;localFailures.push({source,name:error.name,code:error.code,message:error.message});};

  if(cached){try{const bytes=await readPinnedDependencyResponse(cached,h,manifest.chunks[h]);report({level:'info',kind:'dependency.cache-hit'});return bytes;}catch(error){localFailure('cache',error);report({level:'warning',kind:'dependency.cache-invalid',error:{message:error.message}});await c.delete(url).catch(()=>{});}}
  if(c){cacheKeysPromise??=typeof c.keys==='function'?c.keys().catch(()=>[]):Promise.resolve([]);for(const other of await cacheKeysPromise)if(other.url.endsWith('/__dependency_chunks__/'+h)){const found=await c.match(other).catch(()=>null);if(found)try{const data=await readPinnedDependencyResponse(found,h,manifest.chunks[h]);report({level:'info',kind:'dependency.cache-hit',reusedScope:true});return data;}catch(error){localFailure('cache',error);await c.delete(other).catch(()=>{});}}}
  let bytes,localSource=false;if(archive)try{const value=await archive(h);if(value){bytes=await verify(h,value);localSource=true;report({level:'info',kind:'dependency.archive-hit'});}}catch(error){localFailure('archive',error);report({level:'warning',kind:'dependency.archive-invalid',error:{message:error.message}});}
  const local=bytes?null:await folder().catch(error=>{localFailure('folder-access',error);return null;});
  if(local)for(const {path,offset} of locations.get(h)||[])try{const file=await(await libraryFile(local,path)).getFile();if(file.size!==manifest.files[path].size)throw Error('Local library file length differs: '+path);bytes=await verify(h,new Uint8Array(await file.slice(offset,offset+manifest.chunks[h]).arrayBuffer()));localSource=true;report({level:'info',kind:'dependency.folder-hit',file:path});break;}catch(error){localFailure('folder',error);report({level:'warning',kind:'dependency.folder-invalid',file:path,error:{message:error.message}});}
  // Small modules physically bundled in WordPress also belong to the complete
  // standard library export. Do not fetch a second copy from GitHub for them.
  if(!bytes)for(const {path,offset} of locations.get(h)||[])if(manifest.localFiles?.includes(path))try{
   const response=await fetcher(new URL(path,scope),{credentials:'omit',referrerPolicy:'no-referrer'});
   if(response.ok){const data=new Uint8Array(await response.arrayBuffer());bytes=await verify(h,data.subarray(offset,offset+manifest.chunks[h]));report({level:'info',kind:'dependency.bundled-hit',file:path});break;}
  }catch(error){localFailure('bundled',error);}
  if(!bytes&&extension)try{const value=await extension(h);if(value){bytes=await verify(h,value);localSource=true;report({level:'info',kind:'dependency.extension-hit'});}}catch(error){localFailure('extension',error);report({level:'warning',kind:'dependency.extension-unavailable',error:{message:error.message,code:error.code}});}
  if(!bytes){
   const files=(locations.get(h)||[]).map(({path})=>path);
   if(files.length&&files.every(path=>manifest.files[path].localOnly===true)){
    const error=Object.assign(new Error('This model requires its original local files. Connect a library folder or import its verified archive.',localCause?{cause:localCause}:undefined),{code:'MODEL_LOCAL_REQUIRED',details:{files,expectedSha256:h,expectedBytes:manifest.chunks[h],localFailures}});
    report({level:'error',kind:'dependency.local-required',error:{code:error.code,message:error.message,details:error.details,cause:localCause&&{message:localCause.message}}});throw error;
   }
   if(!base)throw Error('DEPENDENCY_OFFLINE_MISSING: '+h);
   const requestedURL=new URL('chunks/'+h+'.bin',base).href;let response;try{response=await fetcher(requestedURL,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});}catch(cause){const error=Object.assign(new Error('Dependency network request failed.',{cause}),{code:'DEPENDENCY_NETWORK',details:{requestedURL,expectedSha256:h}});report({level:'warning',kind:'dependency.remote-failed',error:{code:error.code,message:error.message,details:error.details,cause:{message:cause.message}}});throw error;}
   report({level:'info',kind:'dependency.remote-response',requestedURL,finalURL:response.url,status:response.status,contentType:response.headers.get('content-type')});
   if(!response.ok||response.type==='opaque')throw Object.assign(Error('DEPENDENCY_DOWNLOAD_FAILED: '+response.status+' '+h),{code:'DEPENDENCY_HTTP',details:{requestedURL,finalURL:response.url,status:response.status,contentType:response.headers.get('content-type'),expectedSha256:h}});
   // Reject oversized responses before collecting the body. Even a bad server
   // cannot turn a bounded request into a multi-GiB allocation.
   const reader=response.body.getReader();bytes=new Uint8Array(manifest.chunks[h]);let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;if(size+value.byteLength>bytes.length)throw Error('Dependency chunk too large');bytes.set(value,size);size+=value.byteLength;}if(size!==bytes.length)throw Error('Dependency chunk truncated');}catch(cause){await reader.cancel().catch(()=>{});throw Object.assign(new Error('Dependency body could not complete.',{cause}),{code:'DEPENDENCY_BODY',details:{requestedURL,finalURL:response.url,status:response.status,expectedSha256:h,expectedBytes:bytes.length,receivedBytes:size}});}
   try{await verify(h,bytes);}catch(cause){throw Object.assign(new Error('Dependency integrity verification failed.',{cause}),{code:'DEPENDENCY_INTEGRITY',details:{requestedURL,finalURL:response.url,status:response.status,expectedSha256:h,expectedBytes:bytes.length,receivedBytes:size}});}
  }
  // A full disk must not prevent an otherwise valid online calculation.
  if(c&&!localSource&&cacheWrites)await c.put(url,new Response(bytes)).catch(()=>{});
  report({level:'info',kind:'dependency.verified',receivedBytes:bytes.length,receivedSha256:h});return bytes;
 }
 function load(h,observe){
  if(active.has(h))return active.get(h);
  if(!Object.hasOwn(manifest.chunks,h))return Promise.reject(Error('Unknown dependency chunk'));
  const job=(async()=>{const bytes=manifest.chunks[h];await new Promise(resolve=>{waiters.push({bytes,resolve});pump();});
   try{return await read(h,observe);}finally{running--;reserved-=bytes;pump();}
  })().finally(()=>active.delete(h));active.set(h,job);return job;
 }
 // A pre-response chunk has a real borrower, unlike legacy load() results.
 // Shared bytes and each response's metadata stay inside the same128MiB cap.
 const preloads=new Map(),cancelled=()=>new DOMException('Dependency preload cancelled','AbortError');
 function admission(bytes,readSlot){
  let queued,admitted=false,freed=false,rejectAdmission;
  const task=bytes?new Promise((resolve,reject)=>{rejectAdmission=reject;queued={bytes,resolve:()=>{queued=null;admitted=true;if(!readSlot)running--;resolve();}};waiters.push(queued);}):Promise.resolve();task.catch(()=>{});
  return{task,cancel(){if(queued){const index=waiters.indexOf(queued);if(index>=0)waiters.splice(index,1);queued=null;rejectAdmission(cancelled());}},release(){if(admitted&&!freed){freed=true;reserved-=bytes;pump();}}};
 }
 load.acquire=function(h,observe,{metadataBytes=0}={}){
  if(!Object.hasOwn(manifest.chunks,h)||!Number.isSafeInteger(metadataBytes)||metadataBytes<0||metadataBytes>16384)throw TypeError('Invalid owned dependency chunk admission');
  let record=preloads.get(h);
  if(!record){
   const credit=admission(manifest.chunks[h],true);record={refs:0,data:null,credit};preloads.set(h,record);
   record.task=(async()=>{await credit.task;try{if(!record.refs)throw cancelled();record.data=await read(h,observe);}finally{running--;pump();}})();record.task.catch(()=>{});
  }
  const metadata=admission(metadataBytes,false);record.refs++;pump();let released=false,retirement;
  const owner={ready:async()=>{await metadata.task;await record.task;if(released)throw cancelled();return owner;},get bytes(){if(released||!record.data)throw Error('Owned dependency chunk is not readable');return record.data;},release(){
   if(retirement)return retirement;released=true;metadata.cancel();record.refs--;const last=!record.refs;
   if(last){if(preloads.get(h)===record)preloads.delete(h);record.credit.cancel();}
   return retirement=(async()=>{await Promise.allSettled([metadata.task]);metadata.release();if(last){await Promise.allSettled([record.task]);record.data=null;record.credit.release();}})();
  }};return owner;
 };
 load.ownershipSnapshot=()=>({reservedBytes:reserved,running,queued:waiters.length,ownedChunks:preloads.size,owners:[...preloads.values()].reduce((n,value)=>n+value.refs,0),byteBudget});
 return load;
}
