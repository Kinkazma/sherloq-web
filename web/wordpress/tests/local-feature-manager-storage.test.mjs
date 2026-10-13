import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {createFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {createLocalFeatureManager} from '../sherloq-browser/assets/local-feature-manager.js';
import {OFFLINE_CHUNKS,offlineCacheName,offlineChunkURL,readOfflineInstallation} from '../sherloq-browser/assets/offline-browser-store.js';
import {verifyPreparedInstallation} from '../sherloq-browser/assets/local-update-core.js';

if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const encoder=new TextEncoder(),base=new URL('http://localhost:8765/local/'),remote='https://raw.githubusercontent.com/Kinkazma/sherloq-web/'+'a'.repeat(40)+'/public/';
class MemoryCache{
 constructor(){this.entries=new Map();this.writes=[];}
 key(value){return typeof value==='string'?value:value.url||value.href;}
 async put(key,response){key=this.key(key);this.writes.push(key);this.entries.set(key,response.clone());}
 async match(key){return this.entries.get(this.key(key))?.clone();}
 async keys(){return [...this.entries.keys()].map(url=>new Request(url));}
 async delete(key){return this.entries.delete(this.key(key));}
}
class MemoryCaches{
 constructor(){this.entries=new Map();}
 async open(name){if(!this.entries.has(name))this.entries.set(name,new MemoryCache());return this.entries.get(name);}
}
async function fixture({transport='local-server',managed=false,disk=['base','heavy'],cacheAlias=false,failPolicy=false,receiptTransport=false}={}){
 const resources={base:encoder.encode('core'),heavy:encoder.encode('heavy'),private:encoder.encode('original-private')},files={},chunks={},hashes={};
 for(const [id,bytes]of Object.entries(resources)){const hash=await sha256(bytes);hashes[id]=hash;files['engine/'+id+'.bin']={sha256:hash,size:bytes.length,chunks:[hash],type:'application/octet-stream',...(id==='private'?{localOnly:true}:{})};chunks[hash]=bytes.length;}
 const manifest={schema:'sherloq.dependencies/1',slots:['engine'],remoteBase:remote,files,chunks},catalog={schema:'sherloq.features/1',groups:[{id:'optional',fr:'Facultatif',en:'Optional'}],features:[{id:'base',group:null,fr:'Socle',en:'Base',protected:true,dependsOn:[],resources:['engine/base.bin'],tasks:[]},{id:'heavy',group:'optional',fr:'Méthode lourde',en:'Heavy method',protected:false,dependsOn:['base'],resources:['engine/heavy.bin'],tasks:[]},{id:'private',group:null,fr:'Import privé',en:'Private import',protected:false,dependsOn:['base'],resources:['engine/private.bin'],tasks:[]}]},initial={schema:'sherloq.feature-policy/1',disabledFeatures:['heavy'],disabledGroups:[]},storage=new MemoryCaches(),shellFiles={};
 for(const path of ['app.html','workspace-entry.js','offline-server.py']){const bytes=encoder.encode(path);shellFiles[path]={sha256:await sha256(bytes),size:bytes.length};}
 const manifestBytes=encoder.encode(JSON.stringify(manifest)),catalogBytes=encoder.encode(JSON.stringify(catalog)),shell={schema:'sherloq.offline-shell/1',version:'1',manifest:await sha256(manifestBytes),catalog:await sha256(catalogBytes),files:shellFiles},shellBytes=encoder.encode(JSON.stringify(shell)),identity=await sha256(shellBytes),shellCache=await storage.open(offlineCacheName(identity)),receipt={schema:'sherloq.browser-offline/1',complete:true,transport,shell:identity,serverReusedChunks:[],serverStoredChunks:[],importedLocalOnlyFiles:['engine/private.bin']};
 for(const [path,bytes]of [['__shell.json',shellBytes],['__manifest.json',manifestBytes],['__features.json',catalogBytes],['__feature-policy.json',JSON.stringify(initial)],['__installation.json',JSON.stringify(receipt)],...Object.keys(shellFiles).map(path=>[path,encoder.encode(path)])])await shellCache.put(new URL(path,base),new Response(bytes));
 const chunkCache=await storage.open(OFFLINE_CHUNKS);if(cacheAlias)for(const id of ['base','heavy'])await chunkCache.put('http://localhost:8765/old/__dependency_chunks__/'+hashes[id],new Response(resources[id]));chunkCache.writes=[];
 const requests=[],writes=[],controller=new AbortController();let policyCommitted=false;
 const fetcher=async(url,options)=>{const key=String(url);requests.push(key);const id=Object.keys(hashes).find(id=>key.endsWith('__managed/chunks/'+hashes[id]));if(id&&disk.includes(id))return new Response(resources[id],{headers:{'Content-Length':String(resources[id].length)}});const publicId=Object.keys(hashes).find(id=>key===remote+'chunks/'+hashes[id]+'.bin');if(publicId)return new Response(resources[publicId]);return new Response('missing',{status:404});};
 const policy=createFeaturePolicy({storage:null,eventTarget:null,local:true,catalog,state:initial,persist:async next=>{const current=await readOfflineInstallation(base,identity,{storage});if(transport==='local-server'){assert.ok(current.receipt.serverReusedChunks.includes(hashes.base)||current.receipt.serverStoredChunks.includes(hashes.base)||cacheAlias);assert.ok(current.receipt.serverReusedChunks.includes(hashes.heavy)||current.receipt.serverStoredChunks.includes(hashes.heavy)||chunkCache.entries.has(offlineChunkURL(base,hashes.heavy))||cacheAlias);}if(failPolicy)throw Error('Policy commit refused');policyCommitted=true;await shellCache.put(new URL('__feature-policy.json',base),new Response(JSON.stringify(next)));}});
 const updater={async status(){return{active:{identity,...(receiptTransport?{receipt:{transport}}:{transport})}};}},manager=createLocalFeatureManager({base,manifest,policy,updater,storage,fetcher,serviceWorker:null,library:async()=>null,...(managed?{persistObject:async(hash,bytes,{signal}={})=>{assert.equal(signal,controller.signal);assert.equal(await sha256(bytes),hash);writes.push(hash);}}:{})});
 return {manager,policy,storage,chunkCache,shellCache,identity,hashes,requests,writes,controller,receipt,get policyCommitted(){return policyCommitted;}};
}
test('reinstall verifies original TAR resources without a browser copy or managed PUT and records provenance before policy commit',async()=>{
 const f=await fixture({managed:true,receiptTransport:true}),result=await f.manager.enable(['heavy'],{signal:f.controller.signal});assert.equal(f.policyCommitted,true);assert.deepEqual(f.policy.state.disabledFeatures,[]);assert.deepEqual(new Set(result.serverReusedChunks),new Set([f.hashes.base,f.hashes.heavy]));assert.deepEqual(result.serverStoredChunks,[]);assert.deepEqual(f.writes,[]);assert.deepEqual(f.chunkCache.writes,[]);assert.equal(f.requests.filter(url=>url.startsWith(remote)).length,0);assert.ok(!f.requests.some(url=>url.includes(f.hashes.private)));assert.deepEqual(result.localOnlyPaths,['engine/private.bin']);await verifyPreparedInstallation(base,f.identity,{storage:f.storage});
});
test('managed reinstall persists changed public bytes only on disk while native reinstall caches only those changes',async()=>{
 for(const managed of [true,false]){const f=await fixture({managed,disk:['base']}),result=await f.manager.enable(['heavy'],{signal:f.controller.signal});assert.deepEqual(result.serverReusedChunks,[f.hashes.base]);assert.deepEqual(result.serverStoredChunks,managed?[f.hashes.heavy]:[]);assert.deepEqual(f.writes,managed?[f.hashes.heavy]:[]);assert.deepEqual(f.chunkCache.writes,managed?[]:[offlineChunkURL(base,f.hashes.heavy)]);assert.equal(f.requests.filter(url=>url.startsWith(remote)).length,1);assert.ok(!f.requests.some(url=>url.includes(f.hashes.private)));await verifyPreparedInstallation(base,f.identity,{storage:f.storage});}
});
test('PWA reinstall retains required chunks and cross-scope verified cache aliases remain single copies',async()=>{
 const pwa=await fixture({transport:null,disk:[]});await pwa.manager.enable(['heavy']);assert.deepEqual(new Set(pwa.chunkCache.writes),new Set([offlineChunkURL(base,pwa.hashes.base),offlineChunkURL(base,pwa.hashes.heavy)]));await verifyPreparedInstallation(base,pwa.identity,{storage:pwa.storage});
 const alias=await fixture({transport:null,disk:[],cacheAlias:true});await alias.manager.enable(['heavy']);assert.deepEqual(alias.chunkCache.writes,[]);assert.equal(alias.chunkCache.entries.size,2);assert.equal(alias.requests.length,0);await verifyPreparedInstallation(base,alias.identity,{storage:alias.storage});
});
test('failed reinstall policy commit restores the exact installation receipt and keeps exclusions',async()=>{
 const f=await fixture({managed:true,failPolicy:true}),before=await(await f.shellCache.match(new URL('__installation.json',base))).text();await assert.rejects(f.manager.enable(['heavy'],{signal:f.controller.signal}),/Policy commit refused/);assert.deepEqual(f.policy.state.disabledFeatures,['heavy']);assert.equal(await(await f.shellCache.match(new URL('__installation.json',base))).text(),before);assert.deepEqual(f.chunkCache.writes,[]);assert.deepEqual(f.writes,[]);
});
