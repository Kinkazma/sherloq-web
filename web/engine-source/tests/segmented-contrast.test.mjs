import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {initContrastWasm} from '../src/contrast-math.js';import {segmentedContrast} from '../src/segmented-contrast.js';import {initCvWasm,cvContrast,cvContrastView} from '../src/opencv.js';
await initContrastWasm({wasmBinary:await readFile(new URL('../vendor/contrast/contrast.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const hash=values=>createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/contrast-reference.json',import.meta.url)));
reference.cases.push(...JSON.parse(await readFile(new URL('../fixtures/contrast-reduction-reference.json',import.meta.url))).cases);
async function source(pixels,{orientation=1,limit=128*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
test('All53 native maps and159 views preserve segmented halos, black padding, extra grid row/column and cache',async()=>{
 let count=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},{budget,image}=await source(pixels);
  for(const e of f.expected)for(let mode=0;mode<3;mode++){
   const result=await segmentedContrast(image,{block:e.block,mode},{budget,cacheKey:'source\0contrast/'}),window=await result.surface.readWindow();assert.equal(hash(window.pixels.data),e.views[mode],f.name+' view '+mode);assert.equal(hash(result.data.values),e.sha256,f.name+' map '+e.block);assert.deepEqual([result.data.rows,result.data.cols,3],e.shape);window.release();if(mode){assert.equal(result.metrics.analysisCacheHit,true);assert.equal(result.metrics.sourceReads,0);}result.data.values.fill(-1);await result.surface.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);count++;
  }await image.surface.dispose();budget.clear();assert.equal(budget.total(),0);
 }assert.equal(count,159);
});
test('Contrast eight orientations and partial cells preserve native maps and cancellation ownership',async()=>{
 const pixels={width:67,height:71,format:'rgb8',data:Uint8Array.from({length:67*71*3},(_,i)=>i*37^(i>>>7))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation);
  for(const block of [32,64]){const maps=await cvContrast(oriented,block);for(let mode=0;mode<3;mode++){const result=await segmentedContrast(image,{block,mode},{budget,cacheKey:'source\0contrast/'}),window=await result.surface.readWindow();assert.deepEqual(result.data.values,maps.values);assert.deepEqual(window.pixels,await cvContrastView(maps,oriented.width,oriented.height,block,mode));window.release();await result.surface.dispose();}}
  await image.surface.dispose();budget.clear();assert.equal(budget.total(),0);
 }
 for(const threshold of [.1,.8,1]){const {budget,image}=await source(pixels),controller=new AbortController();await assert.rejects(segmentedContrast(image,{block:32,mode:2},{budget,cacheKey:'source\0contrast/',signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.cacheBytes,0);assert.equal(budget.retained,pixels.data.length);const result=await segmentedContrast(image,{block:32,mode:2},{budget});await result.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);}
 for(const width of [10000,1000000]){const budget=new Budget(64*1024**2),virtual={surface:{descriptor:{width,height:10000},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedContrast(virtual,{block:256,mode:2},{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);}
});
