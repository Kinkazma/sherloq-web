import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
import {createManifestLoader} from '../sherloq-browser/assets/dependency-manifest.js';
import {readDependencyManifest} from '../sherloq-browser/assets/dependency-library.js';
import {startupPhase} from '../sherloq-browser/assets/startup-diagnostics.js';
import {readBootstrapBytes} from '../sherloq-browser/assets/bootstrap-metadata.js';

async function fixture(){
 const manifest={schema:'sherloq.dependencies/1',remoteBase:null,slots:['models'],files:{},chunks:{},localFiles:[]};
 const bytes=JSON.stringify(manifest),identity=await sha256(new TextEncoder().encode(bytes));
 const saved=new Map(),cache={match:async key=>saved.get(String(key))?.clone(),put:async(key,value)=>saved.set(String(key),value.clone())};
 const storage={open:async()=>cache},scope=new URL('https://test.invalid/assets/');
 return {manifest,bytes,identity,saved,storage,scope,url:new URL('dependency-manifest-'+identity+'.json',scope)};
}
test('a valid immutable inventory starts without making a slow network request',async()=>{
 const f=await fixture();f.saved.set(String(f.url),new Response(f.bytes));let calls=0;
 const value=await createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,fetcher:()=>{calls++;return new Promise(()=>{});}})();
 assert.deepEqual(value,f.manifest);assert.equal(calls,0);
});
test('document and restarted worker share the verified inventory, not a second download',async()=>{
 const f=await fixture();let calls=0;
 const fetcher=async()=>{calls++;return new Response(f.bytes);};
 assert.deepEqual(await readDependencyManifest({manifest:f.identity},{storage:f.storage,scopeURL:f.scope,fetcher}),f.manifest);
 assert.deepEqual(await createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,fetcher})(),f.manifest);
 assert.equal(calls,1);
});
test('corrupt cache is replaced by the matching network bytes, never silently accepted',async()=>{
 const f=await fixture();f.saved.set(String(f.url),new Response('{}'));let calls=0;
 assert.deepEqual(await createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,fetcher:async()=>{calls++;return new Response(f.bytes);}})(),f.manifest);
 assert.equal(calls,1);assert.equal(await f.saved.get(String(f.url)).text(),f.bytes);
});
test('an unreadable cache does not prevent a verified network startup',async()=>{
 const f=await fixture();f.storage.open=async()=>({match(){throw Error('unreadable');},put(){throw Error('quota');}});
 assert.deepEqual(await createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,fetcher:async()=>new Response(f.bytes)})(),f.manifest);
});
test('a different manifest identity cannot borrow the previous cached inventory',async()=>{
 const f=await fixture();f.saved.set(String(f.url),new Response(f.bytes));
 const next='b'.repeat(64),url=new URL('dependency-manifest-'+next+'.json',f.scope);
 await assert.rejects(createManifestLoader(url,next,{cacheStorage:f.storage,fetcher:async()=>new Response(f.bytes)})(),/integrity/);
});
for(const stalled of ['open','match','put'])test(`a permanently pending cache ${stalled} cannot hold startup hostage`,async()=>{
 const f=await fixture(),never=()=>new Promise(()=>{});let calls=0;
 const cache={match:async()=>undefined,put:async()=>{}};
 if(stalled!=='open')cache[stalled]=never;
 f.storage.open=stalled==='open'?never:async()=>cache;
 const value=await createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,cacheTimeoutMs:5,fetcher:async()=>{calls++;return new Response(f.bytes);}})();
 assert.deepEqual(value,f.manifest);assert.equal(calls,1);
});
test('a metadata timeout aborts the fetch and releases the loader for a fresh attempt',async()=>{
 const f=await fixture();let attempts=0,signal;
 const load=createManifestLoader(f.url,f.identity,{cacheStorage:f.storage,networkTimeoutMs:5,fetcher:async(_url,options)=>{signal=options.signal;if(++attempts===1)return new Promise(()=>{});return new Response(f.bytes);}});
 await assert.rejects(load(),error=>error.code==='DEPENDENCY_METADATA_TIMEOUT'&&error.url===String(f.url));
 assert.equal(signal.aborted,true);assert.deepEqual(await load(),f.manifest);assert.equal(attempts,2);
});
test('the metadata deadline includes a response whose body never finishes',async()=>{
 await assert.rejects(readBootstrapBytes('https://test.invalid/config.json',{timeoutMs:5,fetcher:async()=>({ok:true,arrayBuffer:()=>new Promise(()=>{})})}),error=>error.code==='DEPENDENCY_METADATA_TIMEOUT');
});
test('metadata HTTP and original transport errors retain their details',async()=>{
 await assert.rejects(readBootstrapBytes('https://test.invalid/config.json',{fetcher:async()=>new Response('missing',{status:503})}),error=>error.status===503&&error.url.endsWith('config.json'));
 const original=Error('network original');await assert.rejects(readBootstrapBytes('https://test.invalid/config.json',{fetcher:async()=>{throw original;}}),error=>error===original);
});
test('phase durations record completion without altering the returned object',async()=>{
 const events=[],value={},times=[10,25];
 assert.equal(await startupPhase('test',async()=>value,{emit:event=>events.push(event),now:()=>times.shift()}),value);
 assert.deepEqual(events.map(e=>[e.state,e.durationMs]),[['started',undefined],['completed',15]]);
});
test('phase failure preserves the exact cause and optional warning severity',async()=>{
 const events=[],error=new Error('original cause'),times=[10,40];
 await assert.rejects(startupPhase('optional',async()=>{throw error;},{emit:event=>events.push(event),now:()=>times.shift(),failureLevel:'warning'}),caught=>caught===error);
 assert.equal(events[1].error,error);assert.equal(events[1].level,'warning');assert.equal(events[1].durationMs,30);
});
