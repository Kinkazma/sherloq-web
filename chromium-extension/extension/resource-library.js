import {readSettings} from './settings.js';
import {withLibraryTabs,callLibrary} from './library-tabs.js';
import {inLocalLibrary} from './local-library.js';
import {inWebFolder} from './web-folder.js';
const CACHE='sherloq-dependency-chunks-v1',own=path=>chrome.runtime.getURL(path),channel='https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json';
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
let catalogPromise,remotePromise;const active=new Map();
const catalog=()=>catalogPromise??=fetch(own('resource-catalog.json')).then(r=>r.json());
const key=hash=>'https://sherloq.invalid/__dependency_chunks__/'+hash,validURL=url=>/^https:\/\/raw\.githubusercontent\.com\/Kinkazma\/sherloq-web\/[a-f0-9]{40}\//.test(url);
async function verifiedResponse(response,hash,bytes){if(!response)return false;const body=await response.clone().arrayBuffer();return body.byteLength===bytes&&await digest(body)===hash;}
async function remote(){return remotePromise??=(async()=>{const pointer=await(await fetch(channel,{cache:'no-cache',credentials:'omit'})).json();if(!validURL(pointer.release?.url))throw Error('Canal de ressources invalide.');const bytes=await(await fetch(pointer.release.url)).arrayBuffer();if(await digest(bytes)!==pointer.release.sha256)throw Error('Livraison GitHub non conforme.');const release=JSON.parse(new TextDecoder().decode(bytes));if(!validURL(release.manifest?.url))throw Error('Inventaire de ressources invalide.');const body=await(await fetch(release.manifest.url)).arrayBuffer();if(await digest(body)!==release.manifest.sha256)throw Error('Inventaire GitHub non conforme.');const manifest=JSON.parse(new TextDecoder().decode(body));if(manifest.schema!=='sherloq.dependencies/1'||!validURL(manifest.remoteBase))throw Error('Bibliothèque GitHub invalide.');return manifest;})().catch(error=>{remotePromise=null;throw error;});}
// Runs only in an already-open, configured SHERLOQ origin. No page/source image
// enters this bridge: only pinned public resource identities and binary pieces.
async function inWeb({action,hash,bytes,offset=0,count=1048576,url}){
 const name='sherloq-dependency-chunks-v1';if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(bytes)||bytes<0||bytes>100000000)throw Error('Invalid resource');
 if(action==='probe'&&!(await caches.keys()).includes(name))return false;
 const cache=await caches.open(name),keys=await cache.keys(),found=keys.find(k=>k.url.endsWith('/__dependency_chunks__/'+hash));
 if(action==='probe'){if(!found)return false;const body=await(await cache.match(found)).arrayBuffer(),valid=body.byteLength===bytes&&[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(v=>v.toString(16).padStart(2,'0')).join('')===hash;if(!valid)await cache.delete(found);return valid;}
 if(action==='download'){if(!/^https:\/\/raw\.githubusercontent\.com\/Kinkazma\/sherloq-web\/[a-f0-9]{40}\//.test(url))throw Error('Invalid download source');const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('GitHub HTTP '+response.status);const body=await response.arrayBuffer();if(body.byteLength!==bytes||[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(v=>v.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Invalid resource bytes');await cache.put(new URL('__dependency_chunks__/'+hash,location.href),new Response(body,{headers:{'Content-Length':String(bytes)}}));return true;}
 if(!found)throw Error('Missing cached resource');const body=await(await cache.match(found)).blob(),part=new Uint8Array(await body.slice(offset,Math.min(bytes,offset+count)).arrayBuffer());let binary='';for(let i=0;i<part.length;i+=8192)binary+=String.fromCharCode(...part.subarray(i,i+8192));return btoa(binary);
}
async function probeMemo(context,key,run){if(!context.memo.has(key))context.memo.set(key,Promise.resolve().then(run).catch(()=>null));return context.memo.get(key);}
async function location(part,file,offset,context){
 const spec={path:file.path,sha256:file.sha256,bytes:file.bytes},local=await context.sources('local');
 for(const tab of local){const source=await probeMemo(context,'archive:'+tab.tabId+':'+tab.frameId+':'+spec.sha256,()=>callLibrary(tab,inLocalLibrary,{action:'probe',file:spec}));if(source)return {tab,source,offset,kind:'archive'};}
 const cache=await caches.open(CACHE),response=await cache.match(key(part.hash));if(await verifiedResponse(response,part.hash,part.bytes))return {response};if(response)await cache.delete(key(part.hash));
 for(const tab of [...local,...await context.sources('web')])try{
  if(await callLibrary(tab,inWeb,{action:'probe',hash:part.hash,bytes:part.bytes}))return {tab,kind:'cache'};
  if(await probeMemo(context,'folder:'+tab.tabId+':'+tab.frameId+':'+spec.sha256,()=>callLibrary(tab,inWebFolder,{action:'probe',file:spec})))return {tab,source:spec,offset,kind:'folder'};
 }catch{}
 return null;
}
async function specFile(spec,{network=false}={}){const c=await catalog();let file=c.files.find(file=>file.sha256===spec.sha256);if(!file?.chunks&&network){const manifest=await remote(),match=Object.entries(manifest.files).find(([,f])=>f.sha256===spec.sha256&&f.size===spec.bytes);if(!match)throw Object.assign(Error('Ces poids ne sont pas encore disponibles dans la livraison GitHub de SHERLOQ.'),{code:'RESOURCE_NOT_PUBLISHED'});file={...spec,chunks:match[1].chunks.map(hash=>({hash,bytes:manifest.chunks[hash]})),base:manifest.remoteBase};}return file??spec;}
async function chunk(part,file,network,offset,context){
 let found=await location(part,file,offset,context);
 if(!found&&network){
  const tabs=await context.sources('web'),url=new URL('chunks/'+part.hash+'.bin',file.base).href;
  if(!validURL(url))throw Error('Adresse de ressource invalide.');
  for(const tab of tabs)try{
   const completed=await callLibrary(tab,inWeb,{action:'download',hash:part.hash,bytes:part.bytes,url});
   if(completed===true){found={tab,kind:'cache'};break;}
  }catch{}
  if(!found){
   const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('GitHub : HTTP '+response.status);
   const body=await response.arrayBuffer();
   if(body.byteLength!==part.bytes||await digest(body)!==part.hash)throw Error('Ressource GitHub non conforme.');
   const responseToCache=new Response(body,{headers:{'Content-Length':String(part.bytes)}});
   await(await caches.open(CACHE)).put(key(part.hash),responseToCache.clone());found={response:responseToCache};
  }
 }
 if(!found)throw Object.assign(Error('Ressource absente de la bibliothèque locale.'),{code:'RESOURCE_MISSING'});
 if(found.response)return found.response.blob();
 const pieces=[];
 for(let at=0;at<part.bytes;at+=1048576){
  const count=Math.min(1048576,part.bytes-at);
  const args=found.kind==='archive'?{action:'read',source:found.source,segment:{offset:found.offset,bytes:part.bytes,sha256:part.hash},offset:found.offset+at,count}:found.kind==='folder'?{action:'read',file:found.source,offset:found.offset+at,count}:{action:'read',hash:part.hash,bytes:part.bytes,offset:at,count};
  const func=found.kind==='archive'?inLocalLibrary:found.kind==='folder'?inWebFolder:inWeb;
  const value=await callLibrary(found.tab,func,args);
  if(typeof value!=='string')throw Error('Lecture de la bibliothèque interrompue.');
  pieces.push(Uint8Array.from(atob(value),v=>v.charCodeAt(0)));
 }
 const result=new Blob(pieces);
 if(result.size!==part.bytes||await digest(await result.arrayBuffer())!==part.hash)throw Error('Ressource partagée non conforme.');
 return result;
}
export async function resourcePresence(group){return withLibraryTabs(async context=>{const files=(await catalog()).files.filter(f=>f.group===group),missing=[];let missingBytes=0;for(const spec of files){const file=await specFile(spec);let bytes=0,offset=0;for(const part of file.chunks??[{hash:file.sha256,bytes:file.bytes}]){if(!await location(part,file,offset,context))bytes+=part.bytes;offset+=part.bytes;}if(bytes){missing.push(spec.sha256);missingBytes+=bytes;}}return {ready:missing.length===0,missing,missingBytes,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};});}
export async function resourceBlob(hash,{network=false}={}){
 if(active.has(hash))return active.get(hash);const task=withLibraryTabs(async context=>{const spec=(await catalog()).files.find(f=>f.sha256===hash);if(!spec)throw Error('Ressource non autorisée.');const file=await specFile(spec,{network}),parts=file.chunks??[{hash:file.sha256,bytes:file.bytes}],pieces=[];let offset=0;for(const part of parts){pieces.push(await chunk(part,file,network,offset,context));offset+=part.bytes;}const blob=new Blob(pieces);if(blob.size!==file.bytes)throw Error('Taille de ressource incorrecte.');if((parts.length!==1||parts[0].hash!==hash)&&await digest(await blob.arrayBuffer())!==hash)throw Error('Empreinte de ressource incorrecte.');return blob;}).finally(()=>active.delete(hash));active.set(hash,task);return task;
}
export async function ensureResources(group){const files=(await catalog()).files.filter(f=>f.group===group);for(const spec of files)await resourceBlob(spec.sha256,{network:true});return resourcePresence(group);}
export async function sharedChunk(message,sender){
 const settings=await readSettings(),allowed=[settings.webURL,settings.localURL].filter(Boolean).some(value=>{try{const root=new URL(value),top=new URL(sender.tab?.url),frame=new URL(sender.url);return root.origin===top.origin&&frame.origin===top.origin&&top.pathname.startsWith(root.pathname.replace(/[^/]*$/,''));}catch{return false;}});if(!allowed)throw Error('Bibliothèque demandée hors de SHERLOQ.');
 const files=(await catalog()).files,parts=files.flatMap(f=>f.chunks??[{hash:f.sha256,bytes:f.bytes}]),part=parts.find(v=>v.hash===message.hash);if(!part)throw Error('Chunk non autorisé.');const cache=await caches.open(CACHE),response=await cache.match(key(part.hash));if(message.action==='probe'){const present=await verifiedResponse(response,part.hash,part.bytes);if(response&&!present)await cache.delete(key(part.hash));return {present,bytes:part.bytes};}if(!response)throw Error('Chunk absent.');
 if(message.action!=='read'||!Number.isSafeInteger(message.offset)||message.offset<0||message.offset>=part.bytes||!Number.isSafeInteger(message.count)||message.count<1||message.count>1048576)throw Error('Fenêtre de bibliothèque invalide.');const bytes=new Uint8Array(await(await response.blob()).slice(message.offset,Math.min(part.bytes,message.offset+message.count)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {base64:btoa(binary),bytes:bytes.length};
}
export function installResourceFetch(){self.addEventListener('fetch',event=>{const prefix=own('resource/');if(!event.request.url.startsWith(prefix))return;const hash=event.request.url.slice(prefix.length);event.respondWith((async()=>{try{const spec=(await catalog()).files.find(v=>v.sha256===hash);if(!spec)throw Error('Ressource inconnue.');const blob=await resourceBlob(hash,{network:spec.group==='pdf'});return new Response(blob,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(blob.size)}});}catch(error){return new Response(error.message,{status:503});}})());});}
