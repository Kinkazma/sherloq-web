import test from 'node:test';import {readFile} from 'node:fs/promises';
test('public historical and quality panels use the same global segmented losses under 72 MiB',async()=>{
 const {createEngine}=await import('../src/index.js'),{checkSegmentedRecompression}=await import('./segmented-recompression-fixture.js'),ref=JSON.parse(await readFile(new URL('./data/recompression-segmented-native.json',import.meta.url))),engine=createEngine({memoryBudgetBytes:72*1024**2,cpuKernel:'single'});
 try{await checkSegmentedRecompression(engine,new Blob([await readFile(new URL('./data/'+ref.file,import.meta.url))]),ref);}finally{await engine.dispose();}
});
test('direct cancellation keeps only completed quality values and resumes from them',async()=>{
 const assert=(await import('node:assert/strict')).default,{createEngine}=await import('../src/index.js'),ref=JSON.parse(await readFile(new URL('./data/recompression-segmented-native.json',import.meta.url))),engine=createEngine({memoryBudgetBytes:72*1024**2,cpuKernel:'single'});
 try{await engine.loadBlob({id:'i',blob:new Blob([await readFile(new URL('./data/'+ref.file,import.meta.url))])});const controller=new AbortController(),task={id:'c',imageId:'i',operation:'jpeg.recompression'};
 await assert.rejects(engine.run(task,{signal:controller.signal,onProgress:event=>{if(event.phase==='jpeg-scanlines'&&event.fraction>=.015)controller.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 const result=await engine.run(task);assert.deepEqual(Array.from(result.data.raw),ref.raw);assert.ok(result.metrics.recompressions<101&&result.metrics.recompressions>0);assert.ok(result.metrics.cache.scalarHits>0);
 }finally{await engine.dispose();}
});
