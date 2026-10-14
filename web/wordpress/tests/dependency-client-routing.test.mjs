import test from 'node:test';
import assert from 'node:assert/strict';
import {createDependencyClientRouting,dependencyWorkerManifest} from '../sherloq-browser/assets/dependency-client-routing.js';
const scope=new URL('https://example.test/assets/'),old='a'.repeat(64),next='b'.repeat(64),oldSession='a'.repeat(8)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(4)+'-'+ 'a'.repeat(12),newSession=oldSession.replaceAll('a','b');
function fixture(){const saved=new Map(),clients=new Map(),cacheStorage={open:async()=>({match:async key=>saved.get(String(key))?.clone(),put:async(key,value)=>saved.set(String(key),value.clone())})},make=()=>createDependencyClientRouting({scope,manifest:next,clients:{get:async id=>clients.get(id),matchAll:async()=>[...clients.values()]},cacheStorage});return {saved,clients,make,cacheStorage};}
const owner=(id,sessionId,type='window')=>({id,type,url:new URL((type==='window'?'app.html':'unified-engine/src/worker.js')+(sessionId?'?sherloqSession='+sessionId:''),scope).href});
test('mounted windows retain their manifests during activation, and routing survives a service-worker restart',async()=>{
 const f=fixture(),before=owner('old',oldSession),source=owner('new',newSession),worker=owner('old-worker',oldSession,'worker');for(const client of [before,source,worker])f.clients.set(client.id,client);const router=f.make(),verified=[];
 await router.prepareCoexistence(source,old,{verify:async hash=>verified.push(hash),confirm:async client=>client.id==='new'});assert.equal((await router.lookup(before)).manifest,old);assert.equal((await router.lookup(source)).manifest,next);assert.equal((await router.lookup(worker)).manifest,old);assert.ok(verified.includes(old)&&verified.includes(next));
 const restarted=f.make();for(const [clientId,hash]of [['old',old],['new',next],['old-worker',old]])assert.equal(await restarted.forRequest({clientId,request:new Request(new URL('unified-engine/src/native.js',scope))}),hash);assert.equal(f.saved.size,5);
});
test('new worker ownership follows its creator before imports; session fallback also keeps workers on the correct inventory',async()=>{
 const f=fixture(),parent=owner('parent',oldSession);f.clients.set(parent.id,parent);const router=f.make();await router.pin(parent,old);
 assert.equal(await router.forRequest({clientId:parent.id,resultingClientId:'child',request:new Request(new URL('unified-engine/src/worker.js',scope))}),old);const child=owner('child',null,'worker');f.clients.set(child.id,child);assert.equal(await f.make().forRequest({clientId:child.id,request:new Request(new URL('unified-engine/vendor/kernel.wasm',scope))}),old);
 const sessionChild=owner('session-child',oldSession,'worker');f.clients.set(sessionChild.id,sessionChild);assert.equal(await f.make().forRequest({clientId:sessionChild.id,request:new Request(new URL('unified-engine/src/native.js',scope))}),old);
});
test('a new navigation does not hijack the copied URL session of an older live workspace',async()=>{
 const f=fixture(),before=owner('old',oldSession);f.clients.set(before.id,before);const router=f.make();await router.pin(before,old);
 assert.equal(await router.forRequest({clientId:before.id,resultingClientId:'new-document',request:{mode:'navigate',url:before.url}}),next);assert.equal((await router.lookup(before)).manifest,old);assert.equal((await router.lookup(owner('old-worker',oldSession,'worker'))).manifest,old);assert.equal((await router.lookup({id:'new-document'})).manifest,next);
});
test('unknown owners, session collisions, incomplete predecessor inventories and storage refusals never silently select the new engine',async()=>{
 const f=fixture(),router=f.make(),before=owner('old',oldSession),source=owner('new',newSession);f.clients.set(before.id,before);f.clients.set(source.id,source);await router.pin(before,old);await assert.rejects(router.pin(before,next),/cannot change/);await assert.rejects(router.pin(owner('collision',oldSession),next,{replace:true}),/another resource version/);
 await assert.rejects(router.forRequest({clientId:'unknown-worker',request:new Request(new URL('unified-engine/src/native.js',scope))}),/identity unavailable/);
 await assert.rejects(router.prepareCoexistence(source,old,{verify:async hash=>{if(hash===old)throw Error('Old inventory missing');},confirm:async client=>client.id==='new'}),/Old inventory missing/);assert.equal((await router.lookup(before)).manifest,old);
 const denied=createDependencyClientRouting({scope,manifest:next,clients:{matchAll:async()=>[source],get:async()=>source},cacheStorage:{open:async()=>({match:async()=>null,put:async()=>{throw Error('Storage denied');}})}});await assert.rejects(denied.prepareCoexistence(source,old,{verify:async()=>{},confirm:async()=>true}),/Storage denied/);
});
test('worker compatibility requires the same origin, script path and immutable manifest, rather than merely a version label',()=>{
 const expected=new URL('https://example.test/assets/dependency-sw.js?manifest='+old+'&release=new');assert.equal(dependencyWorkerManifest({scriptURL:expected.href.replace('release=new','release=old')},expected),old);for(const url of ['https://another.test/assets/dependency-sw.js?manifest='+old,'https://example.test/different.js?manifest='+old,'https://example.test/assets/dependency-sw.js?manifest=unqualified'])assert.equal(dependencyWorkerManifest(url,expected),null);
});
