// Transport/cache ownership qualification with mocked preparation/inference.
// These small probability grids do not qualify any native neural model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {prepareNeuralScientificScope} from '../src/neural-scientific-scope.js';
import {createSegmentationAnalysis} from '../experiments/segmentation/analysis.js';

const sha='a'.repeat(64),fingerprint='f'.repeat(64),width=16,height=16,side=8;
const zones=[{id:'left',kind:'region',bounds:[0,0,8,16]},{id:'right',kind:'region',bounds:[8,0,16,16]}];
const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const scope=(excluded=[])=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',fingerprint,sourceSha256:sha,width,height,regions:[{x0:0,y0:0,x1:width,y1:height}],excluded});
function harness(){
 const budget=new Budget(1024**2),pixels={width,height,data:Uint8Array.from({length:width*height*3},(_,i)=>i%239)},seen=[],projections=[],live={prepare:0,output:0,result:0};let prepareCalls=0,failPrepareCall=0;
 const lease=(key,bytes)=>{const release=budget.reserve(bytes);live[key]++;let closed=false;return ()=>{if(closed)return;closed=true;live[key]--;release();};};
 const prepare={async run(input){prepareCalls++;if(prepareCalls===failPrepareCall)budget.reserve(budget.limit+1);const release=lease('prepare',128);return {tensor:{rgb:input.data.slice(),width:input.width,height:input.height},release};},dispose(){}};
 const inference={model:{id:'scientific-cache-contract',variant:'mock',side,kind:'sigmoid',bytes:0},backend:'cpu',async run(input,hooks){seen.push({rgb:input.rgb.slice(),width:input.width,height:input.height,sourceKey:hooks.sourceKey,scientificScope:structuredClone(hooks.scientificScope),hasScope:Object.hasOwn(hooks,'scientificScope')});return {raw:new Float32Array(side**2).fill(seen.length/100),release:lease('output',side**2*4),...(hooks.scientificScope?{metadata:{scientificScope:{identity:hooks.scientificScope.identity,sourceSha256:hooks.scientificScope.sourceSha256,bounds:[...hooks.scientificScope.bounds]}}}:{})};},dispose(){}};
 const project={async run(input){projections.push({scientificScope:structuredClone(input.scientificScope),zones:input.zones.map(z=>({id:z.id,bounds:[...z.bounds],rawValue:z.raw[0]}))});return {width,height,metadata:{zones:input.zones.map(z=>({id:z.id,bounds:[...z.bounds]}))},release:lease('result',64)};}};
 const analysis=createSegmentationAnalysis({budget,prepare,inference,project});
 const inputSource={width,height,sha256:async()=>sha,region(bounds){const [x0,y0,x1,y1]=bounds,data=new Uint8Array((x1-x0)*(y1-y0)*3);for(let y=y0;y<y1;y++)data.set(pixels.data.subarray((y*width+x0)*3,(y*width+x1)*3),(y-y0)*(x1-x0)*3);return {width:x1-x0,height:y1-y0,data};}};
 return {budget,pixels,inputSource,analysis,seen,projections,live,setPrepareOom(call){failPrepareCall=call;},prepareCalls:()=>prepareCalls,async plan(value=scope()){return prepareNeuralScientificScope(value,zones,{width,height,sourceSha256:sha,side,budget,requireGridSupport:false,retainMatchingGrid:false});},assertReleased(){assert.deepEqual(live,{prepare:0,output:0,result:0});assert.equal(budget.snapshot().activeReservationBytes,0);},async close(){await analysis.dispose();prepare.dispose();inference.dispose();assert.deepEqual(live,{prepare:0,output:0,result:0});assert.equal(budget.total(),0);}};
}
test('prepared sourceScope retains exact geometry/identity and rejects another source or dimensions before allocation',async()=>{
 const h=harness();let plan;
 try{for(const bad of [{...scope(),width:17},{...scope(),height:15},{...scope(),sourceSha256:'b'.repeat(64)}]){await assert.rejects(h.plan(bad),{code:'INVALID_INPUT'});assert.equal(h.budget.total(),0);}plan=await h.plan(scope([rectangle(2,2,4,4)]));assert.deepEqual(plan.sourceScope,scope([rectangle(2,2,4,4)]));assert.equal(plan.metadata.sourceSha256,sha);assert.equal(plan.metadata.width,width);assert.equal(plan.metadata.height,height);assert.equal(typeof plan.identity,'string');assert.deepEqual(plan.zones,zones);assert.equal(h.budget.total(),0);
  for(const bad of [{...plan,sourceScope:null},{...plan,identity:null},{...plan,metadata:{...plan.metadata,width:17}}])assert.throws(()=>h.analysis.run({pixels:h.pixels,zones,scientificScope:bad}),{code:'INVALID_INPUT'});assert.equal(h.seen.length,0);
 }finally{plan?.release();await h.close();}
});
test('contiguous and segmented crops transmit original RGB and per-zone scoped hooks without mutating the plan',async()=>{
 for(const segmented of [false,true]){const h=harness(),plan=await h.plan(scope([rectangle(2,2,4,4)])),before=structuredClone(plan.sourceScope),rgb=h.pixels.data.slice();
  try{const result=await h.analysis.run({...(segmented?{inputSource:h.inputSource}:{pixels:h.pixels}),zones,scientificScope:plan,provenance:{originalSha256:sha,decoder:'contract'}});try{assert.equal(result.metadata.inferences,2);for(const [i,observed]of h.seen.entries()){assert.equal(observed.hasScope,true);assert.equal(observed.scientificScope.identity,plan.identity);assert.equal(observed.scientificScope.sourceSha256,sha);assert.deepEqual(observed.scientificScope.scope,before);assert.deepEqual(observed.scientificScope.bounds,zones[i].bounds);assert.deepEqual(observed.rgb,h.inputSource.region(zones[i].bounds).data);assert.ok(observed.sourceKey.includes(plan.identity.replaceAll('"','\\"')));assert.deepEqual(result.metadata.nativePipelines[i].originalBounds,zones[i].bounds);assert.equal(result.metadata.nativePipelines[i].scientificScope.identity,plan.identity);}}finally{result.release();}assert.deepEqual(h.pixels.data,rgb);assert.deepEqual(plan.sourceScope,before);h.assertReleased();
  }finally{plan.release();await h.close();}
 }
});
test('unscoped and distinct exact scopes never share grids despite identical pixels/bounds and a repeated fingerprint',async()=>{
 const h=harness(),a=await h.plan(scope([rectangle(2,2,4,4)])),b=await h.plan(scope([rectangle(10,2,12,4)]));
 try{assert.equal(a.metadata.fingerprint,b.metadata.fingerprint);assert.notEqual(a.identity,b.identity);for(const [plan,total,hits]of [[undefined,2,0],[a,4,0],[b,6,0],[a,6,2],[undefined,6,2]]){const result=await h.analysis.run({pixels:h.pixels,zones,...(plan?{scientificScope:plan}:{})});assert.equal(h.seen.length,total);assert.equal(result.metadata.cache_hits,hits);result.release();h.assertReleased();}assert.equal(h.seen[0].hasScope,false);assert.equal(h.seen[1].hasScope,false);assert.notEqual(h.seen[0].sourceKey,h.seen[2].sourceKey);assert.notEqual(h.seen[2].sourceKey,h.seen[4].sourceKey);
 }finally{a.release();b.release();await h.close();}
});
test('cache-only reprojection preserves scoped pipeline/source provenance and subset order with zero new inference',async()=>{
 const h=harness(),plan=await h.plan(scope([rectangle(2,2,4,4)]));
 try{const first=await h.analysis.run({pixels:h.pixels,zones,scientificScope:plan,provenance:{originalSha256:sha,decoder:'original'}}),analysisId=first.metadata.analysisId,pipelines=structuredClone(first.metadata.nativePipelines);first.release();const view=await h.analysis.reproject({analysisId,zoneIds:['right']});try{assert.equal(view.metadata.inferences,0);assert.equal(h.seen.length,2);assert.deepEqual(view.metadata.sourceProvenance,{originalSha256:sha,decoder:'original'});assert.deepEqual(view.metadata.nativePipelines,[pipelines[1]]);assert.deepEqual(h.projections.at(-1).scientificScope,h.projections[0].scientificScope);assert.deepEqual(view.metadata.zones.map(z=>z.id),['right']);const raw=h.analysis.readRaw(view.metadata.resultId);try{assert.equal(raw.rawGrids.length,1);assert.equal(raw.metadata.nativePipelines[0].scientificScope.identity,plan.identity);}finally{raw.release();}}finally{view.release();}h.assertReleased();
 }finally{plan.release();await h.close();}
});
test('cancelled scoped work discards only newly inserted grids, releases ownership and permits a clean retry',async()=>{
 const h=harness(),plan=await h.plan(scope([rectangle(2,2,4,4)]));
 try{const baseline=await h.analysis.run({pixels:h.pixels,zones});baseline.release();const cacheBefore=h.budget.snapshot().cacheBytes,abort=new AbortController();await assert.rejects(h.analysis.run({pixels:h.pixels,zones,scientificScope:plan},{signal:abort.signal,onProgress:event=>{if(event.phase==='zone-complete')abort.abort();}}),{code:'CANCELLED'});assert.equal(h.budget.snapshot().cacheBytes,cacheBefore);h.assertReleased();const before=h.seen.length,result=await h.analysis.run({pixels:h.pixels,zones,scientificScope:plan});assert.equal(result.metadata.inferences,2);assert.equal(h.seen.length,before+2);result.release();h.assertReleased();
 }finally{plan.release();await h.close();}
});
test('real Budget OOM after one scoped zone releases ownership and never reuses grids reclaimed under pressure',async()=>{
 const h=harness(),plan=await h.plan(scope([rectangle(2,2,4,4)]));
 try{const baseline=await h.analysis.run({pixels:h.pixels,zones});baseline.release();assert.equal(h.budget.snapshot().cacheBytes,2*side**2*4);h.setPrepareOom(h.prepareCalls()+2);await assert.rejects(h.analysis.run({pixels:h.pixels,zones,scientificScope:plan}),{code:'MEMORY_LIMIT'});
  // Budget.room deliberately reclaims idle raw-grid caches before reporting
  // impossible admission. Such evicted grids require an explicit new run.
  assert.equal(h.budget.snapshot().cacheBytes,0);h.assertReleased();const before=h.seen.length,old=await h.analysis.run({pixels:h.pixels,zones});assert.equal(old.metadata.inferences,2);assert.equal(old.metadata.cache_hits,0);assert.equal(h.seen.length,before+2);old.release();h.setPrepareOom(0);const retry=await h.analysis.run({pixels:h.pixels,zones,scientificScope:plan});assert.equal(retry.metadata.inferences,2);retry.release();h.assertReleased();
 }finally{plan.release();await h.close();}
});
