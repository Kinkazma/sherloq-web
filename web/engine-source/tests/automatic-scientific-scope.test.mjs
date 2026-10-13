import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';
import {automaticD2prlRequest} from '../src/automatic-ai-regions.js';
import {analyzeAutomaticForgeryscope} from '../src/automatic-forgeryscope.js';
import {createForgeryscopeSourceAnalyzer} from '../src/forgeryscope-source-analyzer.js';
import {forgeryscopeEntries} from '../src/automatic-ai-entries.js';
import {createAutomaticD2prlProvider} from '../src/automatic-d2prl-provider.js';
import {automaticAiSnapshot} from '../src/automatic-ai-snapshot.js';
import {createAutomaticDetectorProviders} from '../src/automatic-detector-providers.js';
import {createAutomaticRuntime} from '../src/automatic-runtime.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
import {DenseCopyEngine} from '../src/dense-copy.js';
import {EngineError} from '../src/errors.js';

const sha='a'.repeat(64),poly=([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]],width=80,height=24;
const regions=[{x0:1.25,y0:.5,x1:25.75,y1:22.5,type:'microscopy',confidence:.9},{x0:48.25,y0:.5,x1:75.75,y1:22.5,type:'microscopy',confidence:.8}].map(r=>({...r,polygon:poly([r.x0,r.y0,r.x1,r.y1])}));
const scope=()=>({schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',width,height,sourceSha256:sha,fingerprint:'b'.repeat(64),status:'ready',text:{status:'complete'},regions:structuredClone(regions),searchRegions:[...structuredClone(regions),{x0:1.25,y0:.5,x1:75.75,y1:22.5,envelope:true,polygon:poly([1.25,.5,75.75,22.5])}],excluded:[poly([9,4,13,9]),poly([26,0,48,24])]});
const plan=(s=scope(),complete=false)=>automaticAnalysisPlan({width,height,regions:s.regions.map(r=>r.polygon),envelope:null,scientificScope:s,complete});

test('prepared Automatic preserves all four detectors without synthetic neural envelope, with the real complete ELA job',()=>{
 const s=scope(),p=plan(s,true),task=automaticD2prlRequest(p,{id:'a',imageId:'i'});
 assert.deepEqual(p.jobs.map(j=>[j.id,j.enabled]),[['patchmatch',true],['sift',true],['forgeryscope',true],['d2prl',true],['ela',true]]);
 for(const id of ['patchmatch','sift']){const job=p.jobs.find(j=>j.id===id);assert.deepEqual(job.params.regions,s.searchRegions.map(r=>r.polygon));assert.deepEqual(job.params.excluded,s.excluded);}
 assert.equal(p.jobs[0].params.iterations,8);assert.equal(p.jobs[1].params.limit,6000);assert.equal(p.jobs[1].params.minimum,10);assert.equal(p.jobs[3].minimum,500);
 assert.deepEqual(p.jobs[2].params.regions,s.regions.map(r=>r.polygon));assert.deepEqual(task.regions.map(r=>r.bounds),[[1,0,26,23],[48,0,76,23]]);assert.deepEqual(task.params.exclusions,[]);assert.deepEqual(task.params.scientificScope,s);
 assert.notEqual(task.params.scientificScope,s);assert.equal(task.regions.length,2);
 const empty=plan({...s,status:'excluded',regions:[],searchRegions:[]});assert.ok(empty.jobs.every(j=>!j.enabled));
});

test('installed-feature policy only changes explicit job availability while exact scientific geometry and native settings stay owned',()=>{
 const s=scope(),baseline=plan(s,true),before=structuredClone(s);
 for(const excludedFeatures of [['ai.clones.d2prl'],['m2.forgeryscope'],['m2.forgeryscope','ai.clones.d2prl','m2.forgeryscope']]){
  const p=automaticAnalysisPlan({width,height,regions:s.regions.map(r=>r.polygon),envelope:null,scientificScope:s,complete:true,excludedFeatures});
  assert.deepEqual(p.native,baseline.native);assert.deepEqual(p.scientificScope,s);assert.notEqual(p.scientificScope,s);assert.deepEqual(p.active,baseline.active);assert.deepEqual(p.excluded,s.excluded);assert.deepEqual(p.excludedFeatures,[...new Set(excludedFeatures)].sort());
  for(const job of p.jobs){const removed=excludedFeatures.includes({d2prl:'ai.clones.d2prl',forgeryscope:'m2.forgeryscope'}[job.id]);assert.equal(job.enabled,!removed);assert.equal(job.state,removed?'feature-uninstalled':'pending');assert.deepEqual(job.params,baseline.jobs.find(j=>j.id===job.id).params);}
 }
 for(const excludedFeatures of ['ai.clones.d2prl',['SSG'],['ai.clones.segmentation'],[null]])assert.throws(()=>automaticAnalysisPlan({width,height,regions:s.regions.map(r=>r.polygon),scientificScope:s,excludedFeatures}),{code:'INVALID_INPUT'});
 assert.deepEqual(s,before);
});

test('automatic sparse provider supplies exact prepared scope to prevent another native Panels/Text classification',async()=>{
 const budget=new Budget(2**20),p=plan(),calls=[],providers=createAutomaticDetectorProviders({image:{width,height},budget,sparse:{async analyze(params,hooks){calls.push({params,hooks});return {release(){}};}},geometry:{biomeSides(){}}});
 const result=await providers.sift.run(p.jobs[1],{plan:p});result.release();assert.equal(calls.length,1);assert.equal(calls[0].hooks.scientificScope,p.scientificScope);assert.equal(calls[0].hooks.sourceSha256,sha);assert.deepEqual(calls[0].params.excluded,p.scientificScope.excluded);assert.equal(budget.total(),0);
});

test('public Automatic runtime derives selection from a prepared scope without any fallback detection and rejects a source mismatch',async t=>{
 const budget=new Budget(8*1024**2),s=scope(),image={sha256:sha,pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)},provenance:{}},seen={};
 t.mock.method(DenseCopyEngine.prototype,'analyze',async function(params){seen.dense=structuredClone(params);throw new EngineError('TEST_DENSE_REACHED','Native scope dispatch reached');});
 t.mock.method(SparseCopyEngine.prototype,'analyze',async function(params,hooks){seen.sparse=structuredClone(params);assert.equal(hooks.scientificScope.fingerprint,s.fingerprint);throw new EngineError('TEST_SPARSE_REACHED','Prepared scope dispatch reached');});
 const adapter={configured(){return true;},async runOwned(task){seen.d2=structuredClone(task);throw new EngineError('TEST_D2_REACHED','Scientific native request reached');},readRawOwned(){throw Error('No fabricated raw model grids');}},runtime=createAutomaticRuntime({budget,profile:{maxWorkers:10},version:'scope-contract',getLanguage:()=>({sha256:'c'.repeat(64)}),getD2prl:()=>adapter}),task={id:'automatic',imageId:'i',operation:'analysis.clones',params:{scientificScope:s}};
 try{
  const output=await runtime.run(task,image);assert.deepEqual(output.selection,{regions:s.regions.map(r=>r.polygon),envelope:null,disabled:[]});assert.deepEqual(seen.dense.regions,s.searchRegions.map(r=>r.polygon));assert.deepEqual(seen.sparse.excluded,s.excluded);assert.deepEqual(seen.d2.params.scientificScope,s);assert.deepEqual(seen.d2.regions.map(r=>r.bounds),[[1,0,26,23],[48,0,76,23]]);assert.equal(output.data.state.states.forgeryscope,'failed','Forgeryscope remained enabled and explicitly reported its unloaded model');
  await assert.rejects(runtime.run({...task,id:'bad',params:{scientificScope:{...s,sourceSha256:'d'.repeat(64)}}},image),{code:'INVALID_INPUT'});
 }finally{await runtime.dispose();}assert.equal(budget.total(),0);
});

test('public runtime forwards scope and installed-feature policy together, and policy changes invalidate reuse without changing source or capacity',async t=>{
 const budget=new Budget(8*1024**2),s=scope(),profile={maxWorkers:10},image={sha256:sha,pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3)},provenance:{}},seen={dense:0,sparse:0,d2:0},sourceBefore=image.pixels.data.slice();
 t.mock.method(DenseCopyEngine.prototype,'analyze',async function(params){seen.dense++;assert.deepEqual(params.regions,s.searchRegions.map(r=>r.polygon));assert.deepEqual(params.excluded,s.excluded);assert.equal(params.iterations,8);throw new EngineError('TEST_DENSE_REACHED','Protocol fixture, no native extraction');});
 t.mock.method(SparseCopyEngine.prototype,'analyze',async function(params,hooks){seen.sparse++;assert.deepEqual(hooks.scientificScope,s);assert.equal(params.algorithm,'SIFT-G2NN');assert.equal(params.limit,6000);throw new EngineError('TEST_SPARSE_REACHED','Protocol fixture, no native extraction');});
 const adapter={configured:()=>true,async runOwned(task){seen.d2++;assert.deepEqual(task.params.scientificScope,s);throw new EngineError('TEST_D2_REACHED','Protocol fixture, no model inference');},readRawOwned(){throw Error('No inference or fabricated grids');}},runtime=createAutomaticRuntime({budget,profile,version:'combined-contract',getLanguage:()=>({sha256:'c'.repeat(64)}),getD2prl:()=>adapter}),task={id:'combined',imageId:'i',operation:'analysis.clones',params:{scientificScope:s,excludedFeatures:['ai.clones.d2prl','m2.forgeryscope']}};
 try{
  const first=await runtime.run(task,image);assert.equal(first.data.state.states.d2prl,'feature-uninstalled');assert.equal(first.data.state.states.forgeryscope,'feature-uninstalled');assert.deepEqual(seen,{dense:1,sparse:1,d2:0});
  const reused=await runtime.run({...task,id:'same'},image);assert.equal(reused.analysisId,first.analysisId);assert.equal(reused.metrics.cache.analysis,true);assert.deepEqual(seen,{dense:1,sparse:1,d2:0});
  const restored=await runtime.run({...task,id:'features-restored',params:{scientificScope:s,excludedFeatures:[]}},image);assert.notEqual(restored.analysisId,first.analysisId);assert.equal(restored.data.state.states.forgeryscope,'failed','Unloaded installed model remains explicit, not silently disabled');assert.deepEqual(seen,{dense:2,sparse:2,d2:1});assert.equal(profile.maxWorkers,10);assert.deepEqual(image.pixels.data,sourceBefore);
 }finally{await runtime.dispose();}assert.equal(budget.total(),0);
});

// Real orchestration/field ownership; network tensors here are protocol fixtures,
// never a claim that the scientific corpus or a neural model was qualified.
test('scoped Forgeryscope consumes original RGB once, uses prepared panels, and preserves every raw branch byte',async()=>{
 const budget=new Budget(16*1024**2),s=scope(),p=plan(s),pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i*31%256)},original=pixels.data.slice(),seen=[];
 const networks={async detect(){throw Error('Prepared acquisition classification must not run again');},async embed(images,name,options){seen.push(name);for(const image of images){assert.ok(image.data.some(Boolean));assert.equal(options.scientificScope.fingerprint,s.fingerprint);}return {vectors:new Float32Array(2048),release(){}};},async match(a,b,label,options){assert.equal(label,'Microscopy');assert.deepEqual(a.scientificOrigin,[1,0]);assert.deepEqual(b.scientificOrigin,[48,0]);assert.equal(options.scientificScope.fingerprint,s.fingerprint);return {inliers:9,mean_match_score:.8,overlap_poly_img0:poly([0,0,12,12]),overlap_poly_img1:poly([0,0,12,12]),scopeFiltering:{fingerprint:s.fingerprint,stage:'keypoints-before-matching'}};}};
 const pool={async run(){return {result:{scores:{data:Float32Array.of(1,1)}},release(){}};}},analyzer=createForgeryscopeSourceAnalyzer({networks,budget,pool,identities:[]});let result,again;
 try{
  result=await analyzeAutomaticForgeryscope({pixels,sha256:sha},p,{analyzer,budget});assert.equal(result.layout,'segmented');assert.equal(result.metadata.zones[0].panel_selection.classificationRepeated,false);assert.equal(result.metadata.zones[0].filtered_evidence.comparisons.length,1);assert.deepEqual(seen,['micro_overlap_embedder']);assert.deepEqual(pixels.data,original);
  const raw=new Uint8Array(width*height);await result.stores.branch_microscopy.readInto(raw);assert.equal(raw[4*width+10],1,'Native envelope still contains the raw exclusion hole');assert.equal(result.provenance.exclusion_policy.includes('original-rgb'),true);
  again=await analyzeAutomaticForgeryscope({pixels,sha256:sha},p,{analyzer,budget});assert.equal(again.metadata.zones[0].scientific_scope.fingerprint,s.fingerprint);const saved=new Uint8Array(width*height);await again.stores.branch_microscopy.readInto(saved);assert.deepEqual(saved,raw);assert.equal(seen.length,2,'Borrowed contiguous surfaces have unique identities; no fake cache claim');
 }finally{await result?.release();await again?.release();analyzer.clearCache();}assert.equal(budget.total(),0);assert.deepEqual(pixels.data,original);
});

test('scoped raw Forgeryscope similarity and lanes never vote; only correctly pinned supported geometry does',async()=>{
 const wasmBinary=new Uint8Array(await readFile(new URL('../vendor/clone-entries/clone-entries.wasm',import.meta.url))),budget=new Budget(128*1024**2),fp=scope().fingerprint;
 const geometric={accepted:true,supported:true,branch:'microscopy',inliers:9,score:.8,polygon0:poly([0,0,10,10]),polygon1:poly([50,0,60,10]),scientificScope:{qualified:true,featureFiltering:{fingerprint:fp}}},raw={...geometric,supported:false,branch:'blots',scientificScope:{qualified:false}},lanes={...geometric,branch:'lanes'},zone={origin:[0,0],scientific_scope:{fingerprint:fp},comparisons:[geometric,raw],lane_pairs:[lanes],filtered_evidence:{scopeFingerprint:fp,comparisons:[geometric,raw],lanePairs:[]}},before=structuredClone(zone);
 const result=await forgeryscopeEntries({metadata:{zones:[zone]}},{budget,wasmBinary});try{assert.equal(result.entries.length,1);assert.equal(result.entries[0].provenance.evidence,'geometry');assert.equal(result.entries[0].provenance.branch,'microscopy');assert.deepEqual(zone,before);}finally{result.release();}assert.equal(budget.total(),0);
 zone.filtered_evidence.scopeFingerprint='other';const none=await forgeryscopeEntries({metadata:{zones:[zone]}},{budget,wasmBinary});assert.deepEqual(none.entries,[]);none.release();assert.equal(budget.total(),0);
});

test('fully cancelled Automatic D2PRL exports a genuine zero-grid analysis with no raw model/refilter calls',async()=>{
 const metadata={analysisId:'cancelled',resultId:'cancelled',boxes:[],min_component:500,inferences:0,scientificScope:{stage:'fully-cancelled-before-inference',fingerprint:scope().fingerprint}},n=width*height,data={width,height,metadata,mask:new Uint8Array(n),map:new Float32Array(n),source:new Float32Array(n),target:new Float32Array(n),candidates:new Uint8Array(n),analyzed:new Uint8Array(n)};
 let runs=0,raws=0;const provider=createAutomaticD2prlProvider({image:{sha256:sha},imageId:'i',adapter:{async runOwned(){runs++;return {data,release(){}};},readRawOwned(){raws++;throw Error('No cancelled raw grids exist');}}}),p=plan(),output=await provider.run(p.jobs[3],{plan:p});
 const prepared=await provider.prepare(output.value,{d2Minimum:17},{plan:p});assert.deepEqual(prepared.value.entries,[]);prepared.release();const raw=provider.readRaw(output.value),snapshot=automaticAiSnapshot('d2prl',output.value.result,{raw:raw.value.result});assert.deepEqual(snapshot.raw_probabilities.shape,[0,3,448,448]);assert.equal(snapshot.raw_probabilities.count,0);const zero=new Uint8Array(0);await snapshot.raw_probabilities.read(zero,0,0);raw.release();output.release();assert.equal(runs,1);assert.equal(raws,0);
 assert.throws(()=>automaticAiSnapshot('d2prl',{...data,metadata:{...metadata,scientificScope:undefined}},{raw:raw.value.result}),{code:'INVALID_INPUT'});
});
