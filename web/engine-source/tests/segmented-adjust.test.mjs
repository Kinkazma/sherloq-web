import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {initCvWasm} from '../src/opencv.js';import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {initAdjustWasm,adjustLocalRows,adjustTileHistogram} from '../src/adjust-math.js';import {segmentedAdjust} from '../src/segmented-adjust.js';
await initAdjustWasm({wasmBinary:await readFile(new URL('../vendor/adjust/adjust.wasm',import.meta.url))});await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const operation=OPENCV_OPERATIONS['inspection.adjust'],hash=b=>createHash('sha256').update(b).digest('hex'),reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));
async function source(pixels,{orientation=1,limit=80*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
test('All510 native adjustment outputs preserve stage order, global equalization/CLAHE and Otsu by row bands',async()=>{
 let outputs=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},{budget,image}=await source(pixels);
  for(const e of f.expected.filter(e=>e.operation==='inspection.adjust')){const r=await segmentedAdjust(image,operation.validate(e.params),{budget,rowsPerBlock:7}),window=await r.surface.readWindow();assert.equal(hash(window.pixels.data),e.sha256,f.name+' '+JSON.stringify(e.params));window.release();await r.surface.dispose();assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);outputs++;}
  await image.surface.dispose();assert.equal(budget.total(),0);
 }assert.equal(outputs,510);
});
test('Adjustment orientations, asymmetric CLAHE padding and sharp halos remain exact',async()=>{
 const pixels={width:32,height:33,format:'rgb8',data:Uint8Array.from({length:32*33*3},(_,i)=>i*37^(i>>>7))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation);
  for(let equalize=0;equalize<6;equalize++){const p=operation.validate({brightness:23,saturation:-17,hue:180,gamma:11,shadows:-25,highlights:30,sharpen:100,equalize,threshold:0,invert:true}),expected=await operation.compute(oriented,p,{}),actual=await segmentedAdjust(image,p,{budget,rowsPerBlock:3}),window=await actual.surface.readWindow();assert.deepEqual(window.pixels,expected.pixels);window.release();await actual.surface.dispose();if(equalize>=2)assert.deepEqual(actual.metrics.clahePaddedSize,[40,40]);}
  await image.surface.dispose();assert.equal(budget.total(),0);
 }
});
test('Adjustment cancels each pass without partial outputs and refuses impossible rows before reads',async()=>{
 const pixels={width:41,height:37,format:'rgb8',data:Uint8Array.from({length:41*37*3},(_,i)=>i*31^(i>>>3))},p=operation.validate({equalize:4,threshold:0,sharpen:100});
 for(const threshold of [.1,.51,.81,1]){const {budget,image}=await source(pixels),controller=new AbortController();await assert.rejects(segmentedAdjust(image,p,{budget,rowsPerBlock:3,signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.retained,pixels.data.length);const r=await segmentedAdjust(image,p,{budget});await r.surface.dispose();await image.surface.dispose();assert.equal(budget.total(),0);}
 const virtual={surface:{descriptor:{width:1000000,height:55},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedAdjust(virtual,p,{budget:new Budget(1024**3)}),{code:'MEMORY_LIMIT'});
 const low={surface:{descriptor:{width:100,height:100},readWindow(){assert.fail('Read before admission');}}};const budget=new Budget(32*1024**2);await assert.rejects(segmentedAdjust(low,p,{budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
});

test('Adjustment arithmetic rejects invalid LUT indices and global coordinate casts',async()=>{
 const image={width:1,height:1,format:'rgb8',data:new Uint8Array(3)};
 for(const params of [{gamma:0},{gamma:51},{equalize:6},{hue:-1}])await assert.rejects(adjustLocalRows(image,{...operation.validate(),...params},0,1),{code:'INVALID_INPUT'});
 assert.throws(()=>adjustTileHistogram(new Uint8Array(3),1,1,2147483648,8,2147483656),{code:'INVALID_INPUT'});
});
