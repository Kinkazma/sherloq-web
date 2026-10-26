import {sha256,validateManifest} from './dependency-core.js';
import {optionalBootstrapCache,readBootstrapBytes} from './bootstrap-metadata.js';

// Immutable manifests outlive a WordPress directory replacement. Keep a
// verified copy independently of the downloaded libraries, and never latch a
// temporary fetch failure for the lifetime of the service worker.
export function createManifestLoader(url,identity,{fetcher=fetch,cacheStorage=globalThis.caches,cacheTimeoutMs=1000,networkTimeoutMs=30000}={}){
 let pending;
 const verify=async response=>{
  if(!response.ok)throw Object.assign(Error('Dependency manifest unavailable: HTTP '+response.status),{status:response.status,url:String(url)});
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>8_000_000)throw Error('Dependency manifest exceeds the supported size');
  if(await sha256(bytes)!==identity)throw Error('Dependency manifest integrity failure');
  return {bytes,manifest:validateManifest(JSON.parse(new TextDecoder().decode(bytes)))};
 };
 return ()=>pending??=(async()=>{
  let cache;
  // The URL and SHA identify immutable bytes. A verified retained copy needs
  // no network freshness check, including after the worker has been suspended.
  // An absent, unreadable or corrupt copy still takes the original HTTP path.
  const saved=await optionalBootstrapCache(async()=>{
   cache=await cacheStorage?.open('sherloq-dependency-manifests-v1');
   const response=await cache?.match(url);return response?verify(response):undefined;
  },{timeoutMs:cacheTimeoutMs});
  if(saved)return saved.manifest;
  const verified=await verify(new Response(await readBootstrapBytes(url,{fetcher,timeoutMs:networkTimeoutMs})));
  await optionalBootstrapCache(()=>cache?.put(url,new Response(verified.bytes,{headers:{'Content-Type':'application/json'}})),{timeoutMs:cacheTimeoutMs});
  return verified.manifest;
 })().catch(error=>{pending=null;throw error;});
}

// The document, config and bootstrap graph must be reachable even if a retired
// dependency manifest disappeared. Runtime directories still use the locked
// inventory; this does not introduce a network fallback for scientific files.
export function isDependencyBootstrap(request,path){return request.mode==='navigate'||!path.includes('/');}
