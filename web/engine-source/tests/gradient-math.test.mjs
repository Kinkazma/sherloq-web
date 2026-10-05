import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initGradientWasm,gradientDerivatives,gradientLengths,gradientRender,gradientLut,gradientHeapBytes,GRADIENT_HEAP_BYTES} from '../src/gradient-math.js';import {gradientToneLut} from '../src/segmented-gradient.js';
await initGradientWasm({wasmBinary:await readFile(process.env.GRADIENT_TEST_WASM??new URL('../vendor/gradient/gradient.wasm',import.meta.url))});
test('Staged arithmetic reproduces all 640 native gradient variants, including global normalization and equalization',async()=>{
 const reference=JSON.parse(await readFile(new URL('../fixtures/opencv-reference.json',import.meta.url)));let count=0;
 for(const f of reference.cases){const image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))},derivatives=await gradientDerivatives(image,0,image.height),stats=new Float64Array(6);stats.set(derivatives.stats);
  for(const e of f.expected.filter(e=>e.operation==='detail.gradient')){
   const p=e.params;if(p.mode===3)stats.set(await gradientLengths(derivatives.bytes,stats,p.invert),4);
   const base=await gradientRender(derivatives.bytes,stats,p,image.width*image.height),bytes=p.equalize||Math.trunc(p.intensity/100*127)>0?await gradientLut(base.bytes,gradientToneLut(base.histogram,image.width*image.height,p)):base.bytes;
   assert.equal(createHash('sha256').update(bytes).digest('hex'),e.sha256,`${f.name} ${JSON.stringify(p)}`);count++;
  }
 }assert.equal(count,640);assert.equal(gradientHeapBytes(),GRADIENT_HEAP_BYTES);
});
