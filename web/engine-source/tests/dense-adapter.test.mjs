// Direct-operation transport/ownership contracts; no image analysis is executed.
import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createDenseAdapter,denseCopyParams,denseCapability,DENSE_OPERATION} from '../src/dense-adapter.js';
import {DENSE_PROFILES,densePassPlan} from '../src/dense-profiles.js';import {createResultSurfaces} from '../src/segmented-results.js';
import {createRasterExports} from '../src/raster-export.js';import {unpackScientificNpz} from './automatic-npz-fixture.js';
function rawResult(params,released){return {status:'ok',params,points:new Float32Array([0,0,1,0,1,0,0,1,1,1,0,1,0,0]),pairs:new Float64Array([0,1,.1,2]),groups:[new Uint32Array([0])],models:[],colors:new Uint8Array([20,40,60]),bases:[[20,40,60]],pair_search_regions:new Int32Array([0]),pair_algorithms:new Uint8Array([0]),dense_maps:[{width:2,height:2,targets:new Int32Array([1,0,3,2]),distancesSquared:new Float32Array([.1,.2,.3,.4]),selected:new Uint8Array([1,0,1,0]),errors:new Float32Array([0,1,2,3]),shift:3,pass:{algorithm:'PatchMatch Zernike',stage:'base'},context:{origin:[0,0],pairSearchRegion:0,compare:false}}],metrics:{preflightExecutions:0},release:released};}
function harness({renderFailure=false,progressFailure=false}={}){
 const budget=new Budget(16*1024**2),profile={maxWorkers:8},publicSurfaces=new Map(),registry=createResultSurfaces(publicSurfaces),calls=[];let serial=0;
 const image={segmented:true,surface:{descriptor:{width:20,height:20}},sha256:'sha',provenance:{decoder:'fixture'}};
 const adapter=createDenseAdapter({budget,profile,version:'contract',publishResult:(id,r)=>registry.publish(id,r),create(source,receivedBudget,options){assert.equal(source,image);assert.equal(receivedBudget,budget);assert.equal(options.profile,profile);return {async analyze(params,hooks){calls.push(['analyze',params,hooks.backend,hooks.checkpointKey]);return rawResult(params,async()=>calls.push(['release']));},async dispose(){calls.push(['dispose']);}};},async render(source,data,view){assert.equal(source,image);if(renderFailure)throw Error('render failure');return {surface:{descriptor:{id:'surface-'+(++serial),revision:1,width:20,height:20,format:'rgb8'},async dispose(){calls.push(['surface-dispose']);}},style:view,visible:[[0,1]],legend:[[0,1,1]]};}});
 const run=(params={},view={})=>adapter.run({id:'task',imageId:'source',operation:DENSE_OPERATION,params,view,backend:'auto'},image,{knownHeapBytes:256,onProgress:()=>{if(progressFailure)throw Error('progress failure');}});
 return {adapter,budget,calls,publicSurfaces,registry,run};
}
test('All six advertised profiles validate, build the real native pass plan and reach DenseCopyEngine',async()=>{
 assert.deepEqual(denseCapability().algorithms,DENSE_PROFILES);const h=harness();try{for(const profile of DENSE_PROFILES){const params=denseCopyParams({profile});assert.ok(densePassPlan(profile,{...params,width:128,height:128}).passes.length);const output=await h.run(params);assert.equal(h.calls.filter(c=>c[0]==='analyze').at(-1)[1].profile,profile);assert.equal(output.data.params.profile,profile);assert.doesNotThrow(()=>structuredClone(output));assert.equal(output.data.dense_maps,undefined);await h.registry.release(output.surface.id);}}finally{await h.adapter.dispose();}assert.equal(h.budget.active,0);assert.equal(h.calls.filter(c=>c[0]==='release').length,6);
});
test('Changing display reuses verified evidence; releasing source cache preserves a live result for NPZ',async()=>{
 const h=harness(),exports=createRasterExports(h.budget);let archive;
 try{
  const a=await h.run(),b=await h.run({}, {lines:false,circles:false});assert.equal(b.metrics.cache.result,true);assert.equal(h.calls.filter(c=>c[0]==='analyze').length,1);
  const buffers=new Set(),collect=v=>{if(ArrayBuffer.isView(v))buffers.add(v.buffer);else if(v&&typeof v==='object')for(const item of Object.values(v))collect(item);};collect(b);const transported=structuredClone(b,{transfer:[...buffers]});assert.equal(transported.data.points.length,14);
  await h.registry.release(a.surface.id);await h.adapter.clearImage('source');assert.equal(h.calls.filter(c=>c[0]==='release').length,0);
  const record=h.publicSurfaces.get(b.surface.id).record;archive=await exports.createScientific(record,{format:'npz',storage:'memory'},{imageId:'source',originalSha256:'sha'});const page=await exports.read({exportId:archive.id,revision:archive.revision,length:archive.byteLength});const arrays=unpackScientificNpz(page.bytes);
  assert.equal(arrays.root_result_dense_maps_0_targets.dtype,'<i4');assert.deepEqual(arrays.root_result_dense_maps_0_targets.shape,[2,2]);assert.deepEqual([...new Int32Array(arrays.root_result_dense_maps_0_targets.data.buffer,arrays.root_result_dense_maps_0_targets.data.byteOffset,4)],[1,0,3,2]);
  assert.equal(arrays.root_result_dense_maps_0_consistent_mask.dtype,'|b1');assert.equal(arrays.root_result_points.dtype,'<f4');await h.registry.release(b.surface.id);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
 }finally{await exports.clear();await h.registry.clear();await h.adapter.dispose();}assert.equal(h.budget.total(),0);
});
test('Failed rendering or progress cannot publish a dangling surface and completed evidence remains reusable',async()=>{
 for(const option of [{renderFailure:true},{progressFailure:true}]){const h=harness(option);await assert.rejects(h.run(),/failure/);assert.equal(h.publicSurfaces.size,0);assert.equal(h.budget.active,0);await h.adapter.dispose();assert.equal(h.calls.filter(c=>c[0]==='release').length,1);}
});
test('Invalid dense settings fail before constructing workers or reserving memory',async()=>{
 const h=harness();for(const params of [{profile:'SIFT'},{patch:1},{iterations:0},{model:'bad'},{compare:true,regions:[]},{bogus:1}])await assert.rejects(h.run(params),{code:'INVALID_INPUT'});assert.equal(h.calls.length,0);assert.equal(h.budget.total(),0);
});
