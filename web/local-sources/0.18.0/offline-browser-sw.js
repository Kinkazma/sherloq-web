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

// A release owns this graph. Resource paths identify files in its immutable
// dependency manifest; sizes and content identities always come from that manifest.
const idPattern=/^[a-z0-9][a-z0-9._-]{0,120}$/;
function validateFeatureCatalog(catalog,manifest){
 if(catalog?.schema!=='sherloq.features/1'||!Array.isArray(catalog.features)||!Array.isArray(catalog.groups))throw Error('Invalid feature catalogue');
 const groups=new Set(),features=new Map();
 for(const group of catalog.groups){if(!idPattern.test(group.id)||groups.has(group.id)||typeof group.fr!=='string'||typeof group.en!=='string')throw Error('Invalid feature group');groups.add(group.id);}
 for(const feature of catalog.features){
  if(!idPattern.test(feature.id)||features.has(feature.id)||typeof feature.fr!=='string'||typeof feature.en!=='string'||typeof feature.protected!=='boolean'||feature.group!==null&&!groups.has(feature.group)||!Array.isArray(feature.resources)||!Array.isArray(feature.dependsOn)||!Array.isArray(feature.tasks))throw Error('Invalid feature descriptor');
  if(feature.resources.some(path=>typeof path!=='string'||path.split('/').some(part=>!part||part==='.'||part==='..')||/[\\?#%\x00-\x20]/.test(path)||manifest&&!Object.hasOwn(manifest.files,path)))throw Error('Unknown feature resource');
  if(feature.tasks.some(task=>!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(task.operation)||task.params&&(!task.params||typeof task.params!=='object'||Array.isArray(task.params)||Object.values(task.params).some(value=>!['string','boolean','number'].includes(typeof value)))))throw Error('Invalid feature task');
  features.set(feature.id,feature);
 }
 const visiting=new Set(),visited=new Set();
 function visit(id){if(visiting.has(id))throw Error('Cyclic feature dependencies');if(visited.has(id))return;const feature=features.get(id);if(!feature)throw Error('Unknown feature dependency');visiting.add(id);for(const dependency of feature.dependsOn)visit(dependency);visiting.delete(id);visited.add(id);}
 for(const id of features.keys())visit(id);
 function protect(id){const feature=features.get(id);for(const dependency of feature.dependsOn){const target=features.get(dependency);if(!target.protected&&!target.internal)throw Error('Protected core cannot require an optional uninstallable feature');protect(dependency);}}
 for(const feature of features.values())if(feature.protected)protect(feature.id);
 if(manifest){const covered=new Set(catalog.features.flatMap(feature=>feature.resources));if(Object.keys(manifest.files).some(path=>!covered.has(path)))throw Error('Dependency manifest is not fully covered by the feature catalogue');}
 return catalog;
}
function normalizeFeatureState(state={}){
 if(state.schema!==undefined&&state.schema!=='sherloq.feature-policy/1')throw Error('Unsupported feature policy');
 const list=value=>{if(value===undefined)return [];if(!Array.isArray(value)||value.some(id=>!idPattern.test(id)))throw Error('Invalid feature exclusions');return [...new Set(value)].sort();};
 // Unknown identifiers are intentional choices too: retain them across releases.
 return {schema:'sherloq.feature-policy/1',disabledFeatures:list(state.disabledFeatures),disabledGroups:list(state.disabledGroups)};
}
function recoverFeatureState(state){
 if(!state||typeof state!=='object'||Array.isArray(state)||state.schema&&state.schema!=='sherloq.feature-policy/1')throw Error('Unsupported feature policy recovery');
 const issues=[],value={schema:'sherloq.feature-policy/1'};
 for(const key of ['disabledFeatures','disabledGroups']){
  const input=state[key];if(input===undefined){value[key]=[];continue;}if(!Array.isArray(input))throw Error('Feature exclusions need recovery from a backup');
  value[key]=input.filter((id,index)=>{if(idPattern.test(id)&&typeof id==='string')return true;issues.push({path:key+'.'+index,kind:'incompatible',message:'Preserved in recovery backup'});return false;});
 }
 return {value:normalizeFeatureState(value),issues};
}
function selectedFeatureIds(catalog,state={}){
 const policy=normalizeFeatureState(state),off=new Set(policy.disabledFeatures),groups=new Set(policy.disabledGroups),map=new Map(catalog.features.map(feature=>[feature.id,feature])),chosen=new Set();
 const enabled=(feature,trail=new Set())=>{if(feature.protected)return true;if(off.has(feature.id)||feature.group&&groups.has(feature.group))return false;if(trail.has(feature.id))throw Error('Cyclic feature dependencies');const next=new Set(trail).add(feature.id);return feature.dependsOn.every(id=>{const dependency=map.get(id);if(!dependency)throw Error('Unknown feature dependency');return enabled(dependency,next);});};
 function add(feature){if(chosen.has(feature.id))return;chosen.add(feature.id);for(const id of feature.dependsOn)add(map.get(id));}
 for(const feature of catalog.features)if(feature.protected||!feature.internal&&enabled(feature))add(feature);
 return chosen;
}
function selectActiveFiles(catalog,state={}){
 const selected=selectedFeatureIds(catalog,state);return new Set(catalog.features.filter(feature=>selected.has(feature.id)).flatMap(feature=>feature.resources));
}
function requiredFeatureChunks(catalog,manifest,state={}){
 const chunks=new Map();for(const path of selectActiveFiles(catalog,state)){const file=manifest.files[path];if(!file)throw Error('Unknown feature resource: '+path);if(file.localOnly)continue;for(const hash of file.chunks)chunks.set(hash,manifest.chunks[hash]);}return chunks;
}
function featureIdsForTask(task,catalog){
 const descriptors=catalog.features.filter(feature=>feature.tasks.some(match=>match.operation===task.operation&&Object.entries(match.params??{}).every(([key,value])=>task.params?.[key]===value)));
 // Most specific match wins; a protected container must not bypass an optional submode.
 const specificity=feature=>Math.max(...feature.tasks.filter(match=>match.operation===task.operation&&Object.entries(match.params??{}).every(([key,value])=>task.params?.[key]===value)).map(match=>Object.keys(match.params??{}).length));
 const maximum=Math.max(-1,...descriptors.map(specificity));return descriptors.filter(feature=>specificity(feature)===maximum).map(feature=>feature.id);
}
function featureStateChange(catalog,state,ids,enabled){
 const next=normalizeFeatureState(state),features=new Map(catalog.features.map(feature=>[feature.id,feature]));
 if(!Array.isArray(ids)||!ids.length)throw Error('Choose at least one feature');
 for(const target of ids){
  const group=target.startsWith('group:')?target.slice(6):null;
  if(group){if(!catalog.groups.some(value=>value.id===group))throw Error('Unknown feature group');if(catalog.features.some(feature=>feature.group===group&&feature.protected))throw Error('Protected feature group');const set=new Set(next.disabledGroups);enabled?set.delete(group):set.add(group);next.disabledGroups=[...set].sort();}
  else{const feature=features.get(target);if(!feature)throw Error('Unknown feature');if(feature.protected||feature.internal)throw Error('Protected feature');const set=new Set(next.disabledFeatures);enabled?set.delete(target):set.add(target);next.disabledFeatures=[...set].sort();}
 }
 return next;
}
function featureDeletionPlan(catalog,manifest,state,ids,{presentChunks=[]}={}){
 const next=featureStateChange(catalog,state,ids,false),before=selectActiveFiles(catalog,state),after=selectActiveFiles(catalog,next),retained=new Set(),removed=new Set(),candidate=new Set();
 for(const path of after)for(const hash of manifest.files[path].chunks)retained.add(hash);
 const beforeIds=selectedFeatureIds(catalog,state),afterIds=selectedFeatureIds(catalog,next),map=new Map(catalog.features.map(feature=>[feature.id,feature])),seen=new Set();
 function candidates(feature){if(seen.has(feature.id))return;seen.add(feature.id);for(const path of feature.resources)for(const hash of manifest.files[path].chunks)candidate.add(hash);for(const id of feature.dependsOn)candidates(map.get(id));}
 for(const feature of catalog.features)if(beforeIds.has(feature.id)&&!afterIds.has(feature.id))candidates(feature);
 const paths=[...before].filter(path=>!after.has(path));for(const path of paths)for(const hash of manifest.files[path].chunks){candidate.add(hash);if(!retained.has(hash))removed.add(hash);}
 const present=new Set(presentChunks instanceof Map?presentChunks.keys():presentChunks),bytes=hashes=>[...hashes].reduce((total,hash)=>total+(manifest.chunks[hash]??0),0);
 const removable=[...removed].filter(hash=>present.has(hash)),shared=[...candidate].filter(hash=>retained.has(hash)),allBefore=new Set([...before].flatMap(path=>manifest.files[path].chunks));
 return {state:next,paths,chunks:[...removed],presentChunks:removable,removableBytes:bytes(removable),potentialBytes:bytes(removed),retainedSharedBytes:bytes(shared),retainedSharedPresentBytes:bytes(shared.filter(hash=>present.has(hash))),presentBytes:bytes([...allBefore].filter(hash=>present.has(hash))),archiveBytesFreed:0};
}

// One IndexedDB record is the activation boundary. Candidate writes never replace
// the active reference; a rejected transaction leaves its predecessor intact.
const UPDATE_DB='sherloq-local-updates-v1',LEGACY_KEY='state';
const initialUpdateState=()=>({schema:'sherloq.local-update-state/1',revision:0,active:null,previous:null,candidate:null,bootstrapCandidate:null,journal:[]});
function legacyStateForApp(legacy,base){const appBase=new URL('./',base).href;if(legacy?.schema!=='sherloq.local-update-state/1'||legacy.active?.appBase!==appBase)return null;const scoped=record=>record&&record.appBase&&record.appBase!==appBase?null:record;return {...legacy,previous:scoped(legacy.previous),candidate:scoped(legacy.candidate),bootstrapCandidate:scoped(legacy.bootstrapCandidate)};}
function browserUpdateStore({base,indexedDB=globalThis.indexedDB}={}){
 if(!base)throw Error('Local update application scope required');const appBase=new URL('./',base).href,key='state:'+appBase;
 async function open(){if(!indexedDB)throw Error('Local update storage unavailable');return new Promise((resolve,reject)=>{const r=indexedDB.open(UPDATE_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function transaction(change){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state'),r=s.get(key);let value;const finish=(state,migrating=false)=>{try{value=state||initialUpdateState();if(change)value=change(value);if(change||migrating)s.put(value,key);}catch(error){tx.abort();reject(error);}};r.onsuccess=()=>{if(r.result)return finish(r.result);const old=s.get(LEGACY_KEY);old.onsuccess=()=>{const legacy=legacyStateForApp(old.result,appBase);finish(legacy,!!legacy);};};tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Local update transaction aborted'));});}finally{db.close();}}
 return {read:()=>transaction(),change:fn=>transaction(state=>{const next=fn(state);if(!next||next.schema!==state.schema)throw Error('Invalid update state');return {...next,revision:state.revision+1};})};
}
function journal(state,type,details={}){return [...(state.journal||[]),{at:new Date().toISOString(),type,...details}].slice(-40);}
async function activateCandidate(store,identity,expectedActive){return store.change(state=>{if(state.active?.identity!==expectedActive||state.candidate?.identity!==identity||state.candidate.status!=='ready')throw Error('Local update state changed; prepare again');return {...state,previous:state.active,active:{...state.candidate,status:'active'},candidate:null,journal:journal(state,'activated',{identity})};});}
async function rollbackReference(store){return store.change(state=>{if(!state.previous)throw Error('No previous local version retained');return {...state,active:state.previous,previous:state.active,candidate:null,journal:journal(state,'rollback',{identity:state.previous.identity})};});}
// Retention is scoped to this local installation. The shared chunk cache can
// also serve another local app scope, so collection scans its receipts first.
async function pruneUpdateCaches(state,base,{storage=globalThis.caches,bridgeIdentity}={}){
 if(!storage)return;const scope=new URL('./',base),identities=new Set([state.active?.identity,state.previous?.identity,state.candidate?.identity,state.bootstrapCandidate?.identity,...Object.values(state.clientVersions||{})].filter(Boolean)),shellKeep=new Set([...identities,bridgeIdentity].filter(Boolean));
 const cacheNames=await storage.keys();for(const name of cacheNames){if(!name.startsWith('sherloq-offline-app-')||shellKeep.has(name.slice('sherloq-offline-app-'.length)))continue;const cache=await storage.open(name);for(const key of await cache.keys())if(key.url.startsWith(scope.href))await cache.delete(key);if(!(await cache.keys()).length)await storage.delete(name);}
 const references=new Set(),imported=new Set();let uncertain=false;
 for(const name of await storage.keys()){if(!name.startsWith('sherloq-offline-app-'))continue;const cache=await storage.open(name);for(const key of await cache.keys()){if(!key.url.endsWith('/__manifest.json'))continue;const appBase=new URL('./',key.url),own=appBase.href===scope.href,id=name.slice('sherloq-offline-app-'.length);if(own&&!identities.has(id))continue;try{const manifest=await(await cache.match(key)).json(),response=await cache.match(new URL('__features.json',appBase)),catalog=response?await response.json():null,policyResponse=await cache.match(new URL('__feature-policy.json',appBase)),policy=policyResponse?await policyResponse.json():{};let paths=Object.keys(manifest.files);if(catalog)paths=[...selectActiveFiles(catalog,policy)];for(const path of paths)for(const hash of manifest.files[path].chunks)references.add(hash);for(const file of Object.values(manifest.files))if(file.localOnly)for(const hash of file.chunks)imported.add(hash);}catch{uncertain=true;}}}
 // Unknown/corrupt unrelated metadata prevents deletion, never data loss.
 if(uncertain)return;const chunks=await storage.open('sherloq-dependency-chunks-v1'),managed=new Set(state.managedChunks||[]);for(const key of await chunks.keys()){const hash=key.url.split('/').at(-1);if(managed.has(hash)&&!references.has(hash)&&!imported.has(hash))await chunks.delete(key);}
 return [...new Set((await chunks.keys()).map(key=>key.url.split('/').at(-1)).filter(hash=>managed.has(hash)))];
}


const OFFLINE_CHUNKS='sherloq-dependency-chunks-v1';
const offlineCacheName=identity=>'sherloq-offline-app-'+identity;
const offlineChunkURL=(base,hash)=>new URL('__dependency_chunks__/'+hash,base).href;
const offlinePolicy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://raw.githubusercontent.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
function offlineHeaders(type){return {'Content-Type':type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':offlinePolicy,'Cache-Control':'no-store'};}
function offlineMime(name){return ({js:'text/javascript',mjs:'text/javascript',html:'text/html; charset=utf-8',css:'text/css',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2',py:'text/plain',txt:'text/plain'})[name.split('.').at(-1)]||'application/octet-stream';}
async function offlinePlan(base,{fetcher=fetch,local=false}={}){
 const configResponse=await fetcher(new URL('dependency-config.json',base));if(!configResponse.ok)throw Error('Offline configuration unavailable');
 const config=await configResponse.json(),isLocal=local||config.offlineMode==='browser'||config.offline===true;
 if(!/^[a-f0-9]{64}$/.test(config.manifest))throw Error('Offline manifest identity missing');
 const manifestResponse=await fetcher(new URL(isLocal?'__manifest.json':'dependency-manifest-'+config.manifest+'.json',base));if(!manifestResponse.ok)throw Error('Dependency manifest unavailable');
 const manifestBytes=new Uint8Array(await manifestResponse.arrayBuffer());if(await sha256(manifestBytes)!==config.manifest)throw Error('Dependency manifest integrity failure');
 const manifest=validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
 const shellResponse=await fetcher(new URL(isLocal?'__shell.json':'offline-shell.json',base));if(!shellResponse.ok)throw Error('Offline application unavailable');
 const shellBytes=new Uint8Array(await shellResponse.arrayBuffer()),shell=validateOfflineShell(JSON.parse(new TextDecoder().decode(shellBytes)));
 if(shell.manifest!==config.manifest)throw Error('Offline application version mismatch');
 const identity=await sha256(shellBytes),sourceBase=isLocal?new URL(config.sourceBase):new URL('./',base),appBase=isLocal?new URL('./',base):new URL('offline/',sourceBase);
 let catalog,catalogBytes,featurePolicy=normalizeFeatureState();if(shell.catalog){const response=await fetcher(new URL(isLocal?'__features.json':'feature-catalog.json',base));if(!response.ok)throw Error('Offline feature catalogue unavailable');catalogBytes=new Uint8Array(await response.arrayBuffer());if(await sha256(catalogBytes)!==shell.catalog)throw Error('Offline feature catalogue integrity failure');catalog=validateFeatureCatalog(JSON.parse(new TextDecoder().decode(catalogBytes)),manifest);if(isLocal){const policyResponse=await fetcher(new URL('__feature-policy.json',base));if(policyResponse.ok)featurePolicy=normalizeFeatureState(await policyResponse.json());}}
 return {config,manifest,manifestBytes,shell,shellBytes,identity,sourceBase,appBase,local:isLocal,catalog,catalogBytes,featurePolicy};
}
async function saveOfflineShell(plan,{storage=caches,fetcher=fetch,signal,progress=()=>{},archiveIndex}={}){
 const cache=await storage.open(offlineCacheName(plan.identity));
 for(const [name,meta]of Object.entries(plan.shell.files)){
  signal?.throwIfAborted();const key=new URL(name,plan.appBase),cached=await cache.match(key);
  if(cached){const bytes=new Uint8Array(await cached.arrayBuffer());if(bytes.length===meta.size&&await sha256(bytes)===meta.sha256)continue;}
  let bytes;const member=archiveIndex?.files.get('app/'+name);
  if(member?.size===meta.size){const candidate=new Uint8Array(await archiveIndex.blob.slice(member.offset,member.offset+member.size).arrayBuffer());if(await sha256(candidate)===meta.sha256)bytes=candidate;}
  if(!bytes){const response=await fetcher(new URL(plan.local?(name==='dependency-config.json'?'__shell-file/'+name:name):(meta.source||name),plan.local?plan.appBase:plan.sourceBase),{signal,credentials:'omit'});
   if(!response.ok)throw Error('Offline application file unavailable: '+name);
   bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==meta.size||await sha256(bytes)!==meta.sha256)throw Error('Offline application integrity failure: '+name);
  }
  await cache.put(key,new Response(bytes,{headers:offlineHeaders(offlineMime(name))}));progress({phase:'shell',name});
 }
 await cache.put(new URL('__manifest.json',plan.appBase),new Response(plan.manifestBytes,{headers:offlineHeaders('application/json')}));
 await cache.put(new URL('__shell.json',plan.appBase),new Response(plan.shellBytes,{headers:offlineHeaders('application/json')}));
 if(plan.catalogBytes)await cache.put(new URL('__features.json',plan.appBase),new Response(plan.catalogBytes,{headers:offlineHeaders('application/json')}));if(plan.catalog)await cache.put(new URL('__feature-policy.json',plan.appBase),new Response(JSON.stringify(normalizeFeatureState(plan.featurePolicy)),{headers:offlineHeaders('application/json')}));
 return cache;
}
async function offlineMissing(plan,{storage=caches}={}){
 const cache=await storage.open(OFFLINE_CHUNKS),keys=new Set((await cache.keys()).map(r=>new URL(r.url).pathname.match(/\/__dependency_chunks__\/([a-f0-9]{64})$/)?.[1]).filter(Boolean));
 return (plan.catalog?[...requiredFeatureChunks(plan.catalog,plan.manifest,plan.featurePolicy||{})]:requiredDependencyChunks(plan.manifest)).map(([hash])=>hash).filter(h=>!keys.has(h));
}
async function prepareOfflineBrowser(plan,{archive,storage=caches,fetcher=fetch,signal,progress=()=>{},folder}={}){
 const index=archive?await indexResourceTar(archive,{signal}):null;
 const policyMember=index?.files.get('feature-policy.json'),catalogMember=index?.files.get('feature-catalog.json');if(policyMember||catalogMember){if(!plan.shell.catalog||!catalogMember||catalogMember.size>8_000_000||!policyMember||policyMember.size>65536)throw Error('Selective archive catalogue/policy metadata missing or incompatible');const catalogBytes=new Uint8Array(await index.blob.slice(catalogMember.offset,catalogMember.offset+catalogMember.size).arrayBuffer());if(await sha256(catalogBytes)!==plan.shell.catalog)throw Error('Selective archive catalogue integrity failure');plan={...plan,catalog:validateFeatureCatalog(JSON.parse(new TextDecoder().decode(catalogBytes)),plan.manifest),catalogBytes,featurePolicy:plan.policyEstablished?normalizeFeatureState(plan.featurePolicy):normalizeFeatureState(JSON.parse(await index.blob.slice(policyMember.offset,policyMember.offset+policyMember.size).text()))};}
 const cache=await saveOfflineShell(plan,{storage,fetcher,signal,progress,archiveIndex:index}),chunks=await storage.open(OFFLINE_CHUNKS);
 const network=plan.local?async()=>{throw Error('Offline resource missing. Select your archive.');}:fetcher;
 const load=createChunkLoader(plan.manifest,{base:plan.local?null:remoteBase(plan.manifest.remoteBase,{allowLocal:['127.0.0.1','localhost'].includes(plan.sourceBase.hostname)}),scope:plan.sourceBase,cacheStorage:storage,fetcher:network,archive:index&&archiveChunkReader(index,plan.manifest),...(folder?{folder}:{})});
 let completed=0,bytes=0;const required=plan.catalog?[...requiredFeatureChunks(plan.catalog,plan.manifest,plan.featurePolicy||{})]:requiredDependencyChunks(plan.manifest),total=required.length;
 for(const [hash,size]of required){
  signal?.throwIfAborted();let reusedCache=false;
  const data=await load(hash,entry=>{if(entry.kind==='dependency.cache-hit')reusedCache=true;});
  // Unlike transient archive exports, an installation must persist every piece.
  // Await each write: a quota failure must never become a false "ready" state.
  if(!reusedCache)await chunks.put(offlineChunkURL(plan.sourceBase,hash),new Response(data));
  bytes+=size;progress({phase:'resources',completed:++completed,total,bytes});
 }
 // A public-only archive is complete without restricted models. When the user
 // explicitly supplies those ordinary files, preserve them for offline use as
 // well; an invalid supplied model never becomes a successful import.
 const importedLocalOnlyFiles=[],optional=Object.entries(plan.manifest.files).filter(([path,file])=>file.localOnly===true&&(!plan.catalog||selectActiveFiles(plan.catalog,plan.featurePolicy||{}).has(path))),directory=folder?await folder():await libraryValue('folder').catch(()=>null);
 for(const [path,file]of optional){
  signal?.throwIfAborted();const member=index?.files.get(path);let blob=member&&index.blob.slice(member.offset,member.offset+member.size);
  if(!blob&&directory)try{blob=await(await libraryFile(directory,path)).getFile();}catch(error){if(error.name!=='NotFoundError')throw error;}
  if(!blob)continue;
  await importLibraryFile(blob,file,plan.manifest,(hash,data)=>chunks.put(offlineChunkURL(plan.sourceBase,hash),new Response(data)),signal);
  importedLocalOnlyFiles.push(path);progress({phase:'local-models',completed:importedLocalOnlyFiles.length,total:optional.length});
 }
 signal?.throwIfAborted();if((await offlineMissing(plan,{storage})).length)throw Error('Offline resources were removed during installation');
 const receipt={schema:'sherloq.browser-offline/1',managedStorage:plan.config.managedStorage===true,transport:plan.config.offlineMode==='archive'?'local-server':null,version:plan.shell.version,manifest:plan.config.manifest,shell:plan.identity,sourceBase:plan.sourceBase.href,appBase:plan.appBase.href,chunks:total,bytes,complete:true,localOnlyFiles:optional.map(([path])=>path),importedLocalOnlyFiles};
 await cache.put(new URL('__installation.json',plan.appBase),new Response(JSON.stringify(receipt),{headers:offlineHeaders('application/json')}));
 return receipt;
}
async function readOfflineInstallation(appBase,identity,{storage=caches}={}){
 const cache=await storage.open(offlineCacheName(identity)),read=async name=>{const r=await cache.match(new URL(name,appBase));if(!r)throw Error('Offline installation incomplete');return r;};
 const shellBytes=new Uint8Array(await(await read('__shell.json')).arrayBuffer());if(await sha256(shellBytes)!==identity)throw Error('Offline shell identity differs');
 const shell=validateOfflineShell(JSON.parse(new TextDecoder().decode(shellBytes)));
 const manifestBytes=new Uint8Array(await(await read('__manifest.json')).arrayBuffer());if(await sha256(manifestBytes)!==shell.manifest)throw Error('Offline manifest identity differs');
 const manifest=validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes))),receiptResponse=await cache.match(new URL('__installation.json',appBase)),receipt=receiptResponse&&await receiptResponse.json();
 const catalogResponse=await cache.match(new URL('__features.json',appBase)),catalog=catalogResponse?validateFeatureCatalog(await catalogResponse.clone().json(),manifest):null,policyResponse=await cache.match(new URL('__feature-policy.json',appBase)),featurePolicy=policyResponse?await policyResponse.json():null;
 if(shell.catalog&&(!catalogResponse||await sha256(new Uint8Array(await catalogResponse.arrayBuffer()))!==shell.catalog))throw Error('Offline feature catalogue identity differs');
 return {cache,shell,manifest,receipt,catalog,featurePolicy};
}

const offlineBase=new URL(self.registration.scope),sourceBase=new URL('./',self.location.href),identity=new URL(self.location.href).searchParams.get('shell');
if(!/^[a-f0-9]{64}$/.test(identity))throw Error('Offline identity required');
const installed=readOfflineInstallation(offlineBase,identity);
self.addEventListener('install',event=>event.waitUntil(installed));
// A new release waits for old local windows to close. Running calculations keep
// their exact shell and model inventory; never force a worker update under them.
self.addEventListener('activate',event=>event.waitUntil((async()=>{const state=await updates.read();if(state.bootstrapCandidate?.identity===identity){const candidate=state.bootstrapCandidate,current=await readOfflineInstallation(offlineBase,identity),policy=normalizeFeatureState(state.active?.policy||candidate.policy||{});if(current.catalog)await current.cache.put(new URL('__feature-policy.json',offlineBase),new Response(JSON.stringify(policy),{headers:offlineHeaders('application/json')}));if(!current.receipt?.complete||current.receipt.transport!=='local-server'&&(await offlineMissing({manifest:current.manifest,sourceBase:new URL(current.receipt.sourceBase),appBase:offlineBase,catalog:current.catalog,featurePolicy:policy})).length)throw Error('Installation choices changed; prepare the local version again');await updates.change(s=>{if(s.active?.identity!==candidate.expectedActive)throw Error('Another local version activated; prepare again');return {...s,previous:s.active,active:{...candidate,status:'active',policy},bootstrapCandidate:null,journal:journal(s,'installation-activated',{identity})};});installations.clear();loads.delete(identity);}await self.clients.claim();})()));
const localExports=new Map(),clientVersions=new Map(),installations=new Map([[identity,installed]]),loads=new Map(),networkSessions=new Map(),updates=browserUpdateStore({base:offlineBase});
let activationLock,lockTimer;
const helperControlPaths=new Set(['__launcher','__stop'].map(path=>new URL(path,offlineBase).pathname));
const scopedClients=async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(offlineBase.href)&&!helperControlPaths.has(new URL(c.url).pathname));
const serverPermission=async()=>{const state=await updates.read().catch(()=>null),record=state?.active,receipt=record?.receipt;return {local:record?.transport==='local-server'||receipt?.transport==='local-server',managed:record?.managedStorage===true||receipt?.managedStorage===true};};
const installerURL=new URL('offline-setup.html',sourceBase);
const fromInstaller=source=>{try{const u=new URL(source?.url);return u.origin===installerURL.origin&&u.pathname===installerURL.pathname;}catch{return false;}};
const bridgeToken=offlineBase.pathname.match(/^\/([a-f0-9]{32})\/$/)?.[1];
const fromArchiveBridge=source=>{try{const u=new URL(source?.url);return !!bridgeToken&&u.origin===offlineBase.origin&&u.pathname==='/__sherloq_bridge/'+bridgeToken+'/offline-bridge.html';}catch{return false;}};
const installationClients=async owner=>(await scopedClients()).filter(client=>client.id!==owner.id||!(fromInstaller(owner)||fromArchiveBridge(owner)));
const notify=async type=>{for(const c of await scopedClients())c.postMessage({type});};
async function syncFeaturePolicy(client,policy){return new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false);},7000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ready===true);};client.postMessage({type:'local-feature-policy',policy},[channel.port2]);});}
async function probeClient(client){return new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false);},7000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ready===true);};client.postMessage({type:'local-update-probe'},[channel.port2]);});}
async function helperFetchPinned(event){const state=await updates.read().catch(()=>null),id=event.request.mode==='navigate'?(state?.active?.identity||identity):(clientVersions.get(event.clientId)||state?.clientVersions?.[event.clientId]||state?.active?.identity||identity),headers=new Headers(event.request.headers);headers.set('X-Sherloq-Release',id);const response=await fetch(new Request(event.request.url,{method:event.request.method,headers,credentials:'omit',referrerPolicy:'no-referrer',mode:'same-origin',cache:'no-store'}));if(response.ok&&response.headers.get('X-Sherloq-Release')!==id)return new Response('The local helper does not contain this exact SHERLOQ release. Restore the matching updated archive and launcher; your saved preferences remain local.',{status:409,headers:offlineHeaders('text/plain')});return response;}
async function installationFor(event){const state=await updates.read().catch(()=>null),id=event.request.mode==='navigate'?(state?.active?.identity||identity):(clientVersions.get(event.clientId)||state?.clientVersions?.[event.clientId]||state?.active?.identity||identity);if(event.clientId&&!clientVersions.has(event.clientId))clientVersions.set(event.clientId,id);if(event.resultingClientId){clientVersions.set(event.resultingClientId,id);if(state?.clientVersions)void updates.change(s=>({...s,clientVersions:{...s.clientVersions,[event.resultingClientId]:id}}));}if(!installations.has(id))installations.set(id,readOfflineInstallation(offlineBase,id));return {id,...await installations.get(id)};}
self.addEventListener('message',event=>{if(!(event.source?.url?.startsWith(offlineBase.href)||(fromInstaller(event.source)||fromArchiveBridge(event.source))&&event.data?.type==='local-install-adopt')||!event.data?.type?.startsWith('local-update-')&&!event.data?.type?.startsWith('local-feature-')&&event.data?.type!=='local-install-adopt')return;event.waitUntil((async()=>{const data=event.data;
 if(data.type==='local-install-adopt'){if(activationLock)throw Error('Another local change is being activated');const state=await updates.read(),candidate=state.bootstrapCandidate;if(!candidate||candidate.identity!==data.identity||candidate.status!=='ready')throw Error('Prepared installation reference missing');const current=await readOfflineInstallation(offlineBase,candidate.identity),policy=normalizeFeatureState(state.active?.policy||candidate.policy||{});if(current.catalog)await current.cache.put(new URL('__feature-policy.json',offlineBase),new Response(JSON.stringify(policy),{headers:offlineHeaders('application/json')}));if(!current.receipt?.complete||current.receipt.transport!=='local-server'&&(await offlineMissing({manifest:current.manifest,sourceBase:new URL(current.receipt.sourceBase),catalog:current.catalog,featurePolicy:policy})).length)throw Error('Prepared installation resources missing; choices changed, prepare again');const windows=await installationClients(event.source);activationLock={kind:'install',identity:candidate.identity,owner:event.source.id,clients:windows.map(c=>c.id)};clearTimeout(lockTimer);lockTimer=setTimeout(()=>{activationLock=null;void notify('local-update-cancel');},30000);try{if(state.active&&!(await Promise.all(windows.map(probeClient))).every(Boolean))throw Error('Close older local windows after their calculations before activating this installation');const now=await installationClients(event.source);if(now.some(client=>!activationLock?.clients.includes(client.id)))throw Error('A new local window opened; activate this installation again');await updates.change(s=>{if(s.active?.identity!==candidate.expectedActive||s.bootstrapCandidate?.identity!==candidate.identity||JSON.stringify(normalizeFeatureState(s.active?.policy||candidate.policy||{}))!==JSON.stringify(policy))throw Error('Another local version or feature choice changed; prepare again');return {...s,previous:s.active?.identity===candidate.identity?s.previous:s.active,active:{...(s.active?.identity===candidate.identity?s.active:{}),...candidate,status:'active',policy},bootstrapCandidate:null,journal:journal(s,'installation-activated',{identity:candidate.identity})};});installations.clear();loads.delete(candidate.identity);activationLock=null;clearTimeout(lockTimer);await notify('local-update-activated');return {ok:true};}catch(error){activationLock=null;clearTimeout(lockTimer);await notify('local-update-cancel');throw error;}}
 if(data.type==='local-update-network-open'){networkSessions.set(event.source.id,Date.now()+30*60*1000);return {ok:true};}
 if(data.type==='local-update-network-close'){networkSessions.delete(event.source.id);return {ok:true};}
 if(data.type==='local-update-policy'){installations.clear();const state=await updates.read();if(state.active){const current=await readOfflineInstallation(offlineBase,state.active.identity),windows=await scopedClients();if(!(await Promise.all(windows.map(client=>syncFeaturePolicy(client,current.featurePolicy||{})))).every(Boolean))throw Error('A local window did not apply the feature choices; reload that window before continuing');}return {ok:true};}
 if(data.type==='local-feature-lock'){if(activationLock)throw Error('Another local change is being activated');const windows=await scopedClients();if(!(await Promise.all(windows.map(probeClient))).every(Boolean)){await notify('local-update-cancel');throw Error('A local window is busy or did not confirm readiness');}activationLock={kind:'feature',owner:event.source.id,clients:windows.map(c=>c.id)};clearTimeout(lockTimer);lockTimer=setTimeout(()=>{activationLock=null;void notify('local-update-cancel');},30000);return {ok:true};}
 if(data.type==='local-feature-validate'||data.type==='local-feature-renew'){if(activationLock?.kind!=='feature'||activationLock.owner!==event.source.id)throw Error('Feature mutation lock missing');if((await scopedClients()).some(c=>!activationLock.clients.includes(c.id)))throw Error('A new local window opened; retry the feature change');clearTimeout(lockTimer);lockTimer=setTimeout(()=>{activationLock=null;void notify('local-update-cancel');},30000);return {ok:true};}
 if(data.type==='local-feature-unlock'){if(activationLock?.kind==='feature'&&activationLock.owner===event.source.id){activationLock=null;clearTimeout(lockTimer);await notify('local-update-cancel');}return {ok:true};}
 if(data.type==='local-update-lock'){if(activationLock)throw Error('Another local update is being activated');if(!/^[a-f0-9]{64}$/.test(data.identity))throw Error('Invalid candidate identity');const state=await updates.read();if(![state.candidate?.identity,state.previous?.identity].includes(data.identity))throw Error('Candidate is not recorded');await readOfflineInstallation(offlineBase,data.identity);const windows=await scopedClients();if(!(await Promise.all(windows.map(probeClient))).every(Boolean)){await notify('local-update-cancel');throw Error('A local window is busy or did not confirm readiness');}activationLock={identity:data.identity,owner:event.source.id,clients:windows.map(c=>c.id)};await updates.change(s=>({...s,clientVersions:Object.fromEntries(windows.map(c=>[c.id,clientVersions.get(c.id)||s.active?.identity||identity]))}));clearTimeout(lockTimer);lockTimer=setTimeout(()=>{activationLock=null;void notify('local-update-cancel');},30000);return {ok:true};}
 if(data.type==='local-update-cancel'){if(activationLock?.owner===event.source.id){activationLock=null;clearTimeout(lockTimer);await notify('local-update-cancel');}return {ok:true};}
 if(data.type==='local-update-commit'){if(activationLock?.owner!==event.source.id||activationLock.identity!==data.identity)throw Error('Activation lock missing');const current=await scopedClients();if(current.some(c=>!activationLock.clients.includes(c.id))){activationLock=null;clearTimeout(lockTimer);await notify('local-update-cancel');throw Error('A new local window opened; activation must be retried');}const state=await updates.read();if(state.active?.identity!==data.expectedActive)throw Error('Active reference changed');if(data.rollback)await rollbackReference(updates);else await activateCandidate(updates,data.identity,data.expectedActive);activationLock=null;clearTimeout(lockTimer);await notify('local-update-activated');try{const remaining=await pruneUpdateCaches(await updates.read(),offlineBase,{bridgeIdentity:identity});if(remaining)await updates.change(s=>({...s,managedChunks:remaining}));}catch{}return {ok:true};}
 throw Error('Unknown local update command');})().then(value=>event.ports[0]?.postMessage(value),error=>event.ports[0]?.postMessage({ok:false,error:error.message})));});
self.addEventListener('message',event=>{
 if(event.data?.type!=='offline-kit-prepare'||!(event.source?.url?.startsWith(offlineBase.href)||fromInstaller(event.source)))return;
 try{const {id,archive,identity:exportIdentity,allowPublicNetwork=false}=event.data;if(!/^[a-f0-9-]{36}$/.test(id)||archive&&!(archive instanceof Blob)||exportIdentity&&!/^[a-f0-9]{64}$/.test(exportIdentity)||allowPublicNetwork&&!fromInstaller(event.source))throw Error('Invalid archive request');
  for(const [key,value]of localExports)if(value.client===event.source.id)localExports.delete(key);
  localExports.set(id,{client:event.source.id,archive,identity:exportIdentity,allowPublicNetwork});setTimeout(()=>localExports.delete(id),600000);event.ports[0]?.postMessage({ok:true});
 }catch(error){event.ports[0]?.postMessage({ok:false,error:error.message});}
});
const noNetwork=async()=>{throw Error('Offline dependency missing. Restore your archive.');};

self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 let finishArchive=()=>{};
 if(event.request.method==='GET'&&url.origin===offlineBase.origin&&url.pathname===new URL('__dependency_download__/kit.tar',offlineBase).pathname)event.waitUntil(new Promise(resolve=>{finishArchive=resolve;}));
 event.respondWith((async()=>{
  if(url.origin!==offlineBase.origin){const publicUpdate=url.protocol==='https:'&&url.hostname==='raw.githubusercontent.com'&&!url.search&&!url.hash&&!url.username&&!url.password&&(/^\/Kinkazma\/sherloq-web\/[a-f0-9]{40}\//.test(url.pathname)||url.href==='https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json');if(event.request.method==='GET'&&publicUpdate&&(networkSessions.get(event.clientId)||0)>Date.now())return fetch(new Request(event.request,{credentials:'omit',referrerPolicy:'no-referrer',mode:'cors'}));return new Response('Remote access is disabled outside an explicit local update',{status:503});}if(!url.pathname.startsWith(offlineBase.pathname))return new Response('Outside local scope',{status:503});
  const requestedName=url.pathname.slice(offlineBase.pathname.length);if((requestedName==='__launcher'&&['GET','HEAD'].includes(event.request.method)||requestedName==='__stop'&&event.request.method==='POST')&&(await serverPermission()).local)return fetch(event.request);if(requestedName.startsWith('__managed/')){const permission=await serverPermission();if(permission.managed||['GET','HEAD'].includes(event.request.method)&&permission.local&&(requestedName.startsWith('__managed/chunks/')||requestedName==='__managed/inventory'))return fetch(event.request);}
  if(!['GET','HEAD'].includes(event.request.method))return new Response('Read only',{status:405});
  if(event.request.mode==='navigate'&&['feature','install'].includes(activationLock?.kind))return new Response('Local feature management is in progress in another window. Reload after it completes.',{status:503,headers:offlineHeaders('text/plain')});
  const name=requestedName;let installation;try{const exporting=name==='__dependency_download__/kit.tar'&&localExports.get(url.searchParams.get('id'));installation=exporting?.identity?{id:exporting.identity,...await readOfflineInstallation(offlineBase,exporting.identity)}:await installationFor(event);}catch(error){if((await serverPermission()).local)return helperFetchPinned(event);throw error;}const {id,cache,shell,manifest,receipt,catalog,featurePolicy}=installation;
  const chunkScope=new URL(receipt?.sourceBase||sourceBase),plan={manifest,sourceBase:chunkScope,appBase:offlineBase,catalog,featurePolicy};
  if(name==='dependency-config.json')return new Response(JSON.stringify({schema:'sherloq.dependency-config/1',enabled:false,offline:true,offlineMode:receipt?.transport==='local-server'?'archive':'browser',workerType:shell.workerType||'module',manifest:shell.manifest,version:shell.version,sourceBase:chunkScope.href,managedStorage:receipt?.managedStorage===true,updaterChannel:'https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json'}),{headers:offlineHeaders('application/json')});
  if(name==='__offline-status.json'){const missing=await offlineMissing(plan);return new Response(JSON.stringify({complete:!!receipt?.complete&&(!missing.length||receipt.transport==='local-server'),missing:missing.length,storage:receipt?.transport==='local-server'?'archive':'browser',version:shell.version}),{headers:offlineHeaders('application/json')});}
  if(name.startsWith('__managed/')&&(receipt?.managedStorage===true||receipt?.transport==='local-server'&&(name.startsWith('__managed/chunks/')||name==='__managed/inventory')))return fetch(event.request);
  if(!loads.has(id)){const archive=receipt?.transport==='local-server'?async hash=>{const size=manifest.chunks[hash];try{const response=await fetch(new URL('__managed/chunks/'+hash,offlineBase));if(response.ok&&response.headers.get('content-length')===String(size)){const bytes=new Uint8Array(size),reader=response.body.getReader();let at=0;for(;;){const {done,value}=await reader.read();if(done)break;if(at+value.length>size){await reader.cancel();throw Error('Local dependency chunk too large');}bytes.set(value,at);at+=value.length;}if(at===size)return bytes;}}catch{}for(const [path,file]of Object.entries(manifest.files)){let offset=0;for(const h of file.chunks){if(h===hash){const size=manifest.chunks[h],response=await fetch(new URL(path,offlineBase),{headers:{Range:'bytes='+offset+'-'+(offset+size-1)}});if(response.status===206&&response.headers.get('content-length')===String(size))return new Uint8Array(await response.arrayBuffer());}offset+=manifest.chunks[h];}}return null;}:null;loads.set(id,createChunkLoader(manifest,{base:null,scope:chunkScope,fetcher:noNetwork,folder:async()=>null,archive}));}const offlineLoad=loads.get(id);
  if(name==='__dependency_download__/kit.tar'){
   const headers={...offlineHeaders('application/x-tar'),'Content-Disposition':'attachment; filename="SHERLOQ-complet.tar"'};
   if(event.request.method==='HEAD')return new Response(null,{headers});
   const id=url.searchParams.get('id'),requested=localExports.get(id);localExports.delete(id);if(!requested)throw Error('Start archive creation from the offline setup');
   let archiveReader;if(requested.archive){const index=await indexResourceTar(requested.archive),member=index.files.get('manifest.json');let previousManifest=manifest;if(member&&member.size<=8_000_000)previousManifest=validateManifest(JSON.parse(await index.blob.slice(member.offset,member.offset+member.size).text()));archiveReader=archiveChunkReader(index,previousManifest);}const publicBase=requested.allowPublicNetwork?remoteBase(manifest.remoteBase):null;if(publicBase&&!publicBase.startsWith('https://raw.githubusercontent.com/Kinkazma/sherloq-web/'))throw Error('Unexpected public archive source');const exportLoad=requested.allowPublicNetwork||archiveReader?createChunkLoader(manifest,{base:publicBase,scope:chunkScope,fetcher:requested.allowPublicNetwork?fetch:noNetwork,archive:archiveReader}):offlineLoad;
   const selectedPaths=catalog?selectActiveFiles(catalog,featurePolicy||{}):undefined;
   const extras=(async function*(){for(const [route,path]of [['__features.json','feature-catalog.json'],['__feature-policy.json','feature-policy.json'],['__release.json','local-release.json']]){const r=await cache.match(new URL(route,offlineBase));if(r)yield [path,new Uint8Array(await r.arrayBuffer())];}const metadata=await cache.match(new URL('__shell.json',offlineBase));yield ['offline-kit.json',new Uint8Array(await metadata.arrayBuffer())];for(const [path,meta]of Object.entries(shell.files)){const r=await cache.match(new URL(path,offlineBase));if(!r)throw Error('Offline application file missing');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length!==meta.size||await sha256(bytes)!==meta.sha256)throw Error('Offline application integrity failure');yield ['app/'+path,bytes];}})();
   const notify=data=>self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>clients.filter(c=>c.url.startsWith(offlineBase.href)||fromInstaller(c)).forEach(c=>c.postMessage({type:'dependency-download-progress',id,...data})));
   const stream=resourceTarStream(manifest,exportLoad,{extras,selectedPaths,manifestBytes:new Uint8Array(await(await cache.match(new URL('__manifest.json',offlineBase))).arrayBuffer()),progress:value=>void notify({value,total:publicDependencyEntries(manifest).filter(([path])=>!selectedPaths||selectedPaths.has(path)).length}),finished:error=>{void notify({done:true,error:error?.message}).finally(finishArchive);}});
   return new Response(stream,{headers});
  }
  if(manifest.files[name]){if(catalog&&!selectActiveFiles(catalog,featurePolicy||{}).has(name))return new Response('FEATURE_UNINSTALLED: This local function was voluntarily removed',{status:410,headers:offlineHeaders('text/plain')});return dependencyResponse(manifest.files[name],manifest,offlineLoad,event.request);}
  if(name==='app.html'){
   const missing=await offlineMissing(plan);
   if(!receipt?.complete||(missing.length&&receipt.transport!=='local-server'))return Response.redirect(new URL('offline-setup.html',offlineBase),302);
  }
  const cachePath=name==='__shell-file/dependency-config.json'?'dependency-config.json':name;
  const response=await cache.match(new URL(cachePath,offlineBase));
  if(!response)return new Response('Offline file missing: '+name,{status:404,headers:offlineHeaders('text/plain')});
  // Strip only query parameters for lookups. No online fetch fallback exists.
  return event.request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
 })().catch(error=>{finishArchive();return new Response(error.message,{status:503,headers:offlineHeaders('text/plain')});}));
});
