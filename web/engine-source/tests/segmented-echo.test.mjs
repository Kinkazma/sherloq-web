import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {initEchoWasm} from '../src/echo-math.js';import {segmentedEcho} from '../src/segmented-echo.js';
await initEchoWasm({wasmBinary:await readFile(new URL('../vendor/echo/echo.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const operation=OPENCV_OPERATIONS['detail.echo'],hash=data=>createHash('sha256').update(data).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
async function source(pixels,{orientation=1,limit=128*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
test('All 900 native Echo views preserve radius halos and global normalization over segmented stores',async()=>{
 let count=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))}, {budget,image}=await source(pixels);
  try{for(const e of f.expected.filter(e=>e.operation==='detail.echo')){const result=await segmentedEcho(image,operation.validate(e.params),{budget,rowsPerBlock:7}),window=await result.surface.readWindow();assert.equal(hash(window.pixels.data),e.sha256,`${f.name} ${JSON.stringify(e.params)}`);window.release();await result.surface.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);count++;}}
  finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }assert.equal(count,900);
});
test('Oriented image edges and small row groups retain the native radius1/4/5/15 behavior',async()=>{
 const f=reference.cases[0],pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation);
  try{for(const radius of [1,4,5,15])for(const rowsPerBlock of [1,5,67]){
   const p=operation.validate({radius,grayscale:orientation%2===0}),result=await segmentedEcho(image,p,{budget,rowsPerBlock}),window=await result.surface.readWindow();assert.deepEqual(window.pixels,(await operation.compute(oriented,p,{})).pixels,`orientation=${orientation}, radius=${radius}, rows=${rowsPerBlock}`);window.release();await result.surface.dispose();assert.equal(budget.active,0);
  }}finally{await image.surface.dispose();}assert.equal(budget.total(),0);
 }
});
test('Echo cancellation disposes derivative/output stores and admits retry; low memory refuses before reads',async()=>{
 const pixels={width:41,height:37,format:'rgb8',data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3))},p=operation.validate({radius:15,grayscale:true});
 for(const threshold of [.1,.8,1]){const {budget,image}=await source(pixels),controller=new AbortController();await assert.rejects(segmentedEcho(image,p,{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);
  const result=await segmentedEcho(image,p,{budget}),window=await result.surface.readWindow();assert.deepEqual(window.pixels,(await operation.compute(pixels,p,{})).pixels);window.release();await result.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);
 }
 const budget=new Budget(64*1024**2),virtual={surface:{descriptor:{width:10000,height:10000},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedEcho(virtual,p,{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
});
