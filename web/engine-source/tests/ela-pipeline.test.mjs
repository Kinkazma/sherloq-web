import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';import {imageCodec} from '../src/codecs.js';import {initJpegWasm,jpegCodec} from '../src/jpeg.js';import {initCvWasm} from '../src/opencv.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const ref=JSON.parse(await readFile(new URL('./data/ela-pipeline-native.json',import.meta.url))),bytes=new Uint8Array(await readFile(new URL('./data/'+ref.file,import.meta.url)));
test('native ELA cell operation, background, one/64 Ghost phases, caches and NPZ',async()=>{
 let encodes=0;const codec={...imageCodec,recompress:async(...args)=>{encodes++;return jpegCodec.recompress(...args);}},engine=createEngine({codec,cpuKernel:'single'});
 try{await engine.load({id:'i',bytes});
  for(const [ci,item]of ref.cases.entries()){
   const result=await engine.run({id:'r',imageId:'i',operation:'ela.biomes',params:item.params});
   for(const [name,expected]of Object.entries(item.data)){
    if(name==='regions'){assert.deepEqual(result.data[name],expected);continue;}
    const flat=expected.flat(5).map(Number),actual=result.data[name];assert.equal(actual.length,flat.length);let max=0;for(let i=0;i<flat.length;i++)max=Math.max(max,Math.abs(actual[i]-flat[i]));assert.ok(max<=(name==='content'?3e-7:0),`${ci}/${name}: ${max}`);
   }
   const before=encodes,changed=await engine.run({id:'t',imageId:'i',operation:'ela.biomes',params:{...item.params,threshold:1,minimum:1}});assert.equal(encodes,before,'Threshold/minimum reuse preparations');assert.equal(changed.metrics.cellRecompressions,0);assert.equal(changed.metrics.ghostPhasesComputed,0);
   const exported=engine.exportResult(result,{format:'npz'});assert.ok(exported.bytes.length>0);if(ci===3)await writeFile(new URL('../.build/m5/ela-cells.npz',import.meta.url),exported.bytes);
  }
  assert.equal(encodes,3+71*64,'Each phase/quality computed once');
  await engine.run({id:'quality',imageId:'i',operation:'ela.biomes',params:{quality:80,block:16,ghost:false,background:false}});assert.equal(encodes,3+71*64+1,'Overlapping quality probes reused');
  assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{engine.dispose();}
});
test('cell operation cancellation and subsequent useful recovery',async()=>{
 const engine=createEngine({cpuKernel:'single'}),abort=new AbortController();try{await engine.load({id:'i',bytes});await assert.rejects(engine.run({id:'stop',imageId:'i',operation:'ela.biomes',params:{block:16,ghost:false}},{signal:abort.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0)abort.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const result=await engine.run({id:'recover',imageId:'i',operation:'ela.biomes',params:{block:16,ghost:false}});assert.equal(result.status,'ok');}finally{engine.dispose();}
});
