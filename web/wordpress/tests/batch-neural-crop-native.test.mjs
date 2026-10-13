import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog,catalogRecipe,batchTask,batchNeuralCropRegions} from '../sherloq-browser/assets/batch-catalog.js';
import {createD2prlAnalysis} from '../../engine-source/experiments/d2prl/analysis.js';
import {createSegmentationAnalysis} from '../../engine-source/experiments/segmentation/analysis.js';
import {Budget} from '../../engine-source/src/cache.js';

const polygon=r=>[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
function preparation(){
 const regions=[{x0:.25,y0:.75,x1:49.6,y1:59.3},{x0:70.1,y0:.2,x1:119.95,y1:59.2}].map(r=>({...r,polygon:polygon(r),type:'microscopy'}));
 return {schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',version:'fixture/1',sourceSha256:'a'.repeat(64),fingerprint:'b'.repeat(64),width:200,height:100,status:'ready',regions,excluded:[[[10.2,10.1],[20.7,10.1],[20.7,20.3],[10.2,20.3]]],text:{status:'complete',polygons:[]}};
}
test('fractional acquisition crop bounds are outward integer windows without rounding scientific evidence polygons',()=>{
 const scope=preparation(),before=structuredClone(scope);
 for(const id of ['ai.clones.d2prl','segmentation-mgcfdn','segmentation-mgcfdn-st','segmentation-selfdm-proposal']){
  const recipe=catalogRecipe(id),params=structuredClone(recipe.params),task=batchTask(recipe,{scientificScope:scope});
  assert.deepEqual(task.regions.map(r=>r.bounds),[[0,0,50,60],[70,0,120,60]]);
  assert.ok(task.regions.every(r=>r.bounds.every(Number.isSafeInteger)&&r.kind==='region'));
  assert.deepEqual(task.params,{...params,selectionPresent:true,scientificScope:scope});
  assert.equal(task.scientificScope,undefined);assert.equal(task.params.excluded,undefined);assert.notEqual(task.params.scientificScope,scope);
  assert.deepEqual(scope,before);
 }
 const sift=catalogRecipe(batchCatalog.find(r=>r.params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text').id),native=batchTask(sift,{scientificScope:scope});
 assert.deepEqual(native.scientificScope.regions,before.regions);assert.deepEqual(native.params.excluded,before.excluded);
 assert.deepEqual(native.params.regions,before.regions.map(r=>r.polygon));
});
test('native window rounding is clipped to original pixels and never silently omits or substitutes a tiny acquisition',()=>{
 assert.deepEqual(batchNeuralCropRegions([{x0:-.2,y0:-.1,x1:200.2,y1:100.1}],{width:200,height:100}),[{x0:0,y0:0,x1:200,y1:100}]);
 for(const regions of [[],[{x0:1.2,y0:1.2,x1:6.4,y1:9.2}],[{x0:199,y0:1,x1:205,y1:20}],[{x0:1,y0:1,x1:20,y1:20,envelope:true}]])
  assert.throws(()=>batchNeuralCropRegions(regions,{width:200,height:100}),{code:'BATCH_SCIENTIFIC_ROI_INVALID'});
});
test('corrected batch windows pass the actual D2PRL and MGCFDN session geometry contracts before model work',async()=>{
 const scope=preparation(),sentinel=Error('Native source identity reached after zone validation'),source={width:200,height:100,region(){throw Error('No model crop expected');},async sha256(){throw sentinel;}};
 const originalZones=scope.regions.map((r,i)=>({id:'original-'+i,kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1]}));
 for(const id of ['ai.clones.d2prl','segmentation-mgcfdn']){
  const budget=new Budget(1024**2),task=batchTask(catalogRecipe(id),{scientificScope:scope}),session=id==='ai.clones.d2prl'
   ?createD2prlAnalysis({budget,modelId:'geometry-fixture',infer:async()=>{throw Error('No inference expected');},project:{run(){throw Error('No projection expected');}}})
   :createSegmentationAnalysis({budget,prepare:{},inference:{model:{id:'geometry-fixture',side:256,kind:'sigmoid'}},project:{run(){throw Error('No projection expected');}}});
  const request={inputSource:source,mode:'regions',backend:'cpu'};
  assert.throws(()=>session.run({...request,zones:originalZones}),error=>error.code==='INVALID_INPUT'&&/Half-open/.test(error.message));
  await assert.rejects(session.run({...request,zones:task.regions}),error=>error===sentinel);
  await session.dispose();assert.equal(budget.total(),0);
 }
});
