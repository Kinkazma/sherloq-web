import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
const pixels={width:12,height:10,format:'rgb8',data:new Uint8Array(12*10*3).fill(120)};
const request=i=>({id:'preview-'+i,imageId:'source',operation:'noise.noisesniffer',params:{cellSize:10,samplesPerBin:100}});
async function loaded(){const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'single'});await engine.load({id:'source',bytes:new Uint8Array([1,2,3]),pixels});return engine;}
test('concurrent cache-only previews cannot both own the native engine after scope await',async()=>{
 const engine=await loaded();try{const answers=await Promise.allSettled([engine.previewParameters(request(1)),engine.previewParameters(request(2)),engine.previewParameters(request(3))]);assert.equal(answers[0].reason.code,'PREVIEW_UNAVAILABLE');assert.equal(answers[1].reason.code,'BUSY');assert.equal(answers[2].reason.code,'BUSY');assert.equal(engine.capabilities().memory.activeReservationBytes,0);await assert.rejects(engine.previewParameters(request(4)),{code:'PREVIEW_UNAVAILABLE'});}finally{await engine.dispose();}
});
test('a source removed while asynchronous preview admission yields cannot lend a stale cache',async()=>{
 const engine=await loaded();try{const pending=engine.previewParameters(request(1));await engine.unload('source');await assert.rejects(pending,{code:'NOT_FOUND'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();}
});
test('cancelled admission never acquires cache workspace and a subsequent request is usable',async()=>{
 const engine=await loaded();try{await assert.rejects(engine.previewParameters(request(1),{},{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);await assert.rejects(engine.previewParameters(request(2)),{code:'PREVIEW_UNAVAILABLE'});}finally{await engine.dispose();}
});
