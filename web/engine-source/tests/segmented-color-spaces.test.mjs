import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {segmentedColorSpaces} from '../src/segmented-color-spaces.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const operation=OPENCV_OPERATIONS['colors.space'],hash=data=>createHash('sha256').update(data).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
async function source(pixels,{orientation=1,limit=64*1024**2}={}){
 const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);
 return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget,orientation})}};
}
test('All 290 native color channels preserve complete rows across segmented seams and row-group boundaries',async()=>{
 let count=0;
 for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))}, {budget,image}=await source(pixels);
  try{for(const e of f.expected.filter(e=>e.operation==='colors.space'))for(const rowsPerBlock of [1,7]){
   const result=await segmentedColorSpaces(image,operation.validate(e.params),{budget,rowsPerBlock}),window=await result.surface.readWindow();assert.equal(hash(window.pixels.data),e.sha256,`${f.name} ${JSON.stringify(e.params)} rows=${rowsPerBlock}`);window.release();await result.surface.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);count++;
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(count,580);
});
test('Eight orientations preserve the oriented vector-prefix and scalar-tail positions',async()=>{
 const f=reference.cases.find(f=>f.name==='texture'),pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation);
  try{for(const e of f.expected.filter(e=>e.operation==='colors.space')){
   const p=operation.validate(e.params),result=await segmentedColorSpaces(image,p,{budget,rowsPerBlock:13}),window=await result.surface.readWindow(),expected=await operation.compute(oriented,p,{});
   assert.deepEqual(window.pixels,expected.pixels,`orientation=${orientation} ${JSON.stringify(p)}`);window.release();await result.surface.dispose();assert.equal(budget.active,0);
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
test('Cancellation disposes unpublished output; retry works, and too-small budgets refuse before input reads',async()=>{
 const pixels={width:37,height:43,format:'rgb8',data:Uint8Array.from({length:37*43*3},(_,i)=>i*31)},p=operation.validate({space:'hls',channel:2}),{budget,image}=await source(pixels),controller=new AbortController();
 await assert.rejects(segmentedColorSpaces(image,p,{budget,rowsPerBlock:3,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);
 const result=await segmentedColorSpaces(image,p,{budget}),window=await result.surface.readWindow();assert.deepEqual(window.pixels,(await operation.compute(pixels,p,{})).pixels);window.release();await result.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
 const small=new Budget(32*1024**2),virtual={surface:{descriptor:{width:10000,height:10000},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedColorSpaces(virtual,p,{budget:small}),{code:'MEMORY_LIMIT'});assert.equal(small.total(),0);
});
