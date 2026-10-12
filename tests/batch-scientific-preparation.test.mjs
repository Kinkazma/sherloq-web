import test from 'node:test';
import assert from 'node:assert/strict';
import {composeScientificScope,scopeFingerprint} from '../web/wordpress/sherloq-browser/assets/batch-scientific-preparation.js';
const image={width:100,height:100},sha='a'.repeat(64),quad=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function preparation(){return {width:100,height:100,sourceSha256:sha,panels:{panels:[{label:'Microscopy',rectangle:[0,0,45,100],confidence:.94},{label:'Graphs',rectangle:[50,0,100,100],confidence:.96}],detector:{sha256:'b'.repeat(64)}},text:{status:'complete',polygons:[quad(1,1,5,5)],detections:[{polygon:quad(1,1,5,5),confidence:.93}],metadata:{model:{sha256:'c'.repeat(64)}}}};}
test('Acquisition scopes exclude graphs and native PDF labels without enclosing mixed figures',()=>{
 const source=preparation(),before=structuredClone(source),scope=composeScientificScope(image,source,{pageExclusions:[quad(20,5,25,10)]});
 assert.equal(scope.status,'ready');assert.equal(scope.family,'microscopy');assert.equal(scope.regions.length,1);assert.equal(scope.regions[0].x1,45);
 assert.deepEqual(scope.excluded,[quad(1,1,5,5),quad(20,5,25,10),quad(50,0,100,100)]);assert.equal(scope.coverage.exhaustive,false);assert.deepEqual(source,before);
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
test('Resume fingerprint binds image/model/exclusions and does not depend on display choices',async()=>{
 const scope=composeScientificScope(image,preparation()),first=await scopeFingerprint(scope);
 assert.equal(first,await scopeFingerprint({...scope,view:{circles:true}}));
 assert.notEqual(first,await scopeFingerprint({...scope,excluded:[]}));
 assert.notEqual(first,await scopeFingerprint({...scope,models:{panels:{sha256:'d'.repeat(64)}}}));
});
