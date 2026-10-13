import test from 'node:test';
import assert from 'node:assert/strict';
import {createIndividualScientificScope,individualScopeRectangles,scopeIndividualTask} from '../sherloq-browser/assets/individual-scientific-scope.js';
import {createManualScopeDraft} from '../sherloq-browser/assets/batch-scope-manual.js';
import {scopeFingerprint} from '../sherloq-browser/assets/batch-scientific-preparation.js';
import {compileForgeryscopeScientificScope} from '../../engine-source/src/forgeryscope-scientific-scope.js';
import {sparseParameters} from '../sherloq-browser/assets/sparse-controls.js';
const sha='a'.repeat(64),image={width:240,height:180,sourceSha256:sha,blob:new Blob(['source-immutable']),name:'scientific.png'},rectangle=(x0,y0,x1,y1)=>({x0,y0,x1,y1}),polygon=r=>[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
const regions=Array.from({length:6},(_,i)=>({...rectangle(i%3*80+5,Math.floor(i/3)*90+5,i%3*80+65,Math.floor(i/3)*90+65),id:'panel-'+i})),envelope={...rectangle(5,5,225,155),id:'panels-envelope',envelope:true},prepared=()=>({width:240,height:180,sourceSha256:sha,panels:{panels:[{label:'Microscopy',rectangle:[0,0,240,180],confidence:.99}],detector:{sha256:'b'.repeat(64)}},text:{status:'complete',polygons:[[[12,12],[20,12],[20,16],[12,16]]],detections:[],warnings:[],metadata:{model:{id:'PP-OCRv6_small_det'}}}});

test('Six geometric panels retain exact original membership and a separate seventh individual envelope',async()=>{
 const data=prepared(),rects=[...regions,envelope],snapshot=structuredClone(rects),scope=await createIndividualScientificScope(image,{rectangles:rects,prepared:data});
 assert.equal(scope.status,'ready');assert.equal(scope.regions.length,6);assert.equal(scope.searchRegions.length,7);assert.ok(!scope.regions.some(r=>r.envelope));assert.equal(scope.searchRegions[6].envelope,true);assert.deepEqual(rects,snapshot);assert.equal(image.preparation,undefined);assert.equal(image.blob.size,16);
 const compiled=compileForgeryscopeScientificScope(scope,image);assert.equal(compiled.admits(10,30),true);assert.equal(compiled.admits(75,30),false);assert.equal(compiled.admits(15,14),false);
 assert.equal(await scopeFingerprint(scope),scope.fingerprint);const draft=createManualScopeDraft({...image,preparation:scope});assert.equal(draft.zones.filter(z=>z.kind==='acquisition').length,6);assert.ok(draft.zones.some(z=>z.kind==='exclusion'&&z.role==='text'));
});
test('Classified graphs and flow cytometry are excluded while OCR can be explicitly disabled',async()=>{
 const data=prepared();data.panels.panels.push({label:'Graphs',rectangle:[5,5,65,65]},{label:'Flow Cytometry',rectangle:[85,5,145,65]});
 const scope=await createIndividualScientificScope(image,{rectangles:regions,prepared:data,excludeTexts:false});assert.equal(scope.regions.length,4);assert.equal(scope.individual.cancelledRegions.length,2);assert.equal(scope.text.disabled,true);assert.equal(scope.text.rawDetection.status,'complete');const compiled=compileForgeryscopeScientificScope(scope,image);assert.equal(compiled.admits(30,30),false);assert.equal(compiled.admits(110,30),false);assert.equal(compiled.admits(15,104),true);
});
test('Incomplete OCR never produces a ready empty text mask, and absence of detected panels does not select full source',async()=>{
 const data=prepared();data.text.status='error';const blocked=await createIndividualScientificScope(image,{rectangles:regions,prepared:data});assert.equal(blocked.status,'needs-review');assert.throws(()=>scopeIndividualTask({operation:'ai.clones.segmentation',params:{variant:'selfdm-map'}},blocked),{code:'SCIENTIFIC_SCOPE_REQUIRED'});
 const none=prepared();none.panels.panels=[];const unselected=await createIndividualScientificScope(image,{prepared:none});assert.equal(unselected.regions.length,0);assert.equal(unselected.status,'needs-review');const manual=await createIndividualScientificScope(image,{manualFullSource:true});assert.equal(manual.status,'ready');assert.equal(manual.regions.length,1);assert.equal(manual.text.skipped,true);assert.equal(manual.text.automatic,false);
});
test('Source/dimension and detector provenance mismatches reject before scope construction',async()=>{
 await assert.rejects(createIndividualScientificScope({...image,sourceSha256:'unknown'},{prepared:prepared()}),{code:'INVALID_INPUT'});await assert.rejects(createIndividualScientificScope(image,{prepared:{...prepared(),width:241}}),{code:'INVALID_INPUT'});await assert.rejects(createIndividualScientificScope(image,{prepared:{...prepared(),sourceSha256:'c'.repeat(64)}}),{code:'INVALID_INPUT'});
 await assert.rejects(createIndividualScientificScope(image,{rectangles:[{...regions[0],detection:{width:240,height:180,sourceSha256:'d'.repeat(64),coordinates:'original-pixels'}}],prepared:prepared()}),{code:'INVALID_INPUT'});
});
test('Task routes preserve user algorithm/view/backend/profile/comparison settings and include individual neural envelope',async()=>{
 const scope=await createIndividualScientificScope(image,{rectangles:[...regions,envelope],prepared:prepared()}),base={id:'task',imageId:'image',backend:'auto',params:{minimum:10,compare:false,profile:'auto'},view:{low:0,minimum:4,mode:'biomes'}};
 for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense','ai.clones.d2prl','ai.clones.segmentation','m2.forgeryscope','analysis.clones','analysis.complete']){
  const task={...base,operation},original=structuredClone(task),out=scopeIndividualTask(task,scope);assert.deepEqual(task,original);assert.deepEqual(out.view,base.view);assert.equal(out.backend,'auto');assert.equal(out.params.minimum,10);assert.equal(out.params.compare,false);assert.equal(out.params.profile,'auto');
  if(operation==='tampering.copyMove.sparse'){assert.equal(out.scientificScope.fingerprint,scope.fingerprint);assert.equal(out.params.regions.length,7);}else if(operation==='tampering.copyMove.dense')assert.equal(out.params.excluded.length,scope.excluded.length);else{assert.equal(out.params.scientificScope.fingerprint,scope.fingerprint);if(operation.startsWith('ai.')){assert.equal(out.params.selectionPresent,true);assert.equal(out.regions.length,7);assert.ok(out.regions.every(r=>r.kind==='region'));assert.equal(out.regions[6].envelope,true);}}
 }
 assert.throws(()=>scopeIndividualTask({...base,operation:'various.contrast'},scope),{code:'SCIENTIFIC_SCOPE_UNSUPPORTED'});
});
test('Sparse and dense comparison retain exactly the submitted pair, its order and exclusions rather than the search envelope',async()=>{
 const scope=await createIndividualScientificScope(image,{rectangles:[...regions,envelope],prepared:prepared()}),rects=individualScopeRectangles(scope).filter(r=>r.kind!=='exclusion'),params=sparseParameters({algorithm:'SIFT',compare:true,minimum:10,threshold:.7,reflections:false},[rects[4],rects[1],rects.find(r=>r.envelope)]);
 assert.equal(params.regions.length,2);
 for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense']){
  const task={operation,params,backend:'webgpu',view:{low:0}},before=structuredClone(task),out=scopeIndividualTask(task,scope);assert.deepEqual(task,before);assert.deepEqual(out.params.regions,params.regions);assert.equal(out.params.regions.length,2);assert.deepEqual(out.params.excluded,scope.excluded);assert.equal(out.params.compare,true);assert.equal(out.params.minimum,10);assert.equal(out.params.threshold,.7);assert.equal(out.backend,'webgpu');assert.deepEqual(out.view,{low:0});if(operation.endsWith('sparse'))assert.equal(out.scientificScope.fingerprint,scope.fingerprint);
 }
 const efficient=sparseParameters({algorithm:'EfficientLoFTR',compare:true,rotationMode:'quarter-turns',minimum:10},[rects[4],rects[1],rects.find(r=>r.envelope)]),out=scopeIndividualTask({operation:'tampering.copyMove.sparse',params:efficient},scope);assert.deepEqual(out.params.regions,efficient.regions);assert.deepEqual(out.params.rotations,[0,90,180,270]);
 // A vertex-order change does not change the exact selected acquisition.
 const cyclic=[params.regions[0].slice(1).concat([params.regions[0][0]]),params.regions[1].slice().reverse()];assert.deepEqual(scopeIndividualTask({operation:'tampering.copyMove.sparse',params:{compare:true,regions:cyclic}},scope).params.regions,cyclic);
});
test('Comparison rejects missing, excess, repeated, envelope or stale regions instead of inventing a pair',async()=>{
 const scope=await createIndividualScientificScope(image,{rectangles:[...regions,envelope],prepared:prepared()}),pair=[polygon(regions[0]),polygon(regions[1])],stale=structuredClone(pair);stale[0][0][0]+=.01;
 for(const operation of ['tampering.copyMove.sparse','tampering.copyMove.dense'])for(const value of [undefined,[],[pair[0]],[...pair,polygon(envelope)],[pair[0],pair[0]],[pair[0],polygon(envelope)],stale]){
  const task={operation,params:{compare:true,...(value?{regions:value}:{})}},before=structuredClone(task);assert.throws(()=>scopeIndividualTask(task,scope),{code:'SCIENTIFIC_SCOPE_PAIR_REQUIRED'});assert.deepEqual(task,before);
 }
 assert.throws(()=>scopeIndividualTask({operation:'tampering.copyMove.sparse',params:{algorithm:'EfficientLoFTR',compare:false}},scope),{code:'SCIENTIFIC_SCOPE_PAIR_REQUIRED'});
});
test('Forgeryscope explicit comparison panels and profile are preserved with the source-bound scientific scope',async()=>{
 const scope=await createIndividualScientificScope(image,{rectangles:[...regions,envelope],prepared:prepared()}),panels=[['Microscopy',1,5,5,65,65],['Microscopy',1,85,5,145,65]],task={operation:'m2.forgeryscope',params:{profile:'microscopy',panels}},before=structuredClone(task),out=scopeIndividualTask(task,scope);assert.deepEqual(task,before);assert.deepEqual(out.params.panels,panels);assert.equal(out.params.profile,'microscopy');assert.equal(out.params.scientificScope.fingerprint,scope.fingerprint);assert.equal(out.params.regions,undefined);
});
test('UI list rounds read windows only and retains continuous original polygons without an unwanted envelope',async()=>{
 const r={...rectangle(5.25,5.75,65.1,65.8),id:'fractional'},scope=await createIndividualScientificScope(image,{rectangles:[r,regions[1]],prepared:prepared(),includeEnvelope:false}),rows=individualScopeRectangles(scope);assert.equal(rows.filter(r=>r.kind==='envelope').length,0);assert.deepEqual(rows[0].polygon,polygon(r));assert.equal(rows[0].x0,5);assert.equal(rows[0].y0,5);assert.equal(rows[0].x1,66);assert.equal(rows[0].y1,66);assert.equal(scopeIndividualTask({operation:'ai.clones.segmentation',params:{}},scope).regions.length,2);
});
