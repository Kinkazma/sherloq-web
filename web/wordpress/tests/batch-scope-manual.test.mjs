import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualScopeDraft,normalizeScopeRectangle,addManualScopeZone,updateManualScopeZone,removeManualScopeZone,restoreManualScopeZone,applyManualScopeDraft,restoreManualScientificScope} from '../sherloq-browser/assets/batch-scope-manual.js';
import {rectangleComplement,rectanglePolygon} from '../sherloq-browser/assets/batch-scope-geometry.js';
import {scopeFingerprint,createScientificPreparation} from '../sherloq-browser/assets/batch-scientific-preparation.js';
import {assertBatchScientificScope,batchPairSelection} from '../sherloq-browser/assets/batch-catalog.js';
const sha='a'.repeat(64),image=()=>({id:'figure',name:'figure.png',hash:'pixels',sourceSha256:sha,width:100,height:80,blob:new Blob(['original pixels']),occurrences:[],selected:true});
async function fixture({regions=[{x0:5,y0:10,x1:40,y1:65,type:'microscopy'}],text=[],status='ready',panels=[]}={}){const i=image();i.preparation={schema:'sherloq.scientific-scope/1',version:'batch-preparation-2',coordinates:'original-pixels',sourceSha256:sha,width:i.width,height:i.height,status,regions:regions.map(r=>({...r,polygon:rectanglePolygon(r)})),searchRegions:regions.map(r=>({...r,polygon:rectanglePolygon(r)})),excluded:[...text,...panels.filter(p=>p.label==='Graphs').map(p=>rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]})),...rectangleComplement(regions,i.width,i.height)],panels:{panels},text:{status:status==='ready'?'complete':'incomplete',polygons:text,detections:text.map(polygon=>({polygon})),warnings:[]},models:{text:{sha256:'b'.repeat(64)}}};i.preparation.fingerprint=await scopeFingerprint(i.preparation);return i;}
const hasPixel=(polygons,x,y)=>polygons.some(poly=>{let inside=false;for(let a=0,b=poly.length-1;a<poly.length;b=a++){const p=poly[a],q=poly[b];if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])inside=!inside;}return inside;});

test('a human acquisition extends beyond old margins, keeps source pixels and changes the cache fingerprint',async()=>{
 const i=await fixture(),old=structuredClone(i.preparation),blob=i.blob,d=createManualScopeDraft(i);addManualScopeZone(d,'acquisition',{x0:60.2,y0:20.4,x1:90.1,y1:70.2},{type:'photography'});const scope=await applyManualScopeDraft(i,d);
 assert.equal(scope.status,'ready');assert.equal(scope.family,'mixed');assert.equal(scope.regions.length,2);assert.deepEqual(scope.regions[1].polygon,[[60,20],[91,20],[91,71],[60,71]]);assert.equal(hasPixel(scope.excluded,75.5,40.5),false);assert.equal(hasPixel(scope.excluded,50.5,40.5),true);assert.notEqual(scope.fingerprint,old.fingerprint);assert.equal(scope.manual.actor,'human');assert.equal(scope.manual.sourceSha256,sha);assert.equal(scope.manual.edgeConvention,'half-open-rectangles');assert.equal(scope.sourceSha256,sha);assert.equal(i.blob,blob);assert.deepEqual(i.preparation,old);assert.equal(assertBatchScientificScope({...i,preparation:scope}),scope);
});
test('unknown classes can be explicitly approved without inventing a successful automatic OCR pass',async()=>{
 const i=image(),d=createManualScopeDraft(i);addManualScopeZone(d,'acquisition',{x0:0,y0:0,x1:100,y1:80},{type:'gel'});const scope=await applyManualScopeDraft(i,d);
 assert.equal(scope.family,'gel');assert.equal(scope.text.status,'complete');assert.equal(scope.text.review.actor,'human');assert.equal(scope.text.review.originalStatus,'unavailable');assert.equal(scope.text.rawDetection,null);assert.equal(scope.manual.originalStatus,'unprepared');assert.equal(scope.manual.originalPixelsPreserved,true);assert.equal(scope.regions[0].label,'Blots');
});
test('oriented text polygons survive movement, while resizing records an explicit human rectangle',async()=>{
 const polygon=[[10.2,15.4],[25.2,20.4],[23.2,26.4],[8.2,21.4]],i=await fixture({text:[polygon]}),d=createManualScopeDraft(i),z=d.zones.find(z=>z.kind==='exclusion');
 updateManualScopeZone(d,z.id,{x0:z.x0+3,y0:z.y0+4,x1:z.x1+3,y1:z.y1+4},{operation:'move'});assert.deepEqual(z.polygon,polygon.map(([x,y])=>[x+3,y+4]));
 updateManualScopeZone(d,z.id,{x0:5.4,y0:5.4,x1:30.1,y1:15.1},{operation:'resize'});assert.deepEqual(z.polygon,[[5,5],[31,5],[31,16],[5,16]]);assert.equal(d.actions[1].operation,'resize');const scope=await applyManualScopeDraft(i,d);assert.equal(hasPixel(scope.excluded,10.5,10.5),true);assert.deepEqual(scope.text.rawDetection.polygons,[polygon]);
});
test('fully excluded acquisitions are cancelled before jobs; partial exclusions retain precise polygons',async()=>{
 const regions=[{x0:5,y0:10,x1:40,y1:65,type:'microscopy'},{x0:50,y0:10,x1:95,y1:65,type:'microscopy'}],i=await fixture({regions}),d=createManualScopeDraft(i);
 addManualScopeZone(d,'exclusion',{x0:5,y0:10,x1:20,y1:65});addManualScopeZone(d,'exclusion',{x0:20,y0:10,x1:40,y1:65});addManualScopeZone(d,'exclusion',{x0:55,y0:15,x1:60,y1:20});const s=await applyManualScopeDraft(i,d);
 assert.equal(s.regions.length,1);assert.equal(s.regions[0].x0,50);assert.equal(s.cancelledRegions.length,1);assert.equal(s.searchRegions.length,1);assert.equal(hasPixel(s.excluded,57.5,17.5),true);assert.equal(hasPixel(s.excluded,70.5,30.5),false);
 i.preparation=s;const all=createManualScopeDraft(i);addManualScopeZone(all,'exclusion',{x0:50,y0:10,x1:95,y1:65});const none=await applyManualScopeDraft(i,all);assert.equal(none.status,'excluded');assert.deepEqual(none.regions,[]);assert.deepEqual(none.searchRegions,[]);
});
test('reopening an excluded panel keeps stable IDs and can restore it by removing the human exclusion',async()=>{
 const i=await fixture(),d=createManualScopeDraft(i),id=d.zones[0].id,exclusion=addManualScopeZone(d,'exclusion',{x0:5,y0:10,x1:40,y1:65});i.preparation=await applyManualScopeDraft(i,d);assert.equal(i.preparation.status,'excluded');
 const restored=createManualScopeDraft(i);assert.equal(restored.zones.find(z=>z.kind==='acquisition').id,id);removeManualScopeZone(restored,exclusion.id);const s=await applyManualScopeDraft(i,restored);assert.equal(s.status,'ready');assert.equal(s.regions[0].zoneId,id);assert.deepEqual(s.manual.actions.map(a=>a.operation),['add','delete']);assert.equal(await restoreManualScientificScope({...i,preparation:s}),s);
});
test('adding over an automatic chart stays excluded until the user explicitly removes that exclusion',async()=>{
 const i=await fixture({panels:[{label:'Graphs',rectangle:[50,10,95,65]}]}),d=createManualScopeDraft(i);addManualScopeZone(d,'acquisition',{x0:50,y0:10,x1:95,y1:65});let s=await applyManualScopeDraft(i,d);assert.equal(s.regions.length,1);assert.equal(hasPixel(s.excluded,70,30),true);
 const chart=d.zones.find(z=>z.role==='non-acquisition');removeManualScopeZone(d,chart.id);s=await applyManualScopeDraft(i,d);assert.equal(s.regions.length,2);assert.equal(hasPixel(s.excluded,70,30),false);assert.equal(s.panels.panels.some(p=>p.label==='Graphs'),false);assert.equal(s.manual.originalPanels.panels[0].label,'Graphs');assert.equal(s.manual.actions.at(-1).operation,'delete');
 assert.equal(batchPairSelection({...i,preparation:s},s.regions.map(r=>({x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1}))).regions.length,2);
});
test('unchanged ready pair selection preserves the existing scope object and fingerprint',async()=>{const i=await fixture(),d=createManualScopeDraft(i);assert.equal(await applyManualScopeDraft(i,d),i.preparation);});
test('manual scopes survive archive serialization and preparation without redetecting excluded panels',async()=>{
 const i=await fixture(),d=createManualScopeDraft(i);addManualScopeZone(d,'acquisition',{x0:50,y0:10,x1:95,y1:65});i.preparation=await applyManualScopeDraft(i,d);const scope=JSON.parse(JSON.stringify(i.preparation));i.preparation=scope;assert.equal(await restoreManualScientificScope(i),scope);let detectors=0;
 const model={studies:[{id:'pdf',kind:'pdf',blob:new Blob(['not parsed again'])}],images:[i]},service=createScientificPreparation({clientFactory:async()=>{detectors++;throw Error('Human scope must not be redetected');}});await service.prepare(model);assert.equal(detectors,0);assert.equal(i.preparation,scope);assert.equal(i.selected,true);assert.equal(scope.fingerprint,await scopeFingerprint(scope));
});
test('source swaps, stale drafts and corrupt imported geometry are refused rather than silently reapplied',async()=>{
 const i=await fixture(),d=createManualScopeDraft(i);addManualScopeZone(d,'exclusion',{x0:10,y0:15,x1:15,y1:20});await assert.rejects(applyManualScopeDraft({...i,sourceSha256:'c'.repeat(64)},d),/identité|source|préparation/i);
 await assert.rejects(applyManualScopeDraft({...i,preparation:{...i.preparation,fingerprint:'c'.repeat(64)}},d),/changé/);i.preparation=await applyManualScopeDraft(i,d);i.preparation.excluded[0][0][0]++;await assert.rejects(restoreManualScientificScope(i),/empreinte|zones/i);
 assert.deepEqual(normalizeScopeRectangle({x0:110,y0:90,x1:-5,y1:-3},i),{x0:0,y0:0,x1:100,y1:80});assert.throws(()=>normalizeScopeRectangle({x0:NaN,y0:0,x1:1,y1:1},i));assert.throws(()=>normalizeScopeRectangle({x0:105,y0:0,x1:110,y1:1},i));
});

test('original oriented geometry survives repeated edits and an archive round trip, and cannot be overwritten',async()=>{
 const polygon=[[10.2,15.4],[25.2,20.4],[23.2,26.4],[8.2,21.4]],i=await fixture({text:[polygon]}),d=createManualScopeDraft(i),z=d.zones.find(z=>z.role==='text'),original=structuredClone(z.originalGeometry);
 assert.ok(Object.isFrozen(z.originalGeometry));assert.ok(Object.isFrozen(z.originalGeometry.polygon[0]));assert.throws(()=>{z.originalGeometry.polygon[0][0]=99;},TypeError);assert.throws(()=>{z.originalGeometry={};},TypeError);
 for(let n=0;n<3;n++){updateManualScopeZone(d,z.id,{x0:30+n,y0:31,x1:50+n,y1:48});updateManualScopeZone(d,z.id,{x0:z.x0+1,y0:z.y0+2,x1:z.x1+1,y1:z.y1+2},{operation:'move'});}
 assert.deepEqual(z.originalGeometry,original);i.preparation=JSON.parse(JSON.stringify(await applyManualScopeDraft(i,d)));assert.equal(await restoreManualScientificScope(i),i.preparation);const restored=createManualScopeDraft(i),text=restored.zones.find(zone=>zone.id===z.id);assert.deepEqual(text.originalGeometry,original);assert.equal(restoreManualScopeZone(restored,z.id),true);assert.deepEqual(text.polygon,polygon);assert.equal(restored.actions.at(-1).operation,'restore-original');assert.equal(restoreManualScopeZone(restored,z.id),false);assert.equal(restored.actions.length,1);assert.deepEqual(text.originalGeometry,original);
});
test('legacy archives establish the current geometry as their baseline and reject corrupt stored originals',async()=>{
 const i=await fixture(),d=createManualScopeDraft(i);updateManualScopeZone(d,d.zones[0].id,{x0:10,y0:15,x1:45,y1:60});i.preparation=JSON.parse(JSON.stringify(await applyManualScopeDraft(i,d)));for(const z of i.preparation.manual.zones)delete z.originalGeometry;
 const legacy=createManualScopeDraft(i),z=legacy.zones[0],baseline=structuredClone(z.polygon);assert.deepEqual(z.originalGeometry.polygon,baseline);assert.notDeepEqual(baseline,d.zones[0].originalGeometry.polygon);updateManualScopeZone(legacy,z.id,{x0:20,y0:20,x1:50,y1:50});restoreManualScopeZone(legacy,z.id);assert.deepEqual(z.polygon,baseline);
 const bad=structuredClone(i);bad.preparation.manual.zones[0].originalGeometry={x0:-1,y0:0,x1:20,y1:20,polygon:[[-1,0],[20,0],[20,20],[-1,20]]};assert.throws(()=>createManualScopeDraft(bad),/origine/);await assert.rejects(restoreManualScientificScope(bad),/origine/);
});


import {createOriginalSourceRegionsState} from '../sherloq-browser/assets/original-source-regions.js';
import {originalBatchScientificScope} from '../sherloq-browser/assets/original-source-regions-batch.js';
test('fresh Original selections restore despite a different insertion order of region properties',async()=>{
 const i=image(),state=await createOriginalSourceRegionsState(i);await state.add('acquisition',{x0:5,y0:10,x1:40,y1:65},{id:'positive'});await state.add('exclusion',{x0:10,y0:20,x1:15,y1:25},{id:'hole'});i.originalSourceRegions=state.snapshot();i.preparation=await originalBatchScientificScope(i);assert.equal(i.preparation.fingerprint,await scopeFingerprint(i.preparation));const before=structuredClone(i.preparation);assert.equal(await restoreManualScientificScope(i),i.preparation);assert.deepEqual(i.preparation,before);
 for(const tamper of [scope=>scope.regions[0].x0++,scope=>scope.regions[0].zoneId='different',scope=>scope.excluded[0][0][0]++,scope=>scope.fingerprint='0'.repeat(64)]){const forged={...i,preparation:structuredClone(before)};tamper(forged.preparation);await assert.rejects(restoreManualScientificScope(forged),{code:'BATCH_SCOPE_EDIT_INVALID'});}
 const res = {...i,preparation:structuredClone(before)};res.preparation.regions[0].zoneId='re-signed-inconsistent-id';res.preparation.fingerprint=await scopeFingerprint(res.preparation);await assert.rejects(restoreManualScientificScope(res),{code:'BATCH_SCOPE_EDIT_INVALID'});
});


test('a valid manual acquisition outside its immutable ceiling restores as excluded without a false fingerprint failure',async()=>{
 const i=await fixture(),ceiling=await createOriginalSourceRegionsState(i);await ceiling.add('acquisition',{x0:60,y0:10,x1:95,y1:70});i.preparation.sourceRegionCeiling=ceiling.snapshot();i.preparation.fingerprint=await scopeFingerprint(i.preparation);const draft=createManualScopeDraft(i);updateManualScopeZone(draft,draft.zones[0].id,{x0:6,y0:10,x1:40,y1:65});i.preparation=await applyManualScopeDraft(i,draft);assert.equal(i.preparation.status,'excluded');assert.equal(i.preparation.envelope,null);assert.equal(await restoreManualScientificScope(i),i.preparation);
 const forged=structuredClone(i);forged.preparation.sourceRegionCeiling.zones[0].x0=50;await assert.rejects(restoreManualScientificScope(forged),{code:'BATCH_SCOPE_EDIT_INVALID'});
});
