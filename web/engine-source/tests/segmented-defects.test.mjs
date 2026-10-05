import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedDefects} from '../src/segmented-defects.js';import {defectPixels,defectParams} from '../src/defect-pixels.js';import {orientRgb} from '../src/image-headers.js';import {exportAnalysis} from '../src/exports.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
async function dispose(result){await Promise.all([result.surface.dispose(),...['maskRecords','flagRecords','tableRecords'].flatMap(name=>Object.values(result[name]).map(record=>record.surface.dispose()))]);}
async function read(result){const rgb=await result.surface.readWindow(),mask=await result.maskRecords.candidates.surface.readWindow(),flags=await result.flagRecords.channels.surface.readWindow(),table=result.tableRecords.candidates.surface,rows=await table.readRows({length:Math.max(1,table.descriptor.rowCount)}),csv=await table.readCsv({length:Math.max(1,table.descriptor.rowCount)});const data={rgb:rgb.pixels,mask:mask.pixels.data,flags:flags.pixels.data,rows:rows.data,csv:csv.bytes};for(const value of [rgb,mask,flags,rows,csv])value.release();return data;}
async function source(pixels,orientation=1){const budget=new Budget(2*1024**2),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return {budget,image:{store,surface:createRgbSurface(store,{...pixels,orientation,budget})}};}
test('Segmented defects match every native raster, RGB flag, mask, count and CSV across row seams',async()=>{
 let cases=0;
 for(const fixture of reference.cases){const pixels={width:fixture.width,height:fixture.height,data:new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url)))}, {budget,image}=await source(pixels);
  try{for(const rowsPerBlock of [1,7,128])for(const expected of fixture.expected.filter(e=>e.operation==='pixels.defects')){
   const actual=await segmentedDefects(image,defectParams(expected.params),{budget,rowsPerBlock}),data=await read(actual),label=JSON.stringify({name:fixture.name,params:expected.params,rowsPerBlock});
   assert.equal(hash(data.rgb.data),expected.pixels,label);assert.equal(hash(data.flags),expected.flags,label);assert.equal(hash(data.mask),expected.masks.candidates,label);assert.equal(hash(data.csv),expected.csvSha256,label);assert.equal(actual.data.count,expected.count,label);assert.equal(data.rows.length,actual.data.candidateCount*6);
   await dispose(actual);assert.equal(budget.retained,pixels.data.length);assert.equal(budget.active,0);cases++;
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(cases,1458);
});
test('Eight EXIF orientations preserve candidate coordinates/BGR order, flags and all three views',async()=>{
 const f=reference.cases.find(c=>c.name==='defects'),pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,orientation),oriented=await orientRgb(pixels,orientation);
  try{for(const radius of [1,2])for(const kind of [0,1,2])for(const mode of [0,1,2]){
   const p=defectParams({radius,kind,mode}),expected=await defectPixels(oriented,p),actual=await segmentedDefects(image,p,{budget,rowsPerBlock:3,forceExternalSort:orientation>=5}),data=await read(actual);
   assert.deepEqual(data.rgb,expected.pixels);assert.deepEqual(data.flags,expected.data.flags.data);assert.deepEqual(data.mask,expected.masks.candidates.data);assert.deepEqual(data.rows,expected.data.candidates);
   assert.deepEqual(data.csv,exportAnalysis({operation:'pixels.defects',status:'ok',...expected,provenance:{params:p}},{format:'csv'}).bytes);await dispose(actual);
  }
  for(const stopAt of [.1,.6,.85,1]){const controller=new AbortController();await assert.rejects(segmentedDefects(image,defectParams(),{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=stopAt)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.retained,pixels.data.length);assert.equal(budget.active,0);}
  }finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
