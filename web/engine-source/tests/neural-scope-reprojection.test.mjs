// Adapter identity guards with mocked runtime/session factories only.
// No neural graph, native model or long D2PRL calculation is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';

const enabled=process.execArgv.includes('--experimental-test-module-mocks');
const options={skip:!enabled&&'Requires --experimental-test-module-mocks for isolated adapter runtime contracts'};
const sha='a'.repeat(64),fingerprint='b'.repeat(64),regions=[{id:'panel',kind:'region',bounds:[0,0,16,16]}];
const scope=rectangle=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',status:'ready',sourceSha256:sha,width:16,height:16,fingerprint,regions:[{x0:0,y0:0,x1:16,y1:16}],excluded:[rectangle]});
const a=scope([[2,2],[4,2],[4,4],[2,4]]),b=scope([[8,8],[10,8],[10,10],[8,10]]);
function image(){return {sha256:sha,pixels:{width:16,height:16,data:new Uint8Array(16*16*3).fill(79)},provenance:{decoder:'contract',sourceSize:[16,16]}};}
function harness(t){
 const stats={runs:0,views:0,inferences:0,projectImages:0,disposed:0},budget=new Budget(2**20);let previous;
 t.mock.module('../src/neural-projector.js',{namedExports:{createNeuralProjector:()=>({setImage(){stats.projectImages++;},dispose(){stats.disposed++;}})}});
 t.mock.module('../experiments/d2prl/spatial.js',{namedExports:{createSpatial:()=>({dispose(){stats.disposed++;}})}});
 function result(metadata,inferences){return {width:16,height:16,map:new Float32Array(256),mask:new Uint8Array(256),target:new Uint8Array(256),source:new Uint8Array(256),metadata:{...structuredClone(metadata),inferences,cache_hits:inferences?0:1},release(){}};}
 function session(factory){return {async run(input,hooks){stats.runs++;if(factory.infer){const output=await factory.infer({},hooks);output.release();}else{const output=await factory.inference.run(new Float32Array(1),hooks);output.release();}
   previous={analysisId:'completed-A',resultId:'completed-A',zones:structuredClone(input.zones),exclusions:[],scientificScope:{...structuredClone(input.scientificScope.metadata),identity:input.scientificScope.identity}};return result(previous,1);},async reproject(){stats.views++;return result(previous,0);},async refilter(){stats.views++;return result(previous,0);},dispose(){stats.disposed++;},readRaw(){throw Error('No raw-model read in this adapter identity test');}};}
 return {budget,stats,session};
}
async function qualify(adapter,h,{variant,d2=false}={}){
 const source=image(),before=source.pixels.data.slice(),params=d2?{minimum:7}:{variant},operation=d2?'ai.clones.d2prl':'ai.clones.segmentation';
 const first=await adapter.run({id:'initial',imageId:'image',operation,regions,params:{...params,selectionPresent:true,scientificScope:structuredClone(a)},backend:'cpu'},source);assert.equal(first.status,'ok');assert.equal(h.stats.runs,1);assert.equal(h.stats.inferences,1);
 const request=value=>({id:'view',imageId:'image',operation,params:{...params,[d2?'refilterOf':'reprojectOf']:first.data.metadata.analysisId,...(!d2?{zoneIds:['panel']}:{minimum:8}),scientificScope:structuredClone(value)},backend:'cpu'});
 const refuse=async value=>{const before={...h.stats};await assert.rejects(adapter.run(request(value),source),error=>error.code==='INVALID_INPUT'&&/scope|dimensions|identity/i.test(error.message));assert.deepEqual(h.stats,before,'A mismatched scope must fail before a new project, refilter, model inference or setImage.');};
 assert.equal(a.fingerprint,b.fingerprint);await refuse(b);
 for(let attempt=0;attempt<2;attempt++){const view=await adapter.run(request(a),source);assert.equal(view.status,'ok');assert.equal(view.data.metadata.inferences,0);assert.deepEqual(view.provenance.scientificScope,first.provenance.scientificScope);assert.equal(view.provenance.originalSha256,sha);assert.equal(h.stats.views,attempt+1);assert.equal(h.stats.runs,1);assert.equal(h.stats.inferences,1);await refuse(b);}
 await refuse({...a,width:17});await refuse({...a,sourceSha256:'c'.repeat(64)});assert.deepEqual(source.pixels.data,before);
}
test('segmentation reproject rejects changed exclusions with the same fingerprint before projection and retains exact identity across two views',options,async t=>{
 const h=harness(t),model=SEGMENTATION_MODELS.mgcfdn;
 t.mock.module('../experiments/segmentation/backend.js',{namedExports:{selectSegmentationBackend:async()=>({backend:'cpu',reason:'mocked-runtime'})}});
 t.mock.module('../experiments/segmentation/prepare.js',{namedExports:{createSegmentationPrepare:()=>({dispose(){}})}});
 t.mock.module('../experiments/segmentation/inference.js',{namedExports:{createSegmentationInference:()=>({model,async run(){h.stats.inferences++;return {release(){}};},dispose(){}})}});
 t.mock.module('../experiments/segmentation/zones.js',{namedExports:{createSegmentationZones:()=>({})}});
 t.mock.module('../experiments/segmentation/analysis.js',{namedExports:{createSegmentationAnalysis:factory=>h.session(factory)}});
 const {createSegmentationAdapter}=await import('../src/segmentation-adapter.js?reprojection-contract'),adapter=createSegmentationAdapter({budget:h.budget,profile:{maxWorkers:10},version:'contract'});
 try{await adapter.load({variant:'mgcfdn',bytes:model.bytes,sha256:model.sha256,url:'https://fixture.invalid/model.json'});await qualify(adapter,h,{variant:'mgcfdn'});}finally{await adapter.dispose();}assert.equal(h.budget.total(),0);
});
test('D2PRL refilter rejects changed exclusions with the same fingerprint before refilter and retains exact identity across two views',options,async t=>{
 const h=harness(t),manifest={schema:1,side:448,iterations:40,seed:22,referenceThreads:8,modelId:'reprojection-contract',checkpointSha256:'2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36'},bytes=new TextEncoder().encode(JSON.stringify(manifest)),identity={bytes:bytes.length,sha256:'d'.repeat(64)};
 t.mock.module('../src/d2prl-model-identity.js',{namedExports:{D2PRL_MODEL_IDENTITY:identity}});
 t.mock.module('../src/d2prl-runtime.js',{namedExports:{d2prlRuntime:async()=>({postprocessUrl:'https://fixture.invalid/postprocess',spatialUrl:'https://fixture.invalid/spatial'})}});
 t.mock.module('../experiments/d2prl/model.js',{namedExports:{readVerifiedModelAsset:async()=>bytes,createD2prlModel:async()=>({async run(){h.stats.inferences++;return {release(){}};},releaseCheckpoint(){},dispose(){}})}});
 t.mock.module('../experiments/d2prl/postprocess.js',{namedExports:{createPostprocess:()=>({dispose(){}})}});
 t.mock.module('../experiments/d2prl/zones.js',{namedExports:{createD2prlZones:()=>({})}});
 t.mock.module('../experiments/d2prl/analysis.js',{namedExports:{createD2prlAnalysis:factory=>h.session(factory)}});
 const {createD2prlAdapter}=await import('../src/d2prl-adapter.js?reprojection-contract'),adapter=createD2prlAdapter({budget:h.budget,profile:{maxWorkers:10},version:'contract'});
 try{await adapter.load({url:'https://fixture.invalid/model.json',...identity});await qualify(adapter,h,{d2:true});}finally{await adapter.dispose();}assert.equal(h.budget.total(),0);
});
