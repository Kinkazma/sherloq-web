import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {segmentedFrequency} from '../src/segmented-frequency.js';
import {frequencyParams} from '../src/frequency.js';
import {initCvWasm,cvFrequencyBase,cvFrequencyView} from '../src/opencv.js';
await initCvWasm({wasmBinary:await readFile(new URL(import.meta.resolve('../vendor/opencv/opencv.wasm')))});
const frames=r=>[r.surface,...['high','magnitude','phase'].map(k=>r.rgbRecords[k].surface)];
const release=async r=>Promise.all([...frames(r),r.tableRecords.mask.surface].map(v=>v.dispose()));
const fixture=(width,height)=>({width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*131)%256)});
const params=[{split:0,smooth:0,threshold:0,filter:0},{split:100,smooth:100,threshold:100,filter:15},{split:15,smooth:25,threshold:37,filter:3},{split:50,smooth:5,threshold:0,filter:1},{split:0,smooth:100,threshold:99,filter:15},{split:100,smooth:0,threshold:1,filter:0}];
for(const [width,height] of [[1,1],[1,9],[13,1],[19,17],[41,37],[53,49]])test(`native complete frequency pipeline preserves all four views and float32 weights at ${width}x${height}`,async()=>{
 const pixels=fixture(width,height),budget=new Budget(96*1024**2),image={surface:contiguousSurface(pixels,budget)},base=await cvFrequencyBase(pixels);let cache;
 try{for(const p of params){const expected=await cvFrequencyView(base,width,height,[p.split,p.smooth,p.threshold,p.filter]),actual=await segmentedFrequency(image,p,{budget,cache,blockPixels:137});cache=actual.frequencyCache;
  try{assert.deepEqual(actual.data.frequencyDimensions,[base.width,base.height]);assert.equal(actual.data.zeroPercent,expected.zeroPercent);for(const [index,surface]of frames(actual).entries()){const part=await surface.readWindow();try{assert.deepEqual([part.pixels.width,part.pixels.height],[expected.frames[index].width,expected.frames[index].height]);assert.deepEqual(part.pixels.data,expected.frames[index].data,JSON.stringify(p)+' frame'+index);}finally{part.release();}}
   const table=await actual.tableRecords.mask.surface.readRows({offset:0,length:base.width*base.height});try{const weights=Float32Array.from({length:table.length},(_,i)=>{assert.equal(table.data[i*3],Math.floor(i/base.width));assert.equal(table.data[i*3+1],i%base.width);return table.data[i*3+2];});assert.deepEqual(new Uint32Array(weights.buffer),new Uint32Array(expected.frames[4].data.buffer));}finally{table.release();}
  }finally{await release(actual);}
 }}finally{await cache?.dispose();}assert.equal(budget.total(),0);
});
test('frequency parameters reject noninteger, out-of-range, nonfinite and undeclared controls',()=>{for(const p of [{split:-1},{split:101},{smooth:101},{smooth:NaN},{threshold:Infinity},{threshold:0.5},{filter:16},{filter:-1},{backend:'cpu'},null,[]])assert.throws(()=>frequencyParams(p),{code:'INVALID_INPUT'});assert.deepEqual(frequencyParams(),{split:15,smooth:25,threshold:0,filter:0});});
test('frequency admission rejects a nonfitting complete axis before reading source samples',async()=>{const budget=new Budget(8*1024**2);let reads=0;await assert.rejects(segmentedFrequency({surface:{descriptor:{width:1000,height:1000},readWindow(){reads++;throw Error('not admitted');}}},{},{budget}),{code:'MEMORY_LIMIT'});assert.equal(reads,0);assert.equal(budget.total(),0);});
test('frequency source I/O failure preserves its error and releases the whole uncommitted transform',async()=>{const budget=new Budget(48*1024**2),failure=Object.assign(Error('Injected bounded RGB read failure'),{code:'STORAGE_IO'});await assert.rejects(segmentedFrequency({surface:{descriptor:{width:19,height:17},readWindow:async()=>{throw failure;}}},{},{budget,blockPixels:137}),e=>e===failure);assert.equal(budget.total(),0);});
test('frequency temporary write failure never falls back to a zero or partial scientific plane',async()=>{const budget=new Budget(48*1024**2),failure=Object.assign(Error('Injected temporary write failure'),{code:'STORAGE_IO'});let live=0,created=0;const session={async create(){created++;live++;return{readInto(){throw Error('No completed data may be read');},write(){throw failure;},flush(){},dispose(){live--;}};}};await assert.rejects(segmentedFrequency({surface:contiguousSurface(fixture(19,17),budget),session},{},{budget,blockPixels:137,storage:'temporary'}),e=>e===failure);assert(created>0);assert.equal(live,0);assert.equal(budget.total(),0);});
