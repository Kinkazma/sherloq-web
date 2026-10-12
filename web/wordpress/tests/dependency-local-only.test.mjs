import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sha256,validateManifest,publicDependencyEntries,requiredDependencyChunks} from '../sherloq-browser/assets/dependency-core.js';
import {createChunkLoader,saveLibraryFile} from '../sherloq-browser/assets/dependency-store.js';
import {writeResourceTar,indexResourceTar,archiveChunkReader,importResourceTar,importLibraryFile} from '../sherloq-browser/assets/dependency-tar.js';
import {prepareOfflineBrowser,offlineMissing} from '../sherloq-browser/assets/offline-browser-store.js';

async function fixture(){
 const publicBytes=Uint8Array.of(1,2,3),localBytes=Uint8Array.of(4,5,6,7),a=await sha256(publicBytes),b=await sha256(localBytes);
 const file=(bytes,hash,localOnly)=>({size:bytes.length,sha256:hash,type:'application/octet-stream',chunks:[hash],...(localOnly?{localOnly:true}:{})});
 const manifest={schema:'sherloq.dependencies/1',slots:['models'],remoteBase:'https://raw.githubusercontent.com/example/repo/'+ 'a'.repeat(40)+'/web-assets/',chunks:{[a]:3,[b]:4},files:{'models/public.onnx':file(publicBytes,a),'models/local.onnx':file(localBytes,b,true)}};
 return {manifest,publicBytes,localBytes,a,b};
}
function cacheStorage(){const stores=new Map();return {async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name),key=v=>typeof v==='string'?v:v.url||v.href;return {match:async u=>map.get(key(u))?.clone(),put:async(u,r)=>map.set(key(u),r.clone()),delete:async u=>map.delete(key(u)),keys:async()=>[...map.keys()].map(url=>({url}))};}};}
async function tar(manifest,load,options){const parts=[];await writeResourceTar(manifest,load,{write:async bytes=>parts.push(bytes)},options);return new Blob(parts);}
const localFolder=bytes=>({async getDirectoryHandle(name){assert.equal(name,'models');return {async getFileHandle(name){assert.equal(name,'local.onnx');return {getFile:async()=>new Blob([bytes])};}};}});
test('old manifests and shared public chunks remain downloadable, malformed policy is rejected',async()=>{
 const f=await fixture(),old=structuredClone(f.manifest);delete old.files['models/local.onnx'].localOnly;
 assert.equal(validateManifest(old),old);assert.equal(publicDependencyEntries(old).length,2);assert.equal(requiredDependencyChunks(old).length,2);
 f.manifest.files['models/local.onnx'].localOnly='true';assert.throws(()=>validateManifest(f.manifest),/policy/);
 f.manifest.files['models/local.onnx'].localOnly=true;f.manifest.files['models/public-copy.onnx']={...f.manifest.files['models/local.onnx'],localOnly:false};
 let requests=0;const load=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>null,fetcher:async()=>{requests++;return new Response(f.localBytes);}});
 assert.deepEqual(await load(f.b),f.localBytes);assert.equal(requests,1);
});
test('a missing optional model produces an explicit error without a remote request',async()=>{
 const f=await fixture(),events=[];let calls=0;
 const load=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>null,fetcher:async()=>{calls++;assert.fail('restricted network request');}});
 await assert.rejects(load(f.b,e=>events.push(e)),e=>e.code==='MODEL_LOCAL_REQUIRED'&&e.details.files[0]==='models/local.onnx'&&e.details.expectedSha256===f.b);
 assert.equal(calls,0);assert.equal(events.at(-1).kind,'dependency.local-required');
 assert.deepEqual(requiredDependencyChunks(f.manifest),[[f.a,3]]);
});
test('verified directory, cache, and standard TAR import satisfy local-only models',async()=>{
 const f=await fixture(),storage=cacheStorage();let requests=0;const noNetwork=async()=>{requests++;throw Error('forbidden');};
 const folderLoad=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>localFolder(f.localBytes),fetcher:noNetwork});
 assert.deepEqual(await folderLoad(f.b),f.localBytes);
 const full=await tar(f.manifest,async h=>h===f.a?f.publicBytes:f.localBytes,{includeLocalOnly:true}),index=await indexResourceTar(full);
 const archiveLoad=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>null,archive:archiveChunkReader(index,f.manifest),fetcher:noNetwork});
 assert.deepEqual(await archiveLoad(f.b),f.localBytes);
 const cache=await storage.open('sherloq-dependency-chunks-v1');
 assert.deepEqual(await importResourceTar(full,f.manifest,(hash,bytes)=>cache.put('https://app.test/__dependency_chunks__/'+hash,new Response(bytes))),{files:2});
 const cached=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:storage,folder:async()=>null,fetcher:noNetwork});
 assert.deepEqual(await cached(f.b),f.localBytes);assert.equal(requests,0);
 await assert.rejects(importLibraryFile(new Blob([Uint8Array.of(4,5,6,8)]),f.manifest.files['models/local.onnx'],f.manifest,()=>assert.fail('save corrupt chunk')),/integrity/);
});
test('corrupt local bytes retain their integrity cause and cannot fall back to GitHub',async()=>{
 const f=await fixture(),bad=Uint8Array.of(4,5,6,8),events=[];
 const load=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>localFolder(bad),fetcher:async()=>assert.fail('restricted network request')});
 await assert.rejects(load(f.b,e=>events.push(e)),e=>e.code==='MODEL_LOCAL_REQUIRED'&&/integrity/.test(e.cause.message)&&e.details.localFailures[0].source==='folder');
 const full=await tar(f.manifest,async h=>h===f.a?f.publicBytes:bad,{includeLocalOnly:true}),reader=archiveChunkReader(await indexResourceTar(full),f.manifest);
 const archiveLoad=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>null,archive:reader,fetcher:async()=>assert.fail('restricted network request')});
 await assert.rejects(archiveLoad(f.b),e=>e.code==='MODEL_LOCAL_REQUIRED'&&e.cause.code==='DEPENDENCY_LOCAL_INTEGRITY');
 assert.ok(events.some(e=>e.kind==='dependency.folder-invalid'));
 const oversized=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,folder:async()=>localFolder(Uint8Array.of(...f.localBytes,8)),fetcher:async()=>assert.fail('restricted network request')});
 await assert.rejects(oversized(f.b),e=>e.code==='MODEL_LOCAL_REQUIRED'&&/length/.test(e.cause.message));
 const declaredLarge=structuredClone(f.manifest);declaredLarge.files['models/local.onnx'].size=5;declaredLarge.chunks[f.b]=5;
 const wrongLength=archiveChunkReader(await indexResourceTar(await tar(declaredLarge,async h=>h===f.a?f.publicBytes:Uint8Array.of(...f.localBytes,8),{includeLocalOnly:true})),f.manifest);
 await assert.rejects(wrongLength(f.b),e=>e.code==='DEPENDENCY_LOCAL_INTEGRITY'&&e.details.receivedFileBytes===5);
});
test('public TAR and ordinary directory exports retain every public dependency without restricted payload',async()=>{
 const f=await fixture(),loaded=[];const archive=await tar(f.manifest,async hash=>{loaded.push(hash);return f.publicBytes;});
 const index=await indexResourceTar(archive);assert.deepEqual([...index.files.keys()],['manifest.json','models/public.onnx']);assert.deepEqual(loaded,[f.a]);
 assert.equal(JSON.parse(await index.blob.slice(index.files.get('manifest.json').offset,index.files.get('manifest.json').offset+index.files.get('manifest.json').size).text()).files['models/local.onnx'].localOnly,true);
 const written=new Map(),root={async getDirectoryHandle(){return {async getFileHandle(name){const parts=[];return {createWritable:async()=>({write:async bytes=>parts.push(bytes),close:async()=>written.set(name,Buffer.concat(parts)),abort:async()=>assert.fail('unexpected abort')})};}};}};
 for(const [path,file]of publicDependencyEntries(f.manifest))await saveLibraryFile(root,path,file,async h=>{assert.equal(h,f.a);return f.publicBytes;});
 assert.deepEqual([...written.keys()],['public.onnx']);assert.deepEqual(written.get('public.onnx'),Buffer.from(f.publicBytes));
});
test('offline readiness requires public chunks, while a requested optional model remains explicit',async()=>{
 const f=await fixture(),storage=cacheStorage(),manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest)),identity=await sha256(manifestBytes),content=new TextEncoder().encode('public shell'),shell={schema:'sherloq.offline-shell/1',version:'test',manifest:identity,files:{'app.html':{size:content.length,sha256:await sha256(content)}}};
 const plan={manifest:f.manifest,manifestBytes,shell,shellBytes:new TextEncoder().encode(JSON.stringify(shell)),identity:'a'.repeat(64),config:{manifest:identity},sourceBase:new URL('https://app.test/'),appBase:new URL('https://app.test/offline/')};
 const requests=[],fetcher=async url=>{requests.push(String(url));return new Response(String(url).endsWith('.bin')?f.publicBytes:content);};
 const receipt=await prepareOfflineBrowser(plan,{storage,fetcher,folder:async()=>null});
 assert.equal(receipt.complete,true);assert.equal(receipt.chunks,1);assert.deepEqual(receipt.localOnlyFiles,['models/local.onnx']);assert.deepEqual(await offlineMissing(plan,{storage}),[]);
 assert.equal(requests.filter(s=>s.endsWith('.bin')).length,1);assert.ok(!requests.some(s=>s.includes(f.b)));
 const load=createChunkLoader(f.manifest,{base:null,scope:plan.sourceBase,cacheStorage:storage,folder:async()=>null});await assert.rejects(load(f.b),e=>e.code==='MODEL_LOCAL_REQUIRED');
 const full=await tar(f.manifest,async h=>h===f.a?f.publicBytes:f.localBytes,{includeLocalOnly:true});
 const imported=await prepareOfflineBrowser(plan,{storage,archive:full,fetcher,folder:async()=>null});assert.deepEqual(imported.importedLocalOnlyFiles,['models/local.onnx']);assert.deepEqual(await load(f.b),f.localBytes);
 const folderStorage=cacheStorage();const fromFolder=await prepareOfflineBrowser(plan,{storage:folderStorage,fetcher,folder:async()=>localFolder(f.localBytes)});assert.deepEqual(fromFolder.importedLocalOnlyFiles,['models/local.onnx']);
 const bad=await tar(f.manifest,async h=>h===f.a?f.publicBytes:Uint8Array.of(4,5,6,8),{includeLocalOnly:true});await assert.rejects(prepareOfflineBrowser(plan,{storage:cacheStorage(),archive:bad,fetcher,folder:async()=>null}),/integrity/);
});
test('public pack, restore and factory byte identities obey optional resource policy',()=>{
 const result=JSON.parse(execFileSync('python3',['tests/dependency-local-only-test.py'],{encoding:'utf8'}));
 assert.equal(result.publicPack,true);assert.equal(result.restore,true);assert.equal(result.factoryIdentity,true);
});
test('the UI offline call reuses its remembered IndexedDB folder for optional models without a folder override',async()=>{
 const f=await fixture(),storage=cacheStorage(),originalIndexedDB=globalThis.indexedDB;let folderReads=0,remoteRequests=0;
 const directory={async getDirectoryHandle(name){assert.equal(name,'models');return {async getFileHandle(name){if(name!=='local.onnx')throw new DOMException('File absent','NotFoundError');return {getFile:async()=>new Blob([f.localBytes])};}};}};
 globalThis.indexedDB={open(){const request={result:{close(){},transaction(){const tx={objectStore(){return {get(key){assert.equal(key,'folder');folderReads++;const get={result:directory};queueMicrotask(()=>{get.onsuccess();queueMicrotask(()=>tx.oncomplete());});return get;}};}};return tx;}}};queueMicrotask(()=>request.onsuccess());return request;}};
 try{
  const online=createChunkLoader(f.manifest,{base:f.manifest.remoteBase,scope:'https://app.test/',cacheStorage:null,fetcher:async()=>assert.fail('restricted online download')});assert.deepEqual(await online(f.b),f.localBytes);
  const manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest)),identity=await sha256(manifestBytes),content=new TextEncoder().encode('shell'),shell={schema:'sherloq.offline-shell/1',version:'test',manifest:identity,files:{'app.html':{size:content.length,sha256:await sha256(content)}}};
  const plan={manifest:f.manifest,manifestBytes,shell,shellBytes:new TextEncoder().encode(JSON.stringify(shell)),identity:'a'.repeat(64),config:{manifest:identity},sourceBase:new URL('https://app.test/'),appBase:new URL('https://app.test/offline/')};
  const receipt=await prepareOfflineBrowser(plan,{storage,fetcher:async url=>{if(String(url).endsWith('.bin')){remoteRequests++;assert.ok(!String(url).includes(f.b));return new Response(f.publicBytes);}return new Response(content);}});
  assert.deepEqual(receipt.importedLocalOnlyFiles,['models/local.onnx']);assert.equal(receipt.complete,true);assert.equal(remoteRequests,1);assert.ok(folderReads>=2);
  const offline=createChunkLoader(f.manifest,{base:null,scope:plan.sourceBase,cacheStorage:storage,folder:async()=>null,fetcher:async()=>assert.fail('offline download')});assert.deepEqual(await offline(f.b),f.localBytes);
 }finally{if(originalIndexedDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=originalIndexedDB;}
});
