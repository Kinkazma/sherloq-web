// Exact runtime bytes, delivered in bounded, content-addressed pieces. No model
// conversion, resolution reduction or eager model download happens here.
const CHUNK_LIMIT=100_000_000; // 100 MB, below GitHub's 100 MiB Git-file limit.
const digestPattern=/^[a-f0-9]{64}$/;
async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function validateManifest(m){
 if(m?.schema!=='sherloq.dependencies/1'||!m.files||!m.chunks||!Array.isArray(m.slots))throw Error('Invalid dependency manifest');
 const pathOK=p=>typeof p==='string'&&p.length<500&&p.split('/').every(v=>v&&v!=='.'&&v!=='..')&&!/[\\?#%\x00-\x20]/.test(p);
 if(m.slots.some(s=>!pathOK(s)))throw Error('Invalid dependency slot');
 for(const [hash,size] of Object.entries(m.chunks))if(!digestPattern.test(hash)||!Number.isSafeInteger(size)||size<1||size>CHUNK_LIMIT)throw Error('Invalid dependency chunk');
 for(const [path,f] of Object.entries(m.files)){
  if(!pathOK(path)||!m.slots.some(s=>path.startsWith(s+'/'))||!digestPattern.test(f.sha256)||!Array.isArray(f.chunks)||!Number.isSafeInteger(f.size)||f.size<0||typeof f.type!=='string'||/[\r\n]/.test(f.type))throw Error('Invalid dependency file');
  if(f.chunks.some(h=>!Object.hasOwn(m.chunks,h))||f.chunks.reduce((n,h)=>n+m.chunks[h],0)!==f.size)throw Error('Invalid dependency file length');
  if(f.localOnly!==undefined&&typeof f.localOnly!=='boolean')throw Error('Invalid local-only dependency policy');
 }
 if(m.localFiles!==undefined&&(!Array.isArray(m.localFiles)||m.localFiles.some(p=>!Object.hasOwn(m.files,p))))throw Error('Invalid local dependency list');
 return m;
}
// Optional, restricted weights retain their ordinary file identity for import,
// but are not part of a downloadable public library or offline readiness.
const publicDependencyEntries=manifest=>Object.entries(manifest.files).filter(([,file])=>file.localOnly!==true);
function requiredDependencyChunks(manifest){
 const required=new Set(publicDependencyEntries(manifest).flatMap(([,file])=>file.chunks));
 return Object.entries(manifest.chunks).filter(([hash])=>required.has(hash));
}
function remoteBase(value,{allowLocal=false}={}){
 if(value===null)return null;
 const u=new URL(value);
 const github=u.protocol==='https:'&&u.hostname==='raw.githubusercontent.com'&&/^\/[^/]+\/[^/]+\/[a-f0-9]{40}\/(?:[\w.-]+\/)*$/.test(u.pathname);
 const local=allowLocal&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname);
 if(!(github||local)||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/'))throw Error('Dependencies require an immutable GitHub commit URL');
 return u.href;
}
function byteRange(value,size){
 if(!value)return {start:0,end:size-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2])||size===0)return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
 return {start,end,partial:true};
}
function dependencyResponse(file,manifest,load,request){
 const range=byteRange(request.headers.get('range'),file.size);
 if(!range)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
 const {start,end,partial}=range,headers={'Content-Type':file.type,'Content-Length':String(Math.max(0,end-start+1)),'Accept-Ranges':'bytes','ETag':'"'+file.sha256+'"','Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cache-Control':'no-cache'};
 if(partial)headers['Content-Range']=`bytes ${start}-${end}/${file.size}`;
 if(request.method==='HEAD')return new Response(null,{status:partial?206:200,headers});
 let index=0,offset=0,cancelled=false;
 const stream=new ReadableStream({async pull(controller){
  try{
   while(index<file.chunks.length){
    const hash=file.chunks[index++],size=manifest.chunks[hash],at=offset;offset+=size;
    if(offset<=start)continue;if(at>end)break;
    const bytes=await load(hash);if(cancelled)return;
    controller.enqueue(bytes.subarray(Math.max(0,start-at),Math.min(size,end-at+1)));
    if(offset>end)controller.close();return;
   }
   controller.close();
  }catch(error){if(!cancelled)controller.error(error);}
 },cancel(){cancelled=true;}},{highWaterMark:0});
 return new Response(stream,{status:partial?206:200,headers});
}

const DB='sherloq-dependency-library-v1';
async function libraryValue(key,value){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('settings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('settings',arguments.length>1?'readwrite':'readonly'),s=tx.objectStore('settings'),r=arguments.length>1?s.put(value,key):s.get(key);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||r.error);});}finally{db.close();}
}
async function libraryFile(folder,path,create=false){
 const names=path.split('/');if(names.some(n=>!n||n==='.'||n==='..'))throw Error('Invalid library file path');
 for(const name of names.slice(0,-1))folder=await folder.getDirectoryHandle(name,{create});
 return folder.getFileHandle(names.at(-1),{create});
}
async function saveLibraryFile(folder,path,file,load,{signal}={}){
 const handle=await libraryFile(folder,path,true),writer=await handle.createWritable();
 try{for(const hash of file.chunks){signal?.throwIfAborted();await writer.write(await load(hash));}await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}
}
function createChunkLoader(manifest,{base,scope,fetcher=fetch,folder=()=>libraryValue('folder'),archive,cacheStorage=globalThis.caches,concurrency=2,cacheWrites=true}={}){
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

  if(cached){try{const bytes=await verify(h,new Uint8Array(await cached.arrayBuffer()));report({level:'info',kind:'dependency.cache-hit'});return bytes;}catch(error){localFailure('cache',error);report({level:'warning',kind:'dependency.cache-invalid',error:{message:error.message}});await c.delete(url).catch(()=>{});}}
  if(c){cacheKeysPromise??=typeof c.keys==='function'?c.keys().catch(()=>[]):Promise.resolve([]);for(const other of await cacheKeysPromise)if(other.url.endsWith('/__dependency_chunks__/'+h)){const found=await c.match(other).catch(()=>null);if(found)try{const data=await verify(h,new Uint8Array(await found.arrayBuffer()));report({level:'info',kind:'dependency.cache-hit',reusedScope:true});return data;}catch(error){localFailure('cache',error);await c.delete(other).catch(()=>{});}}}
  let bytes,localSource=false;if(archive)try{const value=await archive(h);if(value){bytes=await verify(h,value);localSource=true;report({level:'info',kind:'dependency.archive-hit'});}}catch(error){localFailure('archive',error);report({level:'warning',kind:'dependency.archive-invalid',error:{message:error.message}});}
  const local=bytes?null:await folder().catch(error=>{localFailure('folder-access',error);return null;});
  if(local)for(const {path,offset} of locations.get(h)||[])try{const file=await(await libraryFile(local,path)).getFile();if(file.size!==manifest.files[path].size)throw Error('Local library file length differs: '+path);bytes=await verify(h,new Uint8Array(await file.slice(offset,offset+manifest.chunks[h]).arrayBuffer()));localSource=true;report({level:'info',kind:'dependency.folder-hit',file:path});break;}catch(error){localFailure('folder',error);report({level:'warning',kind:'dependency.folder-invalid',file:path,error:{message:error.message}});}
  // Small modules physically bundled in WordPress also belong to the complete
  // standard library export. Do not fetch a second copy from GitHub for them.
  if(!bytes)for(const {path,offset} of locations.get(h)||[])if(manifest.localFiles?.includes(path))try{
   const response=await fetcher(new URL(path,scope),{credentials:'omit',referrerPolicy:'no-referrer'});
   if(response.ok){const data=new Uint8Array(await response.arrayBuffer());bytes=await verify(h,data.subarray(offset,offset+manifest.chunks[h]));report({level:'info',kind:'dependency.bundled-hit',file:path});break;}
  }catch(error){localFailure('bundled',error);}
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
 return function load(h,observe){
  if(active.has(h))return active.get(h);
  if(!Object.hasOwn(manifest.chunks,h))return Promise.reject(Error('Unknown dependency chunk'));
  const job=(async()=>{const bytes=manifest.chunks[h];await new Promise(resolve=>{waiters.push({bytes,resolve});pump();});
   try{return await read(h,observe);}finally{running--;reserved-=bytes;pump();}
  })().finally(()=>active.delete(h));active.set(h,job);return job;
 };
}

// POSIX ustar: files remain usable by tar, Archive Utility, 7-Zip, etc.
// Transport pieces never become a proprietary installed-library format.
const enc=new TextEncoder(),dec=new TextDecoder(),BLOCK=512;
function put(header,offset,length,value){const bytes=enc.encode(value);if(bytes.length>length)throw Error('TAR field too long');header.set(bytes,offset);}
function header(path,size){
 const h=new Uint8Array(BLOCK);let name=path,prefix='';
 if(enc.encode(name).length>100){const slash=path.lastIndexOf('/');name=path.slice(slash+1);prefix=path.slice(0,slash);}
 put(h,0,100,name);put(h,345,155,prefix);put(h,100,8,'0000644\0');put(h,108,8,'0000000\0');put(h,116,8,'0000000\0');put(h,124,12,size.toString(8).padStart(11,'0')+'\0');put(h,136,12,'00000000000\0');h.fill(32,148,156);h[156]=48;put(h,257,6,'ustar\0');put(h,263,2,'00');put(h,148,8,h.reduce((n,b)=>n+b,0).toString(8).padStart(6,'0')+'\0 ');return h;
}
async function* resourceTarParts(manifest,load,{signal,progress=()=>{},extras,includeLocalOnly=false,selectedPaths,manifestBytes}={}){
 let done=0;
 const selected=selectedPaths===undefined?null:new Set(selectedPaths);if(selected&&[...selected].some(path=>!Object.hasOwn(manifest.files,path)))throw Error('Unknown selected TAR resource');
 const entries=[['manifest.json',{size:0}],...(includeLocalOnly?Object.entries(manifest.files):publicDependencyEntries(manifest)).filter(([path])=>!selected||selected.has(path))];
 const metadata=manifestBytes||enc.encode(JSON.stringify(manifest,null,2)+'\n');entries[0][1].size=metadata.length;
 if(extras)for await(const [path,bytes] of extras){
  signal?.throwIfAborted();if(!safeTarPath(path)||path==='manifest.json'||Object.hasOwn(manifest.files,path))throw Error('Invalid extra TAR path');
  yield header(path,bytes.byteLength);yield bytes;if(bytes.byteLength%BLOCK)yield new Uint8Array(BLOCK-bytes.byteLength%BLOCK);
 }
 for(const [path,file] of entries){
  signal?.throwIfAborted();yield header(path,file.size);
  if(path==='manifest.json')yield metadata;else for(const hash of file.chunks){signal?.throwIfAborted();yield await load(hash);}
  if(file.size%BLOCK)yield new Uint8Array(BLOCK-file.size%BLOCK);if(path!=='manifest.json')progress(++done);
 }
 yield new Uint8Array(BLOCK*2);
}
function safeTarPath(path){return typeof path==='string'&&path.length<500&&!/[\\\x00-\x1f]/.test(path)&&path.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!path.includes(':');}
// Index the standard archive without loading models into memory or copying
// them into browser storage. Individual chunks are verified when reused.
async function indexResourceTar(blob,{signal}={}){
 let offset=0;const files=new Map();
 const str=(h,a,n)=>dec.decode(h.subarray(a,a+n)).split('\0')[0];
 while(offset+BLOCK<=blob.size){
  signal?.throwIfAborted();const h=new Uint8Array(await blob.slice(offset,offset+BLOCK).arrayBuffer());offset+=BLOCK;
  if(h.every(x=>x===0)){if(offset+BLOCK>blob.size)throw Error('Truncated TAR footer');const tail=new Uint8Array(await blob.slice(offset,offset+BLOCK).arrayBuffer());if(tail.some(x=>x!==0))throw Error('Invalid TAR footer');return {blob,files};}
  const sum=parseInt(str(h,148,8).trim(),8),copy=h.slice();copy.fill(32,148,156);
  if(str(h,257,6)!=='ustar'||sum!==copy.reduce((a,b)=>a+b,0))throw Error('Invalid TAR header');
  const prefix=str(h,345,155),path=(prefix?prefix+'/':'')+str(h,0,100),size=parseInt(str(h,124,12).trim(),8);
  if(!safeTarPath(path)||files.has(path)||![0,48].includes(h[156]))throw Error('Invalid TAR file path or type');
  if(!Number.isSafeInteger(size)||size<0||offset+Math.ceil(size/BLOCK)*BLOCK>blob.size)throw Error('Truncated TAR file');
  files.set(path,{offset,size});offset+=Math.ceil(size/BLOCK)*BLOCK;
 }
 throw Error('TAR footer missing');
}
function archiveChunkReader(index,manifest){
 const locations=new Map(),invalidLengths=new Map();for(const [path,file]of Object.entries(manifest.files)){let at=0;for(const hash of file.chunks){const member=index.files.get(path);if(member?.size===file.size){const items=locations.get(hash)||[];items.push(member.offset+at);locations.set(hash,items);}else if(member)invalidLengths.set(hash,{file:path,expectedFileBytes:file.size,receivedFileBytes:member.size});at+=manifest.chunks[hash];}}
 return async hash=>{for(const offset of locations.get(hash)||[]){const bytes=new Uint8Array(await index.blob.slice(offset,offset+manifest.chunks[hash]).arrayBuffer());if(await sha256(bytes)===hash)return bytes;}if(locations.has(hash)||invalidLengths.has(hash))throw Object.assign(Error('Local archive integrity failure: '+hash),{code:'DEPENDENCY_LOCAL_INTEGRITY',details:{expectedSha256:hash,expectedBytes:manifest.chunks[hash],...invalidLengths.get(hash)}});return null;};
}
async function writeResourceTar(manifest,load,sink,options={}){for await(const bytes of resourceTarParts(manifest,load,options))await sink.write(bytes);}
function resourceTarStream(manifest,load,options={}){
 const iterator=resourceTarParts(manifest,load,options);let cancelled=false;
 return new ReadableStream({async pull(c){try{const {done,value}=await iterator.next();if(cancelled)return;if(done){c.close();options.finished?.();}else c.enqueue(value);}catch(e){if(!cancelled)c.error(e);options.finished?.(e);}},async cancel(){cancelled=true;await iterator.return();options.finished?.(new DOMException('Cancelled','AbortError'));}},{highWaterMark:0});
}
async function importLibraryFile(blob,file,manifest,save,signal){
 if(blob.size!==file.size)throw Error('Library file length differs');let offset=0;
 for(const hash of file.chunks){signal?.throwIfAborted();const size=manifest.chunks[hash],bytes=new Uint8Array(await blob.slice(offset,offset+size).arrayBuffer());if(await sha256(bytes)!==hash)throw Error('Library file integrity failure: '+hash);await save(hash,bytes);offset+=size;}
}
async function importResourceTar(blob,manifest,save,{signal,progress=()=>{}}={}){
 let offset=0,done=0;const seen=new Set();
 const str=(h,a,n)=>dec.decode(h.subarray(a,a+n)).split('\0')[0];
 while(offset+BLOCK<=blob.size){
  signal?.throwIfAborted();const h=new Uint8Array(await blob.slice(offset,offset+BLOCK).arrayBuffer());offset+=BLOCK;
  if(h.every(b=>b===0)){if(offset+BLOCK>blob.size)throw Error('Truncated TAR footer');if(!done)throw Error('No matching library files');return {files:done};}
  const sum=parseInt(str(h,148,8).trim(),8),copy=h.slice();copy.fill(32,148,156);
  if(sum!==copy.reduce((n,b)=>n+b,0)||str(h,257,6)!=='ustar')throw Error('Invalid TAR header');
  const prefix=str(h,345,155),path=(prefix?prefix+'/':'')+str(h,0,100),size=parseInt(str(h,124,12).trim(),8);
  if(!Number.isSafeInteger(size)||size<0||offset+Math.ceil(size/BLOCK)*BLOCK>blob.size)throw Error('Truncated TAR file');
  const file=manifest.files[path];
  if(file){if(![0,48].includes(h[156])||seen.has(path))throw Error('Invalid TAR library entry');seen.add(path);await importLibraryFile(blob.slice(offset,offset+size),file,manifest,save,signal);progress(++done);}
  offset+=Math.ceil(size/BLOCK)*BLOCK;
 }
 throw Error('TAR footer missing');
}

function validateOfflineShell(value){
 if(value?.workerType!==undefined&&!['classic','module'].includes(value.workerType))throw Error('Unsupported offline worker type');
 if(value?.schema!=='sherloq.offline-shell/1'||!value.files||!/^[a-f0-9]{64}$/.test(value.manifest))throw Error('Invalid offline shell');
 for(const [path,file]of Object.entries(value.files))if(!safeTarPath(path)||path.startsWith('private')||(file.source&&!safeTarPath(file.source))||!Number.isSafeInteger(file.size)||file.size<0||file.size>20_000_000||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid offline shell file');
 for(const path of ['app.html','workspace-entry.js','offline-server.py'])if(!value.files[path])throw Error('Incomplete offline shell');
 return value;
}
async function readOfflineShell(scope,fetcher=fetch){
 const response=await fetcher(new URL('offline-shell.json',scope));if(!response.ok)throw Error('Offline application package unavailable');
 return validateOfflineShell(await response.json());
}
async function* offlineShellParts(shell,scope,{fetcher=fetch,signal}={}){
 yield ['offline-kit.json',new TextEncoder().encode(JSON.stringify(shell)+'\n')];
 for(const [path,file]of Object.entries(shell.files)){
  signal?.throwIfAborted();const response=await fetcher(new URL(file.source||path,scope),{signal,credentials:'omit'});if(!response.ok)throw Error('Offline application file unavailable: '+path);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==file.size||await sha256(bytes)!==file.sha256)throw Error('Offline application integrity failure: '+path);
  yield ['app/'+path,bytes];
 }
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function offlineLauncherHTML({archivePath,manifest,shellSha256,version,port=8765,token,language='fr',server,entry='app.html'}){
 if(!archivePath?.trim()||/[\x00-\x1f]/.test(archivePath)||!token?.match(/^[a-f0-9]{32}$/)||!manifest?.match(/^[a-f0-9]{64}$/)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid offline launcher settings');
 if(!shellSha256?.match(/^[a-f0-9]{64}$/))throw Error('Missing offline shell identity');
 if(!['app.html','offline-bridge.html'].includes(entry))throw Error('Invalid offline launcher entry');
 const fr=language!=='en',config={schema:'sherloq.offline-launcher/1',archivePath:archivePath.trim(),manifest,shellSha256,version,port,token};
 const route=entry==='offline-bridge.html'?'/__sherloq_bridge/'+token+'/offline-bridge.html':'/'+token+'/app.html',data=JSON.stringify(config).replace(/</g,'\\u003c'),address='http://127.0.0.1:'+port+route+'#lang='+(fr?'fr':'en');
 // A path is private configuration, never interpolated into executable code.
 // The helper reads this JSON and serves only the archive over loopback.
 const source=JSON.stringify(server).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="${fr?'fr':'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'"><title>SHERLOQ — ${fr?'hors ligne':'offline'}</title><style>body{max-width:52rem;margin:5vh auto;padding:2rem;background:#17191d;color:#eee;font:20px system-ui;line-height:1.5}a,button{display:inline-block;background:#326bb2;color:white;border:0;border-radius:.4rem;padding:.65rem 1rem;font:inherit;cursor:pointer}code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;background:#252932;padding:1rem}small{color:#bbb}</style><h1>SHERLOQ ${escapeHTML(version)}</h1><p>${fr?'Votre application locale. Les moteurs et leurs fichiers restent dans l’archive standard, sans connexion au site ou à GitHub.':'Your local application. Engines and their original files stay in the standard archive, without connecting to the site or GitHub.'}</p><p>${fr?'Archive enregistrée :':'Saved archive:'}</p><code>${escapeHTML(archivePath)}</code><p>${fr?'Placez le lanceur autonome SHERLOQ fourni avec le kit à côté de ce HTML, puis ouvrez-le. Il ouvre votre navigateur habituel et reste actif pendant les calculs. Aucun Python n’est nécessaire avec ce lanceur.':'Place the standalone SHERLOQ launcher supplied with the kit beside this HTML, then open it. It opens your usual browser and stays running during calculations. This launcher needs no Python.'}</p><details><summary>${fr?'Autre possibilité : lanceur Python':'Alternative: Python launcher'}</summary><p>${fr?'Au premier lancement, téléchargez le petit lanceur ci-dessous dans le même dossier que ce HTML. Python 3.10 ou plus récent doit être installé. Depuis ce dossier, exécutez :':'First, save the small launcher below beside this HTML. Python 3.10 or newer must be installed. From that folder, run:'}</p><code>python3 sherloq-local.py SHERLOQ.html</code><p>${fr?'Sous Windows, utilisez « py -3 » à la place de « python3 ». Gardez le lanceur ouvert pendant les calculs. Il ouvre automatiquement le navigateur ; les sessions suivantes utilisent la même commande.':'On Windows, use “py -3” instead of “python3”. Keep the launcher running during calculations. It opens the browser automatically; use the same command for later sessions.'}</p><button id="helper">${fr?'Télécharger le lanceur Python':'Download Python launcher'}</button></details><p><a href="${address}">${fr?'Ouvrir SHERLOQ local':'Open local SHERLOQ'}</a></p><p><small>${fr?'Le chemin mémorisé ne donne pas au navigateur le droit de lire le disque. Ce lanceur est nécessaire pour préserver tous les moteurs et la mémoire partagée. Aucun compte, cookie ni accès Internet n’est nécessaire. L’archive n’est pas extraite ni copiée en mémoire entière.':'A saved path does not grant browser disk access. The launcher preserves all engines and shared memory. No account, cookie or Internet access is required. The archive is not extracted or loaded entirely into RAM.'}</small></p><script id="sherloq-offline-config" type="application/json">${data}</script><script>document.getElementById('helper').onclick=()=>{const u=URL.createObjectURL(new Blob([${source}],{type:'text/x-python'})),a=document.createElement('a');a.href=u;a.download='sherloq-local.py';a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);};</script></html>`;
}


// Immutable manifests outlive a WordPress directory replacement. Keep a
// verified copy independently of the downloaded libraries, and never latch a
// temporary fetch failure for the lifetime of the service worker.
function createManifestLoader(url,identity,{fetcher=fetch,cacheStorage=globalThis.caches}={}){
 let pending;
 const verify=async response=>{
  if(!response.ok)throw Object.assign(Error('Dependency manifest unavailable: HTTP '+response.status),{status:response.status,url:String(url)});
  const bytes=await response.arrayBuffer();
  if(await sha256(bytes)!==identity)throw Error('Dependency manifest integrity failure');
  return {bytes,manifest:validateManifest(JSON.parse(new TextDecoder().decode(bytes)))};
 };
 return ()=>pending??=(async()=>{
  let cache;try{cache=await cacheStorage?.open('sherloq-dependency-manifests-v1');}catch{}
  let cause;
  try{
   const verified=await verify(await fetcher(url,{cache:'no-cache'}));
   try{await cache?.put(url,new Response(verified.bytes,{headers:{'Content-Type':'application/json'}}));}catch{}
   return verified.manifest;
  }catch(error){cause=error;}
  try{const saved=await cache?.match(url);if(saved)return (await verify(saved)).manifest;}catch{}
  throw cause;
 })().catch(error=>{pending=null;throw error;});
}

// The document, config and bootstrap graph must be reachable even if a retired
// dependency manifest disappeared. Runtime directories still use the locked
// inventory; this does not introduce a network fallback for scientific files.
function isDependencyBootstrap(request,path){return request.mode==='navigate'||!path.includes('/');}

const scope=new URL('./',self.location.href);
const manifestHash=new URL(self.location.href).searchParams.get('manifest');
const manifestLoader=createManifestLoader(new URL('dependency-manifest-'+manifestHash+'.json',scope),manifestHash);
let preparation;
const ready=()=>preparation??=(async()=>{
 if(!/^[a-f0-9]{64}$/.test(manifestHash))throw Error('Dependency manifest identity missing');
 const manifest=await manifestLoader(),base=remoteBase(manifest.remoteBase,{allowLocal:['127.0.0.1','localhost'].includes(scope.hostname)});
 return {manifest,localFiles:new Set(manifest.localFiles||[]),load:createChunkLoader(manifest,{base,scope})};
})().catch(error=>{preparation=null;throw error;});
// Updates wait until previous controlled windows close. Never replace a worker
// under a running analysis and accidentally mix two engine deliveries.
self.addEventListener('install',event=>event.waitUntil(ready()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='dependency-identity')event.waitUntil(ready().then(()=>event.ports[0]?.postMessage({manifest:manifestHash})));});
// Hosts may ignore .htaccess for static assets. Workers must still receive
// the same embedder policy as the PHP-served application document.
async function localResponse(request){
 const response=await fetch(request);
 if(!response.ok||response.type==='opaque')return response;
 const headers=new Headers(response.headers);
 headers.set('Cross-Origin-Embedder-Policy','require-corp');
 headers.set('Cross-Origin-Opener-Policy','same-origin');
 headers.set('Cross-Origin-Resource-Policy','same-origin');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
let activationCheck;
async function activateWhenReady(){
 const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>client.url.startsWith(scope.href));
 if(!clients.length)return;
 const safe=await Promise.all(clients.map(client=>new Promise(resolve=>{
  const channel=new MessageChannel();let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();resolve(value);};
  const timer=setTimeout(()=>finish(false),1000);
  channel.port1.onmessage=event=>finish(event.data?.ready===true);
  try{client.postMessage({type:'dependency-bootstrap-ready'},[channel.port2]);}catch{finish(false);}
 })));
 if(safe.every(Boolean))await self.skipWaiting();
}
self.addEventListener('message',event=>{
 if(event.data?.type==='dependency-activate-when-ready'&&event.source?.url?.startsWith(scope.href)){
  activationCheck??=activateWhenReady().finally(()=>{activationCheck=null;});event.waitUntil(activationCheck);
 }
});
const pendingDownloads=new Map(),clientSessions=new Map();
const offlineExports=new Map();
self.addEventListener('message',event=>{
 if(event.data?.type!=='offline-kit-prepare'||!event.source?.url?.startsWith(scope.href))return;
 event.waitUntil((async()=>{try{
  const {id,archive}=event.data;if(!/^[a-f0-9-]{36}$/.test(id)||archive&&!(archive instanceof Blob))throw Error('Invalid offline archive request');
  // Retain only this client's pending export; never persist the private path.
  for(const [key,value]of offlineExports)if(value.client===event.source.id)offlineExports.delete(key);
  offlineExports.set(id,{client:event.source.id,archive});setTimeout(()=>offlineExports.delete(id),600000);
  event.ports[0]?.postMessage({ok:true});
 }catch(error){event.ports[0]?.postMessage({error:error.message});}})());
});
const sessionFor=client=>client&&(clientSessions.get(client.id)||new URL(client.url).searchParams.get('sherloqSession'));
self.addEventListener('message',event=>{if(event.data?.type==='dependency-session'&&event.source?.url?.startsWith(scope.href)&&/^[a-f0-9-]{36}$/.test(event.data.session)){clientSessions.set(event.source.id,event.data.session);event.ports[0]?.postMessage({ready:true});}});
self.addEventListener('message',event=>{
 if(event.data?.type!=='dependency-retry'||!event.source?.url?.startsWith(scope.href))return;
 const session=sessionFor(event.source);
 const id=session+'|'+event.data.key;
 const waiters=pendingDownloads.get(id);pendingDownloads.delete(id);for(const resume of waiters||[])resume();
});
async function recoverChunk(event,path,load,hash){
 const key=event.request.url,client=await self.clients.get(event.clientId);
 const session=sessionFor(client);
 for(;;){let cause;
  for(let attempt=1;attempt<=3;attempt++)try{
   const bytes=await load(hash,entry=>void notifyDependency(event,{...entry,file:path}));
   void notifyDependency(event,{level:'info',kind:'dependency.ready',key,file:path});return bytes;
  }catch(error){cause=error;await notifyDependency(event,{level:'warning',kind:'dependency.transport-error',attempt,file:path,error:{name:error.name,code:error.code,message:error.message,details:error.details,cause:error.cause?.message}});if(error.code==='MODEL_LOCAL_REQUIRED')throw error;if(attempt<3)await new Promise(r=>setTimeout(r,250*attempt));}
  if(!session)throw cause;
  // Keep the original module import or file stream pending: retrying a failed
  // ES module import after rejection would otherwise reuse its cached failure.
  await new Promise(resolve=>{
   const id=session+'|'+key,list=pendingDownloads.get(id)||[];list.push(resolve);pendingDownloads.set(id,list);
   void notifyDependency(event,{level:'error',kind:'dependency.wait',key,file:path,error:{name:cause.name,code:cause.code,message:cause.message,details:cause.details,cause:cause.cause?.message}});
  });
 }
}
async function notifyDependency(event,entry){
 try{const client=await self.clients.get(event.clientId);if(!client)return;const session=sessionFor(client);if(!session)return;
 const message={type:'dependency-diagnostic',session,event:{...entry,source:'service-worker',manifest:manifestHash}};
 if(client.type==='window')client.postMessage(message);else for(const window of await self.clients.matchAll({type:'window'}))if(sessionFor(window)===session)window.postMessage(message);
 }catch{}
}
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname)||!['GET','HEAD'].includes(event.request.method))return;
 const path=u.pathname.slice(scope.pathname.length);
 if(isDependencyBootstrap(event.request,path)){event.respondWith(localResponse(event.request));return;}
 if(path==='__dependency_download__/resources.tar'||path==='__dependency_download__/kit.tar'){
  let finish;event.waitUntil(new Promise(resolve=>{finish=resolve;}));
  const id=u.searchParams.get('id');
  const notify=data=>self.clients.matchAll().then(clients=>clients.forEach(c=>c.postMessage({type:'dependency-download-progress',id,...data})));
  event.respondWith(ready().then(async({manifest,load})=>{
   const kit=path.endsWith('/kit.tar');let extras;
   if(kit){const requested=offlineExports.get(id);offlineExports.delete(id);if(!requested)throw Error('Start archive creation from the offline dialog');
    const shell=await readOfflineShell(scope);if(shell.manifest!==manifestHash)throw Error('Offline application version mismatch');
    extras=offlineShellParts(shell,scope);
    if(requested.archive){const index=await indexResourceTar(requested.archive);load=createChunkLoader(manifest,{base:remoteBase(manifest.remoteBase,{allowLocal:['localhost','127.0.0.1'].includes(scope.hostname)}),scope,archive:archiveChunkReader(index,manifest)});}
   }
   const selected=u.searchParams.get('file');if(selected&&!manifest.files[selected]){finish();return new Response('Unknown library file',{status:404});}
   const chosen=selected?{...manifest,files:{[selected]:manifest.files[selected]}}:manifest;
   const total=selected?1:publicDependencyEntries(chosen).length;
   const stream=resourceTarStream(chosen,load,{extras,includeLocalOnly:!!selected,progress:value=>void notify({value,total}),finished:error=>{void notify({done:true,error:error?.message});finish();}});
   return new Response(stream,{headers:{'Content-Type':'application/x-tar','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'attachment; filename="'+(kit?'SHERLOQ-complet.tar':'SHERLOQ-resources.tar')+'"','Cache-Control':'no-store'}});
  }).catch(e=>{void notify({done:true,error:e.message});finish();return new Response(e.message,{status:503});}));return;
 }
 event.respondWith((async()=>{
  const {manifest,localFiles,load}=await ready(),file=manifest.files[path];
  if(localFiles.has(path))return localResponse(event.request);
  if(file)return dependencyResponse(file,manifest,h=>recoverChunk(event,path,load,h),event.request);
  if(manifest.slots.some(s=>path.startsWith(s+'/')))return new Response('Dependency absent from the locked delivery',{status:404});
  return localResponse(event.request);
 })());
});
