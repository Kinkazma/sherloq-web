import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {createManifestLoader,isDependencyBootstrap} from '../sherloq-browser/assets/dependency-manifest.js';
async function fixture(){
 const manifest={schema:'sherloq.dependencies/1',remoteBase:null,slots:['models'],files:{},chunks:{},localFiles:[]},bytes=JSON.stringify(manifest),identity=await sha256(new TextEncoder().encode(bytes)),saved=new Map();
 const cache={async put(url,response){saved.set(String(url),response.clone());},async match(url){return saved.get(String(url))?.clone();}};
 return {manifest,bytes,identity,saved,cacheStorage:{async open(){return cache;}},url:'https://test.invalid/assets/dependency-manifest-'+identity+'.json'};
}
test('retired worker can restore its exact inventory after directory replacement',async()=>{
 const f=await fixture();let calls=0;
 const first=createManifestLoader(f.url,f.identity,{cacheStorage:f.cacheStorage,fetcher:async()=>{calls++;return new Response(f.bytes);}});
 const [a,b]=await Promise.all([first(),first()]);assert.equal(a,b);assert.equal(calls,1);assert.equal(f.saved.size,1);
 const restarted=createManifestLoader(f.url,f.identity,{cacheStorage:f.cacheStorage,fetcher:async()=>new Response('removed',{status:404})});
 assert.deepEqual(await restarted(),f.manifest);
});
test('initial failure does not poison subsequent download attempt',async()=>{
 const f=await fixture();let calls=0;
 const load=createManifestLoader(f.url,f.identity,{cacheStorage:null,fetcher:async()=>++calls===1?new Response('temporary',{status:503}):new Response(f.bytes)});
 await assert.rejects(load(),error=>error.status===503&&error.url===f.url);assert.deepEqual(await load(),f.manifest);assert.equal(calls,2);
});
test('corrupt retained inventory preserves the original HTTP failure',async()=>{
 const f=await fixture();f.saved.set(f.url,new Response('corrupt'));
 const load=createManifestLoader(f.url,f.identity,{cacheStorage:f.cacheStorage,fetcher:async()=>new Response('missing',{status:404})});
 await assert.rejects(load(),error=>error.status===404&&error.url===f.url);
});
test('cache quota failure cannot prevent a verified startup',async()=>{
 const f=await fixture();f.cacheStorage.open=async()=>({async put(){throw Error('quota');}});
 assert.deepEqual(await createManifestLoader(f.url,f.identity,{cacheStorage:f.cacheStorage,fetcher:async()=>new Response(f.bytes)})(),f.manifest);
});
test('bootstrap bypass preserves locked treatment of runtime directories and downloads',()=>{
 assert.equal(isDependencyBootstrap({mode:'navigate'},'app.php'),true);
 for(const path of ['dependency-config.json','workspace-entry.js','dependency-manifest-old.json','app.css'])assert.equal(isDependencyBootstrap({mode:'cors'},path),true);
 for(const path of ['unified-engine/src/worker-client.js','models/model.onnx','__dependency_download__/resources.tar'])assert.equal(isDependencyBootstrap({mode:'cors'},path),false);
});
