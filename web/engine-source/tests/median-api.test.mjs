import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';import {initMedianWasm} from '../src/median-features.js';
const bytes=new Uint8Array(await readFile(new URL('../fixtures/median/toy-model.json',import.meta.url))),blob=new Blob([bytes]),image={width:64,height:64,format:'rgb8',data:new Uint8Array(64*64*3).fill(127)};
await initMedianWasm({wasmBinary:await readFile(new URL('../vendor/median/median.wasm',import.meta.url))});
const load=engine=>engine.load({id:'image',bytes:new Uint8Array([1]),pixels:image,provenance:{source:'synthetic'}});
const task={id:'task',imageId:'image',operation:'various.median',params:{modelId:'model'}};
test('Median API owns local model bytes, caches analysis across views and invalidates model dependencies',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});await load(engine);
 await assert.rejects(engine.run(task),{code:'NOT_FOUND'});await assert.rejects(engine.run({...task,params:{modelId:'image'}}),{code:'INVALID_INPUT'});
 const loaded=await engine.loadMedianModel({id:'model',blob});assert.equal(loaded.kind,'median-model');assert.equal(loaded.features,8);assert.equal(loaded.weightsBundled,false);
 assert.deepEqual(engine.original('model'),bytes);const original=engine.original('model');original.fill(0);assert.deepEqual(engine.original('model'),bytes);
 const first=await engine.run(task);assert.equal(first.metrics.cache.result,false);assert.equal(first.provenance.references[0].kind,'median-model');assert.equal(first.masks.decisions.data.length,9);assert.equal(first.pixels.data.length,image.data.length);
 first.data.probabilities.fill(99);first.masks.valid.data.fill(9);first.pixels.data.fill(0);
 const next=await engine.run({...task,params:{modelId:'model',threshold:.95,speckle:false,showScore:true}});assert.equal(next.metrics.cache.analysis,true);assert.ok(next.data.probabilities.every(x=>x<=1));assert.ok(next.masks.valid.data.every(x=>x<=1));
 const json=JSON.parse(new TextDecoder().decode(engine.exportResult(next).bytes));assert.equal(json.provenance.references[0].originalSha256,loaded.sha256);
 await assert.rejects(engine.loadMedianModel({id:'model',blob}),{code:'INVALID_INPUT'});
 engine.unload('model');assert.equal(engine.capabilities().memory.cacheBytes,0);await assert.rejects(engine.run(task),{code:'NOT_FOUND'});
 await engine.loadMedianModel({id:'model',blob});const again=await engine.run(task);assert.equal(again.metrics.cache.analysis,false);
 engine.unload('model');engine.unload('image');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);engine.dispose();
});
test('Median loading and analysis failures leave no active model reservations',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2});await assert.rejects(engine.loadMedianModel({id:'bad',blob:new Blob(['{}'])}),{code:'UNSUPPORTED_MODEL'});assert.equal(engine.capabilities().memory.retainedBytes,0);
 const abort=new AbortController();await assert.rejects(engine.loadMedianModel({id:'cancel',blob},{signal:abort.signal,onProgress:()=>abort.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 await load(engine);await engine.loadMedianModel({id:'model',blob});const running=new AbortController();await assert.rejects(engine.run(task,{signal:running.signal,onProgress:()=>running.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 const again=await engine.run(task);assert.equal(again.status,'ok');engine.dispose();
 const limited=createEngine({memoryBudgetBytes:32*1024**2});await assert.rejects(limited.loadMedianModel({id:'low',blob}),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.retainedBytes,0);assert.equal(limited.capabilities().memory.activeReservationBytes,0);limited.dispose();
});
test('Segmented median RPC contract owns grid masks and tracks local model cache dependencies',async()=>{
 const {initJpegWasm}=await import('../src/jpeg.js');await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});const jpeg=new Blob([await readFile(new URL('../fixtures/exif-6-le.jpg',import.meta.url))]),engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});
 try{
  await assert.rejects(engine.loadBlob({id:'bad',blob:jpeg,layout:'smaller'}),{code:'INVALID_INPUT'});await assert.rejects(engine.loadBlob({id:'png',blob:new Blob([new Uint8Array([137,80,78,71])]),layout:'segmented'}),{code:'INVALID_INPUT'});assert.throws(()=>engine.original('png'),{code:'NOT_FOUND'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);const source=await engine.loadBlob({id:'image',blob:jpeg,layout:'segmented'});assert.equal(source.provenance.layout,'segmented-scanlines');assert.ok(source.availableOperations.includes('various.median'));
  await assert.rejects(engine.run(task),{code:'NOT_FOUND'});await assert.rejects(engine.run({...task,params:{modelId:'image'}}),{code:'INVALID_INPUT'});const loaded=await engine.loadMedianModel({id:'model',blob});
  const first=await engine.run(task);assert.equal(first.layout,'surface');assert.equal(first.metrics.cache.analysis,false);assert.equal(first.provenance.references[0].originalSha256,loaded.sha256);const g=first.data.geometry,request={surfaceId:first.maskSurfaces.decisions.id,revision:1,rect:{x:0,y:0,width:g.width,height:g.height}},expected=await engine.readMask(request);assert.deepEqual(expected.mask.range,[0,2]);assert.equal(expected.mask.width,Math.floor(source.width/64)+2);
  first.data.probabilities.fill(99);const cached=await engine.run({...task,params:{modelId:'model',threshold:1}});assert.equal(cached.metrics.cache.analysis,true);assert.equal(cached.metrics.sourceReads,0);assert.ok(cached.data.probabilities.every(x=>x<=1));const json=JSON.parse(new TextDecoder().decode(engine.exportResult(cached).bytes));assert.deepEqual(json.data.geometry,cached.data.geometry);assert.deepEqual(json.masks.decisions.data,[...cached.masks.decisions.data]);cached.masks.decisions.data.fill(9);assert.ok((await engine.readMask({surfaceId:cached.maskSurfaces.decisions.id,revision:1,rect:{x:0,y:0,width:g.width,height:g.height}})).mask.data.every(x=>x<=2));
  await engine.releaseSurface(first.surface.id);assert.deepEqual((await engine.readMask(request)).mask,expected.mask);
  await engine.unload('model');assert.equal(engine.capabilities().memory.cacheBytes,0);assert.deepEqual((await engine.readMask(request)).mask,expected.mask);await assert.rejects(engine.run(task),{code:'NOT_FOUND'});await engine.loadMedianModel({id:'model',blob});const after=await engine.run(task);assert.equal(after.metrics.cache.analysis,false);
  await engine.unload('image');await assert.rejects(engine.readMask(request),{code:'NOT_FOUND'});await engine.unload('model');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.cacheBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{await engine.dispose();}
});
