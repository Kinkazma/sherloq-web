import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {initCvWasm} from '../src/opencv.js';import {createEngine} from '../src/index.js';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
test('Stereo arithmetic shortcuts match software FMA on signed random bits, halfway traps and IEEE boundary cases',async()=>{
 const m=await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});for(const seed of [9744,1,0xabcdef01])assert.equal(m._cv_stereo_fma_test(seed,2000000),0,'FMA seed '+seed);
});
test('Stereogram native periodicity, lazy flow, all views and absent-period outcomes are exact',async()=>{
 await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
 const ref=JSON.parse(await readFile(new URL('../fixtures/stereo-reference.json',import.meta.url))),engine=createEngine();
 try{for(const f of ref.cases){
  const bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});
  for(let mode=0;mode<4;mode++){
   const r=await engine.run({id:'s',imageId:'i',operation:'various.stereogram',params:{mode}});
   assert.equal(r.data.offset,f.offset,f.name);assert.equal(r.data.detected,f.offset!==null);assert.deepEqual(Array.from(r.data.differences),f.difference??[]);
   assert.equal(r.metrics.cache.analysis,mode%2===1);assert.ok(!('pattern' in r));
   if(f.offset===null){assert.equal(r.pixels,undefined);assert.equal(r.data.flow,undefined);continue;}
   assert.equal(hash(r.pixels.data),f.views[mode],f.name+' view '+mode);assert.equal(r.pixels.width,f.width-f.offset);assert.equal(r.pixels.height,f.height);
   if(mode<2)assert.equal(r.data.flow,undefined);else{assert.equal(hash(r.data.flow),f.flowSha256,f.name+' flow');r.data.flow.fill(17);}
   if(mode===2){assert.equal(r.metrics.cache.stages.search,true);assert.equal(r.metrics.cache.stages.pattern,true);assert.equal(r.metrics.cache.stages.flow,false);}
   r.pixels.data.fill(17);r.data.differences.fill(-1);
  }
  engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);
 }}finally{engine.dispose();}
});
test('Stereo original arithmetic remains selectable independently of the optimized engine',async()=>{
 const ref=JSON.parse(await readFile(new URL('../fixtures/stereo-reference.json',import.meta.url))),f=ref.cases.find(f=>f.name==='odd'),bytes=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url))),engine=createEngine({cpuKernel:'reference'});
 try{await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});const r=await engine.run({id:'s',imageId:'i',operation:'various.stereogram',params:{mode:3}});assert.equal(r.metrics.kernel,'cpu-pinned-fma-reference');assert.equal(hash(r.data.flow),f.flowSha256);assert.equal(hash(r.pixels.data),f.views[3]);}finally{engine.dispose();}
});
