import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {elaBase,elaRender,validateParams} from '../src/ela.js';
const root=new URL('../fixtures/',import.meta.url);
const reference=JSON.parse(await readFile(new URL('reference.json',root)));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const fixture of reference.cases) test(`Native reference: ${fixture.name}`,async()=>{
 const a=new Uint8Array(await readFile(new URL(fixture.original.file,root))),b=new Uint8Array(await readFile(new URL(fixture.recompressed.file,root)));
 assert.equal(sha(a),fixture.original.sha256);assert.equal(sha(b),fixture.recompressed.sha256);
 for(const linear of [false,true]) {
  const base=await elaBase(a,b,linear);
  for(const expected of fixture.expected.filter(e=>e.params.linear===linear)) assert.equal(sha(await elaRender(base,expected.params)),expected.sha256,JSON.stringify(expected.params));
 }
});
test('Parameters and cancellation',async()=>{
 assert.throws(()=>validateParams({scale:NaN}),{code:'INVALID_INPUT'});
 assert.throws(()=>validateParams({quality:0}),{code:'INVALID_INPUT'});
 const c=new AbortController();c.abort();
 await assert.rejects(elaBase(new Uint8Array(3),new Uint8Array(3),true,{signal:c.signal}),{code:'CANCELLED'});
 const d=new AbortController();
 await assert.rejects(elaBase(new Uint8Array(400000),new Uint8Array(400000),true,{signal:d.signal,onProgress:()=>d.abort()}),{code:'CANCELLED'});
});
import {toneTable,fusedCpu} from '../experiments/ela-lut.js';
test('Fused lookup output matches all 40 native expectations',async()=>{
 for(const fixture of reference.cases){
  const a=new Uint8Array(await readFile(new URL(fixture.original.file,root))),b=new Uint8Array(await readFile(new URL(fixture.recompressed.file,root)));
  for(const expected of fixture.expected){const table=await toneTable(expected.params);assert.equal(sha(await fusedCpu(a,b,expected.params,table)),expected.sha256);}
 }
});
