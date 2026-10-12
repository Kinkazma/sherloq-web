// Validate by default. --stage changes only the local two-file evaluator and
// its portable PINNED entry; runtime selection remains a separate source edit.
import {readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {summarize,summarizeWorkload} from './benchmark-d2prl-optimization.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url)),VARIANT='pixel-major-combined',NAMES=[VARIANT+'.js',VARIANT+'.wasm'],BUILD_KEY='evaluator-pixel-major';
const sha=value=>createHash('sha256').update(value).digest('hex'),canonical=value=>JSON.stringify(value,function(_key,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v;});
const require=(value,message)=>{if(!value)throw Error(message);};
const identity=bytes=>({bytes:bytes.length,sha256:sha(bytes)});
function pin(spec){require(Number.isSafeInteger(spec?.bytes)&&spec.bytes>0&&/^[0-9a-f]{64}$/.test(spec.sha256),'Invalid proof file identity');return{bytes:spec.bytes,sha256:spec.sha256};}
function relative(name){require(typeof name==='string'&&!path.isAbsolute(name)&&!name.includes('\\')&&!name.split('/').some(part=>!part||part==='..'),'Portable relative source path required');return name;}
function sameFiles(actual,expected,label){for(const name of NAMES)assert.deepEqual(pin(actual?.[name]),pin(expected?.[name]),label+': '+name);}

export function validateFastEvaluatorQualification({direct,build,smallParity,nativeCorpus,pins,proofIdentities}){
 require(build?.status==='compiled-experimental-unqualified'&&typeof build.compiler==='string','Completed experimental build required');
 sameFiles(build.files,smallParity?.buildFiles,'Small parity build');sameFiles(build.files,nativeCorpus?.artifactFiles,'Native corpus build');sameFiles(build.files,direct?.experimental?.files,'Direct model build');
 require(smallParity.status==='passed-small-corpus-bit-parity'&&smallParity.controlBitIdenticalToVendor===true&&smallParity.cases>0,'Small vendor/control parity required');
 const variant=smallParity.variants?.find(value=>value.name===VARIANT);
 require(variant?.descriptorLayout==='HWC-uint16'&&variant.bitIdenticalToVendor===true&&variant.bitIdenticalToSameCompilerControl===true,'Exact HWC small parity required');
 assert.deepEqual(build.oracle,pins?.builds?.['evaluator-tiled']?.files,'Original evaluator artifact pins changed');
 assert.deepEqual(build.originalSources,pins.builds['evaluator-tiled'].sources,'Original evaluator source pins changed');
 assert.deepEqual(smallParity.oracle,pins.builds['evaluator-tiled'],'Small parity oracle changed');
 require(nativeCorpus.variant===VARIANT&&['passed-existing-native-corpora','passed-available-native-corpora'].includes(nativeCorpus.status)&&nativeCorpus.softmax?.status==='passed'&&nativeCorpus.evaluatorCases>0,'Passed existing native corpus and softmax proof required');
 require(Array.isArray(nativeCorpus.missing)&&Array.isArray(nativeCorpus.records)&&nativeCorpus.records.length===nativeCorpus.evaluatorCases&&nativeCorpus.records.every(row=>row.x?.differentBits===0&&row.y?.differentBits===0),'Incomplete native numerical proof');
 require(nativeCorpus.coverageComplete===(nativeCorpus.missing.length===0)&&((nativeCorpus.status==='passed-available-native-corpora')===(nativeCorpus.missing.length>0)),'Native missing coverage must be explicit');
 require(direct.schema===2&&direct.status==='passed-exact-parity'&&direct.experimental.layout==='HWC-uint16'&&direct.experimental.status==='passed-small-corpus-bit-parity','Passed direct HWC model report required');
 const config=direct.configuration;
 require(config?.startupOnly===false&&Number.isInteger(config.repetitions)&&config.repetitions>=2&&config.repetitions%2===0&&config.temperatures?.includes('cold-context-new-model')&&config.temperatures.includes('warm-retained-model'),'Balanced cold and retained-warm full inference required');
 for(const [key,allowed]of [['backends',['cpu','webgpu']],['profiles',['aggressive','maximum']],['temperatures',['cold-context-new-model','warm-retained-model','warm-http-wasm-new-model']]])require(Array.isArray(config[key])&&config[key].length>0&&new Set(config[key]).size===config[key].length&&config[key].every(value=>allowed.includes(value)),'Invalid direct '+key);
 require(Array.isArray(config.budgets)&&config.budgets.length>0&&new Set(config.budgets).size===config.budgets.length&&config.budgets.every(value=>Number.isSafeInteger(value)&&value>0),'Explicit direct budget matrix required');
 require(Array.isArray(direct.jobs)&&direct.jobs.length>0&&new Set(direct.jobs.map(job=>job.id)).size===direct.jobs.length&&direct.jobs.every(job=>/^[\w-]+$/.test(job.id)&&job.expectedInferences===1),'Explicit unique direct inference jobs required');
 require(direct.model?.sha256==='8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b'&&/^[0-9a-f]{40}$/.test(direct.reference),'Pinned current-engine model/reference identity required');
 const expected=new Set();for(const job of direct.jobs)for(const backend of config.backends)for(const profile of config.profiles)for(const budget of config.budgets)for(const temperature of config.temperatures)for(let repetition=0;repetition<config.repetitions;repetition++)for(const variant of ['reference','candidate'])expected.add(canonical([variant,job.id,backend,profile,budget,temperature,repetition]));
 require(Array.isArray(direct.rows)&&direct.rows.length===expected.size&&direct.rows.length>=8,'Complete balanced direct matrix required');
 for(const row of direct.rows){
  const key=canonical([row.variant,row.job,row.backend,row.profile,row.budgetBytes,row.temperature,row.repetition]);require(expected.delete(key),'Missing, duplicate or unexpected direct run');
  require(row.status==='passed'&&row.inferences===1&&row.rawCacheHits===0&&Number.isFinite(row.sourceThroughRunMs)&&row.sourceThroughRunMs>0,'A direct row did not recompute its complete inference');
  require(Array.isArray(row.raw)&&row.raw.length===3&&['union','target','source'].every((plane,index)=>row.raw[index]?.plane===plane&&row.raw[index].dtype==='<f4'&&canonical(row.raw[index].shape)==='[448,448]'&&/^[0-9a-f]{64}$/.test(row.raw[index].sha256))&&row.decision&&typeof row.decision==='object','All three raw plane hashes and decisions required');
  const job=direct.jobs.find(value=>value.id===row.job);assert.deepEqual(row.sourceIdentity,job.source,'Direct source changed');require(row.modelIdentity?.sha256===direct.model.sha256,'Direct model changed');
 }
 const summaries=summarize(direct.rows),workload=summarizeWorkload(direct.rows);
 require(summaries.length>0&&summaries.every(row=>row.exact&&row.globalGainQualified)&&workload.length>0&&workload.every(row=>row.exact&&row.globalGainQualified),'Every direct case and workload must show exact parity and qualified global gain');
 assert.deepEqual(direct.summary,summaries,'Stored direct summary differs from its raw runs');assert.deepEqual(direct.workloadSummary,workload,'Stored workload summary differs from its raw runs');
 const snapshot=direct.runtimeSnapshots?.candidate;require(snapshot&&Object.keys(snapshot).length>0,'Runtime candidate snapshot missing');for(const [name,spec]of Object.entries(snapshot)){relative(name);require(/^(src|experiments|vendor)\//.test(name),'Runtime snapshot scope differs');pin(spec);}
 const sourcePins={original:build.originalSources,candidate:Object.fromEntries([VARIANT+'.cpp',VARIANT+'-tiled.cpp'].map(name=>{require(/^[0-9a-f]{64}$/.test(build.candidateSources?.[name]),'Candidate source pin required');return[name,build.candidateSources[name]];}))};
 const record={schema:1,status:'qualified-exact-direct-model',descriptorLayout:'HWC-uint16',buildScript:'scripts/build-d2prl-evaluator-original-cache.mjs',stageScript:'scripts/stage-d2prl-evaluator-fast.mjs',compiler:build.compiler,sources:sourcePins,files:Object.fromEntries(NAMES.map(name=>[name,pin(build.files[name])])),qualification:{
  directModel:{...pin(proofIdentities.direct),status:direct.status,reference:direct.reference,modelSha256:direct.model.sha256,runs:direct.rows.length,repetitions:config.repetitions,temperatures:config.temperatures,jobs:direct.jobs.map(job=>({id:job.id,source:job.source})),summary:summaries.map(row=>({case:row.case,pairs:row.pairs,exact:row.exact,globalGainQualified:row.globalGainQualified,pairedMedianGainPercent:row.pairedGainPercent.median}))},
  smallParity:{...pin(proofIdentities.smallParity),status:smallParity.status,cases:smallParity.cases,totalElements:smallParity.totalElements},
  nativeCorpus:{...pin(proofIdentities.nativeCorpus),status:nativeCorpus.status,coverageComplete:nativeCorpus.coverageComplete,evaluatorCases:nativeCorpus.evaluatorCases,evaluatorElements:nativeCorpus.evaluatorElements,softmaxStatus:nativeCorpus.softmax.status,missing:nativeCorpus.missing.map(row=>({reference:relative(row.reference),name:relative(row.name),side:row.side,files:row.files.map(relative)}))},
  runtimeCandidate:{files:Object.keys(snapshot).length,sha256:sha(canonical(snapshot))},scope:'Exact current-engine three-raw/decision parity and paired global gain for the recorded jobs, profiles, backends, budgets and cold/warm cases; native corpus omissions remain explicit. No universal detector-accuracy or physical-RAM claim.'}};
 require(!JSON.stringify(record).includes('/Users/'),'Private path in portable evaluator metadata');return record;
}

async function readProof(file){const bytes=await readFile(file);return{value:JSON.parse(bytes),identity:identity(bytes)};}
async function filePin(file){const info=await lstat(file);require(info.isFile()&&!info.isSymbolicLink(),'Regular runtime file required');const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return{bytes:info.size,sha256:hash.digest('hex')};}

async function main(argv){
 const flags=new Map();for(const arg of argv){const at=arg.indexOf('=');require(arg.startsWith('--'),'Named options required');const key=at<0?arg.slice(2):arg.slice(2,at);require(!flags.has(key),'Duplicate option');flags.set(key,at<0?true:arg.slice(at+1));}
 require([...flags.keys()].every(key=>['help','qualification','stage'].includes(key)),'Unknown staging option');
 if(flags.has('help')){console.log('node scripts/stage-d2prl-evaluator-fast.mjs --qualification=/existing/direct/report.json [--stage]\nDefault validates only. --stage writes the two local vendor artifacts and merges their portable PINNED entry; no runtime activation, serving, model/corpus copy or deployment.');return;}
 require(!flags.has('stage')||flags.get('stage')===true,'--stage is a bare flag');require(typeof flags.get('qualification')==='string'&&path.isAbsolute(flags.get('qualification')),'Existing absolute --qualification JSON required');
 const base=path.join(ROOT,'.build/evaluator-cache-original'),vendor=path.join(ROOT,'vendor/d2prl'),pinFile=path.join(vendor,'PINNED.json');
 const [direct,build,smallParity,nativeCorpus,pins]=await Promise.all([readProof(flags.get('qualification')),readProof(path.join(base,'build.json')),readProof(path.join(base,'parity.json')),readProof(path.join(base,VARIANT+'-native-corpus-proof.json')),readProof(pinFile)]);
 const record=validateFastEvaluatorQualification({direct:direct.value,build:build.value,smallParity:smallParity.value,nativeCorpus:nativeCorpus.value,pins:pins.value,proofIdentities:{direct:direct.identity,smallParity:smallParity.identity,nativeCorpus:nativeCorpus.identity}});
 require(Object.keys(direct.value.runtimeSnapshots?.candidate??{}).length>0,'Runtime candidate snapshot missing');
 for(const [name,spec]of Object.entries(direct.value.runtimeSnapshots.candidate)){relative(name);require(/^(src|experiments|vendor)\//.test(name),'Runtime snapshot scope differs');assert.deepEqual(await filePin(path.join(ROOT,name)),pin(spec),'Current runtime differs from direct qualification: '+name);}
 for(const [name,spec]of Object.entries(pins.value.builds['evaluator-tiled'].files))assert.deepEqual(await filePin(path.join(vendor,relative(name))),pin(spec),'Original vendor evaluator differs');
 const artifacts=[];for(const name of NAMES){const bytes=await readFile(path.join(base,name));assert.deepEqual(identity(bytes),record.files[name],'Compiled artifact differs');require(!bytes.includes(Buffer.from('/Users/')),'Private path in compiled artifact');artifacts.push({name,bytes});}
 if(!flags.has('stage')){console.log(JSON.stringify({status:'validated-only',buildKey:BUILD_KEY,files:record.files,qualifiedRuns:record.qualification.directModel.runs,changedFiles:0}));return;}
 assert.deepEqual(await filePin(pinFile),pins.identity,'Vendor pins changed during qualification validation');
 const merged={...pins.value,builds:{...pins.value.builds,[BUILD_KEY]:record},files:{...pins.value.files,...record.files}},writes=[...artifacts,{name:'PINNED.json',bytes:Buffer.from(JSON.stringify(merged,null,2)+'\n')}],previous=[];
 try{for(const item of writes){const target=path.join(vendor,item.name);try{previous.push({target,bytes:await readFile(target)});}catch(error){if(error.code!=='ENOENT')throw error;previous.push({target,bytes:null});}await writeFile(target+'.staging',item.bytes);}
  for(const item of writes)await rename(path.join(vendor,item.name)+'.staging',path.join(vendor,item.name));
 }catch(error){for(const item of previous){if(item.bytes)await writeFile(item.target,item.bytes);else await unlink(item.target).catch(cause=>{if(cause.code!=='ENOENT')throw cause;});}throw error;}
 finally{for(const item of writes)await unlink(path.join(vendor,item.name)+'.staging').catch(error=>{if(error.code!=='ENOENT')throw error;});}
 console.log(JSON.stringify({status:'staged-local-qualified',buildKey:BUILD_KEY,files:record.files,changedFiles:3,runtimeSelectionChanged:false}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
