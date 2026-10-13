import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateFeatureCatalog,normalizeFeatureState,recoverFeatureState,selectedFeatureIds,selectActiveFiles,requiredFeatureChunks,featureDeletionPlan,featureIdsForTask} from '../sherloq-browser/assets/feature-catalog.js';
import {createFeaturePolicy,localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {batchTask,catalogRecipe,batchCatalog} from '../sherloq-browser/assets/batch-catalog.js';
import {createAutomaticClient} from '../sherloq-browser/assets/automatic-client.js';
import {automaticAnalysisPlan} from '../sherloq-browser/assets/unified-engine/src/automatic-analysis-plan.js';

const feature=(id,resources,{protected:base=false,internal=false,group='models',dependsOn=[],tasks=[]}={})=>({id,fr:id,en:id,protected:base,internal,group,resources,dependsOn,tasks});
const fixture=()=>({schema:'sherloq.features/1',groups:[{id:'models',fr:'Modèles',en:'Models'}],features:[
 feature('core',['runtime/start.js'],{protected:true}),
 feature('shared',['models/shared.bin'],{internal:true,group:null}),
 feature('a',['models/a.bin'],{dependsOn:['shared'],tasks:[{operation:'ai.a'}]}),
 feature('b',['models/b.bin'],{dependsOn:['shared'],tasks:[{operation:'ai.b'}]}),
 feature('restricted',['models/local.bin'],{tasks:[{operation:'ai.local'}]})
]});
const manifest={files:{'runtime/start.js':{chunks:['core'],size:1},'models/shared.bin':{chunks:['same'],size:3},'models/a.bin':{chunks:['a'],size:2},'models/b.bin':{chunks:['b'],size:4},'models/local.bin':{chunks:['local'],size:5,localOnly:true}},chunks:{core:1,same:3,a:2,b:4,local:5}};

test('catalogue coverage, unknown resources and cycles fail before activation',()=>{
 const catalog=fixture();validateFeatureCatalog(catalog,manifest);assert.equal(selectActiveFiles(catalog).size,5);
 assert.throws(()=>validateFeatureCatalog({...catalog,features:catalog.features.slice(0,-1)},manifest),/fully covered/);
 const bad=fixture();bad.features[1].dependsOn=['a'];assert.throws(()=>validateFeatureCatalog(bad),/Cyclic/);
 const wrong=fixture();wrong.features[0].resources=['missing/model.bin'];assert.throws(()=>validateFeatureCatalog(wrong,manifest),/Unknown feature resource/);
});
test('group choices survive catalogue changes; new public functions default on',()=>{
 const state=normalizeFeatureState({disabledFeatures:['retired'],disabledGroups:['models']});
 const catalog=fixture();catalog.features.push(feature('new',['models/new.bin']));
 assert.deepEqual([...selectedFeatureIds(catalog,state)],['core']);
 assert.ok(selectedFeatureIds(catalog,{}).has('new'));assert.ok(state.disabledFeatures.includes('retired'));
 const recovered=recoverFeatureState({disabledFeatures:['a',null,42,'invalid id'],disabledGroups:['models']});assert.deepEqual(recovered.value.disabledFeatures,['a']);assert.deepEqual(recovered.value.disabledGroups,['models']);assert.equal(recovered.issues.length,3);
});
test('deletion is the union of unreferenced present content, including aliases',()=>{
 const catalog=fixture();catalog.features[2].resources.push('models/shared.bin');
 const first=featureDeletionPlan(catalog,manifest,{},['a'],{presentChunks:['core','same','a','b']});
 assert.deepEqual(first.chunks,['a']);assert.equal(first.removableBytes,2);assert.equal(first.retainedSharedBytes,3);assert.equal(first.archiveBytesFreed,0);
 const both=featureDeletionPlan(catalog,manifest,{},['a','b'],{presentChunks:['core','same','a','b']});
 assert.equal(both.removableBytes,9);assert.equal(both.retainedSharedBytes,0);assert.ok(!both.chunks.includes('core'));
 const absent=featureDeletionPlan(catalog,manifest,{},['a'],{presentChunks:[]});assert.equal(absent.removableBytes,0);assert.equal(absent.potentialBytes,2);
});
test('public readiness excludes localOnly and deliberately uninstalled files',()=>{
 const required=requiredFeatureChunks(fixture(),manifest,{disabledFeatures:['a']});
 assert.ok(!required.has('a'));assert.ok(!required.has('local'));assert.ok(required.has('same'));
});
test('local choices are transactional, protected and inactive for online pages',async()=>{
 const events=[],saved=[],storage=new Map(),policy=createFeaturePolicy({catalog:fixture(),local:true,storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},eventTarget:{dispatchEvent:event=>events.push(event.type)},persist:async state=>saved.push(state)});
 await policy.disable(['a']);assert.equal(policy.isTaskAvailable({operation:'ai.a'}),false);assert.equal(policy.isTaskAvailable({operation:'ai.b'}),true);
 assert.throws(()=>policy.disable(['core']),/Protected/);await policy.enable(['a']);assert.equal(policy.isTaskAvailable({operation:'ai.a'}),true);assert.equal(saved.length,2);assert.deepEqual(events,['local-feature-change','local-feature-change']);
 policy.configure({local:false,state:{disabledFeatures:['a']}});assert.ok(policy.isTaskAvailable({operation:'ai.a'}));
 const broken=createFeaturePolicy({catalog:fixture(),local:true,storage:null,persist:async()=>{throw Error('full disk');}});await assert.rejects(broken.disable(['a']),/full disk/);assert.equal(broken.state.disabledFeatures.length,0);
 let wrote=false;assert.throws(()=>createFeaturePolicy({storage:{getItem:()=>'{bad',setItem:()=>{wrote=true;}}}),{code:'FEATURE_POLICY_RECOVERY_REQUIRED'});assert.equal(wrote,false);
});

const realCatalog=JSON.parse(fs.readFileSync(new URL('../sherloq-browser/assets/feature-catalog.json',import.meta.url)));
const runtimeIncrement=JSON.parse(fs.readFileSync(new URL('../runtime-patches/batch-scientific-regions-20261013.json',import.meta.url)));
const realManifestBytes=fs.readFileSync(new URL('../../../web-assets/manifest-template.json',import.meta.url));
const realManifest=JSON.parse(realManifestBytes);
test('effective catalogue covers installed bytes and every neural/sparse batch recipe',()=>{
 assert.equal(createHash('sha256').update(realManifestBytes).digest('hex'),runtimeIncrement.manifest.sha256,'The effective catalogue must use the exact reviewed current inventory');
 validateFeatureCatalog(realCatalog,realManifest);assert.equal(selectActiveFiles(realCatalog).size,Object.keys(realManifest.files).length);
 const withoutNeural=selectActiveFiles(realCatalog,{disabledGroups:['neural-detectors','segmentation','learned-clones','forgeryscope','composite']});
 for(const record of runtimeIncrement.files.filter(record=>record.added))assert.ok(withoutNeural.has(record.file),'Shared scientific admission stays in protected core: '+record.file);
 for(const recipe of batchCatalog)assert.ok(featureIdsForTask(recipe,realCatalog).length,recipe.id+' has no functional connection');
 const panel='unified-assets/forgeryscope/yolo_panel_extractor.onnx',plan=featureDeletionPlan(realCatalog,realManifest,{},['m2.forgeryscope'],{presentChunks:Object.keys(realManifest.chunks)});
 assert.ok(!plan.paths.includes(panel));assert.ok(plan.removableBytes>600_000_000);assert.ok(plan.removableBytes<650_000_000);
 assert.equal(realCatalog.features.find(feature=>feature.id==='segmentation.selfdm-map').resources[0],'individual-assets/segmentation/selfdm-proposal/selfdm-map-512.onnx');
});
test('direct batch construction and optional menus use the same exclusion',async()=>{
 localFeaturePolicy.configure({catalog:realCatalog,local:true,state:{disabledFeatures:['ai.clones.d2prl']}});
 assert.equal(localFeaturePolicy.isToolAvailable('ai.clones.d2prl'),true,'other neural methods remain in the container');
 assert.throws(()=>batchTask(catalogRecipe('ai.clones.d2prl')),{code:'FEATURE_UNINSTALLED'});
 localFeaturePolicy.configure({state:{disabledGroups:['segmentation','forgeryscope','neural-detectors']}});
 assert.equal(localFeaturePolicy.isToolAvailable('ai.clones.d2prl'),false);
 await localFeaturePolicy.enable(['group:neural-detectors']);assert.equal(localFeaturePolicy.isTaskAvailable({operation:'ai.clones.d2prl'}),true);
 localFeaturePolicy.configure({local:false,state:{}});
});
test('automatic exclusions keep the exact native numerical plan and explicit absence state',()=>{
 const input={width:20,height:20,regions:[[[0,0],[19,0],[19,19],[0,19]]],envelope:[[0,0],[19,0],[19,19],[0,19]],complete:true};
 const baseline=automaticAnalysisPlan(input),partial=automaticAnalysisPlan({...input,excludedFeatures:['ai.clones.d2prl','m2.forgeryscope']});
 assert.deepEqual(partial.native,baseline.native);assert.deepEqual(partial.jobs.slice(0,2),baseline.jobs.slice(0,2));
 assert.equal(partial.jobs.find(job=>job.id==='d2prl').state,'feature-uninstalled');assert.equal(partial.jobs.find(job=>job.id==='forgeryscope').enabled,false);assert.equal(partial.jobs.find(job=>job.id==='ela').enabled,true);
});
test('automatic model setup skips disabled models and reinstallation loads only missing setup',async()=>{
 const calls=[],requests=[],engine={loadAutomaticModels:async()=>calls.push('forge'),loadD2prlModel:async()=>calls.push('d2'),loadM3Models:async()=>calls.push('ocr'),run:async task=>{calls.push(task);return {status:'ok',data:{entries:[],state:{completed:[],states:{}}}};},dispose:async()=>{}};
 const fetcher=async url=>{requests.push(String(url));return {ok:true,json:async()=>String(url).includes('neural-runtime')?{providers:{}}:{assets:{}},arrayBuffer:async()=>new ArrayBuffer(1)};};
 localFeaturePolicy.configure({catalog:realCatalog,local:true,state:{disabledFeatures:['ai.clones.d2prl','m2.forgeryscope']}});
 const client=await createAutomaticClient({engineFactory:()=>engine,fetcher,config:{assetBase:'./unified-assets/',englishSha256:'test'}});
 await client.run({operation:'analysis.complete'});assert.deepEqual(calls.filter(value=>typeof value==='string'),['ocr']);assert.equal(requests.length,1);assert.deepEqual(calls.find(value=>value?.operation).params.excludedFeatures,['ai.clones.d2prl','m2.forgeryscope']);
 await localFeaturePolicy.enable(['ai.clones.d2prl']);await client.run({operation:'analysis.complete'});assert.deepEqual(calls.filter(value=>typeof value==='string'),['ocr','d2']);await client.dispose();localFeaturePolicy.configure({local:false,state:{}});
});
