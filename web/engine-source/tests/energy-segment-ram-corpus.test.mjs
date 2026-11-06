import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {segmentSegmentedEnergy} from '../src/energy-segment-stream.js';
const directory=new URL('../fixtures/ela-energy/',import.meta.url);

test('admitted RAM segmentation matches every authoritative historical label and region',async()=>{
 const reference=JSON.parse(await readFile(new URL('segmentation.json',directory))),encoded=await readFile(new URL(reference.payload.file,directory)),payload=gunzipSync(encoded),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(encoded.length,reference.payload.compressedBytes);assert.equal(sha(encoded),reference.payload.compressedSha256);assert.equal(payload.length,reference.payload.bytes);assert.equal(sha(payload),reference.payload.sha256);
 const bytes=part=>payload.subarray(part.offset,part.offset+part.length),store=data=>({byteLength:data.byteLength,readInto(target,offset=0){target.set(data.subarray(offset,offset+target.length));}});let cases=0;
 for(const row of reference.cases){
  const base={width:row.width,height:row.height,metadata:{block:row.block},energy_summary:row.summary},budget=new Budget(32*1024**2);for(const key of ['energy_scope','energy_low_score','energy_high_score','energy_allowed'])if(row[key])base[key]=store(bytes(row[key]));let result;
  try{result=await segmentSegmentedEnergy(base,{thresholds:row.thresholds,minimum:row.minimum,offset:row.offset},{budget,segmentationBackend:'contiguous'});assert.equal(result.metrics.segmentationBackend,'contiguous-ram');const labels=new Uint8Array(result.labels.byteLength);await result.labels.readInto(labels);assert.deepEqual(labels,new Uint8Array(bytes(row.labels)),row.name+' labels');assert.deepEqual(result.regions,row.regions,row.name+' regions');cases++;}finally{await result?.dispose();assert.equal(budget.total(),0,row.name+' owner retirement');}
 }
 assert.equal(cases,624);
});
