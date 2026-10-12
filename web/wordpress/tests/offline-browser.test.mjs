import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {writeResourceTar} from '../sherloq-browser/assets/dependency-tar.js';
import {offlinePlan,prepareOfflineBrowser,readOfflineInstallation,offlineMissing,offlineCacheName,offlineChunkURL,OFFLINE_CHUNKS} from '../sherloq-browser/assets/offline-browser-store.js';

class Storage {
 stores=new Map();fail=null;
 async open(name){if(!this.stores.has(name))this.stores.set(name,new Map());const data=this.stores.get(name),key=x=>typeof x==='string'?x:x.url||x.href;
  return {match:async u=>data.get(key(u))?.clone(),put:async(u,r)=>{if(this.fail?.(name,key(u)))throw new DOMException('Disk full','QuotaExceededError');data.set(key(u),r.clone());},delete:async u=>data.delete(key(u)),keys:async()=>[...data.keys()].map(url=>({url}))};
 }
}
async function fixture(){
 const sourceBase=new URL('https://site.test/assets/'),chunks={},files={},content=new Map(),requests=[],shellFiles={};
 for(const [name,data]of [['models/a.bin',Uint8Array.of(1,2,3)],['models/b.bin',Uint8Array.of(4,5,6)]]){const hash=await sha256(data);chunks[hash]=data.length;content.set(hash,data);files[name]={size:data.length,sha256:hash,chunks:[hash],type:'application/octet-stream'};}
 const manifest={schema:'sherloq.dependencies/1',slots:['models'],remoteBase:'https://raw.githubusercontent.com/example/repo/'+ 'a'.repeat(40)+'/web-assets/',chunks,files},manifestBytes=new TextEncoder().encode(JSON.stringify(manifest)),hash=await sha256(manifestBytes);
 const shellContent=new Map();for(const name of ['app.html','workspace-entry.js','offline-server.py']){const data=new TextEncoder().encode('public '+name);shellContent.set(name,data);shellFiles[name]={size:data.length,sha256:await sha256(data)};}
 const shell={schema:'sherloq.offline-shell/1',version:'test',manifest:hash,files:shellFiles},shellBytes=new TextEncoder().encode(JSON.stringify(shell));
 const fetcher=async value=>{const u=new URL(value);requests.push(u.href);if(u.pathname.endsWith('/dependency-config.json'))return Response.json({manifest:hash});if(u.pathname.endsWith('/dependency-manifest-'+hash+'.json'))return new Response(manifestBytes);if(u.pathname.endsWith('/offline-shell.json'))return new Response(shellBytes);if(shellContent.has(u.pathname.split('/').at(-1)))return new Response(shellContent.get(u.pathname.split('/').at(-1)));const bytes=content.get(u.pathname.split('/').at(-1).replace('.bin',''));return new Response(bytes,{status:bytes?200:404});};
 const plan=await offlinePlan(sourceBase,{fetcher}),storage=new Storage();requests.length=0;
 const tar=async(selected=manifest)=>{const parts=[];await writeResourceTar(selected,async h=>content.get(h),{write:async b=>parts.push(b)},{extras:(async function*(){for(const [name,data]of shellContent)yield ['app/'+name,data];})()});return new Blob(parts);};
 return {plan,storage,fetcher,requests,content,tar};
}
test('offline installation reuses a standard archive, verifies and persists each chunk without network',async()=>{
 const f=await fixture(),receipt=await prepareOfflineBrowser(f.plan,{storage:f.storage,archive:await f.tar(),fetcher:async()=>{throw Error('network forbidden');},folder:async()=>null});
 assert.equal(receipt.complete,true);assert.deepEqual(await offlineMissing(f.plan,{storage:f.storage}),[]);
 const read=await readOfflineInstallation(f.plan.appBase,f.plan.identity,{storage:f.storage});assert.equal(read.receipt.manifest,f.plan.config.manifest);
});
test('partial archive plus valid cache fetches only a missing dependency',async()=>{
 const f=await fixture(),[a,b]=Object.keys(f.plan.manifest.chunks),cache=await f.storage.open(OFFLINE_CHUNKS);
 await cache.put(offlineChunkURL(f.plan.sourceBase,a),new Response(f.content.get(a)));
 await prepareOfflineBrowser(f.plan,{storage:f.storage,archive:await f.tar({...f.plan.manifest,files:{}}),fetcher:f.fetcher,folder:async()=>null});
 assert.deepEqual(f.requests,[f.plan.manifest.remoteBase+'chunks/'+b+'.bin']);
});
test('quota failure retains completed work, records no success, then resumes without downloading completed chunks',async()=>{
 const f=await fixture(),[a,b]=Object.keys(f.plan.manifest.chunks);f.storage.fail=(name,key)=>name===OFFLINE_CHUNKS&&key.endsWith(b);
 await assert.rejects(prepareOfflineBrowser(f.plan,{storage:f.storage,archive:await f.tar(),fetcher:f.fetcher,folder:async()=>null}),{name:'QuotaExceededError'});
 const stored=await readOfflineInstallation(f.plan.appBase,f.plan.identity,{storage:f.storage});assert.equal(stored.receipt,undefined);assert.deepEqual(await offlineMissing(f.plan,{storage:f.storage}),[b]);
 f.storage.fail=null;f.requests.length=0;
 await prepareOfflineBrowser(f.plan,{storage:f.storage,fetcher:f.fetcher,folder:async()=>null});assert.deepEqual(f.requests,[f.plan.manifest.remoteBase+'chunks/'+b+'.bin']);
 assert.ok(await(await f.storage.open(OFFLINE_CHUNKS)).match(offlineChunkURL(f.plan.sourceBase,a)));
});
test('corrupt cached data is repaired from the archive while disconnected',async()=>{
 const f=await fixture(),archive=await f.tar();await prepareOfflineBrowser(f.plan,{storage:f.storage,archive,fetcher:f.fetcher,folder:async()=>null});
 const [a]=Object.keys(f.plan.manifest.chunks),cache=await f.storage.open(OFFLINE_CHUNKS);await cache.put(offlineChunkURL(f.plan.sourceBase,a),new Response('bad'));
 const shell=await f.storage.open(offlineCacheName(f.plan.identity));await shell.delete(new URL('workspace-entry.js',f.plan.appBase));
 await prepareOfflineBrowser({...f.plan,local:true},{storage:f.storage,archive,fetcher:async()=>{throw Error('network forbidden');},folder:async()=>null});
 assert.deepEqual(new Uint8Array(await(await cache.match(offlineChunkURL(f.plan.sourceBase,a))).arrayBuffer()),f.content.get(a));
 assert.ok(await shell.match(new URL('workspace-entry.js',f.plan.appBase)));
});
test('missing resources never fall back to GitHub in the offline app',async()=>{
 const f=await fixture(),archive=await f.tar();await prepareOfflineBrowser(f.plan,{storage:f.storage,archive,fetcher:f.fetcher,folder:async()=>null});
 const [a]=Object.keys(f.plan.manifest.chunks);await(await f.storage.open(OFFLINE_CHUNKS)).delete(offlineChunkURL(f.plan.sourceBase,a));
 await assert.rejects(prepareOfflineBrowser({...f.plan,local:true},{storage:f.storage,fetcher:async()=>{assert.fail('network request');},folder:async()=>null}),/OFFLINE_MISSING/);
});
test('cancellation never marks incomplete resources ready and shell identity changes are rejected',async()=>{
 const f=await fixture(),signal=new AbortController();
 await assert.rejects(prepareOfflineBrowser(f.plan,{storage:f.storage,archive:await f.tar(),fetcher:f.fetcher,folder:async()=>null,signal:signal.signal,progress:p=>{if(p.phase==='resources')signal.abort();}}),{name:'AbortError'});
 const stored=await readOfflineInstallation(f.plan.appBase,f.plan.identity,{storage:f.storage});assert.equal(stored.receipt,undefined);
 await stored.cache.put(new URL('__shell.json',f.plan.appBase),new Response('{}'));
 await assert.rejects(readOfflineInstallation(f.plan.appBase,f.plan.identity,{storage:f.storage}),/identity differs/);
});
