import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
let mode='sync',pending;
function adapter(operation){let cached;return{configured:()=>true,backends:()=>['cpu'],async run(task){cached={imageId:task.imageId,values:Float32Array.of(1,-0,NaN)};return{id:task.id,imageId:task.imageId,operation,data:{metadata:{analysisId:'analysis',resultId:'raw'}},provenance:{}};},readRaw(request){assert.equal(request.imageId,cached.imageId);const value={id:'raw',imageId:cached.imageId,operation,data:{values:cached.values},provenance:{}};if(mode==='sync')return value;return new Promise((resolve,reject)=>{pending={resolve:()=>resolve(value),reject};});},async clearImages(){cached=null;},async clearImage(id){if(cached?.imageId===id)cached=null;},async dispose(){cached=null;}};}
mock.module(import.meta.resolve('../src/d2prl-adapter.js'),{namedExports:{createD2prlAdapter:()=>adapter('ai.clones.d2prl')}});
mock.module(import.meta.resolve('../src/segmentation-adapter.js'),{namedExports:{createSegmentationAdapter:()=>adapter('ai.clones.segmentation')}});
const {createEngine}=await import('../src/index.js');
for(const operation of ['ai.clones.d2prl','ai.clones.segmentation'])for(const outcome of ['sync','resolve','reject'])test(operation+' raw '+outcome+' preserves Original metadata and the engine admission lifetime',async()=>{
 const api=createEngine({memoryBudgetBytes:128*1024**2});try{
  const loaded=await api.load({id:'original',bytes:Uint8Array.of(1,2,3),pixels:{width:30,height:24,format:'rgb8',data:new Uint8Array(30*24*3)}}),state=await createOriginalSourceRegionsState({width:30,height:24,sourceSha256:loaded.sha256});await state.add('acquisition',{x0:4,y0:3,x1:24,y1:21});const domain=await compileOriginalSourceRegions(state.snapshot()),output=await api.run({id:'compute',imageId:'original',operation,params:{},sourceRegionDomain:domain.descriptor}),method=operation==='ai.clones.d2prl'?'readD2prlRaw':'readSegmentationRaw',request={imageId:'original',resultId:'raw'},before=api.capabilities().memory.activeReservationBytes;mode=outcome;const answer=api[method](request);
  if(outcome==='sync'){assert.equal(answer instanceof Promise,false);assert.equal(answer.imageId,'original');assert.equal(Object.is(answer.data.values[1],-0),true);}
  else{
   assert.equal(answer instanceof Promise,true);assert.ok(api.capabilities().memory.activeReservationBytes>before);assert.throws(()=>api[method](request),{code:'BUSY'});await assert.rejects(async()=>api.unload('original'),{code:'BUSY'});
   if(outcome==='reject'){const failure=Object.assign(new Error('spilled bank read failed'),{code:'STORAGE_IO'});pending.reject(failure);await assert.rejects(answer,e=>e===failure);}else{pending.resolve();const value=await answer;assert.equal(value.imageId,'original');assert.deepEqual(value.sourceRegionOrigin,[4,3]);assert.equal(value.sourceRegionDomain.fingerprint,domain.fingerprint);assert.equal(Number.isNaN(value.data.values[2]),true);}
  }
  assert.equal(api.capabilities().memory.activeReservationBytes,before);mode='sync';assert.equal(api[method](request).imageId,'original');await api.releaseSurface(output.sourceRegionSourceSurface.id);
 }finally{await api.dispose();}
});
