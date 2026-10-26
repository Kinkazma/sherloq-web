import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {localizeSourceRegionTask} from '../src/source-region-localize.js';
import {sourceRegionOperationCapability} from '../src/source-region-capabilities.js';
import {SOURCE_REGION_SPATIAL_ADAPTERS} from '../src/source-region-spatial.js';
import {prepareCloneAnalysisWindows} from '../src/clone-analysis-windows.js';
import {createEfficientLoFtrNativeWindowCallback} from '../src/efficient-loftr-native-windows.js';
const box=([x,y,r,b])=>[[x,y],[r,y],[r,b],[x,b]],sha='f'.repeat(64),width=160,height=96,rois=[box([8,8,56,72]),box([96,16,144,80])];
test('explicit two native ROI comparison is independent of the number of declared source acquisitions (0NN)',async()=>{
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});await state.add('acquisition',{bounds:[0,0,width,height]});await state.add('exclusion',{bounds:[72,24,80,32]});const domain=await compileOriginalSourceRegions(state.snapshot()),task={operation:'tampering.copyMove.sparse',params:{algorithm:'ALIKED',compare:true,regions:rois}};
 const local=await localizeSourceRegionTask(task,domain,{strictSparseFragments:true});assert.deepEqual(local.params.regions,rois);assert.equal(local.params.compare,true);assert.equal(local.sourceRegionLocalization.sparseDefaults.effectiveAcquisitions,1);
});
test('EfficientLoFTR native acquisition gate is opened only alongside its real registered upstream adapter (0NN)',()=>{
 const value=sourceRegionOperationCapability('tampering.copyMove.sparse',{shape:'native-regions',params:{algorithm:'EfficientLoFTR',regions:rois,compare:true},adapters:SOURCE_REGION_SPATIAL_ADAPTERS});assert(value.supported,'The product adapter remains blocked by legacy native-region rule');
});
test('EfficientLoFTR omitted compare keeps its native true default and exactly two supplied ROI polygons under a scope (0NN)',async()=>{
 const budget=new Budget(256*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height}),domain=await compileOriginalSourceRegions(state.snapshot()),windows=[{id:'mini-a',bounds:[0,0,64,96]},{id:'mini-b',bounds:[88,0,160,96]},{id:'declared-overview',kind:'envelope',bounds:[0,0,160,96]}],scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width,height,fingerprint:'native-two-roi-default',status:'ready',regions:windows.map(w=>({id:w.id,polygon:box(w.bounds),x0:w.bounds[0],y0:w.bounds[1],x1:w.bounds[2],y1:w.bounds[3]})),excluded:[]};scope.searchRegions=scope.regions;
 const task={operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',backend:'webgpu',scientificScope:scope,regions:windows,params:{algorithm:'EfficientLoFTR',regions:rois}},plan=await prepareCloneAnalysisWindows({domain,task},{budget}),calls=[],owners=[];
 const source={sha256:sha,surface:{descriptor:{format:'rgb8',width,height},readWindow(r){const free=budget.reserve(r.width*r.height*3);return{pixels:{format:'rgb8',width:r.width,height:r.height,data:new Uint8Array(r.width*r.height*3)},release:free};}}};
 const callback=createEfficientLoFtrNativeWindowCallback({original:source,budget,profile:{maxWorkers:10},engineFactory:()=>({async analyze(p){calls.push(p);return{params:p,metadata:{algorithm:'EfficientLoFTR'},release(){}};},dispose(){}})});let raw;
 try{raw=await callback({window:plan.windows[2],task:plan.originalTask,onOwner:o=>owners.push(o),sourceContextIdentity:'exact-native-default'});assert.equal(calls.length,1);assert.equal(calls[0].compare,true);assert.deepEqual(calls[0].regions,rois);assert.equal(task.params.compare,undefined);assert.deepEqual(raw.provenance.params,task.params);}finally{await raw?.release();for(const o of owners)await o.dispose();await callback.dispose();plan.release();assert.equal(budget.total(),0);}
});

test('canonical top-level windows retain their Original coordinates while scientific parameters are localized (0NN)',async()=>{
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});await state.add('acquisition',{bounds:[0,0,width,height]});await state.add('exclusion',{bounds:[72,24,80,32]});const domain=await compileOriginalSourceRegions(state.snapshot()),regions=[{id:'arbitrary-bounds-only',bounds:[0,0,64,96]},{id:'native-polygon-only',polygon:box([88,0,160,96])}],task={operation:'tampering.copyMove.sparse',params:{algorithm:'XFeat'},regions};
 const out=await localizeSourceRegionTask(task,domain,{strictSparseFragments:true});assert.deepEqual(out.regions[0].bounds,regions[0].bounds);assert.deepEqual(out.regions[1].polygon,regions[1].polygon);assert.equal(out.regions[0].x1,undefined);assert.equal(out.regions[1].x0,undefined);assert.equal(task.regions[0].x0,undefined);
});

test('a native scientific comparison can retain its second ROI outside a selected analysis crop without clipping or fallback (0NN)',async()=>{
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});await state.add('acquisition',{bounds:[0,0,64,96]});const domain=await compileOriginalSourceRegions(state.snapshot());for(const algorithm of ['XFeat','EfficientLoFTR']){const params={algorithm,regions:rois,...(algorithm==='XFeat'?{compare:true}:{})},task={operation:'tampering.copyMove.sparse',params},out=await localizeSourceRegionTask(task,domain,{strictSparseFragments:true});assert.deepEqual(out.params.regions,rois);assert.equal(out.params.compare,params.compare);}
});
