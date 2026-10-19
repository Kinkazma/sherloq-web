import {sha256,validateManifest,remoteBase,requiredDependencyChunks} from './dependency-core.js?v=0.22.0';
import {createChunkLoader,libraryFile,libraryValue} from './dependency-store.js?v=0.22.0';
import {indexResourceTar,archiveChunkReader,importLibraryFile} from './dependency-tar.js?v=0.22.0';
import {validateFeatureCatalog,requiredFeatureChunks,normalizeFeatureState,selectActiveFiles} from './feature-catalog.js?v=0.22.0';
import {validateOfflineShell} from './offline-kit-core.js?v=0.22.0';

export const OFFLINE_CHUNKS='sherloq-dependency-chunks-v1';
export const offlineCacheName=identity=>'sherloq-offline-app-'+identity;
export const offlineChunkURL=(base,hash)=>new URL('__dependency_chunks__/'+hash,base).href;
export const offlinePolicy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://raw.githubusercontent.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function offlineHeaders(type){return {'Content-Type':type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':offlinePolicy,'Cache-Control':'no-store'};}
export function offlineMime(name){return ({js:'text/javascript',mjs:'text/javascript',html:'text/html; charset=utf-8',css:'text/css',json:'application/json',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2',py:'text/plain',txt:'text/plain'})[name.split('.').at(-1)]||'application/octet-stream';}
export async function offlinePlan(base,{fetcher=fetch,local=false}={}){
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
export async function saveOfflineShell(plan,{storage=caches,fetcher=fetch,signal,progress=()=>{},archiveIndex}={}){
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
export async function offlineMissing(plan,{storage=caches}={}){
 const cache=await storage.open(OFFLINE_CHUNKS),keys=new Set((await cache.keys()).map(r=>new URL(r.url).pathname.match(/\/__dependency_chunks__\/([a-f0-9]{64})$/)?.[1]).filter(Boolean));
 return (plan.catalog?[...requiredFeatureChunks(plan.catalog,plan.manifest,plan.featurePolicy||{})]:requiredDependencyChunks(plan.manifest)).map(([hash])=>hash).filter(h=>!keys.has(h));
}
export async function prepareOfflineBrowser(plan,{archive,storage=caches,fetcher=fetch,signal,progress=()=>{},folder}={}){
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
export async function readOfflineInstallation(appBase,identity,{storage=caches}={}){
 const cache=await storage.open(offlineCacheName(identity)),read=async name=>{const r=await cache.match(new URL(name,appBase));if(!r)throw Error('Offline installation incomplete');return r;};
 const shellBytes=new Uint8Array(await(await read('__shell.json')).arrayBuffer());if(await sha256(shellBytes)!==identity)throw Error('Offline shell identity differs');
 const shell=validateOfflineShell(JSON.parse(new TextDecoder().decode(shellBytes)));
 const manifestBytes=new Uint8Array(await(await read('__manifest.json')).arrayBuffer());if(await sha256(manifestBytes)!==shell.manifest)throw Error('Offline manifest identity differs');
 const manifest=validateManifest(JSON.parse(new TextDecoder().decode(manifestBytes))),receiptResponse=await cache.match(new URL('__installation.json',appBase)),receipt=receiptResponse&&await receiptResponse.json();
 const catalogResponse=await cache.match(new URL('__features.json',appBase)),catalog=catalogResponse?validateFeatureCatalog(await catalogResponse.clone().json(),manifest):null,policyResponse=await cache.match(new URL('__feature-policy.json',appBase)),featurePolicy=policyResponse?await policyResponse.json():null;
 if(shell.catalog&&(!catalogResponse||await sha256(new Uint8Array(await catalogResponse.arrayBuffer()))!==shell.catalog))throw Error('Offline feature catalogue identity differs');
 return {cache,shell,manifest,receipt,catalog,featurePolicy};
}
