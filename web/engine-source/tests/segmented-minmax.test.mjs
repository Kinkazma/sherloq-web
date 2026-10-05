import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedMinmax} from '../src/segmented-minmax.js';import {minmaxParams,minmax} from '../src/minmax.js';import {orientRgb} from '../src/image-headers.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
async function dispose(result){await result.surface.dispose();await Promise.all(Object.values(result.maskRecords).map(record=>record.surface.dispose()));}
async function read(result){const rgb=await result.surface.readWindow(),low=await result.maskRecords.minimum.surface.readWindow(),high=await result.maskRecords.maximum.surface.readWindow();const data={pixels:rgb.pixels,masks:{minimum:low.pixels,maximum:high.pixels}};rgb.release();low.release();high.release();return data;}
test('Segmented extrema match native RGB and both masks across channels, colors, density filters and row groups',async()=>{
 let cases=0;
 for(const fixture of reference.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url))),budget=new Budget(2*1024**2),store=await createSegmentedBytes(bytes.length,{budget,chunkBytes:113});await store.write(bytes);const image={store,surface:createRgbSurface(store,{width:fixture.width,height:fixture.height,budget})};
  try{for(const rowsPerBlock of [1,7,128])for(const expected of fixture.expected.filter(e=>e.operation==='noise.minmax')){
   const result=await segmentedMinmax(image,minmaxParams(expected.params),{budget,rowsPerBlock}),actual=await read(result);
   assert.equal(hash(actual.pixels.data),expected.pixels,JSON.stringify({file:fixture.file,params:expected.params,rowsPerBlock}));for(const name of ['minimum','maximum'])assert.equal(hash(actual.masks[name].data),expected.masks[name]);await dispose(result);assert.equal(budget.retained,bytes.length);assert.equal(budget.active,0);cases++;
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(cases,2754);
});
test('Oriented density grids preserve global anchoring, small borders and cancellation at each stage',async()=>{
 for(const [width,height] of [[29,23],[1,1],[1,19],[3,2],[8,8]])for(let orientation=1;orientation<=8;orientation++){
  const pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i*37^(i>>>3))},budget=new Budget(65536),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);const image={store,surface:createRgbSurface(store,{...pixels,orientation,budget})};
  try{
   for(const filter of [0,1,2,3,4,5])for(const [minimum,maximum] of [[1,0],[3,3],[4,4],[4,3],[3,4]]){const params=minmaxParams({channel:4,minimum,maximum,filter}),actual=await segmentedMinmax(image,params,{budget,rowsPerBlock:3}),expected=await minmax(await orientRgb(pixels,orientation),params),data=await read(actual);assert.deepEqual(data.pixels,expected.pixels,JSON.stringify({width,height,orientation,filter,minimum,maximum}));assert.deepEqual(data.masks,expected.masks);await dispose(actual);}
   for(const stopAt of [.1,.6,.8]){const controller=new AbortController();await assert.rejects(segmentedMinmax(image,minmaxParams({filter:1}),{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=stopAt)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.retained,pixels.data.length);assert.equal(budget.active,0);}
  }finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
test('A failed temporary mask write releases every unpublished surface without losing the source',async()=>{
 const budget=new Budget(150000),store=await createSegmentedBytes(30000,{budget}),bytes=new Uint8Array(30000);await store.write(bytes);let created=0,disposed=0;
 const session={create:async()=>{created++;return {write(){throw Object.assign(new Error('Injected quota failure'),{code:'STORAGE_QUOTA'});},dispose(){disposed++;}};}},image={store,session,surface:createRgbSurface(store,{width:100,height:100,budget})};
 await assert.rejects(segmentedMinmax(image,minmaxParams(),{budget,rowsPerBlock:7}),{code:'STORAGE_QUOTA'});assert.equal(created,3,'Both masks and the RGB output use temporary storage because their migration capacity does not fit');assert.equal(disposed,created,'Every unpublished temporary plane is deleted');assert.equal(budget.retained,30000);assert.equal(budget.active,0);const window=await image.surface.readWindow({x:0,y:0,width:3,height:3});assert.ok(window.pixels.data.every(x=>x===0));window.release();await image.surface.dispose();assert.equal(budget.total(),0);
});
