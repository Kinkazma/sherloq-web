import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog,catalogRecipe,batchTask,imageScore,studyScores} from '../web/wordpress/sherloq-browser/assets/batch-catalog.js';
import {comparisonPolygons} from '../web/wordpress/sherloq-browser/assets/batch-export.js';
import {pdfPoint,safeName} from '../web/wordpress/sherloq-browser/assets/batch-import.js';
import {jsonExportValue} from '../web/wordpress/sherloq-browser/assets/tool-client.js';
import {batchForgeryscopeMetadata} from '../web/wordpress/sherloq-browser/assets/batch-evidence.js';

test('Standalone Forgeryscope Auto keeps native comparisons in source coordinates',()=>{
 const comparisons=[{accepted:true,polygon0:[[1,2],[3,4]],polygon1:[[11,12],[13,14]]}],lane_pairs=[{score:.8}];
 const metadata=batchForgeryscopeMetadata({metadata:{profile:'Forgeryscope Auto',comparisons,lane_pairs,status:'ok'}});
 assert.deepEqual(metadata.zones[0].origin,[0,0]);assert.equal(metadata.zones[0].comparisons,comparisons);assert.equal(metadata.zones[0].lane_pairs,lane_pairs);
 const zoned={zones:[{origin:[10,20],comparisons}]};assert.equal(batchForgeryscopeMetadata(zoned),zoned);
 assert.deepEqual(batchForgeryscopeMetadata({profile:'Forgeryscope Auto',comparisons:[],status:'no_panels'}).zones[0].comparisons,[]);
 assert.throws(()=>batchForgeryscopeMetadata({status:'ok'}));
});

test('A display-only output never becomes a positive method vote',()=>{
 const score=imageScore([{status:'done',kind:'view',positive:false},{status:'done',kind:'map',positive:true,methodKey:'trufor'},{status:'done',kind:'map',positive:true,methodKey:'trufor'}]);
 assert.deepEqual(score,{clones:0,additional:1,total:1,incomplete:false});
});
test('Errors remain incomplete even when another method has a signal',()=>{
 const score=imageScore([{status:'done',kind:'clones',cloneMaximum:3},{status:'error',kind:'map',positive:true}]);
 assert.equal(score.clones,3);assert.equal(score.additional,0);assert.equal(score.incomplete,true);
});
test('An unrelated image never adds votes to the study peak',()=>{
 const studies=[{id:'paper',errors:[]}],images=[{selected:true,state:'done',occurrences:[{studyId:'paper'}],score:{clones:3,additional:0,total:3}},{selected:true,state:'done',occurrences:[{studyId:'paper'}],score:{clones:1,additional:1,total:2}}];
 const [study]=studyScores(studies,images,{threshold:4,basis:'total'});assert.equal(study.score.total,3);assert.equal(study.retained,false);
 assert.equal(studyScores(studies,images,{threshold:3,basis:'clones'})[0].retained,true);
});
test('A filename marker only selects a document; it does not invent a measured score',()=>{
 const [study]=studyScores([{id:'manual',manualMarked:true,errors:[]}],[],{threshold:3,basis:'clones'});
 assert.equal(study.retained,true);assert.equal(study.score.clones,0);assert.equal(study.status,'unselected');
});
test('A PDF extraction error cannot be labelled no signal',()=>{
 assert.equal(studyScores([{id:'bad',errors:['encrypted']}],[],{threshold:1})[0].status,'incomplete');
});
test('Dense clone dispatch preserves native auto settings and panel coordinates',()=>{
 const recipe=catalogRecipe(batchCatalog.find(x=>x.params.algorithm==='PatchMatch Zernike').id);
 const task=batchTask(recipe,{id:'job',imageId:'image',regions:[{x0:12,y0:34,x1:112,y1:234}]});
 assert.equal(task.operation,'tampering.copyMove.dense');assert.equal(task.params.profile,'PatchMatch Zernike');assert.equal(task.params.auto,true);assert.deepEqual(task.params.regions[0],[[12,34],[111,34],[111,233],[12,233]]);
});
test('Only native D2PRL parameters are used for an explicit ROI',()=>{
 const task=batchTask(catalogRecipe('ai.clones.d2prl'),{id:'job',imageId:'image',regions:[{x0:0,y0:0,x1:50,y1:80}]});
 assert.deepEqual(task.regions[0].bounds,[0,0,50,80]);assert.equal(task.params.selectionPresent,true);
});
test('Rotated PDF placement transforms image coordinates without losing provenance',()=>{
 assert.deepEqual(pdfPoint([0,200,-100,0,350,50],1,1),[250,250]);
 assert.equal(safeName('bad/name:*?.pdf'),'bad_name___.pdf');
 assert.equal(safeName('CON.png'),'_CON.png');
});

test('Completed clone signals survive a partial automatic analysis',()=>{
 const score=imageScore([{status:'partial',kind:'automatic',cloneMaximum:3,additionalMethods:['ela.biomes']},{status:'done',kind:'ela',operation:'ela.biomes',positive:true}]);
 assert.deepEqual(score,{clones:3,additional:1,total:4,incomplete:true});
});

test('Cross-study polygons are mapped back from the comparison canvas',()=>{
 const images=[{id:'a',name:'a'},{id:'b',name:'b'}],pairs=[{kind:'geometric-matches',status:'done',images:['a','b'],offset:[0,132],entries:[{polygons:[[[5,10],[20,10],[20,30]],[[7,140],[22,140],[22,160]]]}]}];
 assert.deepEqual(comparisonPolygons(images[1],pairs,images)[0].entries[0].polygons,[[[7,8],[22,8],[22,28]]]);
});

test('Dense counters preserve integer precision in JSON without copying scientific arrays',()=>{
 const pixels=new Float32Array([.1,.8]),result=jsonExportValue({metrics:{comparisons:9007199254740993n},pixels});
 assert.equal(result.metrics.comparisons,'9007199254740993');assert.equal(result.pixels,pixels);assert.doesNotThrow(()=>JSON.stringify(result));
});
