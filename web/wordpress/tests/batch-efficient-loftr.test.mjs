import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog,catalogRecipe,batchTask,batchPairSelection,batchPairRegions,restoredBatchPair} from '../sherloq-browser/assets/batch-catalog.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {cloneEvidence,evidenceContext} from '../sherloq-browser/assets/batch-evidence.js';
import {efficientLoFtrParams,efficientLoFtrCrop} from '../../engine-source/src/efficient-loftr-input.js';

const recipe=()=>catalogRecipe(batchCatalog.find(r=>r.params.algorithm==='EfficientLoFTR').id);
const pair=[{x0:8,y0:12,x1:56,y1:60},{x0:80,y0:20,x1:144,y1:68}];
const image=(id='image-a')=>({id,hash:id+'-exact-pixels',blob:new Blob(['source']),name:id+'.png',width:160,height:96,selected:true,family:'photography',occurrences:[{studyId:'study'}],runs:[],state:'ready'});
function store(){const data=new Map();return {keys:()=>data.keys(),has:p=>data.has(p),get:async p=>data.get(p),set:async(p,v)=>data.set(p,v),delete:async p=>data.delete(p)};}
function fixture({regions=pair,error}={}){
 const calls=[],model={images:[image()],studies:[{id:'study',name:'Study',errors:[]}],artifacts:store()},r=recipe();let source;
 const tool={get source(){return source;},async load(input){source={id:input.id};calls.push(['load',input.id]);return source;},async detectSubimages(){calls.push(['detect']);return {regions:regions.map((r,i)=>({id:'panel-'+i,bounds:[r.x0,r.y0,r.x1,r.y1]}))};},async run(task){calls.push(['run',task]);if(error)throw error;return {operation:task.operation,data:{points:new Float64Array(0),pairs:new Float64Array(0),groups:[],regions:task.params.regions,compare:true,metadata:{algorithm:'EfficientLoFTR'}},provenance:{method:'EfficientLoFTR'},metrics:{}};},export:async type=>new Blob([type]),cancel(){},async dispose(){calls.push(['dispose']);source=null;}};
 const runner=createBatchRunner({scientificFiltering:false,toolFactory:async options=>{assert.equal(options.memoryBudgetBytes,4*1024**3);assert.equal(options.m2MemoryBudgetBytes,2*1024**3);assert.equal(options.maxWorkers,undefined);return tool;}});
 return {model,runner,calls,r};
}
async function run(f,options={}){const prior=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({engineVersion:'test',engineCommit:'fixed',runtimeSourceIncrementSha256:'fixed'})});try{return await f.runner.run(f.model,[f.r],{panels:false,reuse:true,...options});}finally{globalThis.fetch=prior;}}

test('EfficientLoFTR is selectable in batch with its actual transformation and resolution parameters',()=>{
 const r=recipe();assert.notEqual(r.notBatch,true);assert.equal(r.pairRequired,true);
 for(const key of ['reflections','longSide','rotationMode','threshold','limit'])assert.ok(r.fields.some(f=>f.key===key),key);
 assert.equal(r.fields.find(f=>f.key==='longSide').min,64);
 for(const key of ['autoRadius','compact','independent','radius'])assert.equal(r.fields.some(f=>f.key===key),false,key);
 for(const key of ['selfdm-map','selfdm-proposal','cmseg-generalization','mgcfdn-st','mgcfdn-vig'])assert.ok(batchCatalog.some(r=>r.params.variant===key));
});
test('pair selections preserve half-open original coordinates and native mirror/rotation contracts',()=>{
 const r=recipe();r.params.reflections=true;r.params.rotationMode='quarter-turns';r.params.longSide=640;
 const task=batchTask(r,{imageId:'i',regions:pair}),p=efficientLoFtrParams(task.params);
 assert.equal(p.compare,true);assert.equal(p.reflections,true);assert.deepEqual(p.rotations,[0,90,180,270]);assert.equal(p.longSide,640);
 assert.equal(p.guides.length,0);assert.equal(p.independent,false);
 assert.deepEqual(p.regions[0],[[8,12],[55,12],[55,59],[8,59]]);
 const crop=efficientLoFtrCrop(image(),p.regions[0],p.longSide);assert.deepEqual([crop.x,crop.y,crop.width,crop.height],[8,12,48,48]);
});
test('missing, extra, envelope, duplicate, noninteger and out-of-image pairs are never selected silently',()=>{
 for(const candidate of [[],[pair[0]],[...pair,pair[0]],[pair[0],{...pair[1],envelope:true}],[pair[0],pair[0]],[pair[0],{...pair[1],x0:.5}],[pair[0],{...pair[1],x1:200}]])assert.throws(()=>batchPairRegions(candidate,image()),e=>e.code==='BATCH_PAIR_REQUIRED');
});
test('saved selections are bound to exact pixels and can be explicitly cleared',()=>{
 const i=image(),selection=batchPairSelection(i,pair,'manual');i.restored={configuration:{pairSelections:{[i.hash]:selection}}};assert.deepEqual(restoredBatchPair(i),selection);
 i.pairCleared=true;assert.equal(restoredBatchPair(i),null);i.pairCleared=false;i.pairSelection={...selection,pixelHash:'other'};assert.throws(()=>restoredBatchPair(i),e=>e.code==='BATCH_PAIR_REQUIRED');
});
test('photographs detect exactly two real panels even when general panel detection is disabled',async()=>{
 const f=fixture();await run(f);const task=f.calls.find(c=>c[0]==='run')[1];assert.equal(f.calls.filter(c=>c[0]==='detect').length,1);assert.equal(task.params.regions.length,2);assert.equal(f.model.images[0].runs[0].status,'done');assert.equal(f.model.configuration.pairSelections[f.model.images[0].hash].source,'detected');
 assert.equal(f.model.images[0].score.clones,0);
});
test('an explicit pair avoids detection and is recorded in the scientific run and configuration',async()=>{
 const f=fixture();f.model.images[0].pairSelection=batchPairSelection(f.model.images[0],pair);await run(f);assert.equal(f.calls.some(c=>c[0]==='detect'),false);assert.deepEqual(f.model.images[0].runs[0].pairSelection.regions,pair);
});
test('three detected panels require user input and produce a durable error without inference',async()=>{
 const f=fixture({regions:[...pair,{x0:5,y0:72,x1:30,y1:90}]});await run(f);const result=f.model.images[0].runs[0];assert.equal(result.status,'error');assert.equal(result.inputRequired,true);assert.equal(result.error.code,'BATCH_PAIR_REQUIRED');assert.equal(result.error.details.candidateCount,3);assert.equal(f.calls.some(c=>c[0]==='run'),false);assert.equal(f.model.results[0].status,'incomplete');const report=JSON.parse(await (await f.model.artifacts.get(result.files[0])).text());assert.equal(report.error.details.requiredRegions,2);
});
test('native errors preserve network/allocation causes and diagnostic details in the batch error report',async()=>{
 const error=Object.assign(new Error('Useful inference refused',{cause:Object.assign(new Error('HTTP 503'),{code:'ASSET_HTTP',details:{status:503,url:'https://example.invalid/model.onnx'}})}),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',nativeHeapExhausted:true}}),f=fixture({error});await run(f);
 const e=f.model.images[0].runs[0].error;assert.equal(e.code,'MEMORY_ALLOCATION');assert.equal(e.details.nativeHeapExhausted,true);assert.equal(e.cause.code,'ASSET_HTTP');assert.equal(e.cause.details.status,503);
});
test('reuse is sensitive to this image’s selected pair and retains previous files and error states on disk',async()=>{
 const f=fixture();await run(f);const i=f.model.images[0],runs=()=>f.calls.filter(c=>c[0]==='run').length;assert.equal(runs(),1);
 i.restored.configuration.pairSelections.unrelated={changed:true};i.pairSelection.source='selected-panels';await run(f);assert.equal(runs(),1);assert.equal(i.reused,true);
 i.pairSelection=batchPairSelection(i,[pair[0],{x0:72,y0:12,x1:136,y1:60}]);await run(f);assert.equal(runs(),2);assert.equal(i.history.length,1);assert.ok(i.history[0].runs[0].files.every(path=>path.startsWith('historique/')&&f.model.artifacts.has(path)));
 f.r.params.longSide=704;await run(f);assert.equal(runs(),3);
});
test('preparation exposes every candidate and never chooses the first two from an ambiguous image',async()=>{
 const f=fixture({regions:[...pair,{x0:5,y0:72,x1:30,y1:90}]});const result=await f.runner.preparePair(f.model.images[0]);assert.equal(result.candidates.length,3);assert.equal(result.selection,null);assert.equal(f.runner.running,false);assert.equal(f.calls.some(c=>c[0]==='run'),false);
});
test('EfficientLoFTR evidence refuses a substituted or unpaired detector output',async()=>{
 const context=evidenceContext();try{await assert.rejects(cloneEvidence({data:{metadata:{algorithm:'SIFT'},regions:[],compare:false}},recipe(),{},image(),context),e=>e.code==='BATCH_EVIDENCE_INVALID');}finally{context.dispose();}
});
