import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareNeuralStrictSourceContext} from '../src/neural-strict-source-context.js';
import {localizeSourceRegionTask} from '../src/source-region-localize.js';
const size={width:40,height:30,sourceSha256:'c'.repeat(64)},regions=[{id:'left',kind:'region',bounds:[3,4,11,20]},{id:'right',kind:'region',bounds:[25,4,33,20]},{id:'comparison',kind:'envelope',bounds:[3,4,33,20]}];
async function fixture({cropped=false}={}){const state=await createOriginalSourceRegionsState(size);if(cropped)await state.add('acquisition',{x0:2,y0:3,x1:38,y1:27});return{budget:new Budget(16*1024**2),domain:await compileOriginalSourceRegions(state.snapshot())};}
for(const operation of ['ai.clones.d2prl','ai.clones.segmentation'])test(operation+' explicit acquisitions restrict candidates while their gap remains declared comparison context',async()=>{
 const h=await fixture(),answer=await prepareNeuralStrictSourceContext({domain:h.domain,task:{operation,params:{exclusions:[[5,6,7,8]]},regions:structuredClone(regions)}},h);
 try{assert.equal(answer.candidateDomain.countIncluded,252);assert.equal(answer.candidateDomain.containsOriginal(16,10),false);assert.equal(answer.contextDomain.containsOriginal(16,10),true);assert.equal(answer.contextDomain.containsOriginal(5,6),false);assert.equal(answer.contextDomain.countIncluded,476);assert.deepEqual(answer.contextDomain.origin,[3,4]);}finally{answer.release();assert.equal(h.budget.total(),0);}
});
test('localized native regions and exclusions are restored exactly once before positive membership is built',async()=>{
 const h=await fixture({cropped:true}),task={id:'local',operation:'ai.clones.d2prl',params:{exclusions:[[5,6,7,8]]},regions:structuredClone(regions)},localized=await localizeSourceRegionTask(task,h.domain,{strictNeuralFragments:true}),a=await prepareNeuralStrictSourceContext({domain:h.domain,task},h),b=await prepareNeuralStrictSourceContext({domain:h.domain,task:localized},h);
 try{for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){assert.equal(a.candidateDomain.containsOriginal(x,y),b.candidateDomain.containsOriginal(x,y));assert.equal(a.contextDomain.containsOriginal(x,y),b.contextDomain.containsOriginal(x,y));}assert.equal(a.candidateDomain.countIncluded,252);}finally{a.release();b.release();assert.equal(h.budget.total(),0);}
});
test('an explicit single envelope API request is bounded rather than defaulting to the complete source',async()=>{
 const h=await fixture(),answer=await prepareNeuralStrictSourceContext({domain:h.domain,task:{operation:'ai.clones.d2prl',regions:[regions[2]]}},h);try{assert.equal(answer.candidateDomain.countIncluded,480);assert.equal(answer.candidateDomain.containsOriginal(1,1),false);assert.equal(answer.candidateDomain.containsOriginal(16,10),true);}finally{answer.release();assert.equal(h.budget.total(),0);}
});
test('empty native regions retains the existing whole-image API default and malformed explicit bounds are rejected',async()=>{
 const h=await fixture(),answer=await prepareNeuralStrictSourceContext({domain:h.domain,task:{operation:'ai.clones.d2prl',regions:[]}},h);assert.equal(answer.candidateDomain.countIncluded,1200);answer.release();
 for(const bounds of [[3.5,4,11,20],[-1,4,11,20],[3,4,41,20],[11,4,3,20]]){await assert.rejects(prepareNeuralStrictSourceContext({domain:h.domain,task:{operation:'ai.clones.d2prl',regions:[{id:'bad',kind:'region',bounds}]}},h),{code:'INVALID_INPUT'});assert.equal(h.budget.total(),0);}
});

test('strict clone localization admits one-pixel explicit geometry while the legacy minimum remains unchanged',async()=>{
 const h=await fixture({cropped:true}),raw={operation:'ai.clones.d2prl',params:{exclusions:[[5,6,6,7]]},regions:[{id:'tiny',kind:'region',bounds:[5,5,6,8]}]};
 await assert.rejects(localizeSourceRegionTask(raw,h.domain),{code:'SOURCE_SCOPE_EMPTY'});
 const localized=await localizeSourceRegionTask(raw,h.domain,{strictNeuralFragments:true}),answer=await prepareNeuralStrictSourceContext({domain:h.domain,task:localized},h);
 try{assert.equal(localized.sourceRegionLocalization.strictNativeFragments,true);assert.equal(answer.candidateDomain.countIncluded,2);assert.equal(answer.contextDomain.countIncluded,2);assert.equal(answer.candidateDomain.containsOriginal(5,6),false);}finally{answer.release();assert.equal(h.budget.total(),0);}
});
