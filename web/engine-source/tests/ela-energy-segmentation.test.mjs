import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
import{segmentEnergy,energyColor}from'../experiments/ela-energy/segment.js';
const root=new URL('../fixtures/ela-energy/',import.meta.url),reference=JSON.parse(await readFile(new URL('segmentation.json',root))),compressed=await readFile(new URL(reference.payload.file,root)),payload=gunzipSync(compressed),sha=b=>createHash('sha256').update(b).digest('hex'),bytes=part=>payload.subarray(part.offset,part.offset+part.length);
function base(row){const out={width:row.width,height:row.height,metadata:{block:row.block},energy_summary:row.summary};for(const key of ['energy_scope','energy_low_score','energy_high_score','energy_allowed'])if(row[key]){const b=bytes(row[key]);out[key]=key==='energy_allowed'?b:key==='energy_scope'?new Int32Array(b.buffer,b.byteOffset,b.length/4):new Float32Array(b.buffer,b.byteOffset,b.length/4);}return out;}
test('Energy hysteresis labels and region summaries match all generated native cases including zero/weak/strong boundaries',async()=>{
 assert.equal(sha(compressed),reference.payload.compressedSha256);assert.equal(sha(payload),reference.payload.sha256);
 for(const row of reference.cases){const result=await segmentEnergy(base(row),{thresholds:row.thresholds,minimum:row.minimum,offset:row.offset});assert.deepEqual(new Uint8Array(result.labels.buffer),new Uint8Array(bytes(row.labels)),row.name+' labels');assert.deepEqual(result.regions,row.regions,row.name+' regions');}
});
test('Energy colours use reference panel/class identity for all 512 native cases',()=>{for(const row of reference.colors)assert.deepEqual(energyColor(row.region),row.rgb);});
test('Energy mask generation validates parameters, admits memory and supports cancellation',async()=>{
 const row=reference.cases.at(-2),input=base(row);
 await assert.rejects(segmentEnergy(input,{thresholds:[-1,0]}),{code:'INVALID_INPUT'});await assert.rejects(segmentEnergy(input,{}, {account:()=>{throw Error('denied');}}),/denied/);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1);try{await assert.rejects(segmentEnergy(input,{thresholds:[0,0]},{signal:controller.signal}),{code:'CANCELLED'});}finally{clearTimeout(timer);}
});
