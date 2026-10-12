import test from 'node:test';
import assert from 'node:assert/strict';
import {composeScientificScope,scopeFingerprint,createScientificPreparation,canReviewTextAmbiguity,retainReviewedAcquisitions} from '../web/wordpress/sherloq-browser/assets/batch-scientific-preparation.js';
const image={width:100,height:100},sha='a'.repeat(64),quad=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function preparation(){return {width:100,height:100,sourceSha256:sha,panels:{panels:[{label:'Microscopy',rectangle:[0,0,45,100],confidence:.94},{label:'Graphs',rectangle:[50,0,100,100],confidence:.96}],detector:{sha256:'b'.repeat(64)}},text:{status:'complete',polygons:[quad(1,1,5,5)],detections:[{polygon:quad(1,1,5,5),confidence:.93}],metadata:{model:{sha256:'c'.repeat(64)}}}};}
test('Rasterized page scopes exclude graphs and native PDF labels without enclosing mixed figures',()=>{
 const source=preparation(),before=structuredClone(source),scope=composeScientificScope({...image,encoding:'pdf-rendered-page'},source,{pageExclusions:[quad(20,5,25,10)]});
 assert.equal(scope.status,'ready');assert.equal(scope.family,'microscopy');assert.equal(scope.regions.length,1);assert.equal(scope.regions[0].x1,45);
 assert.deepEqual(scope.excluded,[quad(1,1,5,5),quad(20,5,25,10),quad(50,0,100,100),quad(45,0,100,100)]);assert.equal(scope.coverage.exhaustive,false);assert.deepEqual(source,before);
});
test('PDF paint-layer text cannot erase data from an embedded source bitmap',()=>{
 const source=preparation(),whole=quad(0,0,100,100),scope=composeScientificScope({...image,encoding:'pdf-decoded-png'},source,{pageExclusions:[whole,quad(20,5,25,10)]}),withoutPageText=composeScientificScope(image,source);
 assert.equal(scope.status,'ready');assert.deepEqual(scope.excluded,withoutPageText.excluded);assert.deepEqual(scope.pdfText.polygons,[]);assert.equal(scope.pdfText.appliedToSource,false);assert.deepEqual(scope.pdfText.projectedPagePolygons,[whole,quad(20,5,25,10)]);
 const rasterScope=composeScientificScope({...image,encoding:'pdf-rendered-page'},source,{pageExclusions:[whole]});assert.equal(rasterScope.status,'needs-review');assert.equal(canReviewTextAmbiguity(rasterScope),false);
});
test('Unknown images and incomplete OCR cannot silently become full-frame analyses',()=>{
 const prepared=preparation();prepared.panels.panels=[];assert.equal(composeScientificScope(image,prepared).status,'needs-review');
 prepared.panels=preparation().panels;prepared.text.status='needs-review';assert.equal(composeScientificScope(image,prepared).status,'needs-review');
 assert.throws(()=>composeScientificScope({...image,width:101},prepared),/match/);
});
test('A blot mistaken for text is preserved for review rather than removed from the acquisition',()=>{
 const prepared=preparation();prepared.panels.panels=[{label:'Blots',rectangle:[0,0,100,100],confidence:.96}];prepared.text.polygons=[quad(0,0,90,90)];prepared.text.detections=[{polygon:quad(0,0,90,90),confidence:.98}];
 const scope=composeScientificScope(image,prepared);assert.equal(scope.status,'needs-review');assert.equal(scope.family,'gel');assert.equal(scope.regions.length,1);assert.ok(scope.warnings.some(w=>w.code==='TEXT_ACQUISITION_AMBIGUITY'));
});
test('A human can retain experimentally acquired data without removing unrelated real text exclusions',async()=>{
 const prepared=preparation();prepared.panels.panels=[{label:'Blots',rectangle:[0,0,100,100],confidence:.96}];const large=quad(0,0,90,90),label=quad(10,1,15,5);prepared.text.polygons=[large,label];prepared.text.detections=[{polygon:large,confidence:.98},{polygon:label,confidence:.96}];
 const scope=composeScientificScope(image,prepared),before=structuredClone(scope);assert.equal(canReviewTextAmbiguity(scope),true);
 const reviewed=await retainReviewedAcquisitions(scope,{reviewedAt:'2026-10-12T14:00:00Z'});assert.equal(reviewed.status,'ready');assert.equal(reviewed.family,'gel');assert.deepEqual(reviewed.excluded,[label]);assert.equal(reviewed.text.review.actor,'human');assert.deepEqual(reviewed.text.review.candidates,[0]);assert.deepEqual(reviewed.text.rawDetection.polygons,[large,label]);assert.deepEqual(scope,before);assert.notEqual(reviewed.fingerprint,await scopeFingerprint(scope));
});
test('Human ambiguity review cannot bypass unfinished OCR, missing acquisitions or a reached candidate limit',async()=>{
 const prepared=preparation();prepared.text.status='needs-review';let scope=composeScientificScope(image,prepared);assert.equal(canReviewTextAmbiguity(scope),false);await assert.rejects(retainReviewedAcquisitions(scope),/Only acquisition/);
 prepared.text.status='complete';prepared.panels.panels=[];scope=composeScientificScope(image,prepared);assert.equal(canReviewTextAmbiguity(scope),false);
 const large=quad(0,0,90,90);prepared.panels.panels=[{label:'Blots',rectangle:[0,0,100,100],confidence:.96}];prepared.text.status='needs-review';prepared.text.polygons=[large];prepared.text.detections=[{polygon:large}];prepared.text.warnings=[{code:'large-text-region',detection:0},{code:'candidate-limit'}];scope=composeScientificScope(image,prepared);assert.equal(canReviewTextAmbiguity(scope),false);
});
test('Resume fingerprint binds image/model/exclusions and does not depend on display choices',async()=>{
 const scope=composeScientificScope(image,preparation()),first=await scopeFingerprint(scope);
 assert.equal(first,await scopeFingerprint({...scope,view:{circles:true}}));
 assert.notEqual(first,await scopeFingerprint({...scope,excluded:[]}));
 assert.notEqual(first,await scopeFingerprint({...scope,models:{panels:{sha256:'d'.repeat(64)}}}));
 assert.notEqual(first,await scopeFingerprint({...scope,status:'needs-review'}));
});
test('Heavy preparation resources are disposed before analysis handoff and recreated for the next import',async()=>{
 const events=[],factories=[],model={studies:[],images:[{...image,id:'source',name:'cells.png',selected:true,blob:new Blob(['original']),occurrences:[]}]};let allowDispose;
 const service=createScientificPreparation({clientFactory:async options=>{factories.push(options);return {prepare:async()=>{events.push('prepare');return preparation();},dispose:async()=>{events.push('dispose-start');if(factories.length===1)await new Promise(resolve=>allowDispose=resolve);events.push('dispose-end');}};}});
 let completed=false;const pending=service.prepare(model).then(()=>completed=true);
 while(!allowDispose)await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false);assert.deepEqual(events,['prepare','dispose-start']);
 allowDispose();await pending;assert.equal(completed,true);assert.equal(model.images[0].selected,true);assert.equal(model.images[0].sourceSha256,sha);assert.equal(model.images[0].preparation.status,'ready');assert.equal(await model.images[0].blob.text(),'original');
 await service.prepare(model);assert.equal(factories.length,2);assert.ok(factories.every(p=>p.computeProfile==='maximum'&&p.memoryBudgetBytes===4*1024**3));await service.dispose();assert.deepEqual(events,['prepare','dispose-start','dispose-end','prepare','dispose-start','dispose-end']);
});
test('Preparation failure releases the client without downgrading native resolution or options',async()=>{
 let disposed=0;const service=createScientificPreparation({clientFactory:async()=>({prepare:async()=>{throw Error('native model failure');},dispose:async()=>disposed++})}),model={studies:[],images:[{...image,id:'source',blob:new Blob(['original']),occurrences:[]}]};
 await assert.rejects(service.prepare(model),/native model failure/);assert.equal(disposed,1);await service.dispose();assert.equal(disposed,1);assert.equal(model.images[0].preparation,undefined);
});
