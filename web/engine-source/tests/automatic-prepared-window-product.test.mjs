import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,poly} from './helpers/automatic-complete-fixture.mjs';
import {prepareAutomaticStrictContext} from '../src/automatic-strict-context.js';
import {createAutomaticPreparedSparse} from '../src/automatic-prepared-sparse.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
import {SIFT_SOURCE} from '../src/clone-relations.js';

test('actual aggregate/window owners invoke three autonomous native entries or one explicit global entry, retaining each raw result',async()=>{
 const f=await fixture({width:96,height:64,hole:[22,20,26,24]}),originalRegions=[{id:'a',x0:0,y0:0,x1:48,y1:64},{id:'b',x0:48,y0:0,x1:96,y1:64},{id:'e',envelope:true,x0:0,y0:0,x1:96,y1:64}];
 Object.assign(f.scope,{regions:originalRegions,searchRegions:originalRegions});f.task.params.selection={regions:[poly(0,0,48,64),poly(48,0,96,64)],envelope:poly(0,0,96,64),disabled:[]};
 const context=await prepareAutomaticStrictContext(f.image,f.task,{budget:f.budget}),calls=[];let outputs=0;
 const nativeAnalyze=SparseCopyEngine.prototype.analyze;SparseCopyEngine.prototype.analyze=async function(params,hooks){
  // This test reaches the real native producer boundary. The numerical native
  // detector is controlled here and is never presented as a model proof.
  calls.push({params:structuredClone(params),hooks});assert.equal(params.algorithm,SIFT_SOURCE);assert.equal(params.limit,6000);assert.equal(hooks.backend,'auto');assert.equal(hooks.strictPanelsPreparation.preprocessing.text_engine,'PP-OCRv6_small_det');
  const points=new Float64Array([1,1,1,1,1,1,0]);outputs++;return{status:'ok',backend:'cpu',params,points,pairs:new Float64Array(0),groups:[],models:[],colors:new Uint8Array(0),bases:[],pair_search_regions:new Int32Array(0),regions:params.regions,total_features:1,metadata:{nativeControlledBoundary:true},release(){outputs--;}};
 };
 const adapter=createAutomaticPreparedSparse(f.image,f.budget,{id:'maximum',maxWorkers:10},{getContext:async()=>context});let result;
 const params={algorithm:SIFT_SOURCE,limit:6000,regions:f.task.params.selection.regions,excluded:f.scope.excluded,guides:[],reflections:true,compare:false,model:'Affine',threshold:.7};
 try{
  result=await adapter.analyze(params,{scientificScope:f.scope,backend:'auto'});assert.equal(calls.length,3);assert.equal(result.cloneWindowMode,'independent');assert.equal(result.windowResults.length,3);assert.deepEqual(result.windowResults.map(w=>w.id),['a','b','e']);assert.equal(result.windowResults[2].kind,'envelope');assert.equal(result.metadata.cloneAnalysisWindows.matchingAcrossWindows,false);assert.equal(new Set(calls.map(c=>c.hooks.sourceContextFingerprint)).size,3);
  for(const w of result.windowResults){assert.equal(w.dataNatif.metadata.nativeControlledBoundary,true);assert.equal(w.dataNatif.params.reflections,true);assert.equal(w.dataNatif.points.length,7);}await result.release();result=null;assert.equal(outputs,0);
  result=await adapter.analyze(params,{scientificScope:f.scope,cloneWindowMode:'global',backend:'auto'});assert.equal(calls.length,4);assert.equal(result.cloneWindowMode,'global');assert.equal(result.windowResults.length,0);assert.equal(result.globalResult.dataNatif.metadata.nativeControlledBoundary,true);assert.equal(result.metadata.cloneAnalysisWindows.matchingAcrossWindows,true);assert.equal(outputs,1);assert.equal(f.reads.length,0);
 }finally{try{await result?.release();await adapter.dispose();await context.release();assert.equal(outputs,0);assert.equal(f.budget.total(),0);}finally{SparseCopyEngine.prototype.analyze=nativeAnalyze;}}
});
