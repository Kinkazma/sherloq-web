import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initMedianWasm,medianBlockFeatures,medianHeapBytes} from '../src/median-features.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/median/reference.json',import.meta.url))),images=new Uint8Array(await readFile(new URL('../fixtures/median/'+reference.grayFile,import.meta.url))),hash=x=>createHash('sha256').update(x).digest('hex');
await initMedianWasm({wasmBinary:await readFile(new URL('../vendor/median/median.wasm',import.meta.url))});
test('All four median feature formats preserve native float32 model inputs and declared float64 tolerance',async()=>{
 assert.equal(hash(images),reference.graySha256);let outputs=0;
 for(const format of reference.formats){const bytes=await readFile(new URL('../fixtures/median/'+format.file,import.meta.url));assert.equal(hash(bytes),format.sha256);const expected=new Float64Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  for(let i=0;i<reference.images;i++){
   const actual=await medianBlockFeatures(images.subarray(i*4096,(i+1)*4096),format.features);assert.equal(actual.variance,reference.variance[i]);
   for(let c=0;c<format.features;c++){const want=expected[i*format.features+c];assert.equal(Math.fround(actual.features[c]),Math.fround(want),JSON.stringify({format:format.features,image:i,column:c}));assert.ok(Math.abs(actual.features[c]-want)<=1e-13*Math.max(1,Math.abs(want)));outputs++;}
   if(i<4){const scalar=await medianBlockFeatures(images.subarray(i*4096,(i+1)*4096),format.features,{fast:false});assert.deepEqual(actual,scalar);}
  }
 }assert.equal(outputs,9216);assert.ok(medianHeapBytes()<=64*1024**2);
});
test('Median block extraction rejects layout/format mismatches and pre-cancelled work',async()=>{
 await assert.rejects(medianBlockFeatures(new Uint8Array(4095),128),{code:'INVALID_INPUT'});await assert.rejects(medianBlockFeatures(new Uint8Array(4096),32),{code:'INVALID_INPUT'});await assert.rejects(medianBlockFeatures(new Uint8Array(4096),128,{signal:AbortSignal.abort()}),{code:'CANCELLED'});
});
