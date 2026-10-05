import {residentBudget} from './resident-budget.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initZeroWasm,zeroArrays} from '../src/zero.js';import {initJpegWasm,jpegCodec} from '../src/jpeg.js';import {createEngine} from '../src/index.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const ref=JSON.parse(await readFile(new URL('../fixtures/zero-reference.json',import.meta.url)));
test('ZERO votes, detected/regularized masks and five views match native; significance preserves every decision',async()=>{
 await initZeroWasm({wasmBinary:await readFile(new URL('../vendor/zero/zero.wasm',import.meta.url))});await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});const engine=createEngine();let fallbacks=0;
 try{for(const f of ref.cases){const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url))),pixels={width:f.width,height:f.height,format:'rgb8',data:bytes};await engine.load({id:'i',bytes,pixels});const jpeg=await jpegCodec.recompress444(pixels,99);assert.deepEqual(jpeg.data,new Uint8Array(await readFile(new URL('../fixtures/'+f.companion,import.meta.url))),f.name+' JPEG99');
  for(const e of f.expected){const task={id:'z',imageId:'i',operation:'jpeg.zero',params:{missing:e.missing}},r=await engine.run(task);fallbacks+=r.metrics.thresholdFallbacks;for(const [key,a] of Object.entries(e.arrays))if(key==='grid_log10_nfa'){for(let i=0;i<64;i++){assert.ok(Math.abs(r.data[key][i]-a.values[i])<=1e-10,f.name+' significance');assert.equal(r.data[key][i]<0,a.values[i]<0);}}else assert.equal(hash(r.data[key]),a.sha256,f.name+' '+key);
   assert.equal(r.data.metadata.main_grid,e.metadata.main_grid);assert.equal(r.data.metadata.missing_grid_analyzed,e.metadata.missing_grid_analyzed);
   for(const key of ['foreign_regions','missing_regions']){assert.equal(r.data.metadata[key].length,e.metadata[key].length);for(let i=0;i<e.metadata[key].length;i++){const actual={...r.data.metadata[key][i]},expected={...e.metadata[key][i]};assert.ok(Math.abs(actual.log10_nfa-expected.log10_nfa)<=1e-10);delete actual.log10_nfa;delete expected.log10_nfa;assert.deepEqual(actual,expected);}}
   assert.equal(hash(r.pixels.data),e.views[0],f.name+' regions');r.data.votes.fill(99);
   for(let view=1;view<5;view++){const rendered=await engine.run({...task,params:{missing:e.missing,view}});assert.ok(rendered.metrics.cache.analysis);assert.equal(hash(rendered.pixels.data),e.views[view],f.name+' view '+view);}
  }engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);
 }assert.ok(fallbacks>0,'Corpus must exercise original-order fallback near the DCT threshold');
 }finally{engine.dispose();}
});
test('ZERO original-order CPU override agrees with the optimized threshold filter on a native positive case',async()=>{
 const f=ref.cases.find(x=>x.name==='spliced'),image={width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)))};
 const fast=await zeroArrays(image,null),serial=await zeroArrays(image,null,{}, {reference:true});for(const key of Object.keys(fast))if(ArrayBuffer.isView(fast[key]))assert.deepEqual(fast[key],serial[key]);assert.deepEqual(fast.metadata.foreign_regions,serial.metadata.foreign_regions);
});
test('ZERO significance retains native threshold decisions on 413 boundary samples',async()=>{
 const m=await initZeroWasm({wasmBinary:await readFile(new URL('../vendor/zero/zero.wasm',import.meta.url))}),large=JSON.parse(await readFile(new URL('../fixtures/zero-large-reference.json',import.meta.url)));
 for(const e of large.thresholds){const actual=m._log_nfa(e.n,e.k,e.p,e.lognt);assert.ok(Math.abs(actual-e.expected)<=1e-8);assert.equal(actual<0,e.expected<0);}
});
test('ZERO refuses an excessive working set before allocation and leaves a constrained engine usable',async()=>{
 const pixels={width:16,height:16,format:'rgb8',data:new Uint8Array(768)},engine=createEngine({memoryBudgetBytes:residentBudget(16*1024**2)});
 try{await engine.load({id:'i',bytes:pixels.data,pixels});await assert.rejects(engine.run({id:'z',imageId:'i',operation:'jpeg.zero'}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.imagePixels('i').data.length,768);engine.unload('i');await assert.rejects(zeroArrays({width:1,height:1,data:new Uint8Array(3)},null),{code:'INVALID_INPUT'});
 }finally{engine.dispose();}
});
test('Compact RGB8 luminance conversion matches the native rounding of all 16,777,216 colors',async()=>{
 const m=await initZeroWasm({wasmBinary:await readFile(new URL('../vendor/zero/zero.wasm',import.meta.url))}),e=JSON.parse(await readFile(new URL('../fixtures/zero-luminance-reference.json',import.meta.url))),n=256*256,input=m._malloc(n*3),output=m._malloc(n*8),hash=createHash('sha256'),rgb=new Uint8Array(n*3);
 try{for(let r=0;r<256;r++){for(let g=0;g<256;g++)for(let b=0;b<256;b++){const i=(g*256+b)*3;rgb[i]=r;rgb[i+1]=g;rgb[i+2]=b;}m.HEAPU8.set(rgb,input);m._zero_rgb_luminance(input,output,n);hash.update(Uint8Array.from(new Float64Array(m.HEAPU8.buffer,output,n)));}assert.equal(hash.digest('hex'),e.sha256);}finally{m._free(input);m._free(output);}
});
