import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog,catalogRecipe,batchTask,imageScore,studyScores} from '../web/wordpress/sherloq-browser/assets/batch-catalog.js';
import {comparisonPolygons} from '../web/wordpress/sherloq-browser/assets/batch-export.js';
import {pdfPoint,safeName} from '../web/wordpress/sherloq-browser/assets/batch-import.js';
import {jsonExportValue,sparseNpzPreparationBytes} from '../web/wordpress/sherloq-browser/assets/tool-client.js';
import {batchForgeryscopeMetadata} from '../web/wordpress/sherloq-browser/assets/batch-evidence.js';
import {createBatchRunner} from '../web/wordpress/sherloq-browser/assets/batch-runner.js';
import {m3Npz} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/npz.js';

test('Batch uses the native capacity and backend without a worker cap or forced CPU retry',async()=>{
 const previous=globalThis.fetch;let settings,calls=0;
 globalThis.fetch=async()=>new Response(JSON.stringify({engineVersion:'test',engineCommit:'test',runtimeSourceIncrementSha256:'test'}));
 const image={id:'image',name:'image.png',blob:new Blob(),width:1,height:1,family:'unknown',selected:true,state:'ready',occurrences:[],runs:[]},model={images:[image],studies:[],artifacts:new Map()};
 const runner=createBatchRunner({scientificFiltering:false,toolFactory:async value=>{settings=value;return {async load(){},async run(task){calls++;assert.equal(task.backend,'auto');throw Object.assign(Error('native refusal'),{code:'MEMORY_LIMIT'});},async dispose(){}};}});
 try{await runner.run(model,[{id:'native',fr:'native',kind:'view',operation:'m2.native',params:{},signal:{},backend:'auto'}]);assert.equal(settings.resourceHints,undefined);assert.equal(settings.memoryBudgetBytes,4*1024**3);assert.equal(calls,1);assert.equal(image.runs[0].status,'error');assert.equal(image.runs[0].error.code,'MEMORY_LIMIT');assert.equal(model.engine.resourceHints,undefined);}
 finally{globalThis.fetch=previous;}
});

test('Sparse NPZ admission includes numeric arrays and the native nested JSON mirror',()=>{
 const data={points:new Float64Array(18000*7),pairs:new Float64Array(5405*4),colors:new Uint8Array(5405*3),pair_search_regions:new Int32Array(5405),groups:[new Uint32Array([0,1])],params:{algorithm:'SIFT + G2NN + RANSAC + Panels + Text'},metadata:{},regions:[],bases:[]};
 const result={operation:'tampering.copyMove.sparse',data,provenance:{},style:{},visible:[]};
 const output=m3Npz(result,sparseNpzPreparationBytes(result));assert.ok(output.bytes.byteLength>data.points.byteLength);assert.equal(output.bytes[0],0x50);assert.equal(output.bytes[1],0x4b);
});

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
test('Batch clone outputs request biomes only, preserving the analysis parameters',()=>{
 for(const algorithm of ['PatchMatch Zernike','SIFT + G2NN + RANSAC + Panels + Text']){
  const recipe=catalogRecipe(batchCatalog.find(x=>x.params.algorithm===algorithm).id),before=structuredClone(recipe.params);
  const task=batchTask(recipe,{id:'job',imageId:'image'});
  assert.deepEqual(task.view,{low:0,high:100000,minimum:4,circles:false,lines:false,points:false,areas:true,textExclusions:false});
  assert.deepEqual(recipe.params,before);
 }
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
