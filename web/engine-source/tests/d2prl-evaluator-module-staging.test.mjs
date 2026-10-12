// Pure proof-gate tests; no compiler, Worker, model inference or vendor writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateEvaluatorModuleQualification} from '../scripts/stage-d2prl-evaluator-module.mjs';
import {summarize,summarizeWorkload} from '../scripts/benchmark-d2prl-optimization.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),variant='table-simd4-scalar',sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=value=>JSON.stringify(value,function(_key,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v;});
async function proofFixture(){
 const load=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
 const build=await load('.build/evaluator-table-simd/build.json'),smallParity=await load('.build/evaluator-table-simd/parity.json'),pins=await load('vendor/d2prl/PINNED.json'),baselineNativeCorpus=await load('.build/evaluator-cache-original/pixel-major-combined-native-corpus-proof.json');
 const nativeCorpus={...structuredClone(baselineNativeCorpus),variant,descriptorLayout:'HWC-uint16',artifactFiles:Object.fromEntries(['.js','.wasm'].map(suffix=>[variant+suffix,build.files[variant+suffix]]))};
 const source={bytes:608007,sha256:'1238856164fe1cde39f48ca43729fc0d5c2058eaab31502712a5762cc6ed41fd',shape:[389,521,3]},snapshot=Object.fromEntries(['pixel-major-combined.js','pixel-major-combined.wasm'].map(name=>['vendor/d2prl/'+name,structuredClone(pins.builds['evaluator-pixel-major'].files[name])]));
 const direct={schema:2,status:'passed-exact-parity',referenceKind:'frozen-current-engine-source',reference:'snapshot:'+sha(canonical(snapshot)),experimental:{layout:'HWC-uint16',status:'passed-small-corpus-bit-parity',files:nativeCorpus.artifactFiles},configuration:{startupOnly:false,repetitions:2,temperatures:['cold-context-new-model','warm-retained-model'],backends:['webgpu'],profiles:['maximum'],budgets:[8589934592],rolesMemoryMiB:256},jobs:[{id:'pinned-positive-rgb',source,expectedInferences:1}],model:{sha256:'8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b'},runtimeSnapshots:{reference:snapshot,candidate:snapshot},rows:[]};
 for(const temperature of direct.configuration.temperatures)for(let repetition=0;repetition<2;repetition++)for(const name of ['reference','candidate']){const ms=100+repetition*10;
  direct.rows.push({variant:name,job:'pinned-positive-rgb',backend:'webgpu',profile:'maximum',budgetBytes:8589934592,temperature,repetition,status:'passed',inferences:1,rawCacheHits:0,sourceThroughRunMs:name==='reference'?ms:ms*.9,runMs:name==='reference'?ms:ms*.9,phaseMs:{preparation:1,descriptors:10,patchmatch:40,heads:10},raw:['union','target','source'].map((plane,i)=>({plane,dtype:'<f4',shape:[448,448],sha256:['a','b','c'][i].repeat(64)})),decision:{positive_pixels:500},sourceIdentity:structuredClone(source),modelIdentity:{sha256:direct.model.sha256},execution:{evaluator:{descriptorLayout:'HWC-uint16',url:'http://localhost/'+(name==='reference'?'reference/vendor/d2prl/pixel-major-combined.js':'experimental/'+variant+'.js')}},finalCapabilities:{memory:{activeReservationBytes:0,retainedBytes:0,cacheBytes:0,activeRecoveries:0},execution:{active:{cpu:0,gpu:0},running:0,queued:0},resources:{domains:{wasm:{backings:0,materializedBytes:0}},operations:[],pressures:[]}}});
 }
 direct.summary=summarize(direct.rows);direct.workloadSummary=summarizeWorkload(direct.rows);
 return{variant,buildKey:'evaluator-'+variant,direct,build,smallParity,nativeCorpus,baselineNativeCorpus,pins,proofIdentities:Object.fromEntries(['direct','smallParity','nativeCorpus'].map(name=>[name,{bytes:1,sha256:'d'.repeat(64)}]))};
}
let fixture;try{fixture=await proofFixture();}catch(error){if(error.code!=='ENOENT')throw error;}
const options={skip:!fixture?'Requires the existing isolated qualification artifacts; does not build them':false};
test('complete frozen HWC comparison qualifies a portable additive build record',options,()=>{
 const record=validateEvaluatorModuleQualification(structuredClone(fixture));assert.equal(record.status,'qualified-exact-direct-model');assert.equal(record.qualification.directModel.runs,8);assert.equal(record.qualification.directModel.referenceKind,'frozen-current-engine-source');assert.ok(record.qualification.directModel.summary.every(row=>row.pairedMedianGainPercent>=5));assert.ok(!JSON.stringify(record).includes('/Users/'));
});
test('historical or altered snapshot cannot masquerade as additional current-HWC gain',options,()=>{
 for(const mutation of [value=>{value.direct.referenceKind='historical-git-commit';},value=>{value.direct.reference='snapshot:'+'f'.repeat(64);},value=>{value.direct.runtimeSnapshots.reference['vendor/d2prl/pixel-major-combined.js'].sha256='f'.repeat(64);value.direct.reference='snapshot:'+sha(canonical(value.direct.runtimeSnapshots.reference));}]){const value=structuredClone(fixture);mutation(value);assert.throws(()=>validateEvaluatorModuleQualification(value));}
});
test('partial pairs, raw divergence and sub-five-percent additional gain reject staging',options,()=>{
 for(const mutation of [value=>value.direct.rows.pop(),value=>{value.direct.rows.find(row=>row.variant==='candidate').raw[1].sha256='f'.repeat(64);},value=>{for(const row of value.direct.rows)if(row.variant==='candidate')row.sourceThroughRunMs*=.97/.9;}]){const value=structuredClone(fixture);mutation(value);value.direct.summary=summarize(value.direct.rows);value.direct.workloadSummary=summarizeWorkload(value.direct.rows);assert.throws(()=>validateEvaluatorModuleQualification(value));}
});
test('different artifact, omitted native row and residual backing ownership reject staging',options,()=>{
 for(const mutation of [value=>{value.nativeCorpus.artifactFiles[variant+'.wasm'].sha256='f'.repeat(64);},value=>{value.nativeCorpus.records[1]=structuredClone(value.nativeCorpus.records[0]);},value=>{value.direct.rows[0].finalCapabilities.resources.domains.wasm.materializedBytes=65536;}]){const value=structuredClone(fixture);mutation(value);assert.throws(()=>validateEvaluatorModuleQualification(value));}
});
test('empty comparisons, missing same-SDK comparison, missing trace and false extents reject staging',options,()=>{
 for(const mutation of [value=>{value.smallParity.records[0].comparisons={};},value=>{delete value.smallParity.records[0].comparisons[variant+'Totable-control'];},value=>{delete value.smallParity.records.find(row=>row.trace).comparisons[variant+'Tovendor'].trace;},value=>{value.smallParity.records[0].comparisons[variant+'Tovendor'].x.elements++;},value=>{value.smallParity.totalElements++;}]){const value=structuredClone(fixture);mutation(value);assert.throws(()=>validateEvaluatorModuleQualification(value));}
});
test('below-five-percent gain requires the explicit all-positive-pairs criterion',options,()=>{
 const value=structuredClone(fixture);
 for(const row of value.direct.rows)if(row.variant==='candidate')row.sourceThroughRunMs*=.956/.9;
 value.direct.summary=summarize(value.direct.rows);value.direct.workloadSummary=summarizeWorkload(value.direct.rows);
 assert.throws(()=>validateEvaluatorModuleQualification(value),/qualified global gain/);
 const record=validateEvaluatorModuleQualification({...value,acceptConsistentPositivePairs:true}),direct=record.qualification.directModel;
 assert.equal(direct.speedCriterion,'all-paired-runs-faster');assert.equal(direct.allCasesReachFivePercent,false);
 assert.ok(Math.abs(direct.minObservedPairedGainPercent-4.4)<1e-10);
 assert.ok(direct.summary.every(row=>row.exact&&row.allPairedRunsFaster&&!row.globalGainQualified&&row.minObservedPairedGainPercent>0));
 assert.match(record.qualification.scope,/does not require or claim at least5%/);
});
test('explicit all-positive-pairs criterion rejects one zero or negative pair despite positive medians',options,()=>{
 for(const multiplier of [1,1.001]){
  const value=structuredClone(fixture),candidate=value.direct.rows.find(row=>row.variant==='candidate'),reference=value.direct.rows.find(row=>row.variant==='reference'&&row.temperature===candidate.temperature&&row.repetition===candidate.repetition);
  candidate.sourceThroughRunMs=reference.sourceThroughRunMs*multiplier;
  value.direct.summary=summarize(value.direct.rows);value.direct.workloadSummary=summarizeWorkload(value.direct.rows);
  assert.throws(()=>validateEvaluatorModuleQualification({...value,acceptConsistentPositivePairs:true}),/Every individual paired run/);
 }
});
test('resource-only mode cannot qualify speed even with an explicit positive-pairs criterion',options,()=>{
 const value=structuredClone(fixture);value.direct.configuration.resourceParityOnly=true;
 assert.throws(()=>validateEvaluatorModuleQualification({...value,acceptConsistentPositivePairs:true}),/Balanced cold/);
});
