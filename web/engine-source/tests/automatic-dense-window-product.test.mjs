import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,poly} from './helpers/automatic-complete-fixture.mjs';
import {prepareAutomaticStrictContext} from '../src/automatic-strict-context.js';
import {createAutomaticPreparedDense} from '../src/automatic-prepared-dense.js';

test('automatic dense retains separate native maps/passes and exact BigInt counts per analysis window',async()=>{
 const f=await fixture({width:96,height:64,hole:[22,20,26,24]}),regions=[{id:'a',x0:0,y0:0,x1:48,y1:64},{id:'b',x0:48,y0:0,x1:96,y1:64},{id:'e',envelope:true,x0:0,y0:0,x1:96,y1:64}];
 f.scope.regions=regions;f.scope.searchRegions=regions;const context=await prepareAutomaticStrictContext(f.image,f.task,{budget:f.budget}),calls=[],maps=[],count=(1n<<60n)+1n;let engines=0,disposed=0,outputs=0;
 const geometry={native:true},profile={id:'maximum',maxWorkers:10};
 const nativeFactory=(image,budget,options)=>{assert.strictEqual(options.geometry,geometry);assert.strictEqual(options.profile,profile);assert.strictEqual(budget,f.budget);engines++;return{
  async analyze(input,hooks){const prepared=await options.getContext();assert.equal(prepared.width,image.surface.descriptor.width);assert.deepEqual(prepared.origin,image.sourceRegionOrigin);assert.equal(hooks.backend,'auto');assert.equal(input.iterations,8);assert.equal(input.patch,8);assert.equal(input.flip,true);assert.deepEqual(input.regions,[]);
   const lease=await image.surface.readWindow({x:0,y:0,width:1,height:1});await lease.release();if(prepared.origin[0]===0)assert.throws(()=>image.surface.readWindow({x:20,y:20,width:8,height:4}),/excluded RGB/);
   calls.push({input:structuredClone(input),prepared});const map={nativeMap:engines},points=new Float32Array([1,1,1,1,1,1,0]);maps.push(map);outputs++;
   return{status:'ok',points,pairs:new Float64Array(0),groups:[],models:[],colors:new Uint8Array(0),bases:[],pair_search_regions:new Int32Array(0),pair_algorithms:new Uint8Array(0),group_algorithms:[],group_variants:[],group_frames:[],dense_maps:[map],candidate_comparisons:count,dense_count:3,dense_consistent_count:2,params:input,regions:input.regions,extension_bins:[0,1],mirror_policy:{normal_preserved:true,detail:{enabled:true}},release(){outputs--;}};
  },clearCheckpoint(){},dispose(){disposed++;}
 };};
 const adapter=createAutomaticPreparedDense(f.image,f.budget,{geometry,profile,getContext:async()=>context,nativeFactory});let result;
 const params={profile:'PatchMatch Zernike',patch:8,iterations:8,flip:true,regions:[poly(0,0,48,64),poly(48,0,96,64)],excluded:f.scope.excluded,guides:[],compare:false};
 try{
  result=await adapter.analyze(params,{backend:'auto'});assert.equal(calls.length,3);assert.equal(engines,3);assert.equal(result.cloneWindowMode,'independent');assert.equal(result.candidate_comparisons,count*3n);assert.equal(result.windowResults.length,3);assert.deepEqual(result.metadata.cloneAnalysisWindows.ranges.map(r=>r.nativeOrigin),[[0,0],[48,0],[0,0]]);
  for(let i=0;i<3;i++){const raw=result.windowResults[i].dataNatif;assert.strictEqual(raw.dense_maps[0],maps[i]);assert.equal(raw.points.constructor,Float32Array);assert.equal(raw.candidate_comparisons,count);assert.equal(raw.mirror_policy.detail.enabled,true);assert.equal(raw.dense_count,3);assert.equal(raw.dense_consistent_count,2);assert.equal(raw.params.flip,true);assert.deepEqual(raw.extension_bins,[0,1]);}
  await result.release();result=null;assert.equal(outputs,0);result=await adapter.analyze(params,{backend:'auto',cloneWindowMode:'global'});assert.equal(engines,4);assert.equal(disposed,3);assert.equal(calls.length,4);assert.equal(result.cloneWindowMode,'global');assert.equal(result.candidate_comparisons,count);assert.strictEqual(result.globalResult.dataNatif.dense_maps[0],maps[3]);
 }finally{await result?.release();await adapter.dispose();await context.release();assert.equal(outputs,0);assert.equal(disposed,engines);assert.equal(f.budget.total(),0);}
});
