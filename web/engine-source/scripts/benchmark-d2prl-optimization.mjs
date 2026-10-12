// Development-only A/B recipe. Never imported by the product; all heavy work
// requires --idle-confirmed. Existing Git blobs, models and corpus are read-only.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const exec=promisify(execFile), ROOT=fileURLToPath(new URL('../',import.meta.url));
const REFERENCE='eb0cc7518c58b98a905abe031f7a3228d0a2d3df', PREFIX='web/engine-source/';
const TEMPERATURES=['cold-context-new-model','warm-retained-model','warm-http-wasm-new-model'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
const relative=value=>{if(typeof value!=='string'||value.startsWith('/')||value.split('/').some(p=>!p||p==='..'))throw Error('Relative path required');return value;};
const runtimeFile=name=>/^(src\/|experiments\/|vendor\/)/.test(name)&&/\.(?:js|mjs|wasm|json)$/.test(name);
const canonical=value=>JSON.stringify(value,function(_key,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v;});

const HELP=`Direct D2PRL engine A/B qualification (heavy work requires --idle-confirmed)

node scripts/benchmark-d2prl-optimization.mjs --idle-confirmed \  --reference-repo=/existing/github-web-public --corpus-root=/existing/web-engine/.build \  --asset-manifest=/existing/web-assets/manifest-template.json --asset-chunks=/existing/web-assets/chunks \  --playwright-module=/absolute/existing/playwright/index.mjs --backends=webgpu \  --budgets-mib=8192 --profiles=maximum --repetitions=2

Required: --reference-repo, --corpus-root, and --model-root OR both
--asset-manifest/--asset-chunks. The logical pinned assets stream from existing
ordered chunks; model/source payloads are never copied to a new depot.
Optional: --candidate-root=ENGINE_ROOT, --git=EXISTING_EXECUTABLE,
--reference-runtime-root=EXISTING_ENGINE_ROOT freezes an existing current-engine
source baseline instead of historical Git code; its snapshot SHA is explicit.
--roles-memory-mib=256 selects the candidate's separate pinned D2 role factory
(default512; shared factories unchanged), requiring its prepared modules,
--playwright-module=ABSOLUTE_EXISTING_MODULE_ENTRY (default bare playwright),
--model-assets-root=EXISTING_ASSETS, --jobs=EXISTING_RGB_JOBS_JSON,
--backends=cpu,webgpu --budgets-mib=3072 --profiles=aggressive --repetitions=4,
--temperatures=cold-context-new-model,warm-retained-model,
--output-dir=IGNORED_OR_EXTERNAL_DIR, --input-mode=rgb|rows (default rgb).
--evaluator-variant=pixel-major-combined (or --evaluator-module=ABSOLUTE_JS) and
--descriptor-layout=CHW-uint16|HWC-uint16 optionally override the CANDIDATE
kernel only. Its sibling parity.json must qualify exactly these JS/WASM hashes.
HWC additionally requires the candidate model/pool/worker layout contract.
--startup-only --idle-confirmed initializes/disposes both real model Workers
without inference, for infrastructure smoke checks; it does not qualify numbers.
--resource-parity-only --repetitions=1 runs one cold and retained-warm A/B pair
for exact raw/decision and resource-cleanup checks. It never qualifies speed;
ordinary timing still requires at least two balanced repetitions.
--validate-only is read-only: no server/browser/inference. --help reads nothing.

Default: existing pinned d2prl-source/png-rgb.bin [389,521,3]. Each native run
performs preparation448 + descriptors + PatchMatch40 + three raw heads. The
Budget, runtime and createD2prlModel run inside a dedicated real module Worker.
No source decoder, general engine adapter, batch chain or scientific raw cache
is involved. Jobs schema1: {jobs:[{id:'case',source:{file:'relative/rgb.bin',
bytes:608007,sha256:'64 hex',shape:[389,521,3]},nativeRaw:[{file:'relative/raw.bin',
bytes:802816,sha256:'64 hex',shape:[1,1,448,448]}]}]} (valid JSON double quotes).
A/B requires exact hashes of ALL three raw planes and exact decision metadata.
Existing Torch oracles are diagnostic max-absolute/sign comparisons; their
role residuals need not be bit-identical to the current browser engine.
Projection, minima/refilter, NPZ and other engine functions have separate
integration tests and are outside this focused inference timing.

Cold means fresh browser context + Worker + model, NOT cold OS/file caches.
Retained warm uses the SAME model and immutable RGB and repeats real inference.
Optional warm-http-wasm-new-model disposes that model then starts a fresh Worker
in the same context: HTTP/WASM warm, model/parameter cache fresh. Retained warm
requires cold in the temperature list. A/B order alternates by repetition.
The idle flag is an operator assertion; no other process is probed or changed.
Scheduler leases and backing registrations do not measure physical occupancy.
`;

export function dispersion(values){
 const v=values.filter(Number.isFinite).sort((a,b)=>a-b), q=p=>{if(!v.length)return null;const i=(v.length-1)*p,l=Math.floor(i),u=Math.ceil(i);return v[l]+(v[u]-v[l])*(i-l);};
 return{n:v.length,mean:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,median:q(.5),q25:q(.25),q75:q(.75),iqr:v.length?q(.75)-q(.25):null,min:v[0]??null,max:v.at(-1)??null};
}
export function settings(argv){
 const flags=new Map();for(const arg of argv){if(!arg.startsWith('--'))throw Error('Unknown argument '+arg);const at=arg.indexOf('=');flags.set(at<0?arg.slice(2):arg.slice(2,at),at<0?true:arg.slice(at+1));}
 const allowed=['help','idle-confirmed','validate-only','startup-only','resource-parity-only','reference-repo','reference-runtime-root','candidate-root','roles-memory-mib','git','playwright-module','jobs','model-root','model-assets-root','asset-manifest','asset-chunks','corpus-root','backends','budgets-mib','profiles','repetitions','output-dir','temperatures','input-mode','evaluator-module','evaluator-variant','descriptor-layout','kernel-parity'];for(const key of flags.keys())if(!allowed.includes(key))throw Error('Unknown option --'+key);
 for(const key of ['help','idle-confirmed','validate-only','startup-only','resource-parity-only'])if(flags.has(key)&&flags.get(key)!==true)throw Error('--'+key+' is a bare boolean flag, without =value');
 if(flags.has('help'))return{help:true};
 if(!flags.has('idle-confirmed')&&!flags.has('validate-only'))throw Error('Heavy work requires --idle-confirmed after the live lot has ended. Use --validate-only for read-only preparation.');
 for(const name of ['reference-repo','corpus-root'])if(typeof flags.get(name)!=='string')throw Error('Missing --'+name);
 if(flags.has('asset-manifest')){if(typeof flags.get('asset-manifest')!=='string'||typeof flags.get('asset-chunks')!=='string')throw Error('Both --asset-manifest and --asset-chunks are required');}
 else if(typeof flags.get('model-root')!=='string')throw Error('Missing --model-root or chunk manifest route');
 if(flags.has('playwright-module')&&(typeof flags.get('playwright-module')!=='string'||!path.isAbsolute(flags.get('playwright-module'))))throw Error('--playwright-module must name an absolute existing module entry file');
 const list=(name,fallback)=>String(flags.get(name)??fallback).split(','), integer=(value,name)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Error('Positive integer required for '+name);return n;};
 const resourceParityOnly=flags.has('resource-parity-only');
 const backends=list('backends','cpu,webgpu'),profiles=list('profiles','aggressive'),budgets=list('budgets-mib','3072').map(v=>integer(v,'budgets-mib')*1024**2),repetitions=integer(flags.get('repetitions')??(resourceParityOnly?1:4),'repetitions');
 if(backends.some(b=>!['cpu','webgpu'].includes(b))||profiles.some(p=>!['aggressive','maximum'].includes(p)))throw Error('Unsupported backend/profile');
 if(resourceParityOnly&&(repetitions!==1||flags.has('startup-only')))throw Error('Resource parity requires one repetition of real inference, not a startup smoke run.');
 if(!resourceParityOnly&&(repetitions<2||repetitions%2)&&!flags.has('validate-only')&&!flags.has('startup-only'))throw Error('An even number of at least two repetitions is required to balance A/B order; four or more recommended.');
 const temperatures=list('temperatures','cold-context-new-model,warm-retained-model');if(temperatures.some(t=>!TEMPERATURES.includes(t))||new Set(temperatures).size!==temperatures.length||!temperatures.length)throw Error('Invalid temperatures');if(temperatures.includes('warm-retained-model')&&!temperatures.includes('cold-context-new-model'))throw Error('Retained warm requires a preceding cold run');const inputMode=String(flags.get('input-mode')??'rgb');if(!['rgb','rows'].includes(inputMode))throw Error('Invalid input mode');const evaluatorVariant=flags.get('evaluator-variant');if(evaluatorVariant!==undefined&&!['cache-original','rotation-bases','combined','pixel-major-combined'].includes(evaluatorVariant))throw Error('Unknown experimental evaluator variant');if(evaluatorVariant!==undefined&&flags.has('evaluator-module'))throw Error('Choose evaluator-module OR evaluator-variant');const descriptorLayout=String(flags.get('descriptor-layout')??(evaluatorVariant==='pixel-major-combined'?'HWC-uint16':'CHW-uint16'));if(!['CHW-uint16','HWC-uint16'].includes(descriptorLayout))throw Error('Invalid descriptor layout');if(descriptorLayout==='HWC-uint16'&&!flags.has('evaluator-module')&&evaluatorVariant===undefined)throw Error('HWC requires an explicitly qualified experimental kernel');
 if(resourceParityOnly&&(temperatures.length!==2||!temperatures.includes('cold-context-new-model')||!temperatures.includes('warm-retained-model')))throw Error('Resource parity requires exactly cold and retained-model warm, one pair each.');
 const rolesMemoryMiB=Number(flags.get('roles-memory-mib')??512);if(![256,512].includes(rolesMemoryMiB))throw Error('Only pinned D2 role memory ceilings256/512MiB supported');
 const outputDir=path.resolve(String(flags.get('output-dir')??path.join(ROOT,'.build/d2prl-optimization')));
 if(inside(ROOT,outputDir)&&!inside(path.join(ROOT,'.build'),outputDir))throw Error('Scientific outputs must stay outside tracked engine files; use an external directory or ignored .build.');
 for(const name of ['reference-repo','model-root','corpus-root','model-assets-root','asset-chunks'])if(flags.has(name)&&inside(path.resolve(String(flags.get(name))),outputDir))throw Error('Output cannot be inside read-only --'+name);
 return{referenceRuntimeRoot:flags.has('reference-runtime-root')?path.resolve(String(flags.get('reference-runtime-root'))):null,rolesMemoryMiB,resourceParityOnly,referenceRepo:path.resolve(String(flags.get('reference-repo'))),candidateRoot:path.resolve(String(flags.get('candidate-root')??ROOT)),modelRoot:flags.has('model-root')?path.resolve(String(flags.get('model-root'))):null,modelAssetsRoot:flags.has('model-root')?path.resolve(String(flags.get('model-assets-root')??path.join(String(flags.get('model-root')),'assets'))):null,assetManifest:flags.has('asset-manifest')?path.resolve(String(flags.get('asset-manifest'))):null,assetChunks:flags.has('asset-chunks')?path.resolve(String(flags.get('asset-chunks'))):null,corpusRoot:path.resolve(String(flags.get('corpus-root'))),jobs:flags.get('jobs'),git:String(flags.get('git')??'git'),playwrightModule:flags.has('playwright-module')?flags.get('playwright-module'):null,backends,profiles,budgets,repetitions,outputDir,temperatures,inputMode,descriptorLayout,evaluatorModule:evaluatorVariant!==undefined?path.join(ROOT,'.build/evaluator-cache-original',evaluatorVariant+'.js'):flags.has('evaluator-module')?path.resolve(String(flags.get('evaluator-module'))):null,kernelParity:flags.has('kernel-parity')?path.resolve(String(flags.get('kernel-parity'))):null,validateOnly:flags.has('validate-only'),startupOnly:flags.has('startup-only'),idleConfirmed:flags.has('idle-confirmed')};
}
async function git(config,...args){return(await exec(config.git,['-C',config.referenceRepo,...args],{encoding:'buffer',maxBuffer:128*1024**2})).stdout;}
async function fileIdentity(file){const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){bytes+=chunk.length;h.update(chunk);}return{bytes,sha256:h.digest('hex')};}

async function jobs(config){
 if(config.jobs){const input=await json(path.resolve(String(config.jobs)));if(input.schema!==1||!Array.isArray(input.jobs)||!input.jobs.length)throw Error('Invalid RGB jobs manifest');return input.jobs;}
 const source=await json(path.join(config.corpusRoot,'d2prl-source/reference.json')),native=await json(path.join(config.corpusRoot,'d2prl-model/reference.json'));
 return[{id:'pinned-positive-rgb',source:{...source.records[0].pixels,file:'d2prl-source/'+source.records[0].pixels.file},nativeRaw:native.raw.map(v=>({...v,file:'d2prl-model/'+v.file}))}];
}
async function prepare(config){
 const commit=(await git(config,'rev-parse',REFERENCE+'^{commit}')).toString().trim();if(commit!==REFERENCE)throw Error('Reference commit identity differs');
 let identity={schema:1,file:'model.json',bytes:1173784,sha256:'8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b'},manifestBytes,catalog,catalogSha256;
 const modelRoutes=new Map(),chunkFiles=new Map();
 if(config.assetManifest){const catalogBytes=await readFile(config.assetManifest);catalogSha256=hash(catalogBytes);catalog=JSON.parse(catalogBytes);if(catalog.schema!=='sherloq.dependencies/1'||!catalog.files||!catalog.chunks)throw Error('Dependency file/chunk table required');
  const meta=catalog.files['unified-assets/d2prl/model.json'];if(meta?.sha256!==identity.sha256||meta.size!==identity.bytes||!Array.isArray(meta.chunks))throw Error('Chunked model manifest pin differs');
  // Only the small JSON configuration is assembled here. Weight payloads are
  // never preloaded, hashed globally, copied or reconstructed into a new file.
  const buffers=[];for(const sha of meta.chunks){if(!/^[0-9a-f]{64}$/.test(sha))throw Error('Invalid model configuration chunk');const value=await readFile(path.join(config.assetChunks,sha+'.bin'));if(value.length!==catalog.chunks[sha])throw Error('Model configuration chunk size');buffers.push(value);}manifestBytes=Buffer.concat(buffers);
 }else{try{identity=await json(path.join(config.modelRoot,'identity.json'));}catch(error){if(error.code!=='ENOENT')throw error;}manifestBytes=await readFile(path.join(config.modelRoot,identity.file??'model.json'));}
 if(identity.sha256!=='8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b'||manifestBytes.length!==identity.bytes||hash(manifestBytes)!==identity.sha256)throw Error('Pinned model manifest identity differs');
 const manifest=JSON.parse(manifestBytes);if(manifest.side!==448||manifest.iterations!==40||manifest.referenceThreads!==8||manifest.seed!==22||manifest.checkpointSha256!=='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36')throw Error('Native scientific contract differs');
 identity={...identity,modelId:manifest.modelId,assets:Object.keys(manifest.assets).length,assetBytes:Object.values(manifest.assets).reduce((n,s)=>n+s.bytes,0)};
 for(const[file,spec]of [['model.json',{bytes:identity.bytes,sha256:identity.sha256}],...Object.entries(manifest.assets)]){
  if(file!=='model.json'&&!/^assets\/[0-9a-f]{64}\.bin$/.test(file))throw Error('Pinned asset path differs');
  if(catalog){const meta=catalog.files['unified-assets/d2prl/'+file];if(!meta||meta.size!==spec.bytes||meta.sha256!==spec.sha256||!Array.isArray(meta.chunks))throw Error('Logical model file pin differs: '+file);let total=0;const pieces=[];for(const sha of meta.chunks){if(!/^[0-9a-f]{64}$/.test(sha)||!Number.isSafeInteger(catalog.chunks[sha]))throw Error('Invalid model chunk table');const chunk=path.join(config.assetChunks,sha+'.bin');if(!chunkFiles.has(chunk)){const found=await stat(chunk);if(!found.isFile()||found.size!==catalog.chunks[sha])throw Error('Missing/wrong-size model chunk '+sha);chunkFiles.set(chunk,found.size);}total+=chunkFiles.get(chunk);pieces.push(chunk);}if(total!==spec.bytes)throw Error('Logical model chunk lengths differ');modelRoutes.set(file,pieces);
  }else{const dataFile=file==='model.json'?path.join(config.modelRoot,identity.file??file):path.join(config.modelAssetsRoot,path.basename(file)),data=await stat(dataFile);if(!data.isFile()||data.size!==spec.bytes)throw Error('Missing/wrong-size model asset '+file);modelRoutes.set(file,[dataFile]);}
 }
 const cases=await jobs(config),ids=new Set();for(const job of cases){
  if(!/^[\w-]+$/.test(job.id)||ids.has(job.id))throw Error('Unique safe job id required');ids.add(job.id);
  const shape=job.source?.shape;if(!Array.isArray(shape)||shape.length!==3||shape[2]!==3||shape.some(n=>!Number.isSafeInteger(n)||n<1)||job.source.bytes!==shape.reduce((a,b)=>a*b,1))throw Error('Explicit tightly packed RGB8 [height,width,3] required for '+job.id);
  const actual=await fileIdentity(path.resolve(config.corpusRoot,relative(job.source.file)));if(actual.bytes!==job.source.bytes||actual.sha256!==job.source.sha256)throw Error('RGB source identity differs for '+job.id);
  if(job.regions||job.exclusions)throw Error('Direct inference jobs accept RGB crops as independent sources, not adapter regions/exclusions');
  for(const spec of job.nativeRaw??[]){const actual=await fileIdentity(path.resolve(config.corpusRoot,relative(spec.file)));if(spec.bytes!==802816||actual.bytes!==spec.bytes||actual.sha256!==spec.sha256)throw Error('Native raw oracle identity differs');}
  if(job.nativeRaw&&job.nativeRaw.length!==3)throw Error('All three native raw planes required');
  job.expectedInferences=1;
 }
 let experimental=null;if(config.evaluatorModule){
  const name=path.basename(config.evaluatorModule),wasm=name.replace(/\.m?js$/,'.wasm');if(!/\.m?js$/.test(name))throw Error('Experimental evaluator must be a JS module');
  const proof=await json(config.kernelParity??path.join(path.dirname(config.evaluatorModule),'parity.json')),variant=proof.variants?.find(v=>v.name===name.replace(/\.m?js$/,''));
  if(proof.status!=='passed-small-corpus-bit-parity'||!variant?.bitIdenticalToVendor||!variant?.bitIdenticalToSameCompilerControl||variant.descriptorLayout!==config.descriptorLayout)throw Error('Small bit-parity proof/layout missing for selected experimental evaluator');
  const files=new Map();for(const file of [name,wasm]){const data=await readFile(path.join(path.dirname(config.evaluatorModule),file)),spec=proof.buildFiles?.[file];if(!spec||spec.bytes!==data.length||spec.sha256!==hash(data))throw Error('Experimental artifact differs from parity proof: '+file);files.set(file,data);}
  experimental={name,files,proof:{status:proof.status,cases:proof.cases,totalElements:proof.totalElements,compiler:proof.compiler,layout:variant.descriptorLayout,files:Object.fromEntries([...files].map(([k,v])=>[k,{bytes:v.length,sha256:hash(v)}]))}};
 }
 return{commit,identity,manifest,cases,modelRoutes,catalogSha256,chunkFiles:chunkFiles.size,experimental};
}

// Read immutable Git blobs in one process; no checkout/archive/corpus copies.
class BlobReader{
 constructor(config){this.queue=[];this.buffer=Buffer.alloc(0);this.header=null;this.child=spawn(config.git,['-C',config.referenceRepo,'cat-file','--batch'],{stdio:['pipe','pipe','pipe']});this.child.stdout.on('data',chunk=>{this.buffer=Buffer.concat([this.buffer,chunk]);this.consume();});this.child.on('error',error=>this.fail(error));this.child.on('exit',code=>{if(this.queue.length)this.fail(Error('Git blob reader exited '+code));});this.child.stderr.on('data',()=>{});}
 fail(error){for(const entry of this.queue.splice(0))entry.reject(error);}
 consume(){while(this.queue.length){if(!this.header){const at=this.buffer.indexOf(10);if(at<0)return;const line=this.buffer.subarray(0,at).toString();this.buffer=this.buffer.subarray(at+1);const m=/^[0-9a-f]+ blob (\d+)$/.exec(line);if(!m){this.queue.shift().reject(Error('Git blob response '+line));continue;}this.header={bytes:Number(m[1])};}if(this.buffer.length<this.header.bytes+1)return;const value=Buffer.from(this.buffer.subarray(0,this.header.bytes));this.buffer=this.buffer.subarray(this.header.bytes+1);this.header=null;this.queue.shift().resolve(value);}}
 read(oid){return new Promise((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin.write(oid+'\n');});}
 close(){this.child.stdin.end();}
}
async function snapshots(config){
 const listing=(await git(config,'ls-tree','-rz',REFERENCE,PREFIX)).toString(),tree=new Map();for(const entry of listing.split('\0').filter(Boolean)){const[meta,file]=entry.split('\t'),[mode,type,oid]=meta.split(' ');if(type==='blob'&&file.startsWith(PREFIX)&&runtimeFile(file.slice(PREFIX.length)))tree.set(file.slice(PREFIX.length),{mode,oid});}
 const reader=new BlobReader(config),reference=new Map(),candidate=new Map();try{for(const[name,row]of tree){if(row.mode==='120000')continue;reference.set(name,await reader.read(row.oid));}}finally{reader.close();}
 async function readRuntime(directory,target){const repository=path.resolve(directory,'../..'),prefix=path.relative(repository,directory).split(path.sep).join('/')+'/';
 const files=(await exec(config.git,['-C',repository,'ls-files','-z','--cached','--others','--exclude-standard','--',prefix+'src',prefix+'experiments',prefix+'vendor'],{encoding:'buffer',maxBuffer:16*1024**2})).stdout.toString().split('\0').filter(Boolean);
 for(const file of new Set(files)){const name=file.slice(prefix.length);if(runtimeFile(name))target.set(name,await readFile(path.join(directory,name)));}}
 await readRuntime(config.candidateRoot,candidate);if(config.referenceRuntimeRoot){reference.clear();await readRuntime(config.referenceRuntimeRoot,reference);}
 for(const variant of [reference,candidate])for(const name of ['src/cache.js','src/d2prl-runtime.js','experiments/d2prl/model.js','vendor/d2prl/evaluator-tiled.wasm'])if(!variant.has(name))throw Error('Runtime snapshot missing '+name);
 const identities=map=>Object.fromEntries([...map].map(([name,value])=>[name,{bytes:value.length,sha256:hash(value)}]));
 return{reference,candidate,identities:{reference:identities(reference),candidate:identities(candidate)},meaning:'Both runtime code/binary snapshots are read into memory before browser timings, eliminating Git retrieval versus filesystem read bias. No model or corpus is copied or snapshotted.'};
}

function csv(rows){const keys=['variant','job','backend','profile','budgetBytes','repetition','temperature','status','runMs','sourceThroughRunMs','inferences','peakPolicyBytes','observedWasmBytes','observedArrayBufferBytes','observedGpuBytes','workersCreated','patchmatchWorkersCreated','patchmatchPeakWorkers','patchmatchMessages','patchmatchKernelTiles','schedulerPeakCpu','schedulerPeakGpu','spillBytes'];const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return[keys.join(','),...rows.map(row=>keys.map(k=>quote(row[k])).join(','))].join('\n')+'\n';}
function scientific(row){return{raw:row.raw,decision:row.decision,model:row.modelIdentity,source:row.sourceIdentity};}
export function summarize(rows){
 const groups=new Map();for(const row of rows){const key=JSON.stringify([row.job,row.backend,row.profile,row.budgetBytes,row.temperature]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return[...groups].map(([key,group])=>{const reference=group.filter(r=>r.variant==='reference'),candidate=group.filter(r=>r.variant==='candidate'),pairs=reference.map(a=>({a,b:candidate.find(b=>b.repetition===a.repetition)})),exact=pairs.length>0&&pairs.length===candidate.length&&pairs.every(({a,b})=>b&&a.status==='passed'&&b.status==='passed'&&canonical(scientific(a))===canonical(scientific(b))),gains=exact?pairs.map(({a,b})=>100*(a.sourceThroughRunMs-b.sourceThroughRunMs)/a.sourceThroughRunMs):[],gain=dispersion(gains),fields=['runMs','sourceThroughRunMs','sourceInitMs','modelInitMs'];const stats=variant=>Object.fromEntries(fields.map(k=>[k,dispersion(variant.filter(r=>r.status==='passed').map(r=>r[k]))]));
  return{case:JSON.parse(key),exact,pairs:pairs.length,reference:stats(reference),candidate:stats(candidate),pairedGainPercent:gain,globalGainQualified:exact&&pairs.length>=2&&gain.median>=5,qualification:!exact?'unqualified: failed/missing job or scientific divergence':pairs.length<2?'unqualified: insufficient repetitions':gain.median<5?'exact parity; no demonstrated >=5% median global gain':'exact parity with >=5% paired median source-through-run gain; inspect dispersion',phaseDispersion:Object.fromEntries([...new Set(group.flatMap(r=>Object.keys(r.phaseMs??{})))].map(phase=>[phase,{reference:dispersion(reference.map(r=>r.phaseMs?.[phase])),candidate:dispersion(candidate.map(r=>r.phaseMs?.[phase]))}]))};
 });
}
export function summarizeWorkload(rows){
 const groups=new Map();for(const row of rows){const key=canonical([row.variant,row.backend,row.profile,row.budgetBytes,row.repetition,row.temperature]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const aggregate=[...groups.values()].map(group=>{const ordered=[...group].sort((a,b)=>a.job.localeCompare(b.job)),row=ordered[0],sum=key=>ordered.every(r=>Number.isFinite(r[key]))?ordered.reduce((n,r)=>n+r[key],0):null,phaseMs={};for(const r of ordered)for(const[phase,ms]of Object.entries(r.phaseMs??{}))phaseMs[phase]=(phaseMs[phase]??0)+ms;return{variant:row.variant,job:'ALL_REQUESTED_JOBS',backend:row.backend,profile:row.profile,budgetBytes:row.budgetBytes,repetition:row.repetition,temperature:row.temperature,status:ordered.every(r=>r.status==='passed')?'passed':'failed',runMs:sum('runMs'),sourceThroughRunMs:sum('sourceThroughRunMs'),phaseMs,raw:[],views:[],modelIdentity:{workload:true},sourceIdentity:{jobs:ordered.map(r=>({job:r.job,scientific:scientific(r)}))}};});
 return summarize(aggregate);
}
export function summariesForMode(rows,{resourceParityOnly=false}={}){
 const result={summary:summarize(rows),workloadSummary:summarizeWorkload(rows)};
 if(resourceParityOnly)for(const row of [...result.summary,...result.workloadSummary]){row.globalGainQualified=false;row.qualification='Resource parity only; no speed qualification permitted.';}
 return result;
}
function summaryCsv(summary){
 const columns=['job','backend','profile','budgetBytes','temperature','exact','globalGainQualified','referenceN','referenceMeanMs','referenceMedianMs','referenceIqrMs','referenceMinMs','referenceMaxMs','candidateN','candidateMeanMs','candidateMedianMs','candidateIqrMs','candidateMinMs','candidateMaxMs','pairedGainMeanPercent','pairedGainMedianPercent','pairedGainIqrPercent','pairedGainMinPercent','pairedGainMaxPercent','qualification'];
 const records=summary.map(s=>{const[job,backend,profile,budgetBytes,temperature]=s.case,a=s.reference.sourceThroughRunMs,b=s.candidate.sourceThroughRunMs,g=s.pairedGainPercent;return{job,backend,profile,budgetBytes,temperature,exact:s.exact,globalGainQualified:s.globalGainQualified,referenceN:a.n,referenceMeanMs:a.mean,referenceMedianMs:a.median,referenceIqrMs:a.iqr,referenceMinMs:a.min,referenceMaxMs:a.max,candidateN:b.n,candidateMeanMs:b.mean,candidateMedianMs:b.median,candidateIqrMs:b.iqr,candidateMinMs:b.min,candidateMaxMs:b.max,pairedGainMeanPercent:g.mean,pairedGainMedianPercent:g.median,pairedGainIqrPercent:g.iqr,pairedGainMinPercent:g.min,pairedGainMaxPercent:g.max,qualification:s.qualification};});const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return[columns.join(','),...records.map(r=>columns.map(k=>quote(r[k])).join(','))].join('\n')+'\n';
}

// This function is served as a module Worker, keeping OPFS/IDB access and all
// control checkpoints on the same kind of execution surface as the engine.
function directWorker(){
 let config,budget,scheduler,model,rgb,sourceRelease,sourceBacking,api,initial;
 const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),b=>b.toString(16).padStart(2,'0')).join('');
 const snapshot=()=>({memory:budget.snapshot(),resources:budget.resourceSnapshot?.()??null,execution:scheduler.snapshot()});
 function requireClean(final){
  for(const key of ['activeReservationBytes','retainedBytes','cacheBytes','activeRecoveries'])if(final.memory[key]!==undefined&&final.memory[key]!==0)throw Error('Final memory '+key+' retained');
  for(const[name,domain]of Object.entries(final.resources?.domains??{}))for(const field of ['backings','materializedBytes'])if(domain[field]!==undefined&&domain[field]!==0)throw Error('Final '+name+' '+field+' retained');
  for(const field of ['operations','pressures'])if(final.resources?.[field]?.length)throw Error('Final resource '+field+' retained');
  for(const field of ['running','queued'])if(final.execution[field]!==undefined&&final.execution[field]!==0)throw Error('Final scheduler '+field+' retained');
  if(final.execution.active.cpu||final.execution.active.gpu)throw Error('Final scheduler leases retained');
 }
 async function close(){
  await model?.dispose();model=null;rgb=null;sourceBacking?.();sourceBacking=null;sourceRelease?.();sourceRelease=null;
  const final=snapshot();requireClean(final);scheduler.dispose();return final;
 }
 async function initialize(request){
  config=request;const base='/'+config.variant+'/',began=performance.now();
  const [{Budget},{getExecutionScheduler},{createD2prlModel,readVerifiedModelAsset},{d2prlRuntime},{resolveComputeProfile},{withD2prlActivity}]=await Promise.all([
   import(base+'src/cache.js'),import(base+'src/execution-scheduler.js'),import(base+'experiments/d2prl/model.js'),import(base+'src/d2prl-runtime.js'),import(base+'src/profiles.js'),import(base+'experiments/d2prl/resource-activity.js')]);
  api={createD2prlModel,readVerifiedModelAsset,d2prlRuntime,withD2prlActivity};budget=new Budget(config.budgetBytes);
  const profile=resolveComputeProfile(config.profile),maxWorkers=Math.min(32,profile.maxWorkers);scheduler=getExecutionScheduler(budget,{maxWorkers});
  const importMs=performance.now()-began;let at=performance.now();
  await withD2prlActivity(budget,'benchmark:rgb-source-initialization','io',async()=>{
   sourceRelease=budget.reserve(config.job.source.bytes);rgb=new Uint8Array(config.job.source.bytes);sourceBacking=budget.registerBacking?.('array-buffer',rgb.byteLength,{owner:'benchmark-source',label:'immutable-qualified-rgb'});
   const response=await fetch('/sources/'+config.variant+'/'+config.job.id);if(!response.ok||!response.body)throw Error('RGB source unavailable');
   const reader=response.body.getReader();let offset=0;try{while(true){const{done,value}=await reader.read();if(done)break;if(offset+value.length>rgb.length)throw Error('RGB exceeds pinned size');rgb.set(value,offset);offset+=value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   if(offset!==rgb.length||await digest(rgb)!==config.job.source.sha256)throw Error('RGB identity differs');
  });
  const sourceInitMs=performance.now()-at;at=performance.now();
  const manifestBytes=await withD2prlActivity(budget,'benchmark:model-manifest','io',()=>readVerifiedModelAsset('/models/'+config.variant+'/model.json',config.identity));
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
  const runtime=await withD2prlActivity(budget,'d2prl:runtime-import','io',d2prlRuntime);
  if(config.variant==='candidate'&&config.experimental){runtime.evaluatorUrl=new URL('/experimental/'+config.experimental.name,location.href).href;runtime.evaluatorDescriptorLayout=config.experimental.layout;}
  if(config.variant==='candidate'&&config.rolesMemoryMiB===256){runtime.rolesRuntime={runtimeId:'ort130-wasm-256mib-d2prl',memoryMaximumBytes:256*1024**2};runtime.rolesFactoryUrl=new URL(base+'vendor/d2prl/factory-roles256.mjs',location.href).href;}
  model=await createD2prlModel({budget,model:manifest,assetBaseUrl:new URL('/models/'+config.variant+'/',location.href).href,runtime,backend:config.backend==='webgpu'?'gpu':'cpu',maxWorkers});
  initial={importMs,sourceInitMs,modelInitMs:performance.now()-at,resourceProfile:profile,maxWorkers};return initial;
 }
 async function run(request){
  const row={status:'running',phaseMs:{},reportedPhaseMs:null,milestones:[],sampledBackings:{},sampleCount:0,modelIdentity:{modelId:config.identity.modelId,sha256:config.identity.sha256},sourceIdentity:{sha256:config.job.source.sha256,bytes:config.job.source.bytes,shape:config.job.source.shape},inferences:1,rawCacheHits:0,inputMode:config.inputMode};
  let phase,phaseAt,previousLog=-Infinity,result,timer;const stages=new Set();const started=performance.now();
  const sample=()=>{const state=snapshot();row.sampleCount++;row.sampledPolicyPeak=Math.max(row.sampledPolicyPeak??0,state.memory.peakAccountedBytes??0);for(const[k,v]of Object.entries(state.resources?.domains??{}))row.sampledBackings[k]=Math.max(row.sampledBackings[k]??0,v.materializedBytes??0);row.lastCapabilities=state;};
  sample();timer=setInterval(sample,1000);
  const onProgress=event=>{stages.add(event.phase);const now=performance.now(),next=['preparation','descriptors','patchmatch'].includes(event.phase)?event.phase:(event.phase==='preparation-rows'?'preparation':'heads');
   if(next!==phase){if(phase)row.phaseMs[phase]=(row.phaseMs[phase]??0)+now-phaseAt;phase=next;phaseAt=now;row.milestones.push({phase:event.phase,completed:event.completed,total:event.total,ms:now-started});}
   if(event.phase==='resource-recovery')row.recoveryEvents=(row.recoveryEvents??0)+1;
   if(next!==row.lastLoggedPhase||now-previousLog>=15000){postMessage({kind:'progress',event:{benchmarkProgress:true,...request,variant:config.variant,job:config.job.id,backend:config.backend,phase:event.phase,completed:event.completed,total:event.total,message:event.message,ms:now-started}});previousLog=now;row.lastLoggedPhase=next;}
  };
  try{
   const[height,width]=config.job.source.shape;
   // The row provider returns a borrowed immutable RGB view; preparation owns
   // its temporary lease. No decode/crop transform or copied pixel tensor.
   const input=config.inputMode==='rows'?{width,height,readRows:async(y,count)=>({pixels:{width,height:count,format:'rgb8',data:rgb.subarray(y*width*3,(y+count)*width*3)},release(){}})}:{rgb,width,height};
   result=await model.run(input,{onProgress,verifiedInputIdentity:config.job.source.sha256+':'+width+'x'+height});
   row.runMs=performance.now()-started;if(phase)row.phaseMs[phase]=(row.phaseMs[phase]??0)+performance.now()-phaseAt;
   // Host/CDP timing stops before hashing or native-oracle readback.
   postMessage({kind:'measured',runMs:row.runMs});clearInterval(timer);timer=null;sample();
   if(!['preparation','descriptors','patchmatch'].every(p=>stages.has(p)))throw Error('A native stage was skipped; warm measurement is not full inference');
   if(model.checkpointSnapshot()!==null)throw Error('Completed model retained a scientific checkpoint');
   if(!(result.raw instanceof Float32Array)||result.raw.length!==3*448**2)throw Error('Three native raw planes required');
   const names=['union','target','source'],n=448**2;row.raw=[];row.nativeDiagnostics=[];
   for(let p=0;p<3;p++){
    const values=result.raw.subarray(p*n,(p+1)*n);for(const v of values)if(!Number.isFinite(v))throw Error('Nonfinite raw value');
    row.raw.push({plane:names[p],sha256:await digest(values),dtype:'<f4',shape:[448,448]});
    const spec=config.job.nativeRaw?.[p];if(spec){const response=await fetch('/oracles/'+config.job.id+'/'+p);if(!response.ok)throw Error('Native oracle unavailable');const buffer=await response.arrayBuffer();if(buffer.byteLength!==spec.bytes||await digest(buffer)!==spec.sha256)throw Error('Native oracle identity differs');const native=new Float32Array(buffer),a=new Uint32Array(values.buffer,values.byteOffset,n),b=new Uint32Array(buffer);let differentBits=0,maxAbsolute=0,signChanges=0;for(let i=0;i<n;i++){if(!Number.isFinite(native[i]))throw Error('Nonfinite native oracle');differentBits+=a[i]!==b[i];maxAbsolute=Math.max(maxAbsolute,Math.abs(values[i]-native[i]));signChanges+=(values[i]>0)!==(native[i]>0);}row.nativeDiagnostics.push({plane:names[p],differentBits,maxAbsolute,positiveSignChanges:signChanges,oracleSha256:spec.sha256,meaning:'Torch diagnostic only; exact current-engine A/B is the required gate'});}
   }
   row.decision=structuredClone(result.decision);row.execution=structuredClone(result.execution);row.reportedPhaseMs=result.execution.phaseTimes??null;row.metrics={memory:budget.snapshot()};
   if(await digest(rgb)!==config.job.source.sha256)throw Error('Immutable RGB input changed');row.status='passed';
  }catch(error){row.status='failed';row.error={code:error.code??null,message:error.message};}
  finally{clearInterval(timer);result?.release();}
  delete row.lastLoggedPhase;return row;
 }
 let queue=Promise.resolve();self.onmessage=({data})=>{queue=queue.then(async()=>{try{let value;if(data.kind==='init')value=await initialize(data.request);else if(data.kind==='run')value=await run(data.request);else if(data.kind==='close')value=await close();else throw Error('Unknown direct benchmark command');postMessage({id:data.id,value});}catch(error){postMessage({id:data.id,error:{code:error.code??null,message:error.message}});}});};
}

async function createRunner(page,request){
 return page.evaluate(async request=>{
  const worker=new Worker('/direct-worker.mjs',{type:'module'}),pending=new Map();let sequence=0,measurement;
  worker.onmessage=({data})=>{if(data.kind==='progress'){console.log(JSON.stringify(data.event));return;}if(data.kind==='measured'){measurement?.();return;}const entry=pending.get(data.id);if(!entry)return;pending.delete(data.id);data.error?entry.reject(Object.assign(Error(data.error.message),data.error)):entry.resolve(data.value);};
  worker.onerror=event=>{for(const entry of pending.values())entry.reject(Error('Direct module Worker failed: '+event.message));pending.clear();};
  const rpc=(kind,request)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,kind,request});});
  globalThis.directBenchmark={worker,rpc,setMeasured:fn=>{measurement=fn;}};
  const started=performance.now(),initial=await rpc('init',request);return{...initial,hostInitializationMs:performance.now()-started};
 },request);
}
async function runBrowserJob(page,request){return page.evaluate(async request=>{
 const started=performance.now(),client=globalThis.directBenchmark;let measuredAt,boundaryPromise;
 client.setMeasured(()=>{measuredAt=performance.now();boundaryPromise=globalThis.benchmarkBoundary('end');});
 const value=await client.rpc('run',request);await boundaryPromise;return{...value,hostRunMs:measuredAt===undefined?null:measuredAt-started};
},request);}
async function closeRunner(page){return page.evaluate(async()=>{const client=globalThis.directBenchmark;if(!client)return null;try{return await client.rpc('close');}finally{client.worker.terminate();globalThis.directBenchmark=null;}});}

async function main(argv){
 const config=settings(argv);if(config.help){console.log(HELP);return;}const input=await prepare(config);
 if(config.validateOnly){console.log(JSON.stringify({status:'validated-only',scope:'direct D2 model Worker',reference:config.referenceRuntimeRoot?{kind:'frozen-current-engine-source',snapshot:'read-and-hashed-only-when-running'}:input.commit,historicalReferenceCommit:input.commit,model:input.identity.sha256,logicalModelFiles:input.modelRoutes.size,chunkFiles:input.chunkFiles,catalogSha256:input.catalogSha256??null,experimental:input.experimental?.proof??null,jobs:input.cases.map(j=>({id:j.id,sourceSha256:j.source.sha256,shape:j.source.shape,inferences:1})),noServerBrowserInference:true}));return;}
 const{chromium}=await import(config.playwrightModule?pathToFileURL(config.playwrightModule).href:'playwright'),snapshot=await snapshots(config);
 if(config.descriptorLayout==='HWC-uint16')for(const[file,term]of [['experiments/d2prl/model.js','evaluatorDescriptorLayout'],['experiments/d2prl/evaluator-pool.js','descriptorLayout'],['experiments/d2prl/evaluator-worker.js','d2prl_descriptor_layout']])if(!snapshot.candidate.get(file)?.toString().includes(term))throw Error('HWC integration contract missing: '+file);
 const session=path.join(config.outputDir,new Date().toISOString().replaceAll(':','-')+'-'+process.pid);await mkdir(session,{recursive:true});
 const serverCounts={reference:0,candidate:0,model:0,source:0,oracle:0,experimental:0},missingRoutes=[];
 const server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(name==='/')return res.end('<!doctype html><title>Direct D2PRL model qualification</title>');if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
  if(name==='/direct-worker.mjs'){res.setHeader('Content-Type','text/javascript');return res.end('('+directWorker.toString()+')();');}
  const runtime=/^\/(reference|candidate)\/(.+)$/.exec(name);if(runtime){const value=snapshot[runtime[1]].get(runtime[2]);if(!value)throw Error('Runtime route missing '+name);serverCounts[runtime[1]]++;res.setHeader('Content-Type',/\.m?js$/.test(name)?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Cache-Control','public,max-age=3600,immutable');return res.end(value);}
  const experimental=/^\/experimental\/([^/]+)$/.exec(name);if(experimental){const value=input.experimental?.files.get(experimental[1]);if(!value)throw Error('Unqualified experimental route');serverCounts.experimental++;res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.setHeader('Cache-Control','public,max-age=3600,immutable');return res.end(value);}
  const model=/^\/models\/(reference|candidate)\/(.+)$/.exec(name);if(model){const file=relative(model[2]),pieces=input.modelRoutes.get(file);if(!pieces)throw Error('Unlisted model asset');serverCounts.model++;res.setHeader('Cache-Control','public,max-age=3600,immutable');res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'application/octet-stream');return await pipeline(Readable.from((async function*(){for(const piece of pieces)for await(const chunk of createReadStream(piece,{highWaterMark:1024**2}))yield chunk;})()),res);}
  const source=/^\/sources\/(reference|candidate)\/([\w-]+)$/.exec(name),oracle=/^\/oracles\/([\w-]+)\/([012])$/.exec(name);
  if(source||oracle){const job=input.cases.find(j=>j.id===(source?source[2]:oracle[1])),spec=source?job?.source:job?.nativeRaw?.[Number(oracle[2])];if(!spec)throw Error('Unlisted RGB/oracle route');serverCounts[source?'source':'oracle']++;res.setHeader('Cache-Control','public,max-age=3600,immutable');return await pipeline(createReadStream(path.join(config.corpusRoot,spec.file)),res);}
  throw Error('Unknown benchmark route '+name);
 }catch(error){missingRoutes.push({path:req.url,message:error.message});console.error(error.message);if(!res.headersSent)res.statusCode=404;if(!res.destroyed)res.end('Unavailable benchmark resource');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const rows=[];
 const report={schema:2,status:'running',reference:config.referenceRuntimeRoot?'snapshot:'+hash(canonical(snapshot.identities.reference)):REFERENCE,referenceKind:config.referenceRuntimeRoot?'frozen-current-engine-source':'historical-git-commit',historicalReferenceCommit:REFERENCE,model:input.identity,assetCatalogSha256:input.catalogSha256??null,assetLogicalFiles:input.modelRoutes.size,assetChunks:input.chunkFiles,scope:'Current-engine direct D2PRL inference lifecycle in a dedicated module Worker: preparation448, descriptors, PatchMatch40, three raw heads and decisions. Projection/refilter/NPZ/general-engine regression qualification is separate.',idleAssertion:config.idleConfirmed,experimental:input.experimental?.proof??null,measurementLimits:['Operator-confirmed idle; ambient OS work remains possible. No process is probed or overridden.','Browser context cold does not imply OS/file caches cold. Runtime snapshots are both read before timed intervals.','Retained warm uses the same initialized model and RGB; each call recomputes every native stage and completed checkpoints must be absent.','Fresh-model warm uses a new Worker/model in the same context, preserving browser HTTP/WASM caches only.','sourceThroughRunMs is host useful initialization + model run elapsed; hashing/native readback occurs after its end. Worker creation and model disposal are excluded.','progress phase intervals are comparable observations; candidate-reported phaseTimes are also preserved but absent in the historical reference. Pool service times overlap, not additive CPU utilization.','One-second backing samples may miss peaks. Registered ownership and policy limits are not physical RAM/RSS. Comparator allocations and server code snapshots are outside the engine policy.','CDP CPU deltas omit retired process history; scheduler leases/worker counts do not establish physical utilization. GPU utilization and storage spill byte totals are unavailable.','All three raw plane hashes and decisions must exactly match the current browser reference. Torch role residual max-absolute/sign differences are diagnostic, not an exact reference requirement.'],precisionTiers:[{precision:'bit-identical-to-current-engine-reference',status:'awaiting-measurement'},...['1e-6','1e-5','1e-4','1e-3','1e-2'].map(precision=>({precision,status:'not-implemented; not-qualified'}))],runtimeSnapshots:{...snapshot.identities,meaning:snapshot.meaning},configuration:{backends:config.backends,budgets:config.budgets,profiles:config.profiles,repetitions:config.repetitions,startupOnly:config.startupOnly,resourceParityOnly:config.resourceParityOnly,temperatures:config.temperatures,inputMode:config.inputMode,rolesMemoryMiB:config.rolesMemoryMiB},jobs:input.cases.map(({id,source})=>({id,source:{bytes:source.bytes,sha256:source.sha256,shape:source.shape},expectedInferences:1})),rows};
 const flush=async()=>{Object.assign(report,summariesForMode(rows,config));report.speedQualification=config.resourceParityOnly?{status:'not-permitted-resource-parity-only',qualified:false,reason:'One pair per temperature verifies exact resources/raw decisions, not speed.'}:{status:'requires-balanced-global-gain',minimumPairs:2,minimumPairedMedianGainPercent:5};await writeFile(path.join(session,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(session,'runs.csv'),csv(rows));await writeFile(path.join(session,'summary.csv'),summaryCsv([...report.summary,...report.workloadSummary]));};
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});report.browser=browser.version();
  const cdp=await browser.newBrowserCDPSession(),created=[];cdp.on('Target.targetCreated',({targetInfo})=>created.push({type:targetInfo.type,id:targetInfo.targetId}));await cdp.send('Target.setDiscoverTargets',{discover:true});
  for(const backend of config.backends)for(const budgetBytes of config.budgets)for(const profile of config.profiles)for(const job of input.cases)for(let repetition=0;repetition<config.repetitions;repetition++){
   const order=repetition%2?['candidate','reference']:['reference','candidate'];for(const variant of order){const context=await browser.newContext(),page=await context.newPage();page.on('console',message=>console.log(message.text()));await page.goto('http://127.0.0.1:'+server.address().port);let boundaries={};
    await page.exposeFunction('benchmarkBoundary',async key=>{boundaries[key]={wall:performance.now(),processes:(await cdp.send('SystemInfo.getProcessInfo')).processInfo};});
    let runnerOpen=false,groupRows=[];
    try{for(const temperature of TEMPERATURES.filter(t=>config.temperatures.includes(t)&&(!config.startupOnly||t==='cold-context-new-model'))){
     const retained=temperature==='warm-retained-model';if(!retained&&runnerOpen){const final=await closeRunner(page);runnerOpen=false;for(const row of groupRows)row.finalCapabilities=final;groupRows=[];await flush();}
     const firstTarget=created.length,firstMissingRoute=missingRoutes.length,runId=[variant,job.id,backend,profile,budgetBytes,repetition,temperature].join('-');let initial={sourceInitMs:0,modelInitMs:0,importMs:0},run;
     boundaries={};await page.evaluate(()=>globalThis.benchmarkBoundary('start'));const started=performance.now();
     const watchdog=setInterval(()=>console.log(JSON.stringify({benchmarkAlive:true,runId,elapsedMs:Math.round(performance.now()-started),meaning:'Host heartbeat; worker progress remains the stage evidence'})),30000);
     try{
      if(!retained){runnerOpen=true;initial=await createRunner(page,{variant,job,identity:input.identity,backend,profile,budgetBytes,inputMode:config.inputMode,rolesMemoryMiB:config.rolesMemoryMiB,experimental:input.experimental?{name:input.experimental.name,layout:config.descriptorLayout}:null});}
      run=config.startupOnly?{status:'startup-checked',runMs:null,hostRunMs:0}:await runBrowserJob(page,{runId,temperature});
     }catch(error){run={status:'failed',error:{code:error.code??null,message:error.message}};}
     finally{clearInterval(watchdog);}
     const row={...run,...initial,resourceParityOnly:config.resourceParityOnly,sourceThroughRunMs:run.hostRunMs===null||run.hostRunMs===undefined?null:(initial.hostInitializationMs??0)+run.hostRunMs,variant,job:job.id,backend,profile,budgetBytes,repetition,temperature,workersCreated:created.slice(firstTarget).filter(t=>t.type==='worker').length};
     if(boundaries.start&&boundaries.end){const before=new Map(boundaries.start.processes.map(p=>[p.id,p.cpuTime])),delta={};for(const p of boundaries.end.processes){delta[p.type]=(delta[p.type]??0)+Math.max(0,p.cpuTime-(before.get(p.id)??0));}row.cpuObservation={secondsByProcessType:delta,windowMs:boundaries.end.wall-boundaries.start.wall,meaning:'Observed CDP CPU delta including useful initialization/run, incomplete for retired processes; not physical utilization'};}
     row.peakPolicyBytes=row.sampledPolicyPeak??null;row.observedWasmBytes=row.sampledBackings?.wasm??null;row.observedArrayBufferBytes=row.sampledBackings?.['array-buffer']??null;row.observedGpuBytes=row.sampledBackings?.gpu??null;row.schedulerPeakCpu=row.lastCapabilities?.execution?.peakCpu??null;row.schedulerPeakGpu=row.lastCapabilities?.execution?.peakGpu??null;row.spillBytes=null;row.gpuUtilization=null;
     const pool=row.execution?.patchmatchPool;row.patchmatchWorkersCreated=pool?.createdWorkers??null;row.patchmatchPeakWorkers=pool?.peakWorkers??null;row.patchmatchMessages=pool?.messages??null;row.patchmatchKernelTiles=pool?.kernelTiles??null;
     row.missingRoutes=missingRoutes.slice(firstMissingRoute);if(row.status==='failed'&&row.missingRoutes.length){row.status='startup-routing-failure';row.qualification='No numerical verdict: infrastructure did not complete the requested calculation.';}
     rows.push(row);groupRows.push(row);await flush();console.log(JSON.stringify({runId,status:row.status,runMs:row.runMs,sourceThroughRunMs:row.sourceThroughRunMs,raw:row.raw}));
     if(!['passed','startup-checked'].includes(row.status)){const error=Error('Direct D2 model failed; matrix stopped after first affected run');error.benchmarkStage=row.status==='startup-routing-failure'?'startup-routing':'direct-inference';throw error;}
    }}finally{if(runnerOpen){try{const final=await closeRunner(page);for(const row of groupRows)row.finalCapabilities=final;}catch(error){for(const row of groupRows){row.status='failed-cleanup';row.cleanupError=error.message;}throw error;}}await context.close();}
   }
  }
  report.status=config.startupOnly?'passed-startup-smoke':rows.every(r=>r.status==='passed')&&summarize(rows).every(r=>r.exact)?(config.resourceParityOnly?'passed-resource-parity-only':'passed-exact-parity'):'rejected';report.precisionTiers[0].status=report.status;report.serverRequests=serverCounts;await flush();if(!['passed-exact-parity','passed-resource-parity-only','passed-startup-smoke'].includes(report.status))process.exitCode=1;
 }catch(error){report.status=error.benchmarkStage==='startup-routing'?'structural-startup-failure':'interrupted-or-failed';report.error={message:error.message,stage:error.benchmarkStage??null};report.missingRoutes=missingRoutes;await flush();throw error;}
 finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({status:report.status,report:path.join(session,'report.json'),table:path.join(session,'runs.csv'),summary:report.summary.map(({case:job,exact,globalGainQualified,pairedGainPercent})=>({case:job,exact,globalGainQualified,pairedGainPercent}))}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
