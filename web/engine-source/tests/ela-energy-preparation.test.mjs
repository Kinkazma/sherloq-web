import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import{createHash}from'node:crypto';
import{prepareEnergy}from'../experiments/ela-energy/prepare.js';import{referenceLogFunction}from'../experiments/ela-energy/log-reference.js';
const base=new URL('../fixtures/ela-energy/',import.meta.url),reference=JSON.parse(await readFile(new URL('preparation.json',base))),compressed=await readFile(new URL(reference.payload.file,base)),payload=gunzipSync(compressed),sha=b=>createHash('sha256').update(b).digest('hex');
const log=referenceLogFunction(JSON.parse(await readFile(new URL('log-domain.json',base))),gunzipSync(await readFile(new URL('log-corrections.bin.gz',base))));
const bytes=part=>payload.subarray(part.offset,part.offset+part.length),image=row=>({width:row.width,height:row.height,format:'rgb8',data:bytes(row.image)}),planes=row=>{const b=bytes(row.planes);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
test('84 energy preparations reproduce native score/scope bytes and percentile statistics',async()=>{
 assert.equal(sha(compressed),reference.payload.compressedSha256);assert.equal(sha(payload),reference.payload.sha256);
 for(const row of reference.cases){let reserved=0;const actual=await prepareEnergy(image(row),planes(row),row.quantiles,log,{account:n=>reserved+=n});for(const key of ['energy_low_score','energy_high_score','energy_scope'])assert.deepEqual(new Uint8Array(actual[key].buffer),new Uint8Array(bytes(row[key])),row.name+' '+key);assert.deepEqual(actual.energy_summary,row.summary,row.name);assert.ok(reserved>=45*row.width*row.height);}
});
test('Energy preparation rejects invalid quantiles/domain, refuses admission, and cancels before returning maps',async()=>{
 const row=reference.cases.at(-3),a=image(row),p=planes(row);
 await assert.rejects(prepareEnergy(a,p,[-.01,.99],log),{code:'INVALID_INPUT'});const bad=p.slice();bad[0]=NaN;await assert.rejects(prepareEnergy(a,bad,[.01,.99],log),{code:'INVALID_INPUT'});
 await assert.rejects(prepareEnergy(a,p,[.01,.99],log,{account:()=>{throw Error('budget denied');}}),/budget denied/);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1);try{await assert.rejects(prepareEnergy(a,p,[.01,.99],log,{signal:controller.signal}),{code:'CANCELLED'});}finally{clearTimeout(timer);}
});
