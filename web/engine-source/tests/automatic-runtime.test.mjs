import test from 'node:test';import assert from 'node:assert/strict';import {createEngine} from '../src/index.js';
const pixels={width:16,height:16,format:'rgb8',data:new Uint8Array(768)},selection={regions:[[[0,0],[15,0],[15,15],[0,15]]],envelope:[[0,0],[15,0],[15,15],[0,15]],disabled:[0]};
test('public complete analysis preserves all-disabled scope, cached identity, explicit views and independent export lifetime',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2});try{
  await engine.load({id:'i',bytes:pixels.data,pixels});const task={id:'a',imageId:'i',operation:'analysis.complete',params:{selection}},a=await engine.run(task);assert.equal(a.status,'ok');assert.deepEqual(Object.values(a.data.state.states),Array(5).fill('no-active-zones'));assert.deepEqual(a.data.state.attempts,{});
  const b=await engine.run({...task,id:'b'});assert.equal(b.analysisId,a.analysisId);assert.equal(b.metrics.cache.analysis,true);
  const view=await engine.updateAutomatic({analysisId:a.analysisId,view:[{method:'setD2prlMinimum',value:801},{method:'selectTab',value:'D2PRL'}]});assert.equal(view.data.filters.d2Minimum,801);assert.deepEqual(view.data.state.attempts,{});
  await assert.rejects(engine.resumeAutomatic({analysisId:a.analysisId}),{code:'INVALID_INPUT'});const unchanged=await engine.updateAutomatic({analysisId:a.analysisId});assert.deepEqual(unchanged.data.state.attempts,{});assert.deepEqual(Object.values(unchanged.data.state.states),Array(5).fill('no-active-zones'));assert.equal(unchanged.data.filters.d2Minimum,801);
  await assert.rejects(engine.resumeAutomatic({analysisId:'missing'}),{code:'NOT_FOUND'});
  await assert.rejects(engine.renderAutomatic({analysisId:a.analysisId,layer:'ela-preview'}),{code:'RESULT_UNAVAILABLE'});
  const archive=await engine.exportAutomatic({analysisId:a.analysisId,storage:'memory'});await engine.unload('i');await assert.rejects(engine.updateAutomatic({analysisId:a.analysisId}),{code:'NOT_FOUND'});assert.equal((await engine.readExport({exportId:archive.id,revision:1})).bytes.length,archive.byteLength);await engine.releaseExport(archive.id);const memory=engine.capabilities().memory;assert.equal(memory.retainedBytes+memory.activeReservationBytes+memory.cacheBytes,0);
 }finally{await engine.dispose();}
});
test('invalid automatic configuration and early cancellation never leak or fabricate completed detectors',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2});try{await engine.load({id:'i',bytes:pixels.data,pixels});const baseline=engine.capabilities().memory;await assert.rejects(engine.run({id:'a',imageId:'i',operation:'analysis.complete',params:{unknown:1}}),{code:'INVALID_INPUT'});await assert.rejects(engine.loadAutomaticModels({forgeryscope:{}}),{code:'INVALID_INPUT'});const cancel=new AbortController();cancel.abort();await assert.rejects(engine.run({id:'c',imageId:'i',operation:'analysis.complete',params:{selection}},{signal:cancel.signal}),{code:'CANCELLED'});const after=engine.capabilities().memory;assert.equal(after.retainedBytes,baseline.retainedBytes);assert.equal(after.activeReservationBytes,0);}finally{await engine.dispose();}
});
