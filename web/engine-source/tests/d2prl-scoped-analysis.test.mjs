import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {prepareNeuralScientificScope} from '../src/neural-scientific-scope.js';
import {createD2prlAnalysis} from '../experiments/d2prl/analysis.js';
const sha='a'.repeat(64),zone={id:'panel',kind:'region',bounds:[0,0,16,16]},scope=excluded=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',fingerprint:'b'.repeat(64),sourceSha256:sha,width:16,height:16,regions:[{x0:0,y0:0,x1:16,y1:16}],excluded});
test('real session forwards membership before inference, keys its cache by scoped geometry, and refilters without re-inference',async()=>{
 const budget=new Budget(64*1024**2),pixels={width:16,height:16,data:new Uint8Array(768).fill(79)},before=pixels.data.slice(),seen=[];
 const project={async run(input){return {width:16,height:16,metadata:{zones:input.zones.map(z=>({id:z.id,bounds:z.bounds})),exclusions:[]},release(){}};}};
 // Only computation is observed here; these fake grids are not scientific
 // qualification. The separate evaluator test executes the actual pinned WASM.
 const analysis=createD2prlAnalysis({budget,modelId:'native-contract-fixture',project,infer:async(input)=>{seen.push({rgb:input.rgb.slice(),grid:input.scientificMask});return {raw:new Float32Array(3*448**2),decision:{},execution:{},release(){}};}});
 const plan1=await prepareNeuralScientificScope(scope([[[4,4],[8,4],[8,8],[4,8]]]),[zone],{width:16,height:16,sourceSha256:sha,side:448,budget});
 let plan2;
 try{const first=await analysis.run({pixels,zones:[zone],backend:'cpu',minimum:500,scientificScope:plan1});first.release();assert.equal(seen.length,1);assert.deepEqual(seen[0].rgb,before);assert.ok(seen[0].grid.values.some(v=>v===0));assert.equal(first.metadata.scientificScope.fingerprint,plan1.metadata.fingerprint);
  const same=await analysis.run({pixels,zones:[zone],backend:'cpu',minimum:500,scientificScope:plan1});same.release();assert.equal(seen.length,1);assert.equal(same.metadata.cache_hits,1);
  plan2=await prepareNeuralScientificScope(scope([[[1,1],[3,1],[3,3],[1,3]]]),[zone],{width:16,height:16,sourceSha256:sha,side:448,budget});const changed=await analysis.run({pixels,zones:[zone],backend:'cpu',minimum:500,scientificScope:plan2});changed.release();assert.equal(seen.length,2,'Even an incorrectly repeated fingerprint cannot reuse different polygons.');
  const filtered=await analysis.refilter({analysisId:changed.metadata.analysisId,minimum:501});filtered.release();assert.equal(seen.length,2);assert.equal(filtered.metadata.inferences,0);assert.equal(filtered.metadata.scientificScope.fingerprint,plan2.metadata.fingerprint);assert.deepEqual(pixels.data,before);
 }finally{plan1.release();plan2?.release();await analysis.dispose();}assert.equal(budget.total(),0);
});
