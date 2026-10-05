import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {orientRgb} from '../src/image-headers.js';
import {medianParams,medianGeometry,medianGrayBlock,medianAnalyze,medianRender,medianGrid,medianEnlargeRows} from '../src/median.js';import {segmentedMedian,medianSurfaceReader} from '../src/segmented-median.js';import {initMedianWasm} from '../src/median-features.js';
const root=new URL('../fixtures/median/',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),reference=JSON.parse(await readFile(new URL('pipeline-reference.json',root)));
await initMedianWasm({wasmBinary:await readFile(new URL('../vendor/median/median.wasm',import.meta.url))});
async function source(pixels,{orientation=1,limit=48*1024**2}={}){const budget=new Budget(limit),store=await createSegmentedBytes(pixels.data.length,{budget,chunkBytes:113});await store.write(pixels.data);return{budget,image:{store,surface:createRgbSurface(store,{...pixels,budget,orientation})}};}
async function dispose(r){await r.surface.dispose();for(const m of Object.values(r.maskRecords))await m.surface.dispose();}
async function mask(s){const r=await s.readWindow();r.release();return r.pixels;}
const model8={metadata:{features:8},async predict(values){const scores=Float32Array.from({length:values.length/8},(_,i)=>Math.abs(values[i*8])%1);return{scores,margins:scores.slice(),release(){}};}};
test('Segmented median preserves native block features, padding, score border, views and independent grid masks',async()=>{
 let renders=0;for(const f of reference.cases){const pixels={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL(f.rgbFile,root)))},{budget,image}=await source(pixels),bytes=await readFile(new URL(f.featureFile,root)),features=new Float64Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));let completed=0;
  const g=medianGeometry(f.width,f.height),model={metadata:{features:128},async predict(input){const n=input.length/128;for(let i=0;i<input.length;i++)assert.equal(Math.fround(input[i]),Math.fround(features[completed*128+i]));const indices=Array.from({length:n},(_,i)=>Math.floor((completed+i)/g.blockColumns)*g.width+(completed+i)%g.blockColumns);completed+=n;return{scores:Float32Array.from(indices,i=>f.probabilities[i]),margins:Float32Array.from(indices,i=>f.margins[i]),release(){}};}};
  const selected=f.renders.filter((r,i)=>i===0||r.params.showScore||r.params.threshold===.4||r.params.threshold===1);
  for(const [i,e]of selected.entries()){
   const r=await segmentedMedian(image,medianParams(e.params),{budget,model,cacheKey:'image\0model',dependencies:['model'],rowsPerBlock:17}),pixels=await mask(r.surface),valid=await mask(r.maskRecords.valid.surface),decisions=await mask(r.maskRecords.decisions.surface);
   assert.equal(hash(pixels.data),e.rgbSha256);assert.deepEqual([...r.data.probabilities],f.probabilities);assert.deepEqual([...r.data.margins],f.margins);assert.deepEqual([...r.data.variances],f.variances);assert.deepEqual([...r.data.filtered],e.filtered);assert.deepEqual([...valid.data],e.valid);assert.deepEqual([...decisions.data],e.decisions);assert.ok(Math.abs(r.data.mean-e.mean)<=1e-14);assert.equal(r.metrics.analysisCacheHit,i!==0);if(i)assert.equal(r.metrics.sourceReads,0);
   r.data.probabilities.fill(99);await r.surface.dispose();assert.deepEqual((await mask(r.maskRecords.decisions.surface)).data,decisions.data);await dispose(r);assert.equal(budget.retained,pixels.width*pixels.height*3);assert.equal(budget.active,0);renders++;
  }
  assert.equal(completed,g.blockColumns*g.blockRows);budget.clearDependencies('model');assert.equal(budget.cacheBytes,0);await image.surface.dispose();assert.equal(budget.total(),0);
 }assert.equal(renders,95);
});
test('Median block reader respects all orientations, batch row crossings and divisible black padding',async()=>{
 const pixels={width:129,height:64,format:'rgb8',data:Uint8Array.from({length:129*64*3},(_,i)=>i*37^(i>>>7))};
 for(let orientation=1;orientation<=8;orientation++){
  const {budget,image}=await source(pixels,{orientation}),oriented=await orientRgb(pixels,orientation),g=medianGeometry(oriented.width,oriented.height),read=medianSurfaceReader(image.surface),count=g.blockColumns*g.blockRows;
  for(let i=0;i<count;i+=2){const n=Math.min(2,count-i),blocks=await read(i,n,g);for(let j=0;j<n;j++)assert.deepEqual(blocks.subarray(j*4096,(j+1)*4096),medianGrayBlock(oriented,i+j,g));}
  const p=medianParams({showScore:orientation%2===0,speckle:orientation%3===0}),expected=await medianRender(await medianAnalyze(oriented,model8),p),r=await segmentedMedian(image,p,{budget,model:model8,rowsPerBlock:3});assert.deepEqual(await mask(r.surface),expected.pixels);assert.deepEqual((await mask(r.maskRecords.decisions.surface)).data,expected.decisions);await dispose(r);await image.surface.dispose();assert.equal(budget.total(),0);
 }
});
test('Median interpolation row cuts keep absolute native coordinates around threshold and image edges',async()=>{
 for(const f of reference.synthetic){const g=medianGeometry(f.width,f.height),analysis={geometry:g,probabilities:Float32Array.from(f.probabilities),variances:Float64Array.from(f.variances)};for(const e of f.renders.filter(r=>r.params.threshold===.4||r.params.showScore)){
  const grid=await medianGrid(analysis,e.params),out=new Uint8Array(f.width*f.height*3);for(let y=0;y<f.height;y+=31)out.set(await medianEnlargeRows(grid.rgb,g,{start:y,rows:Math.min(31,f.height-y)}),y*f.width*3);assert.equal(hash(out),e.rgbSha256);
 }}
});
test('Median failure/cancellation frees every unpublished surface; refusal precedes source access',async()=>{
 const pixels={width:65,height:67,format:'rgb8',data:new Uint8Array(65*67*3).fill(127)};
 for(const threshold of [.1,.85,1]){const {budget,image}=await source(pixels),controller=new AbortController();await assert.rejects(segmentedMedian(image,medianParams(),{budget,model:model8,rowsPerBlock:3,cacheKey:'image\0model',signal:controller.signal,onProgress:f=>{if(f>=threshold)controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.cacheBytes,0);assert.equal(budget.retained,pixels.data.length);const r=await segmentedMedian(image,medianParams(),{budget,model:model8});await dispose(r);await image.surface.dispose();assert.equal(budget.total(),0);}
 const budget=new Budget(1024),image={surface:{descriptor:{width:10000,height:10000},readWindow(){assert.fail('Read before admission');}}};await assert.rejects(segmentedMedian(image,medianParams(),{budget,model:model8}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const s=await source(pixels);await assert.rejects(segmentedMedian(s.image,medianParams(),{budget:s.budget,model:{metadata:{features:8},predict(){throw new Error('prediction failed');}}}),/prediction failed/);assert.equal(s.budget.active,0);assert.equal(s.budget.retained,pixels.data.length);await s.image.surface.dispose();
});
