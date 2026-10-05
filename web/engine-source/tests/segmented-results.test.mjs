import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {segmentedPixelStats,createResultSurfaces} from '../src/segmented-results.js';import {statsParams,pixelStats} from '../src/pixel-stats.js';import {orientRgb} from '../src/image-headers.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/pixel-reference.json',import.meta.url)));
test('Segmented channel ranks preserve all six native variants across arbitrary storage seams',async()=>{
 let cases=0;
 for(const fixture of reference.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+fixture.file,import.meta.url)));
  for(const chunkBytes of [2,113,16384]){
   const budget=new Budget(2*1024**2),store=await createSegmentedBytes(bytes.length,{budget,chunkBytes});await store.write(bytes);
   const image={store,surface:createRgbSurface(store,{width:fixture.width,height:fixture.height,budget})};
   try{for(const expected of fixture.expected.filter(e=>e.operation==='colors.stats')){
    const output=await segmentedPixelStats(image,statsParams(expected.params),{budget});const window=await output.surface.readWindow();
    assert.equal(hash(window.pixels.data),expected.pixels);window.release();await output.surface.dispose();assert.equal(budget.retained,bytes.length);assert.equal(budget.active,0);cases++;
   }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
  }
 }assert.equal(cases,162);
});
test('Result windows retain exact orientation and owned lifetime; cancellation never publishes partial output',async()=>{
 const pixels={width:17,height:13,format:'rgb8',data:Uint8Array.from({length:17*13*3},(_,i)=>i*37^(i>>>3))},params=statsParams({mode:'avg',inclusive:true});
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(65536),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);
  const source=createRgbSurface(store,{...pixels,orientation,budget}),image={store,surface:source},surfaces=new Map([[source.descriptor.id,{record:image}]]),manager=createResultSurfaces(surfaces);
  const result=await segmentedPixelStats(image,params,{budget}),descriptor=manager.publish('source',result),actual=await result.surface.readWindow(),expected=await pixelStats(await orientRgb(pixels,orientation),params);
  assert.deepEqual(actual.pixels,expected.pixels);actual.release();assert.equal(manager.hasFor('source'),true);await assert.rejects(manager.release(source.descriptor.id),{code:'INVALID_INPUT'});
  await manager.release(descriptor.id);assert.equal(surfaces.has(descriptor.id),false);await assert.rejects(result.surface.readWindow(),{code:'DISPOSED'});assert.equal(budget.retained,pixels.data.length);
  const controller=new AbortController();await assert.rejects(segmentedPixelStats(image,params,{budget,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.retained,pixels.data.length);assert.equal(budget.active,0);await source.dispose();assert.equal(budget.total(),0);
 }
});
test('Paired result ownership releases the output before either source storage closes',async()=>{
 const budget=new Budget(1024),store=await createSegmentedBytes(12,{budget}),surfaces=new Map(),manager=createResultSurfaces(surfaces),surface=createRgbSurface(store,{width:2,height:2,budget});
 const descriptor=manager.publish('evidence',{surface,pairedSourceIds:['evidence','reference']});assert.equal(manager.hasAny(),true);assert.equal(manager.hasFor('reference'),true);await manager.clear('reference');assert.equal(manager.hasAny(),false);assert.equal(surfaces.has(descriptor.id),false);assert.equal(budget.total(),0);await assert.rejects(surface.readWindow(),{code:'DISPOSED'});
});
