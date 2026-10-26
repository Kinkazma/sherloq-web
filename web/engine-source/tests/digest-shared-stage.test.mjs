import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createBlobSource} from '../src/blob-source.js';
import {fileDigest, digestParams} from '../src/digest.js';

const algorithms={'MD5':'md5','SHA-1':'sha1','SHA2-224':'sha224','SHA2-256':'sha256','SHA2-384':'sha384','SHA2-512':'sha512','SHA3-224':'sha3-224','SHA3-256':'sha3-256','SHA3-384':'sha3-384','SHA3-512':'sha3-512'};
function fixture(bytes,chunkBytes=65537){
 const budget=new Budget(2*1024**2),raw=createBlobSource(new Blob([bytes]),{budget,chunkBytes}),stages=new Map();let visits=0;
 const source={...raw,async visit(...args){visits++;return raw.visit(...args);}};
 const context={source,sourceFile:{name:'DSC_1234.JPG',declaredMimeType:'application/octet-stream',lastModified:17,origin:'File'},async memo(name,compute){if(stages.has(name))return stages.get(name);const value=await compute();stages.set(name,value);return value;}};
 return{context,budget,stages,visits:()=>visits,dispose:()=>raw.dispose()};
}
function exact(result,bytes){for(const[label,algorithm]of Object.entries(algorithms))assert.equal(result.data.hashes[label],createHash(algorithm).update(bytes).digest('hex'),label);}
test('Both toggle orders reuse a complete original-byte stage with ten exact hashes',async()=>{
 for(const order of[[true,false,true],[false,true,false]])for(const bytes of[new Uint8Array(),new TextEncoder().encode('abc'),Uint8Array.from({length:2*1024**2+17},(_,i)=>i*37)]){
  const f=fixture(bytes);try{for(const imageHashes of order){const result=await fileDigest(null,digestParams({imageHashes}),{},f.context);exact(result,bytes);assert.deepEqual(result.data.imageHashes,{});}assert.equal(f.visits(),1);assert.equal(f.budget.total(),0);}finally{f.dispose();}
 }
});
test('Returned hash records cannot mutate a cached stage and file properties remain fresh',async()=>{
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]),f=fixture(bytes);try{
  const a=await fileDigest(null,digestParams(),{},f.context);exact(a,bytes);a.data.hashes.MD5='changed';f.context.sourceFile={name:'renamed.png',declaredMimeType:'image/png',lastModified:99,origin:'File'};
  const b=await fileDigest(null,digestParams({imageHashes:false}),{},f.context);exact(b,bytes);assert.equal(b.data.physicalFile.name,'renamed.png');assert.equal(b.data.physicalFile.lastModified,99);assert.equal(b.data.physicalFile.signatureMimeType,'image/png');assert.equal(b.data.physicalFile.declaredMimeType,'image/png');assert.equal(a.data.physicalFile.declaredMimeType,'application/octet-stream');assert.equal(f.visits(),1);
 }finally{f.dispose();}
});
test('Pre-cancelled cache hit never consults or computes its stage',async()=>{
 const f=fixture(new Uint8Array([1,2,3]));try{await fileDigest(null,digestParams(),{},f.context);let consulted=false;f.context.memo=async()=>{consulted=true;throw Error('must not reach memo');};const controller=new AbortController();controller.abort();await assert.rejects(fileDigest(null,digestParams(),{signal:controller.signal},f.context),{code:'CANCELLED'});assert.equal(consulted,false);assert.equal(f.budget.total(),0);}finally{f.dispose();}
});
test('Cancellation from the cached-stage progress callback stops the result',async()=>{
 const f=fixture(new Uint8Array([1,2,3]));try{await fileDigest(null,digestParams(),{},f.context);const controller=new AbortController();await assert.rejects(fileDigest(null,digestParams(),{signal:controller.signal,onProgress:()=>controller.abort()},f.context),{code:'CANCELLED'});assert.equal(f.visits(),1);assert.equal(f.budget.total(),0);}finally{f.dispose();}
});
test('Aborted and failed byte scans publish no partial digest stage or reservation',async()=>{
 const bytes=Uint8Array.from({length:131101},(_,i)=>i*37);
 for(const fail of['abort','callback']){const f=fixture(bytes);try{const controller=new AbortController(),error=new Error('progress callback');await assert.rejects(fileDigest(null,digestParams(),{signal:controller.signal,onProgress:()=>{if(fail==='abort')controller.abort();else throw error;}},f.context),e=>fail==='abort'?e.code==='CANCELLED':e===error);assert.equal(f.stages.size,0);assert.equal(f.budget.total(),0);const result=await fileDigest(null,digestParams(),{},f.context);exact(result,bytes);assert.equal(f.visits(),2);assert.equal(f.budget.total(),0);}finally{f.dispose();}}
});
test('Memory refusal precedes the source window and allows a later bounded retry',async()=>{
 const bytes=Uint8Array.from({length:4096},(_,i)=>i),f=fixture(bytes,4096),free=f.budget.reserve(2*1024**2-2048);try{await assert.rejects(fileDigest(null,digestParams(),{},f.context),{code:'MEMORY_LIMIT'});assert.equal(f.stages.size,0);assert.equal(f.budget.total(),2*1024**2-2048);free();const r=await fileDigest(null,digestParams(),{},f.context);exact(r,bytes);assert.equal(f.budget.total(),0);}finally{free();f.dispose();}
});
test('Eviction of a complete optional stage recomputes exact hashes without invalidating an earlier result',async()=>{
 const bytes=Uint8Array.from({length:65541},(_,i)=>i*17),f=fixture(bytes);try{
  f.context.memo=async(name,compute)=>{const hit=f.budget.get(name);if(hit)return hit.value;const value=await compute();f.budget.put(name,{value,byteLength:4096});return value;};
  const first=await fileDigest(null,digestParams(),{},f.context),saved=structuredClone(first.data);assert.equal(f.visits(),1);assert.equal(f.budget.cacheBytes,4096);
  const release=f.budget.reserve(f.budget.limit);assert.equal(f.budget.cacheBytes,0);release();const next=await fileDigest(null,digestParams({imageHashes:false}),{},f.context);exact(next,bytes);assert.equal(f.visits(),2);assert.deepEqual(first.data,saved);assert.equal(f.budget.active,0);f.budget.remove('original-bytes');assert.equal(f.budget.total(),0);
 }finally{f.dispose();}
});
test('Signature detection and original hashes preserve single-byte and 16-byte prefix seams',async()=>{
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,...Array.from({length:27},(_,i)=>i)]);
 for(const chunkBytes of[1,7,8,15,16,17]){const f=fixture(bytes,chunkBytes);try{const r=await fileDigest(null,digestParams(),{},f.context);exact(r,bytes);assert.equal(r.data.physicalFile.signatureMimeType,'image/png');assert.equal(f.budget.total(),0);}finally{f.dispose();}}
});
