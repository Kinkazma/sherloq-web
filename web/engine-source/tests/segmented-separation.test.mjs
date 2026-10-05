import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {segmentedSeparation,separationEqualizeLuts} from '../src/segmented-separation.js';import {initSeparationWasm} from '../src/separation-math.js';import {initCvWasm} from '../src/opencv.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),operation=OPENCV_OPERATIONS['noise.separation'],reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
await initSeparationWasm({wasmBinary:await readFile(new URL('../vendor/separation/separation.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
async function source(pixels,{orientation=1,limit=80*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
test('All1680 native separation outputs retain five filters, residuals, global equalization and LUTs',async()=>{
 let outputs=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},{budget,image}=await source(pixels);
  for(const e of f.expected.filter(e=>e.operation==='noise.separation')){const r=await segmentedSeparation(image,operation.validate(e.params),{budget,rowsPerBlock:31}),window=await r.surface.readWindow();assert.equal(hash(window.pixels.data),e.sha256,f.name+' '+JSON.stringify(e.params));window.release();await r.surface.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);outputs++;}
  await image.surface.dispose();assert.equal(budget.total(),0);
 }assert.equal(outputs,1680);
});
test('Separation supports oriented row widths, minimal halos, cancellation at filter/equalization and retry',async()=>{
 const pixels={width:37,height:41,format:'rgb8',data:Uint8Array.from({length:37*41*3},(_,i)=>i*37^(i>>>7))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation);
  for(let mode=0;mode<5;mode++){const p=operation.validate({mode,radius:mode%2?10:2,grayscale:orientation%2===0,levels:0}),expected=await operation.compute(oriented,p,{}),actual=await segmentedSeparation(image,p,{budget,rowsPerBlock:3}),window=await actual.surface.readWindow();assert.deepEqual(window.pixels,expected.pixels);window.release();await actual.surface.dispose();}
  await image.surface.dispose();assert.equal(budget.total(),0);
 }
 for(const threshold of [.1,.81,1]){const {budget,image}=await source(pixels),controller=new AbortController(),p=operation.validate({mode:2,levels:0});await assert.rejects(segmentedSeparation(image,p,{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);const r=await segmentedSeparation(image,p,{budget});await r.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);}
 const budget=new Budget(32*1024**2),virtual={surface:{descriptor:{width:10000,height:10000},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedSeparation(virtual,operation.validate(),{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const wide={surface:{descriptor:{width:1000000,height:33},readWindow(){assert.fail('Heap refusal before reads');}}};await assert.rejects(segmentedSeparation(wide,operation.validate({mode:4}),{budget:new Budget(1024**3)}),{code:'MEMORY_LIMIT'});
});
