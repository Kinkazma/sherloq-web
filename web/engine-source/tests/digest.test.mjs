import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileDigest} from '../src/digest.js';
const algorithms={'MD5':'md5','SHA-1':'sha1','SHA2-224':'sha224','SHA2-256':'sha256','SHA2-384':'sha384','SHA2-512':'sha512','SHA3-224':'sha3-224','SHA3-256':'sha3-256','SHA3-384':'sha3-384','SHA3-512':'sha3-512'};
test('All ten native cryptographic algorithms match independent streaming digests',async()=>{
 for(const bytes of [new Uint8Array(),new TextEncoder().encode('abc'),Uint8Array.from({length:2*1024**2+17},(_,i)=>(i*37)%256)]){
  const result=await fileDigest(null,{}, {},{bytes});for(const [label,algorithm]of Object.entries(algorithms))assert.equal(result.data.hashes[label],createHash(algorithm).update(bytes).digest('hex'),label+' '+bytes.length);
 }
});
test('File digest cancellation stops between chunks',async()=>{const controller=new AbortController();await assert.rejects(fileDigest(null,{}, {signal:controller.signal,onProgress:()=>controller.abort()},{bytes:new Uint8Array(3*1024**2)}),{code:'CANCELLED'});});
