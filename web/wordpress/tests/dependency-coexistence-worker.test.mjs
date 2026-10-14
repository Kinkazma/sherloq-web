import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {MessageChannel} from 'node:worker_threads';
import {sha256,remoteBase,dependencyResponse,publicDependencyEntries} from '../sherloq-browser/assets/dependency-core.js';
import {createChunkLoader} from '../sherloq-browser/assets/dependency-store.js';
import {createManifestLoader,isDependencyBootstrap} from '../sherloq-browser/assets/dependency-manifest.js';
import {createDependencyClientRouting} from '../sherloq-browser/assets/dependency-client-routing.js';
const source=(await readFile(new URL('../sherloq-browser/assets/dependency-sw.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''),base=new URL('https://example.test/assets/'),sessionA='a'.repeat(8)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(12),sessionB=sessionA.replaceAll('a','b');
async function fixture(){
 const path='unified-engine/src/native.js',before=new TextEncoder().encode('export const version="old native";'),after=new TextEncoder().encode('export const version="new native";'),hashA=await sha256(before),hashB=await sha256(after),raw=new Map(),resources=new Map([[hashA,before],[hashB,after]]),cacheMaps=new Map(),clients=new Map(),network=[];let unavailableOld=false;
 for(const [hash,bytes]of resources){const manifest={schema:'sherloq.dependencies/1',remoteBase:'https://raw.githubusercontent.com/example/project/'+ 'c'.repeat(40)+'/web-assets/',slots:['unified-engine'],files:{[path]:{sha256:hash,size:bytes.length,chunks:[hash],type:'text/javascript'}},chunks:{[hash]:bytes.length},localFiles:[path]},encoded=JSON.stringify(manifest);raw.set(await sha256(new TextEncoder().encode(encoded)),encoded);}
 const [old,next]=[...raw.keys()],cacheStorage={async open(name){if(!cacheMaps.has(name))cacheMaps.set(name,new Map());const saved=cacheMaps.get(name);return {match:async key=>saved.get(String(key))?.clone(),put:async(key,value)=>saved.set(String(key),value.clone()),delete:async key=>saved.delete(String(key)),keys:async()=>[...saved.keys()].map(url=>new Request(url))};}};
 function add(id,sessionId,{ready=false,type='window'}={}){const client={id,type,url:new URL((type==='window'?'app.html':'unified-engine/src/worker.js')+(sessionId?'?sherloqSession='+sessionId:''),base).href,working:{source:'untouched',result:'untouched'},postMessage(data,ports=[]){if(data.type==='dependency-bootstrap-ready'){if(ready)ports[0].postMessage({ready:true});ports[0].close();}}};clients.set(id,client);return client;}
 const mounted=add('mounted',sessionA),starting=add('starting',sessionB,{ready:true}),existingWorker=add('existing-worker',sessionA,{type:'worker'});
 const fetcher=async input=>{const url=new URL(input instanceof Request?input.url:String(input));network.push(url.href);const match=url.pathname.match(/dependency-manifest-([a-f0-9]{64})\.json$/);if(match){if(unavailableOld&&match[1]===old)return new Response('retired',{status:404});return new Response(raw.get(match[1])||'missing',{status:raw.has(match[1])?200:404});}if(url.pathname.endsWith('/'+path))return new Response(after);const chunk=url.pathname.match(/chunks\/([a-f0-9]{64})\.bin$/);if(chunk&&resources.has(chunk[1]))return new Response(resources.get(chunk[1]));return new Response('top-level transport');};
 function instance(){const handlers=new Map(),timers=new Set();let skipped=0,claimed=0;
  const self={location:{href:new URL('dependency-sw.js?manifest='+next,base).href},clients:{get:async id=>clients.get(id),matchAll:async()=>[...clients.values()],claim:async()=>{claimed++;}},skipWaiting:async()=>{skipped++;},addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);}};
  const context=vm.createContext({self,URL,Request,Response,Headers,Blob,TextEncoder,TextDecoder,Uint8Array,MessageChannel,Map,Set,Promise,JSON,Error,sha256,remoteBase,dependencyResponse,publicDependencyEntries,isDependencyBootstrap,createManifestLoader:(url,identity)=>createManifestLoader(url,identity,{fetcher,cacheStorage}),createChunkLoader:(manifest,options)=>createChunkLoader(manifest,{...options,fetcher,cacheStorage,folder:async()=>null}),createDependencyClientRouting:options=>createDependencyClientRouting({...options,cacheStorage}),fetch:fetcher,setTimeout(fn,ms){const timer=setTimeout(fn,Math.min(ms,20));timers.add(timer);return timer;},clearTimeout(timer){clearTimeout(timer);timers.delete(timer);},readOfflineShell:()=>{throw Error('Not needed');},offlineShellParts:()=>{},resourceTarStream:()=>{},indexResourceTar:()=>{},archiveChunkReader:()=>{}});vm.runInContext(source,context);
  async function message(data,client=starting){const tasks=[];let result;const event={data,source:client,ports:[{postMessage(value){result=value;}}],waitUntil:p=>tasks.push(p)};for(const handler of handlers.get('message')||[])handler(event);await Promise.all(tasks);return result;}
  async function request(path,{clientId='starting',resultingClientId='',mode='cors'}={}){const url=new URL(path,base).href,request=mode==='navigate'?{url,method:'GET',mode,headers:new Headers()}:new Request(url),event={request,clientId,resultingClientId,waitUntil(){},respondWith:p=>event.response=p};for(const handler of handlers.get('fetch')||[])handler(event);return event.response;}
  async function activate(){const tasks=[];for(const handler of handlers.get('activate')||[])handler({waitUntil:p=>tasks.push(p)});await Promise.all(tasks);}
  return {message,request,activate,get skipped(){return skipped;},get claimed(){return claimed;},close(){for(const timer of timers)clearTimeout(timer);}};
 }
 return {path,old,next,hashA,hashB,before,after,clients,mounted,starting,existingWorker,network,cacheMaps,instance,add,retireOld(){unavailableOld=true;}};
}

test('the actual newer service worker starts alongside a mounted calculation and serves its exact old modules, including bundled modules and descendant workers',async()=>{
 const f=await fixture(),worker=f.instance();try{
  await worker.message({type:'dependency-activate-coexist',previousManifest:f.old});assert.equal(worker.skipped,1);await worker.activate();assert.equal(worker.claimed,1);assert.deepEqual(f.mounted.working,{source:'untouched',result:'untouched'});
  assert.equal((await worker.message({type:'dependency-session',session:sessionB,manifest:f.next})).manifest,f.next);
  for(const clientId of ['mounted','existing-worker'])assert.equal(await(await worker.request(f.path,{clientId})).text(),new TextDecoder().decode(f.before));assert.equal(await(await worker.request(f.path)).text(),new TextDecoder().decode(f.after));
  await worker.request('unified-engine/src/child.js?sherloqSession='+sessionA,{clientId:'mounted',resultingClientId:'child'});f.add('child',null,{type:'worker'});assert.equal(await(await worker.request(f.path,{clientId:'child'})).text(),new TextDecoder().decode(f.before));
  assert.equal((await worker.message({type:'dependency-identity'},f.mounted)).manifest,f.old);assert.ok(f.network.some(url=>url.includes('/chunks/'+f.hashA+'.bin')));assert.equal(f.cacheMaps.get('sherloq-dependency-chunks-v1').size,2);
 }finally{worker.close();}
});

test('client and worker pins plus the SHA-verified retired manifest survive a real service-worker script restart without selecting the latest physical source',async()=>{
 const f=await fixture(),first=f.instance();try{await first.message({type:'dependency-activate-coexist',previousManifest:f.old});assert.equal(await(await first.request(f.path,{clientId:'mounted'})).text(),new TextDecoder().decode(f.before));}finally{first.close();}
 f.retireOld();const restarted=f.instance();try{for(const clientId of ['mounted','existing-worker'])assert.equal(await(await restarted.request(f.path,{clientId})).text(),new TextDecoder().decode(f.before));assert.equal(await(await restarted.request(f.path)).text(),new TextDecoder().decode(f.after));assert.deepEqual(f.mounted.working,{source:'untouched',result:'untouched'});}finally{restarted.close();}
});

test('an unverified predecessor cannot activate or substitute the newest resources for an existing owner',async()=>{
 const f=await fixture();f.retireOld();const worker=f.instance();try{await worker.message({type:'dependency-activate-coexist',previousManifest:f.old});assert.equal(worker.skipped,0);assert.deepEqual(f.mounted.working,{source:'untouched',result:'untouched'});await assert.rejects(worker.request(f.path,{clientId:'mounted'}),/identity unavailable/);assert.ok(!f.network.some(url=>url.includes('/chunks/')));}finally{worker.close();}
});
