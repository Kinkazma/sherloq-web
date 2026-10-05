import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';import {initJpegWasm,jpegCodec} from '../src/jpeg.js';import {initCvWasm} from '../src/opencv.js';import {imageCodec} from '../src/codecs.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const ref=JSON.parse(await readFile(new URL('./data/recompression-native.json',import.meta.url)));
test('historical 101-quality loss through original PNG, cached quality estimation and CSV export',async()=>{
 let calls=0;const codec={...imageCodec,recompressGray:async(...args)=>{calls++;return jpegCodec.recompressGray(...args);}},engine=createEngine({codec,cpuKernel:'single'});
 try{for(const [index,f] of ref.cases.entries()){
   const bytes=new Uint8Array(await readFile(new URL('./data/'+f.file,import.meta.url)));await engine.load({id:'i',bytes});calls=0;
   // Cover cache reuse in both directions: Q0 only extra, or no extra qualities.
   if(index%2)await engine.run({id:'quality',imageId:'i',operation:'jpeg.quality'});
   const r=await engine.run({id:'curve',imageId:'i',operation:'jpeg.recompression'});
   assert.deepEqual([...r.data.qualities],Array.from({length:101},(_,i)=>i));assert.deepEqual([...r.data.raw],f.raw);assert.equal(calls,101);assert.equal(r.metrics.recompressions,index%2?1:101);
   const q=await engine.run({id:'quality',imageId:'i',operation:'jpeg.quality'});assert.deepEqual([...q.data.raw],f.raw.slice(1));assert.equal(calls,101);
   const csv=new TextDecoder().decode(engine.exportResult(r,{format:'csv'}).bytes).trim().split('\r\n');assert.equal(csv.length,102);assert.equal(csv[0],'jpeg_quality,mean_absolute_pixel_error_0_255');assert.equal(csv.at(-1),'100,'+f.raw[100]);
   r.data.raw.fill(-1);const again=await engine.run({id:'again',imageId:'i',operation:'jpeg.recompression'});assert.deepEqual([...again.data.raw],f.raw);assert.ok(again.metrics.cache.result);assert.equal(calls,101);
   await assert.rejects(engine.run({id:'bad',imageId:'i',operation:'jpeg.recompression',params:{quality:75}}),{code:'INVALID_INPUT'});engine.unload('i');assert.equal(engine.capabilities().memory.cacheBytes,0);
 }}finally{engine.dispose();}
});
test('recompression cancellation frees active admission and permits a subsequent useful run',async()=>{
 const engine=createEngine({cpuKernel:'single'}),f=ref.cases[1],bytes=new Uint8Array(await readFile(new URL('./data/'+f.file,import.meta.url)));await engine.load({id:'i',bytes});const abort=new AbortController();
 try{await assert.rejects(engine.run({id:'stop',imageId:'i',operation:'jpeg.recompression'},{signal:abort.signal,onProgress:e=>{if(e.fraction>0)abort.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const r=await engine.run({id:'retry',imageId:'i',operation:'jpeg.recompression'});assert.deepEqual([...r.data.raw],f.raw);}finally{engine.dispose();}
});
