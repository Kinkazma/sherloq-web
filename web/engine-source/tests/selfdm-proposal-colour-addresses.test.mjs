import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelfDMProposalColourAddresses as addresses, estimateSelfDMProposalColourSeedsMemory as estimate} from '../src/selfdm-proposal-colour-addresses.js';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState, compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';

async function viewFor(boxes, budget) {
  const source = {sourceSha256: 'a'.repeat(64), width: 16, height: 12};
  const state = await createOriginalSourceRegionsState(source);
  await state.replaceZones(boxes.map((b,i) => ({id: 'z'+i, kind:'acquisition', enabled:true, x0:b[0], y0:b[1], x1:b[2], y1:b[3]})), {enabled:true, positiveMode:'selected'});
  const domain = await compileOriginalSourceRegions(state.snapshot());
  return createSourceRegionView({width:16,height:12,sha256:source.sourceSha256,readWindow(){throw Error('Address/memory preparation must not read RGB');}}, domain.descriptor, {budget});
}
const roi = {x:0,y:0,width:16,height:12};
test('actual canonical view makes owner addresses invariant to H/V, reverse, duplicate overlap and read bounds', async () => {
  const budget = new Budget(1048576), H=[[0,0,16,6],[0,6,8,12]], V=[[0,0,8,12],[8,0,16,6]];
  let first;
  for (const boxes of [H,V,[...H].reverse(),[...V].reverse(),[...V,[0,0,5,12],[0,0,16,4]]]) {
    const view = await viewFor(boxes,budget), plan = addresses(view,roi,{budget});
    try { if (!first) first={indices:plan.indices.slice(),rectangles:plan.rectangles.slice()}; assert.deepEqual(plan.indices,first.indices);assert.deepEqual(plan.rectangles,first.rectangles);assert.equal(plan.count,144);assert.equal(plan.metadata.RGBReads,0); }
    finally { plan.release();plan.release();await view.dispose(); }
  }
  assert.equal(budget.total(),0);
});
test('empty ROI remains an explicit zero-observation plan without RGB/native work', async () => {
  const budget=new Budget(1048576),view=await viewFor([[0,0,16,6],[0,6,8,12]],budget),plan=addresses(view,{x:8,y:6,width:8,height:6},{budget});
  try { assert.equal(plan.count,0);assert.equal(plan.rectanglesCount,0);assert.equal(plan.indices.length,0);assert.equal(estimate({width:8,height:6,outWidth:320,outHeight:240,sourceCount:0,rectanglesCount:0}).nativeInvocationRequired,false); }
  finally {plan.release();await view.dispose();}assert.equal(budget.total(),0);
});
test('memory estimate keeps existing hierarchy and accounts complete packed/tap/support scratch before native work',()=>{
  const value=estimate({width:16,height:12,outWidth:320,outHeight:240,sourceCount:144,rectanglesCount:2});
  assert.ok(value.heapBytes>=32*1048576);assert.equal(value.heapBytes%1048576,0);assert.equal(value.inputBytes,144*7+2*16);assert.equal(value.outputBytesUpper,320*240*60);assert.equal(value.noSilentResolutionOrIterationReduction,true);
});
test('unadmittable native heap refuses before RGB/allocations, without resolution or CPU fallback',()=>{
  assert.throws(()=>estimate({width:131072,height:16383,outWidth:2000,outHeight:1500,sourceCount:144,rectanglesCount:2}),error=>error.code==='MEMORY_LIMIT');
});
test('primitive metadata admission is retained and invalid geometry refuses before admission',async()=>{
  const budget=new Budget(1048576),view=await viewFor([[0,0,16,6],[0,6,8,12]],budget);let calls=0,caught=false,reason;
  const fail={reserve(){calls++;throw false;}};
  assert.throws(()=>addresses(view,{...roi,width:17},{budget:fail}));assert.equal(calls,0);
  try{addresses(view,roi,{budget:fail});}catch(error){caught=true;reason=error;}
  assert.equal(caught,true);assert.equal(reason,false);assert.equal(calls,1);await view.dispose();assert.equal(budget.total(),0);
});
