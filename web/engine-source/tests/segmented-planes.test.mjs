import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedBitPlanes} from '../src/segmented-planes.js';import {planesParams,bitPlanes} from '../src/bit-planes.js';import {orientRgb} from '../src/image-headers.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
async function dispose(result){await result.surface.dispose();await result.maskRecords.plane.surface.dispose();}
test('Segmented bit planes retain all native channels/bits/filters, raw masks and global borders across row groups',async()=>{
 let cases=0;
 for(const fixture of reference.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url))),budget=new Budget(2*1024**2),store=await createSegmentedBytes(bytes.length,{budget,chunkBytes:113});await store.write(bytes);const image={store,surface:createRgbSurface(store,{width:fixture.width,height:fixture.height,budget})};
  try{for(const rowsPerBlock of [1,7,128])for(const expected of fixture.expected.filter(e=>e.operation==='noise.planes')){
   const result=await segmentedBitPlanes(image,planesParams(expected.params),{budget,rowsPerBlock}),pixels=await result.surface.readWindow(),mask=await result.maskRecords.plane.surface.readWindow();
   assert.equal(hash(pixels.pixels.data),expected.pixels);assert.equal(hash(mask.pixels.data),expected.masks.plane);assert.equal(mask.pixels.format,'mask8');assert.deepEqual(mask.pixels.range,[0,1]);pixels.release();mask.release();await dispose(result);assert.equal(budget.retained,bytes.length);assert.equal(budget.active,0);cases++;
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(cases,3240);
});
test('Mask/display orientation is exact and cancellation releases both unpublished arrays',async()=>{
 const pixels={width:17,height:13,format:'rgb8',data:Uint8Array.from({length:17*13*3},(_,i)=>i*37^(i>>>3))};
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(65536),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);const image={store,surface:createRgbSurface(store,{...pixels,orientation,budget})};
  try{
   for(const filter of [0,1,2]){const params=planesParams({channel:4,bit:3,filter}),actual=await segmentedBitPlanes(image,params,{budget,rowsPerBlock:3}),expected=await bitPlanes(await orientRgb(pixels,orientation),params),rgb=await actual.surface.readWindow(),mask=await actual.maskRecords.plane.surface.readWindow();assert.deepEqual(rgb.pixels,expected.pixels);assert.deepEqual(mask.pixels,expected.masks.plane);rgb.release();mask.release();await dispose(actual);}
   for(const stopAt of [.1,.6]){const controller=new AbortController();await assert.rejects(segmentedBitPlanes(image,planesParams(),{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=stopAt)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.retained,pixels.data.length);assert.equal(budget.active,0);}
  }finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
