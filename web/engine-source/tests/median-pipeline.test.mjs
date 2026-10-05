import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {medianParams,medianGeometry,medianGrayBlock,medianAnalyze,medianRender} from '../src/median.js';
import {initMedianWasm} from '../src/median-features.js';
const directory=new URL('../fixtures/median/',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const reference=JSON.parse(await readFile(new URL('pipeline-reference.json',directory)));
await initMedianWasm({wasmBinary:await readFile(new URL('../vendor/median/median.wasm',import.meta.url))});
test('Median score filtering, variance/threshold decisions and linear64 RGB crops match native rendering',async()=>{
 let count=0;for(const item of [...reference.cases,...reference.synthetic]){
  const geometry=medianGeometry(item.width,item.height);assert.equal(geometry.width,item.gridWidth);assert.equal(geometry.height,item.gridHeight);
  const analysis={geometry,probabilities:Float32Array.from(item.probabilities),variances:Float64Array.from(item.variances)};
  for(const expected of item.renders){const actual=await medianRender(analysis,expected.params);assert.equal(hash(actual.pixels.data),expected.rgbSha256,JSON.stringify({shape:[item.width,item.height],...expected.params}));assert.deepEqual([...actual.filtered],expected.filtered);assert.deepEqual([...actual.valid],expected.valid);assert.deepEqual([...actual.decisions],expected.decisions);assert.ok(Math.abs(actual.mean-expected.mean)<=1e-14);assert.equal(actual.validBlocks,expected.valid.reduce((a,b)=>a+b,0));count++;}
 }assert.equal(count,3252);
});
test('Median RGB luminance, black padding, complete batches and zero score border match native inputs',async()=>{
 for(const item of reference.cases){
  const data=new Uint8Array(await readFile(new URL(item.rgbFile,directory)));assert.equal(hash(data),item.rgbSha256);const image={width:item.width,height:item.height,format:'rgb8',data},geometry=medianGeometry(item.width,item.height),gray=new Uint8Array(item.width*item.height);
  for(let i=0;i<geometry.blockRows*geometry.blockColumns;i++){const block=medianGrayBlock(image,i,geometry);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const yy=Math.floor(i/geometry.blockColumns)*64+y,xx=i%geometry.blockColumns*64+x;if(yy<item.height&&xx<item.width)gray[yy*item.width+xx]=block[y*64+x];else assert.equal(block[y*64+x],0);}}
  assert.equal(hash(gray),item.graySha256);
  const buffer=await readFile(new URL(item.featureFile,directory));assert.equal(hash(buffer),item.featureSha256);const expected=new Float64Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length));let completed=0,released=0;
  const model={metadata:{features:128},async predict(input){for(let j=0;j<input.length;j++)assert.equal(Math.fround(input[j]),Math.fround(expected[completed*128+j]));const start=completed,count=input.length/128;completed+=count;return {scores:Float32Array.from({length:count},(_,i)=>(i+start)/100),margins:new Float32Array(count),release:()=>released++};}};
  const analysis=await medianAnalyze(image,model,{batchSize:3});assert.equal(completed,geometry.blockRows*geometry.blockColumns);assert.equal(released,Math.ceil(completed/3));assert.deepEqual([...analysis.variances],item.variances);
  for(let y=0;y<geometry.height;y++)for(let x=0;x<geometry.width;x++)assert.equal(analysis.probabilities[y*geometry.width+x],y===geometry.blockRows||x===geometry.blockColumns?0:Math.fround((y*geometry.blockColumns+x)/100));
 }
});
test('Median parameters and cancellation reject incomplete work',async()=>{
 assert.deepEqual(medianParams(),{modelId:'',variance:5,threshold:.4,showScore:false,speckle:true});
 for(const p of [{threshold:NaN},{threshold:1.01},{variance:.5},{speckle:1},{quality:75}])assert.throws(()=>medianParams(p),{code:'INVALID_INPUT'});
 const analysis={geometry:medianGeometry(64,64),probabilities:new Float32Array(9),variances:new Float64Array(9)};
 await assert.rejects(medianRender(analysis,{}, {signal:AbortSignal.abort()}),{code:'CANCELLED'});
 const controller=new AbortController(),image={width:64,height:64,format:'rgb8',data:new Uint8Array(64*64*3)};let releases=0;
 const model={metadata:{features:8},async predict(input){return {scores:new Float32Array(input.length/8),margins:new Float32Array(input.length/8),release:()=>releases++};}};
 await assert.rejects(medianAnalyze(image,model,{batchSize:1,signal:controller.signal,onProgress:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(releases,1);
});
