import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {jpegCodec,initJpegWasm} from '../src/jpeg.js';import {jpegQuality,tableEstimate} from '../src/jpeg-quality.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
const ref=JSON.parse(await readFile(new URL('../fixtures/quality-reference.json',import.meta.url)));
test('Native JPEG quality tables, all 100 grayscale recompressions and final minimum agree',async()=>{
 for(const f of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url))),image=await jpegCodec.decode(bytes),{data}=await jpegQuality(image,{}, {},{bytes,codec:jpegCodec});
  assert.deepEqual(data.quantization,f.quantization,f.file+' quantization');assert.deepEqual(Array.from(data.raw),f.raw,f.file+' raw');
  assert.deepEqual(Array.from(data.curve),f.curve,f.file+' binary64 curve');
  assert.equal(data.minimum,f.minimum,f.file+' minimum');assert.equal(data.estimate.quality,f.estimate.quality);assert.equal(data.estimate.deviation,f.estimate.deviation);assert.deepEqual(Array.from(data.estimate.distance),f.estimate.distance);
 }
});
test('Quantization estimator does not fabricate absent component tables',()=>{assert.equal(tableEstimate({},[0,1,1]),null);assert.equal(tableEstimate({},[0,1,2,3]),null);});
