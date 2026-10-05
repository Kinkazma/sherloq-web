import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createEngine} from '../src/index.js';import {checkTiffStream} from './tiff-stream-fixture.js';
const root=new URL('./data/tiff-stream/',import.meta.url),ref=JSON.parse(await readFile(new URL('reference.json',root)));
test('22MP TIFF strips and BigTIFF tiles preserve native RGB/hash and never stage whole encoded Blob',async()=>{
 class EncodedBlob extends Blob {arrayBuffer(){throw Error('Whole encoded TIFF staging forbidden');}}const engine=createEngine({memoryBudgetBytes:192*1024**2,cpuKernel:'single'});try{for(const item of ref.cases)await checkTiffStream(engine,new EncodedBlob([await readFile(new URL(item.file,root))]),item,{storage:'memory'});}finally{await engine.dispose();}
});
test('cancelled block load discards unpublished pixels and permits reload',async()=>{
 const blob=new Blob([await readFile(new URL(ref.cases[1].file,root))]),engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'}),controller=new AbortController();try{await assert.rejects(engine.loadBlob({id:'cancel',blob},{signal:controller.signal,onProgress:e=>{if(e.phase==='decode'&&e.fraction>.1)controller.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);const loaded=await engine.loadBlob({id:'reload',blob});assert.equal(loaded.sha256,ref.cases[1].sourceSha256);await engine.unload('reload');}finally{await engine.dispose();}
});
