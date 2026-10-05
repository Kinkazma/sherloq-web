import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {referenceLogFunction} from '../experiments/ela-energy/log-reference.js';
const base=new URL('../fixtures/ela-energy/',import.meta.url),reference=JSON.parse(await readFile(new URL('log-domain.json',base))),compressed=await readFile(new URL('log-corrections.bin.gz',base)),bytes=gunzipSync(compressed),sha=x=>createHash('sha256').update(x).digest('hex');
test('Bounded float32 energy log matches all184549377 native values with sparse static corrections',()=>{
 assert.equal(sha(compressed),reference.corrections.compressedSha256);assert.equal(sha(bytes),reference.corrections.sha256);const log=referenceLogFunction(reference,bytes);
 for(const row of reference.records){const bits=new Uint32Array(row.length),input=new Float32Array(bits.buffer),output=new Float32Array(row.length);for(let i=0;i<row.length;i++){bits[i]=row.start+i;output[i]=log(input[i]);}assert.equal(sha(new Uint8Array(output.buffer)),row.nativeSha256,String(row.start));}
 for(const value of [0,-1,Infinity,NaN,2**-12,4096])assert.throws(()=>log(value),/Outside qualified/);
});
