import {sha256,validateManifest} from './dependency-core.js?v=0.23.0';

// Immutable manifests outlive a WordPress directory replacement. Keep a
// verified copy independently of the downloaded libraries, and never latch a
// temporary fetch failure for the lifetime of the service worker.
export function createManifestLoader(url,identity,{fetcher=fetch,cacheStorage=globalThis.caches}={}){
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
export function isDependencyBootstrap(request,path){return request.mode==='navigate'||!path.includes('/');}
