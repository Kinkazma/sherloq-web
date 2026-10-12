import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateFastEvaluatorQualification} from '../scripts/stage-d2prl-evaluator-fast.mjs';
import {summarize,summarizeWorkload} from '../scripts/benchmark-d2prl-optimization.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),pin=value=>({bytes:value.length,sha256:hash(value)}),clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const files={'pixel-major-combined.js':pin('HWC js'),'pixel-major-combined.wasm':pin('HWC wasm')},oracle={files:{'evaluator-tiled.js':pin('oracle js'),'evaluator-tiled.wasm':pin('oracle wasm')},sources:{'evaluator.cpp':hash('oracle'),'evaluator-tiled.cpp':hash('wrapper'),'reference-exp.h':hash('exp')}},source={bytes:3,sha256:hash('rgb'),shape:[1,1,3]},model={sha256:'8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b'},rows=[];
 for(let repetition=0;repetition<2;repetition++)for(const temperature of ['cold-context-new-model','warm-retained-model'])for(const variant of ['reference','candidate'])rows.push({variant,job:'positive',backend:'cpu',profile:'maximum',budgetBytes:1024,repetition,temperature,status:'passed',sourceThroughRunMs:variant==='reference'?100:90,runMs:80,sourceInitMs:1,modelInitMs:1,inferences:1,rawCacheHits:0,raw:['union','target','source'].map(plane=>({plane,sha256:hash(plane),dtype:'<f4',shape:[448,448]})),decision:{unchanged:true},modelIdentity:model,sourceIdentity:source,phaseMs:{}});
 const direct={schema:2,status:'passed-exact-parity',reference:'a'.repeat(40),model,experimental:{status:'passed-small-corpus-bit-parity',layout:'HWC-uint16',files},configuration:{startupOnly:false,repetitions:2,temperatures:['cold-context-new-model','warm-retained-model'],backends:['cpu'],profiles:['maximum'],budgets:[1024]},jobs:[{id:'positive',source,expectedInferences:1}],rows,summary:summarize(rows),workloadSummary:summarizeWorkload(rows),runtimeSnapshots:{candidate:{'src/d2prl-runtime.js':pin('current runtime')}}};
 return{direct,build:{status:'compiled-experimental-unqualified',compiler:'Emscripten 6.0.11',files,oracle:oracle.files,originalSources:oracle.sources,candidateSources:{'pixel-major-combined.cpp':hash('candidate'),'pixel-major-combined-tiled.cpp':hash('wrapper')}},smallParity:{status:'passed-small-corpus-bit-parity',controlBitIdenticalToVendor:true,cases:52,totalElements:1662364,buildFiles:files,oracle,variants:[{name:'pixel-major-combined',descriptorLayout:'HWC-uint16',bitIdenticalToVendor:true,bitIdenticalToSameCompilerControl:true}]},nativeCorpus:{variant:'pixel-major-combined',status:'passed-available-native-corpora',coverageComplete:false,missing:[{reference:'reference.json',name:'missing-native-case',side:448,files:['missing.bin']}],artifactFiles:files,evaluatorCases:1,evaluatorElements:8,records:[{x:{differentBits:0},y:{differentBits:0}}],softmax:{status:'passed'}},pins:{builds:{'evaluator-tiled':oracle}},proofIdentities:{direct:pin('direct proof'),smallParity:pin('small proof'),nativeCorpus:pin('native proof')}};
}
test('the staging gate accepts only a complete balanced exact/gain proof and emits portable known metadata',()=>{
 const f=fixture(),record=validateFastEvaluatorQualification(f);assert.equal(record.status,'qualified-exact-direct-model');assert.equal(record.qualification.directModel.runs,8);assert.equal(record.qualification.nativeCorpus.missing.length,1);assert.deepEqual(record.files,f.build.files);assert.equal(record.qualification.directModel.summary[0].pairedMedianGainPercent,10);assert.doesNotMatch(JSON.stringify(record),/Command|\/Users\//);assert.equal(Object.keys(record.files).length,2);
});
for(const [label,change]of [
 ['unfinished model report',f=>f.direct.status='running'],
 ['startup-only report',f=>f.direct.configuration.startupOnly=true],
 ['missing requested inference',f=>f.direct.rows.pop()],
 ['duplicate inference in a balanced-looking matrix',f=>f.direct.rows[1]=clone(f.direct.rows[0])],
 ['raw cache used instead of real inference',f=>f.direct.rows[1].rawCacheHits=1],
 ['one changed source raw plane',f=>f.direct.rows[1].raw[2].sha256=hash('changed')],
 ['unchanged decision omitted',f=>delete f.direct.rows[1].decision],
 ['unqualified 4 percent global gain',f=>{for(const row of f.direct.rows)if(row.variant==='candidate')row.sourceThroughRunMs=96;f.direct.summary=summarize(f.direct.rows);f.direct.workloadSummary=summarizeWorkload(f.direct.rows);}],
 ['claimed gain inconsistent with runs',f=>f.direct.summary[0].pairedGainPercent.median=80],
 ['experimental artifact changed',f=>{f.direct.experimental.files=clone(f.direct.experimental.files);f.direct.experimental.files['pixel-major-combined.wasm'].sha256=hash('changed');}],
 ['native numerical divergence',f=>f.nativeCorpus.records[0].y.differentBits=1],
 ['hidden native coverage omission',f=>f.nativeCorpus.missing=[]],
 ['missing runtime snapshot',f=>f.direct.runtimeSnapshots.candidate={}],
 ['private build compiler path',f=>f.build.compiler='/Users/person/sdk/emcc'],
])test('the staging gate rejects '+label,()=>{const f=fixture();change(f);assert.throws(()=>validateFastEvaluatorQualification(f));});
