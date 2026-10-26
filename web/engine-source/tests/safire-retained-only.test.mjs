// Real cache/adapters, controlled composition only. No model, ORT or Worker start.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SafireEngine} from '../src/safire.js';
import {createStrictSafireEngine} from '../src/safire-strict.js';
import {createM3Adapter} from '../src/m3-adapter.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
const MiB=1024**2;
const proposals=()=>({features:new Float32Array(256),lowMasks:new Float32Array(65536),confidence:Float32Array.of(.9),areas:Uint32Array.of(4),points:Float32Array.of(1,1),validIds:Int32Array.of(0),metadata:{provider:'controlled-no-model'}});
test('whole SAFIRE cache-only miss refuses before any asset or worker; hit composes exact requested parameters',async()=>{
 const priorWorker=globalThis.Worker,priorFetch=globalThis.fetch;let workers=0,fetches=0,rpc=0;
 globalThis.Worker=class{constructor(){workers++;throw Error('Worker forbidden');}};globalThis.fetch=async()=>{fetches++;throw Error('Asset forbidden');};
 const budget=new Budget(256*MiB),engine=new SafireEngine({format:'rgb8',width:2,height:2,data:new Uint8Array(12)},budget,{maxWorkers:8});
 try{
  await assert.rejects(engine.analyze({side:4},{requireCached:true,backend:'cpu'}),{code:'PREVIEW_UNAVAILABLE'});
  budget.put(engine.prefix+'4/cpu',{value:proposals(),byteLength:300000});
  engine.rpc=async job=>{rpc++;assert.equal(job.task,'compose');assert.equal(job.params.groups,4);assert.equal(job.params.minimum,7);return{chosen:[0],map:new Float32Array(2),source_probabilities:new Float32Array(2),source_labels:new Uint32Array(2),prompt_clusters:new Int32Array(1)};};
  const out=await engine.analyze({side:4,groups:4,minimum:7},{requireCached:true,backend:'cpu'});assert.equal(out.metadata.proposals_reused,true);out.release();assert.equal(rpc,1);assert.equal(workers,0);assert.equal(fetches,0);assert.equal(engine.counts.proposals,0);
 }finally{await engine.dispose();globalThis.Worker=priorWorker;globalThis.fetch=priorFetch;assert.equal(budget.total(),0);}
});
test('strict SAFIRE cache-only miss does not construct a fragment; final propagates requireCached to existing fragments',async()=>{
 const budget=new Budget(128*MiB),sha='b'.repeat(64),s=await createOriginalSourceRegionsState({sourceSha256:sha,width:4,height:2});await s.add('acquisition',{x0:0,y0:0,x1:2,y1:2});const domain=(await compileOriginalSourceRegions(s.snapshot())).descriptor;
 const image={sha256:sha,sourceRegionDomain:domain,sourceRegionOrigin:[0,0],surface:{descriptor:{width:2,height:2,format:'rgb8'}},originalSource:{sha256:sha,surface:{descriptor:{width:4,height:2,format:'rgb8'},async readWindow(){throw Error('RGB not needed by controlled proposals');}}}};
 let factory=0,extracts=0,requireCached,available=true;
 const owner=createStrictSafireEngine(image,budget,{maxWorkers:8},{engineFactory(){factory++;return{async extractProposals(params,hooks){extracts++;requireCached=hooks.requireCached;if(hooks.requireCached&&!available)throw Object.assign(Error('Controlled proposal cache evicted'),{code:'PREVIEW_UNAVAILABLE'});return{proposals:proposals(),reused:hooks.requireCached,release(){}};},dispose(){}};},postprocess:async job=>{assert.equal(job.task,'cluster-global');return{assignments:Int32Array.of(-1),chosen:new Int32Array(),clusterLabels:new Int32Array()};}});
 try{
  await assert.rejects(owner.analyze({side:4},{requireCached:true}),{code:'PREVIEW_UNAVAILABLE'});assert.equal(factory,0);assert.equal(extracts,0);
  const warm=await owner.analyze({side:4});warm.release();assert.equal(factory,1);assert.equal(requireCached,false);
  const hit=await owner.analyze({side:4,minimum:7},{requireCached:true});hit.release();assert.equal(factory,1);assert.equal(requireCached,true);
  available=false;await assert.rejects(owner.analyze({side:4},{requireCached:true}),{code:'PREVIEW_UNAVAILABLE'});assert.equal(factory,1);assert.equal(requireCached,true);
 }finally{await owner.dispose();assert.equal(budget.total(),0);}
});
test('M3 cache-only regrouping rejects a missing owner and disallows other methods before constructing engines',async()=>{
 const budget=new Budget(64*MiB),adapter=createM3Adapter({budget,profile:{maxWorkers:8},version:'test'}),image={sha256:'a'.repeat(64),pixels:{format:'rgb8',width:2,height:2,data:new Uint8Array(12)}};
 try{await assert.rejects(adapter.run({id:'r',imageId:'im',operation:'ai.sources.safire',params:{side:4},retainedNativeOnly:true},image),{code:'PREVIEW_UNAVAILABLE'});await assert.rejects(adapter.run({id:'r',imageId:'im',operation:'ai.localization.focal',params:{},retainedNativeOnly:true},image));}finally{await adapter.dispose();assert.equal(budget.total(),0);}
});
