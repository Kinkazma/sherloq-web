import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngine} from '../sherloq-browser/assets/unified-engine/src/index.js';
import {initJpegWasm,jpegCodec} from '../sherloq-browser/assets/unified-engine/src/jpeg.js';
await initJpegWasm({wasmBinary:await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/unified-engine/vendor/libjpeg/jpeg.wasm')))});
test('Classic preview owns the legacy engine before returning its first promise and cancellation releases that lock',async()=>{
 const engine=createEngine({codec:jpegCodec,memoryBudgetBytes:128*1024**2,cpuKernel:'single'}),pixels={width:33,height:35,format:'rgb8',data:new Uint8Array(33*35*3).fill(100)};
 try{
  await engine.load({id:'image',bytes:Uint8Array.of(1),pixels});await engine.run({id:'native',imageId:'image',operation:'ela.classic'});
  const controller=new AbortController(),preview=engine.previewElaClassic({imageId:'image',params:{contrast:71}},{signal:controller.signal});
  const cancelled=assert.rejects(preview,{code:'CANCELLED'});
  const rejected=assert.rejects(engine.run({id:'racing',imageId:'image',operation:'ela.classic'}),{code:'BUSY'});
  controller.abort();await Promise.all([rejected,cancelled]);
  assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  assert.equal((await engine.previewElaClassic({imageId:'image'})).nativePixelSamples,true);
 }finally{await engine.dispose();}
 assert.equal(engine.capabilities().memory.retainedBytes,0);
});
