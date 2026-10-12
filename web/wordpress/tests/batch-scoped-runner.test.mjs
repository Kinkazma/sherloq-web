import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {batchCatalog,catalogRecipe} from '../sherloq-browser/assets/batch-catalog.js';
import {rectanglePolygon,rectangleComplement} from '../sherloq-browser/assets/batch-scope-geometry.js';

const deployment={engineVersion:'protocol-test',engineCommit:'fixed',runtimeSourceIncrementSha256:'fixed'};
const regions=[{x0:0,y0:0,x1:40,y1:40},{x0:60,y0:0,x1:100,y1:40}],text=rectanglePolygon({x0:5,y0:5,x1:15,y1:12});
function scope(){return {schema:'sherloq.scientific-scope/1',version:'policy/1',coordinates:'original-pixels',width:120,height:64,status:'ready',sourceSha256:'a'.repeat(64),fingerprint:'b'.repeat(64),regions:regions.map(r=>({...r,polygon:rectanglePolygon(r),type:'microscopy',confidence:.95})),searchRegions:[...regions,{x0:0,y0:0,x1:100,y1:40,envelope:true}].map(r=>({...r,polygon:rectanglePolygon(r)})),excluded:[...rectangleComplement(regions,120,64),text],text:{status:'complete',polygons:[text]},models:{panels:{sha256:'c'.repeat(64)},text:{sha256:'d'.repeat(64)}}};}
function fixture({withScope=true}={}){
 const image={id:'image',hash:'decoded-pixel-hash',name:'source.png',width:120,height:64,selected:true,family:'mixed',blob:new Blob(['native source']),state:'ready',runs:[],occurrences:[{studyId:'study'}],...(withScope?{preparation:scope()}:{})},calls=[],artifacts=new Map(),model={images:[image],studies:[{id:'study',name:'Study',errors:[]}],artifacts};let source;
 const tool={get source(){return source;},async load(input){source={id:input.id,sha256:'a'.repeat(64)};calls.push(['load']);return source;},async detectSubimages(){throw Error('Scientific batch must use classified acquisitions, never a silhouette fallback');},async run(task){calls.push(['run',task]);return {operation:task.operation,data:{points:new Float64Array(0),pairs:new Float64Array(0),groups:[],params:task.params,metadata:{}},provenance:{protocolFixture:true},metrics:{}};},async export(type){return new Blob([type]);},cancel(){},async dispose(){calls.push(['dispose']);source=null;}};
 const runner=createBatchRunner({toolFactory:async options=>{calls.push(['factory',options]);return tool;}}),recipe=catalogRecipe(batchCatalog.find(r=>r.params.algorithm==='SIFT + G2NN + RANSAC + Panels + Text').id);
 return {model,image,calls,runner,recipe};
}
async function localDeployment(callback){const prior=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>deployment});try{return await callback();}finally{globalThis.fetch=prior;}}

test('production runner rejects missing scientific preparation before altering previous outputs; per-run options cannot disable it',async()=>localDeployment(async()=>{
 const f=fixture({withScope:false}),previous=new Blob(['previous']);f.model.artifacts.set('comparaisons/previous.json',previous);
 await assert.rejects(f.runner.run(f.model,[f.recipe],{scientificFiltering:false}),{code:'SCIENTIFIC_SCOPE_REQUIRED'});assert.equal(f.runner.running,false);assert.equal(f.calls.length,0);assert.equal(f.model.artifacts.get('comparaisons/previous.json'),previous);assert.equal(f.image.state,'ready');
}));

test('scientific runner forwards prepared search and exclusions, preserves source/settings/capacity and fingerprints reuse',async()=>localDeployment(async()=>{
 const f=fixture(),params=structuredClone(f.recipe.params),blob=f.image.blob,options={reuse:true,panels:false};
 await f.runner.run(f.model,[f.recipe],options);const task=f.calls.find(c=>c[0]==='run')[1],settings=f.calls.find(c=>c[0]==='factory')[1];assert.deepEqual(task.scientificScope,f.image.preparation);assert.deepEqual(task.params.regions,f.image.preparation.searchRegions.map(r=>r.polygon));assert.deepEqual(task.params.excluded,f.image.preparation.excluded);assert.equal(settings.resourceHints,undefined);assert.equal(settings.maxWorkers,undefined);assert.equal(task.backend,'auto');assert.equal(f.image.blob,blob);assert.deepEqual(f.recipe.params,params);assert.equal(f.model.configuration.options.scientificFiltering,true);assert.equal(f.model.configuration.options.panels,true);assert.equal(f.model.configuration.scientificPreparations.image.fingerprint,f.image.preparation.fingerprint);
 await f.runner.run(f.model,[f.recipe],options);assert.equal(f.image.reused,true);assert.equal(f.calls.filter(c=>c[0]==='run').length,1);
 f.image.preparation.fingerprint='e'.repeat(64);await f.runner.run(f.model,[f.recipe],options);assert.equal(f.image.reused,false);assert.equal(f.calls.filter(c=>c[0]==='run').length,2);assert.equal(f.image.history.length,1);
 f.image.preparation.version='policy/2';await f.runner.run(f.model,[f.recipe],options);assert.equal(f.calls.filter(c=>c[0]==='run').length,3);
}));

test('old unfiltered completion cannot be reused under scientific filtering even with matching pixels, engine and recipe',async()=>localDeployment(async()=>{
 const f=fixture();await f.runner.run(f.model,[f.recipe],{reuse:true});f.image.restored.configuration.options.scientificFiltering=false;delete f.image.restored.configuration.scientificPreparations;
 await f.runner.run(f.model,[f.recipe],{reuse:true});assert.equal(f.image.reused,false);assert.equal(f.calls.filter(c=>c[0]==='run').length,2);assert.equal(f.image.history.length,1);
}));

test('pair preparation uses semantic acquisition panels and never spends an inference on silhouette detection',async()=>{
 const f=fixture(),prepared=await f.runner.preparePair(f.image);assert.equal(prepared.candidates.length,2);assert.equal(prepared.selection.regions.length,2);assert.equal(f.calls.length,0);assert.equal(f.image.panels.source,'scientific-preparation');assert.equal(f.runner.running,false);
 f.image.pairSelection=null;f.image.preparation.regions.push({x0:0,y0:45,x1:20,y1:64,type:'microscopy',confidence:.9});const ambiguous=await f.runner.preparePair(f.image);assert.equal(ambiguous.candidates.length,3);assert.equal(ambiguous.selection,null);assert.equal(f.calls.length,0);
});

test('methods without qualified scientific exclusions still compute and export but cannot vote as filtered evidence',async()=>localDeployment(async()=>{
 const f=fixture(),r={id:'raw-method',operation:'m2.raw-method',fr:'Raw method',kind:'clones',params:{nativeSetting:42},signal:{},backend:'auto'};
 await f.runner.run(f.model,[r]);assert.equal(f.calls.filter(c=>c[0]==='run').length,1);assert.equal(f.image.runs[0].scopeSupport.mode,'raw-only');assert.equal(f.image.runs[0].positive,false);assert.equal(f.image.runs[0].cloneMaximum,0);assert.deepEqual(f.image.runs[0].entries,[]);assert.ok(f.image.runs[0].files.some(path=>path.endsWith('.json')));assert.ok(f.image.runs[0].files.some(path=>path.endsWith('.npz')));const task=f.calls.find(c=>c[0]==='run')[1];assert.deepEqual(task.params,{nativeSetting:42});assert.equal(task.scientificScope,undefined);assert.equal(f.image.score.clones,0);
}));
