import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionLog} from '../sherloq-browser/assets/session-log.js';
import {dependencyBytes} from '../sherloq-browser/assets/runtime-dependency.js';
import {resourceFetch} from '../sherloq-browser/assets/resilient-resource.js';
const bytes=Uint8Array.of(0,97,115,109,1,0,0,0),hash=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
test('complete session retains earlier tools and more than eight failures, with no binary or credential payload',async()=>{
 const log=createSessionLog({indexedDB:null,environment:{uiVersion:'test'}});for(let i=0;i<600;i++)log.append({level:i%25===0?'error':'info',kind:'operation.test',error:{message:'e'+i,details:{pixels:bytes,debug:bytes}},parameters:{i},url:'https://site.test/?token=secret'});const report=await log.report();assert.equal(report.events.length,601);assert.equal(report.errorCount,24);assert.equal(report.events[1].parameters.i,0);assert.equal(report.events.at(-1).parameters.i,599);assert.equal(report.events[1].error.details.pixels,'[omitted]');assert.equal(report.events[1].error.details.debug.omitted,'binary');assert.ok(!JSON.stringify(report).includes('secret'));await log.close();
});
test('native loader retains HTTP status and wrong-body identity instead of compiling HTML',async()=>{
 const expected={size:bytes.length,sha256:await hash(bytes)};
 await assert.rejects(dependencyBytes('https://example.test/x.wasm',expected,{wait:null,attempts:1,fetcher:async()=>new Response('not found',{status:404})}),e=>e.code==='DEPENDENCY_HTTP'&&e.details.status===404);
 await assert.rejects(dependencyBytes('https://example.test/x.wasm',expected,{wait:null,attempts:1,fetcher:async()=>new Response('<!html>')}),e=>e.code==='DEPENDENCY_CONTENT'&&e.details.header.startsWith('3c21'));
 await assert.rejects(dependencyBytes('https://example.test/x.wasm',{...expected,sha256:'0'.repeat(64)},{wait:null,attempts:1,fetcher:async()=>new Response(bytes)}),e=>e.code==='DEPENDENCY_INTEGRITY');
});
test('manual dependency retry resumes the same pending initializer after bounded failures',async()=>{
 let requests=0,paused,release;const waiting=new Promise(r=>paused=r);const expected={size:bytes.length,sha256:await hash(bytes)};
 const result=dependencyBytes('https://example.test/x.wasm',expected,{attempts:2,delay:async()=>{},wait:async()=>{paused();await new Promise(r=>release=r);},fetcher:async()=>++requests<3?new Response('down',{status:503}):new Response(bytes)});
 await waiting;assert.equal(requests,2);release();assert.deepEqual(await result,bytes);assert.equal(requests,3);
});
test('model transport resumes only missing bytes and preserves the original consumer',async()=>{
 let calls=0;const ranges=[];const fetcher=async request=>{calls++;ranges.push(request.headers.get('range'));if(calls===1){let n=0;return new Response(new ReadableStream({pull(c){if(!n++){c.enqueue(bytes.subarray(0,4));}else c.error(Error('disconnected'));}}),{headers:{'Content-Length':'8'}});}return new Response(bytes.subarray(4),{status:206,headers:{'Content-Range':'bytes 4-7/8','Content-Length':'4'}});};
 const fetch=resourceFetch(fetcher,{delay:async()=>{}}),response=await fetch('https://example.test/model.bin');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.deepEqual(ranges,[null,'bytes=4-']);
});
test('persistent stream failure waits instead of spinning, and HTTP failure keeps cause',async()=>{
 let waits=0,calls=0;const fetch=resourceFetch(async()=>{calls++;return new Response(new ReadableStream({start(c){c.error(Error('broken'));}}),{headers:{'Content-Length':'8'}});},{attempts:2,delay:async()=>{},wait:async()=>{waits++;throw Error('stop fixture');}});
 await assert.rejects((await fetch('https://example.test/x')).arrayBuffer(),/stop fixture/);assert.equal(waits,1);assert.equal(calls,2);
});
test('a requested subrange resumes with absolute file offsets',async()=>{
 let calls=0;const ranges=[];const fetch=resourceFetch(async r=>{ranges.push(r.headers.get('range'));if(!calls++){let n=0;return new Response(new ReadableStream({pull(c){if(!n++)c.enqueue(bytes.subarray(2,4));else c.error(Error('cut'));}}),{status:206,headers:{'Content-Range':'bytes 2-7/8','Content-Length':'6'}});}return new Response(bytes.subarray(4),{status:206,headers:{'Content-Range':'bytes 4-7/8','Content-Length':'4'}});},{delay:async()=>{}});
 assert.deepEqual(new Uint8Array(await(await fetch('https://example.test/model',{headers:{Range:'bytes=2-7'}})).arrayBuffer()),bytes.subarray(2));assert.deepEqual(ranges,['bytes=2-7','bytes=4-7']);
});
test('compressed transport restarts only its resource and does not duplicate delivered pixels',async()=>{
 let calls=0;const fetch=resourceFetch(async r=>{assert.equal(r.headers.get('range'),null);if(!calls++){let n=0;return new Response(new ReadableStream({pull(c){if(!n++)c.enqueue(bytes.subarray(0,4));else c.error(Error('cut'));}}),{headers:{'Content-Encoding':'gzip','Content-Length':'123'}});}return new Response(bytes,{headers:{'Content-Encoding':'gzip'}});},{delay:async()=>{}});
 assert.deepEqual(new Uint8Array(await(await fetch('https://example.test/model')).arrayBuffer()),bytes);assert.equal(calls,2);
});
test('abort releases a consumer paused for an explicit download retry',async()=>{
 let waiting;const paused=new Promise(r=>waiting=r),abort=new AbortController();const fetch=resourceFetch(async()=>new Response('down',{status:503}),{attempts:1,wait:()=>{waiting();return new Promise(()=>{});}});const result=fetch('https://example.test/model',{signal:abort.signal});await paused;abort.abort();await assert.rejects(result,e=>e.name==='AbortError');
});
