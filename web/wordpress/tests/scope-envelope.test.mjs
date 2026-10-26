import test from 'node:test';
import assert from 'node:assert/strict';
import {scientificScopeEnvelope,rectanglePolygon} from '../sherloq-browser/assets/batch-scope-geometry.js';
import {composeScientificScope,scopeFingerprint} from '../sherloq-browser/assets/batch-scientific-preparation.js';
import {createIndividualScientificScope,individualScopeRectangles} from '../sherloq-browser/assets/individual-scientific-scope.js';
import {compileForgeryscopeScientificScope} from '../sherloq-browser/assets/unified-engine/src/forgeryscope-scientific-scope.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/unified-engine/src/source-region-geometry.js';
const sha='a'.repeat(64),size={width:200,height:120},source={...size,sourceSha256:sha},rect=(x0,y0,x1,y1)=>({x0,y0,x1,y1,polygon:rectanglePolygon({x0,y0,x1,y1})});
const frame=r=>r&&[r.x0,r.y0,r.x1,r.y1];

test('derived frame shrinks only when exclusions remove complete native border observations',()=>{
 const scope={...size,regions:[rect(10,10,60,90),rect(100,30,180,100)],excluded:[rect(0,0,30,120).polygon]},before=structuredClone(scope);
 const envelope=scientificScopeEnvelope(scope);assert.deepEqual(frame(envelope),[30,10,180,100]);assert.equal(envelope.countIncluded,8000);assert.equal(envelope.envelope,true);assert.equal(envelope.derived,true);assert.deepEqual(scope,before);
 scope.excluded=[rect(10,10,30,40).polygon];assert.deepEqual(frame(scientificScopeEnvelope(scope)),[10,10,180,100]);
});
test('one fractional acquisition uses native pixel centres rather than rounded geometric corners',()=>{
 const envelope=scientificScopeEnvelope({width:10,height:10,regions:[rect(2.8,1.8,8.2,7.2)],excluded:[]});assert.deepEqual(frame(envelope),[3,2,8,7]);assert.equal(envelope.countIncluded,25);
});
test('disabled zones and prior supplied envelopes cannot become acquisitions; fully excluded scope has no frame',()=>{
 const scope={...size,regions:[rect(10,10,60,90),{...rect(100,0,200,120),enabled:false},{...rect(0,0,200,120),envelope:true}],excluded:[]};assert.deepEqual(frame(scientificScopeEnvelope(scope)),[10,10,60,90]);scope.excluded=[rect(0,0,200,120).polygon];assert.equal(scientificScopeEnvelope(scope),null);scope.regions=[];assert.equal(scientificScopeEnvelope(scope),null);
});
test('the UI frame and native domain measure the same union, rotated polygon and exact exclusions',async()=>{
 const acquisition=[rect(10.5,12.5,40.5,60.5),{x0:60,y0:20,x1:100,y1:70,polygon:[[60,40],[75,20],[100,50],[70,70]]}],excluded=[rect(0,0,20.5,120).polygon,[[68,30],[95,45],[79,68],[62,49]]],state=await createOriginalSourceRegionsState(source);for(const [i,r]of acquisition.entries())await state.add('acquisition',r,{id:'p'+i});for(const [i,polygon]of excluded.entries())await state.add('exclusion',{x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1])),polygon},{id:'e'+i});const native=await compileOriginalSourceRegions(state.snapshot()),visual=scientificScopeEnvelope({...size,regions:acquisition,excluded});assert.deepEqual(frame(visual),frame(native.rect));assert.equal(visual.countIncluded,native.countIncluded);
});
test('individual search envelope is recomputed from current acquisitions/exclusions and never admits the gap',async()=>{
 const image={...source,blob:new Blob(['fixture'])},a=rect(10,10,60,90),b=rect(100,30,180,100),stale={...rect(0,0,200,120),envelope:true},exclusion={...rect(0,0,30,120),kind:'exclusion'};
 const scope=await createIndividualScientificScope(image,{rectangles:[a,b,stale,exclusion],excludeTexts:false});assert.deepEqual(frame(scope.envelope),[30,10,180,100]);assert.equal(scope.regions.length,2);assert.equal(scope.regions.some(r=>r.envelope),false);assert.deepEqual(frame(scope.searchRegions.find(r=>r.envelope)),[30,10,180,100]);const membership=compileForgeryscopeScientificScope(scope,source);assert.equal(membership.admits(20,20),false);assert.equal(membership.admits(35,20),true);assert.equal(membership.admits(80,50),false);
 const rows=individualScopeRectangles({...scope,searchRegions:[stale]});assert.deepEqual(frame(rows.find(r=>r.envelope)),[30,10,180,100]);
});
test('deletion to a single acquisition clears stale search jobs but retains its derived crop; empty selection has none',async()=>{
 const image={...source,blob:new Blob(['fixture'])},a=rect(10,10,60,90),stale={...rect(0,0,200,120),envelope:true};const scope=await createIndividualScientificScope(image,{rectangles:[a,stale],excludeTexts:false});assert.deepEqual(frame(scope.envelope),[10,10,60,90]);assert.equal(scope.searchRegions.filter(r=>r.envelope).length,0);assert.equal(individualScopeRectangles(scope).filter(r=>r.envelope).length,0);
 const empty=await createIndividualScientificScope(image,{excludeTexts:false});assert.equal(empty.envelope,null);assert.equal(empty.regions.length,0);assert.equal(empty.searchRegions.length,0);
});

test('batch preparation derives the same crop from classifier panels and text, without replacing panel membership',()=>{
 const panels={panels:[{label:'Microscopy',rectangle:[10,10,60,90]},{label:'Microscopy',rectangle:[100,30,180,100]}]},text={status:'complete',polygons:[rect(0,0,30,120).polygon],detections:[]},prepared={...source,panels,text},scope=composeScientificScope(source,prepared);
 assert.deepEqual(frame(scope.envelope),[30,10,180,100]);assert.equal(scope.regions.length,2);assert.deepEqual(frame(scope.searchRegions.find(r=>r.envelope)),[30,10,180,100]);assert.equal(scope.regions.some(r=>r.envelope),false);
 const single=composeScientificScope(source,{...prepared,panels:{panels:panels.panels.slice(0,1)}});assert.deepEqual(frame(single.envelope),[30,10,60,90]);assert.equal(single.searchRegions.some(r=>r.envelope),false);
 const none=composeScientificScope(source,{...prepared,panels:{panels:[]}});assert.equal(none.envelope,null);assert.deepEqual(none.searchRegions,[]);
});

test('a local redraw frame intersects its immutable original ceiling and exact holes',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(10,10,60,90),{id:'source-panel'});await state.add('exclusion',rect(10,10,30,90),{id:'source-negative'});const original=state.snapshot(),scope={...source,regions:[rect(0,0,100,120)],excluded:[],originalSourceRegions:original},envelope=scientificScopeEnvelope(scope),native=await compileOriginalSourceRegions(original);assert.deepEqual(frame(envelope),[30,10,60,90]);assert.equal(envelope.countIncluded,native.countIncluded);
 const transported={...scope,originalSourceRegions:undefined,sourceRegionCeiling:native.descriptor};assert.deepEqual(frame(scientificScopeEnvelope(transported)),frame(envelope));
 const local=await createOriginalSourceRegionsState(source);await local.add('acquisition',rect(20,0,100,100));const nested=await compileOriginalSourceRegions(local.snapshot(),{ceiling:native});assert.deepEqual(frame(scientificScopeEnvelope({...scope,originalSourceRegions:undefined,sourceRegionDomain:nested.descriptor})),[30,10,60,90]);
});

test('the inherited ceiling survives scope serialization and binds its scientific fingerprint',async()=>{
 const state=await createOriginalSourceRegionsState(source);await state.add('acquisition',rect(10,10,60,90),{id:'source-region'});const ceiling=state.snapshot(),image={...source,blob:new Blob(['fixture']),sourceRegionCeiling:ceiling},scope=await createIndividualScientificScope(image,{rectangles:[rect(0,0,100,120)],excludeTexts:false});assert.deepEqual(frame(scope.envelope),[10,10,60,90]);assert.deepEqual(scope.sourceRegionCeiling,ceiling);const restored=JSON.parse(JSON.stringify(scope));assert.equal(await scopeFingerprint(restored),scope.fingerprint);assert.deepEqual(frame(scientificScopeEnvelope(restored)),[10,10,60,90]);
 const different=await state.add('exclusion',rect(20,20,30,30),{id:'new-hole'}),changed={...restored,sourceRegionCeiling:different};assert.notEqual(await scopeFingerprint(changed),scope.fingerprint);
 const noCeiling={...restored};delete noCeiling.sourceRegionCeiling;const encoded=new TextEncoder().encode(JSON.stringify([noCeiling.schema,noCeiling.version,noCeiling.sourceSha256,noCeiling.width,noCeiling.height,noCeiling.status,noCeiling.regions,noCeiling.searchRegions,noCeiling.excluded,noCeiling.models,noCeiling.text?.status,noCeiling.maxTextAcquisitionFraction,noCeiling.remainder]));const original=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(n=>n.toString(16).padStart(2,'0')).join('');assert.equal(await scopeFingerprint(noCeiling),original);
});
