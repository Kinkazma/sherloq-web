import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createEngine,EngineError} from '../src/index.js';import {initJpegWasm,jpegCodec} from '../src/jpeg.js';
await initJpegWasm({wasmBinary:await readFile(new URL('../vendor/libjpeg/jpeg.wasm',import.meta.url))});const bytes=new Uint8Array(await readFile(new URL('../fixtures/bench-1024.jpg',import.meta.url))),small=new Uint8Array(await readFile(new URL('../fixtures/exif-6-le.jpg',import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
test('Blob API preserves the existing full-memory path and returns exact owned windows with stale-handle rejection',async()=>{
 const e=createEngine({memoryBudgetBytes:128*1024**2});try{const loaded=await e.loadBlob({id:'i',blob:new Blob([small])}),expected=await jpegCodec.decode(small);assert.equal(loaded.metrics.path,'existing-full-memory');const request={surfaceId:loaded.surface.id,revision:1,rect:{x:1,y:2,width:7,height:5}},r=await e.readPixels(request);
  for(let y=0;y<5;y++)assert.deepEqual(r.pixels.data.subarray(y*21,(y+1)*21),expected.data.subarray(((y+2)*expected.width+1)*3,((y+2)*expected.width+8)*3));r.pixels.data.fill(0);assert.notDeepEqual((await e.readPixels(request)).pixels.data,r.pixels.data);assert.equal(hash(new Uint8Array(await e.originalBlob('i').arrayBuffer())),hash(small));assert.deepEqual((await e.readOriginal('i',{offset:3,length:17})).bytes,small.slice(3,20));await e.unload('i');await assert.rejects(e.readPixels(request),{code:'NOT_FOUND'});assert.equal(e.capabilities().memory.retainedBytes,0);
 }finally{await e.dispose();}
});
test('A RAM-admitted segmented JPEG keeps all pixels and global histogram while validating each adapter parameters',async()=>{
 const e=createEngine({memoryBudgetBytes:48*1024**2}),reference=createEngine();try{const loaded=await e.loadBlob({id:'i',blob:new Blob([bytes])});assert.equal(loaded.metrics.storage,'memory');assert.equal(loaded.provenance.layout,'segmented-scanlines');assert.ok(loaded.availableOperations.includes('ela.biomes'));await reference.load({id:'i',bytes});const task={id:'h',imageId:'i',operation:'inspection.histogram',params:{channel:2,start:23,end:184}},actual=await e.run(task),expected=await reference.run(task);assert.deepEqual(actual.data,expected.data);assert.equal((await e.run(task)).metrics.cache.result,true);assert.equal(e.capabilities().memory.activeReservationBytes,0);await assert.rejects(e.run({...task,operation:'ela.biomes'}),{code:'INVALID_INPUT',message:'Unknown parameter.'});assert.equal(e.capabilities().memory.activeReservationBytes,0);await e.unload('i');assert.equal(e.capabilities().memory.retainedBytes,0);
 }finally{await e.dispose();reference.dispose();}
});
test('Only recognized full-memory allocation failure tries the exact row path once',async()=>{
 for(const code of ['MEMORY_ALLOCATION','INVALID_INPUT']){let calls=0;const e=createEngine({codec:{...jpegCodec,decode(){calls++;throw new EngineError(code,'Injected failure');}},memoryBudgetBytes:128*1024**2});try{if(code==='MEMORY_ALLOCATION'){const r=await e.loadBlob({id:'i',blob:new Blob([small])});assert.deepEqual(r.metrics.retry,{from:'full-memory',code});const pixels=await e.readPixels({surfaceId:r.surface.id,revision:1,rect:{x:0,y:0,width:r.width,height:r.height}});assert.equal(hash(pixels.pixels.data),hash((await jpegCodec.decode(small)).data));await e.unload('i');}else await assert.rejects(e.loadBlob({id:'i',blob:new Blob([small])}),{code});assert.equal(calls,1);assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.activeReservationBytes,0);}finally{await e.dispose();}}
});
test('Segmented result surfaces stay owned until release and are invalidated with their source',async()=>{
 const e=createEngine({memoryBudgetBytes:48*1024**2});
 try{
  const loaded=await e.loadBlob({id:'i',blob:new Blob([bytes])});assert.equal(loaded.provenance.layout,'segmented-scanlines');
  const a=await e.run({id:'a',imageId:'i',operation:'colors.stats',params:{mode:'min'}});assert.equal(a.pixels,undefined);assert.equal(a.layout,'surface');
  const request={surfaceId:a.surface.id,revision:1,rect:{x:0,y:0,width:17,height:13}},original=await e.readPixels(request);
  const b=await e.run({id:'b',imageId:'i',operation:'colors.stats',params:{mode:'max',inclusive:true}});assert.deepEqual((await e.readPixels(request)).pixels,original.pixels);
  await assert.rejects(e.releaseSurface(loaded.surface.id),{code:'INVALID_INPUT'});await e.releaseSurface(a.surface.id);await assert.rejects(e.readPixels(request),{code:'NOT_FOUND'});
  await e.unload('i');await assert.rejects(e.readPixels({...request,surfaceId:b.surface.id}),{code:'NOT_FOUND'});assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.activeReservationBytes,0);
 }finally{await e.dispose();}
});
test('Bit-plane mask handles preserve raw evidence separately from the filtered display',async()=>{
 const e=createEngine({memoryBudgetBytes:48*1024**2});try{
  await e.loadBlob({id:'i',blob:new Blob([bytes])});
  const a=await e.run({id:'p',imageId:'i',operation:'noise.planes',params:{filter:2}}),maskId=a.maskSurfaces.plane.id,rect={x:7,y:13,width:17,height:19};
  const mask=await e.readMask({surfaceId:maskId,revision:1,rect});assert.equal(mask.mask.format,'mask8');assert.deepEqual(mask.mask.range,[0,1]);assert.ok(mask.mask.data.every(x=>x===0||x===1));
  await assert.rejects(e.readPixels({surfaceId:maskId,revision:1,rect}),{code:'INVALID_INPUT'});await assert.rejects(e.readMask({surfaceId:a.surface.id,revision:1,rect}),{code:'INVALID_INPUT'});
  await e.releaseSurface(a.surface.id);assert.deepEqual((await e.readMask({surfaceId:maskId,revision:1,rect})).mask,mask.mask);
  await e.unload('i');await assert.rejects(e.readMask({surfaceId:maskId,revision:1,rect}),{code:'NOT_FOUND'});assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.activeReservationBytes,0);
 }finally{await e.dispose();}
});
test('Segmented extrema publish two independently owned masks and preserve all live evidence',async()=>{
 const e=createEngine({memoryBudgetBytes:48*1024**2});try{
  const source=await e.loadBlob({id:'i',blob:new Blob([bytes])});assert.ok(source.availableOperations.includes('noise.minmax'));
  const a=await e.run({id:'p',imageId:'i',operation:'noise.minmax',params:{filter:1}}),minimum=a.maskSurfaces.minimum,maximum=a.maskSurfaces.maximum,rect={x:7,y:13,width:17,height:19};
  const read=async surface=>e.readMask({surfaceId:surface.id,revision:1,rect}),low=await read(minimum),high=await read(maximum);
  assert.deepEqual(low.mask.range,[0,1]);assert.deepEqual(high.mask.range,[0,1]);assert.ok(low.mask.data.some(x=>x===1));assert.ok(high.mask.data.some(x=>x===1));assert.ok(low.mask.data.every((x,i)=>!(x&&high.mask.data[i])));
  await assert.rejects(e.readMask({surfaceId:minimum.id,revision:2,rect}),{code:'INVALID_INPUT'});
  await e.releaseSurface(a.surface.id);await e.releaseSurface(minimum.id);await assert.rejects(read(minimum),{code:'NOT_FOUND'});assert.deepEqual((await read(maximum)).mask,high.mask);
  await e.unload('i');await assert.rejects(read(maximum),{code:'NOT_FOUND'});assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.activeReservationBytes,0);
 }finally{await e.dispose();}
});
test('Segmented defect evidence exposes owned typed flags, paged rows and CSV with strict lifetime',async()=>{
 const e=createEngine({memoryBudgetBytes:48*1024**2});try{
  const loaded=await e.loadBlob({id:'i',blob:new Blob([bytes])});assert.ok(loaded.availableOperations.includes('pixels.defects'));
  const result=await e.run({id:'d',imageId:'i',operation:'pixels.defects'}),rect={x:7,y:13,width:17,height:19},flagRequest={surfaceId:result.flagSurfaces.channels.id,revision:1,rect},tableRequest={tableId:result.tables.candidates.id,revision:1,offset:0,length:7};
  const flags=await e.readFlags(flagRequest);assert.equal(flags.flags.channelOrder,'RGB');assert.ok(flags.flags.data.every(x=>x<=2));
  const rows=await e.readTable(tableRequest);assert.equal(rows.data.length,rows.length*6);assert.equal(rows.totalRows,result.data.candidateCount);const copy=rows.data.slice();rows.data.fill(99);assert.deepEqual((await e.readTable(tableRequest)).data,copy);
  const csv=await e.readTableCsv(tableRequest);assert.ok(new TextDecoder().decode(csv.bytes).startsWith('x,y,channel,candidate,'));assert.equal(csv.nextOffset,csv.length);
  await assert.rejects(e.readPixels(flagRequest),{code:'INVALID_INPUT'});await assert.rejects(e.readFlags({...flagRequest,revision:2}),{code:'INVALID_INPUT'});await assert.rejects(e.readTable({...tableRequest,revision:2}),{code:'INVALID_INPUT'});await assert.rejects(e.readTable({...tableRequest,tableId:result.surface.id}),{code:'INVALID_INPUT'});
  assert.throws(()=>e.exportResult(result,{format:'csv'}),{code:'UNSUPPORTED_EXPORT'});
  await e.releaseSurface(result.surface.id);await e.releaseSurface(result.maskSurfaces.candidates.id);assert.deepEqual((await e.readFlags(flagRequest)).flags,flags.flags);assert.deepEqual((await e.readTable(tableRequest)).data,copy);
  await e.releaseTable(tableRequest.tableId);await assert.rejects(e.readTable(tableRequest),{code:'NOT_FOUND'});await e.unload('i');await assert.rejects(e.readFlags(flagRequest),{code:'NOT_FOUND'});assert.equal(e.capabilities().memory.retainedBytes,0);assert.equal(e.capabilities().memory.activeReservationBytes,0);
 }finally{await e.dispose();}
});
