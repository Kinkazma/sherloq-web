import {validateManifest,remoteBase,sha256,dependencyResponse} from './dependency-core.js';
import {createChunkLoader} from './dependency-store.js';
import {resourceTarStream,indexResourceTar,archiveChunkReader} from './dependency-tar.js';
import {readOfflineShell,offlineShellParts} from './offline-kit-core.js';
import {createManifestLoader,isDependencyBootstrap} from './dependency-manifest.js';
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
  }catch(error){cause=error;await notifyDependency(event,{level:'warning',kind:'dependency.transport-error',attempt,file:path,error:{name:error.name,code:error.code,message:error.message,details:error.details,cause:error.cause?.message}});if(attempt<3)await new Promise(r=>setTimeout(r,250*attempt));}
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
   const stream=resourceTarStream(chosen,load,{extras,progress:value=>void notify({value,total:Object.keys(chosen.files).length}),finished:error=>{void notify({done:true,error:error?.message});finish();}});
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
