import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {createChunkLoader} from '../sherloq-browser/assets/dependency-store.js';
import {writeResourceTar,indexResourceTar,archiveChunkReader} from '../sherloq-browser/assets/dependency-tar.js';
import {offlineLauncherHTML,offlineShellParts} from '../sherloq-browser/assets/offline-kit-core.js';

async function fixture(){
 const a=Uint8Array.of(1,2,3,4),b=Uint8Array.of(5,6,7,8),ha=await sha256(a),hb=await sha256(b);
 const m={schema:'sherloq.dependencies/1',remoteBase:null,slots:['models'],chunks:{[ha]:4,[hb]:4},files:{'models/a.bin':{size:4,sha256:ha,type:'application/octet-stream',chunks:[ha]},'models/b.bin':{size:4,sha256:hb,type:'application/octet-stream',chunks:[hb]}}};
 return {a,b,ha,hb,m};
}
async function tar(m,load,options){const parts=[];await writeResourceTar(m,load,{async write(bytes){parts.push(bytes);}},options);return new Blob(parts);}
test('an ordinary previous TAR is reused without network or copying into IndexedDB',async()=>{
 const {a,b,ha,hb,m}=await fixture(),blob=await tar(m,async h=>h===ha?a:b),index=await indexResourceTar(blob);
 let requests=0;const load=createChunkLoader(m,{base:'https://example.test/',scope:'https://app.test/',cacheStorage:null,folder:async()=>null,archive:archiveChunkReader(index,m),fetcher:async()=>{requests++;throw Error('network forbidden');}});
 assert.deepEqual(await load(ha),a);assert.deepEqual(await load(hb),b);assert.equal(requests,0);assert.equal(index.blob,blob);
});
test('partial archive plus cached chunk fetches only the missing piece',async()=>{
 const {a,b,ha,hb,m}=await fixture(),old={...m,files:{'models/a.bin':m.files['models/a.bin']}},index=await indexResourceTar(await tar(old,async()=>a));let fetched=[];
 const load=createChunkLoader(m,{base:'https://example.test/',scope:'https://app.test/',cacheStorage:null,folder:async()=>null,archive:archiveChunkReader(index,m),fetcher:async url=>{fetched.push(String(url));return new Response(b);}});
 assert.deepEqual(await load(ha),a);assert.deepEqual(await load(hb),b);assert.deepEqual(fetched,['https://example.test/chunks/'+hb+'.bin']);
 let calls=0;const cached=createChunkLoader(m,{base:null,scope:'https://app.test/',folder:async()=>null,archive:async()=>{calls++;return null;},cacheStorage:{async open(){return {async match(){return new Response(a);}};}}});assert.deepEqual(await cached(ha),a);assert.equal(calls,0);
});
test('corrupted old archive cannot substitute unverified bytes',async()=>{
 const {a,b,ha,m}=await fixture(),blob=await tar(m,async h=>h===ha?a:b),index=await indexResourceTar(blob),bytes=new Uint8Array(await blob.arrayBuffer());bytes[index.files.get('models/a.bin').offset]^=255;
 const read=archiveChunkReader(await indexResourceTar(new Blob([bytes])),m);await assert.rejects(read(ha),e=>e.code==='DEPENDENCY_LOCAL_INTEGRITY');
 const load=createChunkLoader(m,{base:null,scope:'https://app.test/',cacheStorage:null,folder:async()=>null,archive:read});await assert.rejects(load(ha),/OFFLINE_MISSING/);
});
test('TAR index rejects truncation and unsupported extra paths',async()=>{
 const {a,ha,m}=await fixture(),blob=await tar(m,async()=>a);await assert.rejects(indexResourceTar(blob.slice(0,-1)),/Truncated|footer/);
 await assert.rejects(tar(m,async()=>a,{extras:(async function*(){yield ['../escape',a];})()}),/Invalid extra/);
 const extras=(async function*(){yield ['offline-kit.json',a];})();const full=await indexResourceTar(await tar(m,async()=>a,{extras}));assert.ok(full.files.has('offline-kit.json'));assert.ok(full.files.has('models/a.bin'));
});
test('personal HTML safely embeds a private path and requires no cookie',()=>{
 const archivePath='/private/<script>alert("x")</script>/a & b.tar',h=offlineLauncherHTML({archivePath,manifest:'a'.repeat(64),shellSha256:'b'.repeat(64),version:'0.15.0',token:'c'.repeat(32),server:'print("local only")'}),{document}=parseHTML(h);
 assert.equal(JSON.parse(document.getElementById('sherloq-offline-config').textContent).archivePath,archivePath);
 assert.equal(document.querySelectorAll('script').length,2);assert.ok(h.includes('connect-src &#39;none&#39;')||h.includes("connect-src 'none'"));assert.ok(!h.includes('localStorage'));assert.ok(!h.includes('https://'));
 assert.throws(()=>offlineLauncherHTML({archivePath:'x\nmalicious',manifest:'a'.repeat(64),token:'b'.repeat(32)}));
});
test('offline shell exports the public HTML copy, never the private mail overlay',async()=>{
 const data=new TextEncoder().encode('<html>public</html>'),hash=await sha256(data),shell={schema:'sherloq.offline-shell/1',manifest:'a'.repeat(64),files:{'app.html':{source:'offline-public-app.html',size:data.length,sha256:hash}}},seen=[],parts=[];
 for await(const entry of offlineShellParts(shell,'https://app.test/',{fetcher:async url=>{seen.push(String(url));return new Response(data);}}))parts.push(entry);
 assert.deepEqual(seen,['https://app.test/offline-public-app.html']);assert.equal(parts[1][0],'app/app.html');assert.deepEqual(parts[1][1],data);
});
