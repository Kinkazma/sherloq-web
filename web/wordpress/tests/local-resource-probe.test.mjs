import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceFetch} from '../sherloq-browser/assets/resilient-resource.js';
import {localChunkReader} from '../sherloq-browser/assets/local-update-core.js';
import {sha256} from '../sherloq-browser/assets/dependency-core.js';
test('missing optional local aliases fall through without retry prompts before a verified resource is restored',async()=>{
 const bytes=new Uint8Array([4,7,9]),hash=await sha256(bytes),base=new URL('https://site.test/offline/'),manifest={files:{'composite-assets/optional.bin':{chunks:[hash]},'extension-engine/shared.bin':{chunks:[hash]}},chunks:{[hash]:bytes.length}},calls=[];
 const fetcher=resourceFetch(async(input,init)=>{assert.equal(init?.sherloqResourceProbe,undefined,'probe control is not sent to transport');const url=new URL(input);calls.push(url.href);if(url.pathname.endsWith('/extension-engine/shared.bin'))return new Response(bytes,{status:206,headers:{'Content-Length':String(bytes.length)}});return new Response('absent optional file',{status:503});},{attempts:3,wait:()=>{throw Error('A presence probe cannot wait for Retry');}});
 assert.deepEqual(await localChunkReader(manifest,base,fetcher)(hash),bytes);assert.equal(calls.length,3);
});
