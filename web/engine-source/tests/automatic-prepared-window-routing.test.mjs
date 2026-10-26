import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticPreparedSparse} from '../src/automatic-prepared-sparse.js';
import {SIFT_SOURCE} from '../src/clone-relations.js';
const box=([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]],sha='a'.repeat(64);
function fixture(){
 const origin=[17,29],scope={status:'ready',fingerprint:'local',text:{status:'complete'}},originalScope={status:'ready',fingerprint:'Original',text:{status:'complete'},regions:[{id:'a',x0:17,y0:29,x1:37,y1:49},{id:'b',x0:37,y0:29,x1:57,y1:49}],excluded:[box([23,35,25,37])]};
 const image={sha256:sha,sourceRegionOrigin:origin,surface:{descriptor:{width:40,height:20},readWindow(){throw Error('Routing cannot read RGB');}}},calls=[],results=[],counts={features:7},context={width:40,height:20,origin,sourceDomain:{sourceSha256:sha},inputScopeFingerprint:'local',originalTask:{operation:'analysis.complete',cloneWindowMode:'independent',sourceRegionLocalization:{old:true},params:{scientificScope:originalScope}}};
 const native={algorithm:SIFT_SOURCE,regions:[box([0,0,20,20]),box([20,0,40,20])],excluded:[box([6,6,8,8])],guides:[box([2,2,4,4])],limit:6000,reflections:true,compare:false,threshold:.7,model:'Affine'};
 let factories=0,disposed=0,cleared;
 const engine={counts,clearCheckpoint(key){cleared=key;},async analyze(params,hooks){calls.push({params,hooks});const result={cloneWindowMode:hooks.sourceRegionTask.cloneWindowMode,points:new Float64Array([1,2]),metadata:{native:true},release(){}};results.push(result);return result;},async dispose(){disposed++;}};
 const adapter=createAutomaticPreparedSparse(image,{reserve(){}},{maxWorkers:10},{getContext:async()=>context,windowEngineFactory:(actual,budget,profile,options)=>{assert.strictEqual(actual,image);assert.equal(profile.maxWorkers,10);assert.equal(options.admitIndependent({task:{params:{...native,scientificScope:originalScope}}}),true);assert.equal(options.admitGlobal({task:{params:{...native,scientificScope:originalScope}}}),true);factories++;return engine;}});
 return{adapter,context,scope,originalScope,native,calls,results,origin,stats:()=>({factories,disposed,cleared})};
}
test('prepared aggregate restores native polygons to Original once and retains its exact preparation and backend',async()=>{
 const f=fixture();try{const params=structuredClone(f.native),before=structuredClone(params);const answer=await f.adapter.analyze(params,{scientificScope:f.scope,backend:'webgpu'}),call=f.calls[0],task=call.hooks.sourceRegionTask;
  assert.strictEqual(answer,f.results[0]);assert.strictEqual(call.params.scientificScope,f.originalScope);assert.strictEqual(task.params,call.params);assert.equal(task.operation,'tampering.copyMove.sparse');assert.equal(task.cloneWindowMode,'independent');assert.equal(task.backend,'webgpu');assert.equal(task.sourceRegionLocalization,undefined);assert.equal(call.hooks.scientificScope,undefined);
  assert.deepEqual(call.params.regions,[box([17,29,37,49]),box([37,29,57,49])]);assert.deepEqual(call.params.excluded,[box([23,35,25,37])]);assert.deepEqual(call.params.guides,[box([19,31,21,33])]);assert.deepEqual(params,before);for(const name of ['limit','reflections','compare','threshold','model'])assert.equal(call.params[name],before[name]);
 }finally{await f.adapter.dispose();assert.equal(f.stats().disposed,1);}
});
test('explicit global and subsequent independent runs use the retained product engine; native raw and checkpoint API survive',async()=>{
 const f=fixture();try{for(const cloneWindowMode of ['independent','global','independent'])assert.equal((await f.adapter.analyze(f.native,{scientificScope:f.scope,cloneWindowMode,backend:'auto'})).cloneWindowMode,cloneWindowMode);assert.equal(f.stats().factories,1);assert.equal(new Set(f.results.map(r=>r.points)).size,3);f.adapter.clearCheckpoint('native-key');assert.equal(f.stats().cleared,'native-key');assert.deepEqual(f.adapter.counts,{features:7});}finally{await f.adapter.dispose();}
});
test('a foreign prepared source fails before native work instead of using the whole image',async()=>{
 const f=fixture();try{f.context.origin=[0,0];await assert.rejects(f.adapter.analyze(f.native,{scientificScope:f.scope}),/differs/);assert.equal(f.calls.length,0);assert.equal(f.stats().factories,0);}finally{await f.adapter.dispose();}
});
test('missing Original scientific preparation does not reinterpret localized polygons',async()=>{
 const f=fixture();try{delete f.context.originalTask.params.scientificScope;await assert.rejects(f.adapter.analyze(f.native,{scientificScope:f.scope}),/Original scientific preparation/);assert.equal(f.calls.length,0);}finally{await f.adapter.dispose();}
});
test('incomplete text preparation or an unknown mode fails without invoking a native producer',async()=>{
 const f=fixture();try{await assert.rejects(f.adapter.analyze(f.native,{scientificScope:{...f.scope,text:{status:'pending'}}}),/must be complete/);await assert.rejects(f.adapter.analyze(f.native,{scientificScope:f.scope,cloneWindowMode:'silently-whole'}),/Invalid automatic/);assert.equal(f.calls.length,0);}finally{await f.adapter.dispose();}
});
test('a disposed aggregate cannot reacquire its retained source',async()=>{const f=fixture();await f.adapter.dispose();await assert.rejects(f.adapter.analyze(f.native,{scientificScope:f.scope}),/disposed/);assert.equal(f.stats().factories,0);});
