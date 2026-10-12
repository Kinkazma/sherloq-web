import {sha256,dependencyResponse} from './dependency-core.js';
import {createChunkLoader} from './dependency-store.js';
import {resourceTarStream,indexResourceTar,archiveChunkReader} from './dependency-tar.js';
import {offlineHeaders,offlineMissing,readOfflineInstallation} from './offline-browser-store.js';
const offlineBase=new URL(self.registration.scope),sourceBase=new URL('./',self.location.href),identity=new URL(self.location.href).searchParams.get('shell');
if(!/^[a-f0-9]{64}$/.test(identity))throw Error('Offline identity required');
const installed=readOfflineInstallation(offlineBase,identity);
self.addEventListener('install',event=>event.waitUntil(installed));
// A new release waits for old local windows to close. Running calculations keep
// their exact shell and model inventory; never force a worker update under them.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const localExports=new Map();
self.addEventListener('message',event=>{
 if(event.data?.type!=='offline-kit-prepare'||!event.source?.url?.startsWith(offlineBase.href))return;
 try{const {id,archive}=event.data;if(!/^[a-f0-9-]{36}$/.test(id)||archive&&!(archive instanceof Blob))throw Error('Invalid archive request');
  for(const [key,value]of localExports)if(value.client===event.source.id)localExports.delete(key);
  localExports.set(id,{client:event.source.id,archive});setTimeout(()=>localExports.delete(id),600000);event.ports[0]?.postMessage({ok:true});
 }catch(error){event.ports[0]?.postMessage({ok:false,error:error.message});}
});
const noNetwork=async()=>{throw Error('Offline dependency missing. Restore your archive.');};
let offlineLoad;
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 let finishArchive=()=>{};
 if(event.request.method==='GET'&&url.origin===offlineBase.origin&&url.pathname===new URL('__dependency_download__/kit.tar',offlineBase).pathname)event.waitUntil(new Promise(resolve=>{finishArchive=resolve;}));
 event.respondWith((async()=>{
  if(url.origin!==offlineBase.origin||!url.pathname.startsWith(offlineBase.pathname))return new Response('Remote access is disabled in SHERLOQ offline',{status:503});
  if(!['GET','HEAD'].includes(event.request.method))return new Response('Read only',{status:405});
  const name=url.pathname.slice(offlineBase.pathname.length),{cache,shell,manifest,receipt}=await installed;
  const plan={manifest,sourceBase,appBase:offlineBase};
  if(name==='dependency-config.json')return new Response(JSON.stringify({schema:'sherloq.dependency-config/1',enabled:false,offline:true,offlineMode:'browser',manifest:shell.manifest,version:shell.version,sourceBase:sourceBase.href}),{headers:offlineHeaders('application/json')});
  if(name==='__offline-status.json'){const missing=await offlineMissing(plan);return new Response(JSON.stringify({complete:!!receipt?.complete&&!missing.length,missing:missing.length,version:shell.version}),{headers:offlineHeaders('application/json')});}
  offlineLoad??=createChunkLoader(manifest,{base:null,scope:sourceBase,fetcher:noNetwork,folder:async()=>null});
  if(name==='__dependency_download__/kit.tar'){
   const headers={...offlineHeaders('application/x-tar'),'Content-Disposition':'attachment; filename="SHERLOQ-complet.tar"'};
   if(event.request.method==='HEAD')return new Response(null,{headers});
   const id=url.searchParams.get('id'),requested=localExports.get(id);localExports.delete(id);if(!requested)throw Error('Start archive creation from the offline setup');
   const exportLoad=requested.archive?createChunkLoader(manifest,{base:null,scope:sourceBase,fetcher:noNetwork,folder:async()=>null,archive:archiveChunkReader(await indexResourceTar(requested.archive),manifest)}):offlineLoad;
   const extras=(async function*(){const metadata=await cache.match(new URL('__shell.json',offlineBase));yield ['offline-kit.json',new Uint8Array(await metadata.arrayBuffer())];for(const [path,meta]of Object.entries(shell.files)){const r=await cache.match(new URL(path,offlineBase));if(!r)throw Error('Offline application file missing');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length!==meta.size||await sha256(bytes)!==meta.sha256)throw Error('Offline application integrity failure');yield ['app/'+path,bytes];}})();
   const notify=data=>self.clients.matchAll().then(clients=>clients.forEach(c=>c.postMessage({type:'dependency-download-progress',id,...data})));
   const stream=resourceTarStream(manifest,exportLoad,{extras,progress:value=>void notify({value,total:Object.keys(manifest.files).length}),finished:error=>{void notify({done:true,error:error?.message}).finally(finishArchive);}});
   return new Response(stream,{headers});
  }
  if(manifest.files[name])return dependencyResponse(manifest.files[name],manifest,offlineLoad,event.request);
  if(name==='app.html'){
   const missing=await offlineMissing(plan);
   if(!receipt?.complete||missing.length)return Response.redirect(new URL('offline-setup.html',offlineBase),302);
  }
  const response=await cache.match(new URL(name,offlineBase));
  if(!response)return new Response('Offline file missing: '+name,{status:404,headers:offlineHeaders('text/plain')});
  // Strip only query parameters for lookups. No online fetch fallback exists.
  return event.request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
 })().catch(error=>{finishArchive();return new Response(error.message,{status:503,headers:offlineHeaders('text/plain')});}));
});
