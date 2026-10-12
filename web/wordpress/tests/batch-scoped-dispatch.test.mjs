import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog,catalogRecipe,batchTask,batchScopeSupport,batchPairSelection,assertBatchScientificScope} from '../sherloq-browser/assets/batch-catalog.js';
import {denseCloneParameters} from '../sherloq-browser/assets/clone-methods.js';
import {rectangleComplement,rectanglePolygon} from '../sherloq-browser/assets/batch-scope-geometry.js';
import {batchComparisonScope} from '../sherloq-browser/assets/batch-runner.js';

const a={x0:0,y0:0,x1:50,y1:60},b={x0:70,y0:0,x1:120,y1:60},graph={x0:140,y0:0,x1:190,y1:60},text=rectanglePolygon({x0:10,y0:10,x1:20,y1:20}),sha='a'.repeat(64),fp='f'.repeat(64);
const scope=()=>({schema:'sherloq.scientific-scope/1',version:'fixture/1',coordinates:'original-pixels',width:200,height:100,sourceSha256:sha,fingerprint:fp,status:'ready',regions:[a,b].map(r=>({...r,polygon:rectanglePolygon(r),type:'microscopy',confidence:.9})),searchRegions:[a,b,{x0:0,y0:0,x1:120,y1:60,envelope:true}].map(r=>({...r,polygon:rectanglePolygon(r)})),excluded:[...rectangleComplement([a,b],200,100),text,rectanglePolygon(graph)],text:{status:'complete',polygons:[text]},panels:{panels:[{label:'Graphs',rectangle:[140,0,190,60],policyHint:'non-acquisition'}]},models:{panels:{sha256:'b'.repeat(64)},text:{sha256:'c'.repeat(64)}}});
const recipe=name=>catalogRecipe(batchCatalog.find(r=>r.params.algorithm===name).id);

test('SIFT scientific dispatch preserves native settings, allows cross-panel search and excludes intervening graph/text gaps',()=>{
 const p=scope(),r=recipe('SIFT + G2NN + RANSAC + Panels + Text'),before=structuredClone(r.params),task=batchTask(r,{imageId:'i',scientificScope:p});
 assert.deepEqual(task.params.regions,p.searchRegions.map(r=>r.polygon));assert.deepEqual(task.params.excluded,p.excluded);assert.deepEqual(task.scientificScope.regions,p.regions);assert.notEqual(task.scientificScope,p);
 assert.equal(task.scientificScope.regions.some(r=>r.envelope),false);assert.equal(task.params.regions.length,3);assert.deepEqual(task.view,{low:0,high:100000,minimum:4,circles:false,lines:false,points:false,areas:true,textExclusions:false});
 for(const key of ['limit','minimum','threshold','tolerance','autoRadius','geometricThreshold','geometricMinimum','reflections'])assert.equal(task.params[key],before[key],key);assert.deepEqual(r.params,before);
});

test('dense search propagates scientific exclusions instead of clearing them, without sending unsupported M3 scope fields',()=>{
 const p=scope(),r=recipe('PatchMatch Zernike'),task=batchTask(r,{scientificScope:p});assert.equal(task.operation,'tampering.copyMove.dense');assert.deepEqual(task.params.excluded,p.excluded);assert.deepEqual(task.params.regions,p.searchRegions.map(r=>r.polygon));assert.equal(task.scientificScope,undefined);
 const native=denseCloneParameters({...r.params,excluded:[text]});assert.deepEqual(native.excluded,[text]);assert.notEqual(native.excluded[0],text);assert.equal(task.params.limit,r.params.limit);assert.equal(task.params.iterations,r.params.iterations);
});

test('SSG, two-real-ROI EfficientLoFTR and Forgeryscope retain their distinct scientific contracts',()=>{
 const p=scope(),ssg=recipe('SSG'),ssgTask=batchTask(ssg,{scientificScope:p});for(const key of ssg.fields.map(f=>f.key))assert.equal(ssgTask.params[key],ssg.params[key],key);assert.deepEqual(ssgTask.params.excluded,p.excluded);assert.equal(ssgTask.params.scientificScope,undefined);assert.deepEqual(ssgTask.scientificScope,p);
 const pair=[{x0:8,y0:8,x1:40,y1:40},{x0:80,y0:8,x1:110,y1:40}],efficient=batchTask(recipe('EfficientLoFTR'),{regions:pair,scientificScope:p});assert.equal(efficient.params.regions.length,2);assert.equal(efficient.params.compare,true);assert.deepEqual(efficient.params.excluded,p.excluded);assert.equal(efficient.scientificScope.regions.length,2);
 const image={hash:'exact-pixels',width:200,height:100,preparation:p};assert.doesNotThrow(()=>batchPairSelection(image,pair));assert.throws(()=>batchPairSelection(image,[pair[0],{x0:140,y0:0,x1:180,y1:40}]),{code:'BATCH_PAIR_REQUIRED'});assert.throws(()=>batchPairSelection(image,[pair[0],{x0:70,y0:0,x1:180,y1:40}]),{code:'BATCH_PAIR_REQUIRED'});
 const fg=batchTask(catalogRecipe('m2.forgeryscope'),{scientificScope:p});assert.deepEqual(fg.params.scientificScope,p);assert.equal(fg.scientificScope,undefined);assert.equal(fg.params.exclusions,undefined);
});

test('segmentation and D2PRL receive true acquisition ROIs only and never unknown algorithm parameters',()=>{
 for(const id of ['ai.clones.d2prl','segmentation-selfdm-proposal']){const r=catalogRecipe(id),task=batchTask(r,{scientificScope:scope()});assert.deepEqual(task.regions.map(r=>r.bounds),[[0,0,50,60],[70,0,120,60]]);assert.equal(task.params.selectionPresent,true);assert.equal(task.params.excluded,undefined);assert.equal(task.params.scientificScope,undefined);assert.equal(task.scientificScope,undefined);assert.equal(batchScopeSupport(r,scope()).mode,'derived-evidence');}
 for(const id of ['analysis.complete','analysis.clones','ela.energy','m2.trufor'])assert.equal(batchScopeSupport(catalogRecipe(id),scope()).mode,'raw-only');
});

test('incomplete preparation cannot become a full-frame task',()=>{
 for(const change of [{status:'needs-review'},{text:{status:'partial'}},{regions:[]},{fingerprint:'legacy'},{sourceSha256:'legacy'},{coordinates:'page-points'}])assert.throws(()=>batchTask(recipe('SIFT + G2NN + RANSAC'),{scientificScope:{...scope(),...change}}),{code:'SCIENTIFIC_SCOPE_REQUIRED'});
 assert.throws(()=>assertBatchScientificScope({name:'mismatch',width:199,height:100,preparation:scope()}),{code:'SCIENTIFIC_SCOPE_REQUIRED'});
});

test('cross-study scope keeps two original image envelopes for searching while all text, graph gaps and padding remain excluded',async()=>{
 const left={id:'left',name:'left.png',width:200,height:100,preparation:scope()},right={id:'right',name:'right.png',width:200,height:100,preparation:{...scope(),fingerprint:'d'.repeat(64)}};
 const prepared=await batchComparisonScope(left,right,{width:200,height:232,offset:132,sourceSha256:'e'.repeat(64)});assert.equal(prepared.regions.length,4);assert.equal(prepared.searchRegions.length,2);assert.deepEqual(prepared.sources.map(s=>s.fingerprint),[fp,'d'.repeat(64)]);assert.equal(prepared.sourceSha256,'e'.repeat(64));
 assert.ok(prepared.excluded.some(poly=>JSON.stringify(poly)===JSON.stringify(text)));assert.ok(prepared.excluded.some(poly=>JSON.stringify(poly)===JSON.stringify(text.map(([x,y])=>[x,y+132]))));assert.ok(prepared.excluded.some(poly=>Math.min(...poly.map(p=>p[0]))===0&&Math.max(...poly.map(p=>p[0]))===200&&Math.min(...poly.map(p=>p[1]))<=100&&Math.max(...poly.map(p=>p[1]))>=132));
 assert.equal(prepared.regions.some(r=>r.envelope),false);assert.equal(prepared.text.status,'complete');assert.match(prepared.fingerprint,/^[a-f0-9]{64}$/);
 right.preparation.fingerprint='c'.repeat(64);const changed=await batchComparisonScope(left,right,{width:200,height:232,offset:132,sourceSha256:'e'.repeat(64)});assert.notEqual(changed.fingerprint,prepared.fingerprint);
});
