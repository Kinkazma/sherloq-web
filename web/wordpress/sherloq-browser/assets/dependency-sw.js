import {validateManifest,remoteBase,sha256,dependencyResponse} from './dependency-core.js';
import {createChunkLoader} from './dependency-store.js';
import {resourceTarStream} from './dependency-tar.js';
const scope=new URL('./',self.location.href);
const manifestHash=new URL(self.location.href).searchParams.get('manifest');
const ready=(async()=>{
 if(!/^[a-f0-9]{64}$/.test(manifestHash))throw Error('Dependency manifest identity missing');
 const response=await fetch(new URL('dependency-manifest-'+manifestHash+'.json',scope),{cache:'no-cache'});
 if(!response.ok)throw Error('Dependency manifest unavailable');
 const bytes=await response.arrayBuffer();if(await sha256(bytes)!==manifestHash)throw Error('Dependency manifest integrity failure');
 const manifest=validateManifest(JSON.parse(new TextDecoder().decode(bytes))),base=remoteBase(manifest.remoteBase,{allowLocal:['127.0.0.1','localhost'].includes(scope.hostname)});
 return {manifest,localFiles:new Set(manifest.localFiles||[]),load:createChunkLoader(manifest,{base,scope})};
})();
// Updates wait until previous controlled windows close. Never replace a worker
// under a running analysis and accidentally mix two engine deliveries.
self.addEventListener('install',event=>event.waitUntil(ready));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='dependency-identity')event.waitUntil(ready.then(()=>event.ports[0]?.postMessage({manifest:manifestHash})));});
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
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname)||!['GET','HEAD'].includes(event.request.method))return;
 const path=u.pathname.slice(scope.pathname.length);
 if(path==='__dependency_download__/resources.tar'){
  let finish;event.waitUntil(new Promise(resolve=>{finish=resolve;}));
  const id=u.searchParams.get('id');
  const notify=data=>self.clients.matchAll().then(clients=>clients.forEach(c=>c.postMessage({type:'dependency-download-progress',id,...data})));
  event.respondWith(ready.then(({manifest,load})=>{
   const selected=u.searchParams.get('file');if(selected&&!manifest.files[selected]){finish();return new Response('Unknown library file',{status:404});}
   const chosen=selected?{...manifest,files:{[selected]:manifest.files[selected]}}:manifest;
   const stream=resourceTarStream(chosen,load,{progress:value=>void notify({value,total:Object.keys(chosen.files).length}),finished:error=>{void notify({done:true,error:error?.message});finish();}});
   return new Response(stream,{headers:{'Content-Type':'application/x-tar','Content-Disposition':'attachment; filename="SHERLOQ-resources.tar"','Cache-Control':'no-store'}});
  }).catch(e=>{finish();return new Response(e.message,{status:503});}));return;
 }
 event.respondWith((async()=>{
  const {manifest,localFiles,load}=await ready,file=manifest.files[path];
  if(localFiles.has(path))return localResponse(event.request);
  if(file)return dependencyResponse(file,manifest,load,event.request);
  if(manifest.slots.some(s=>path.startsWith(s+'/')))return new Response('Dependency absent from the locked delivery',{status:404});
  return localResponse(event.request);
 })());
});
