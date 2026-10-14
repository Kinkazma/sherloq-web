import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateFeatureCatalog,selectActiveFiles,requiredFeatureChunks,featureDeletionPlan} from '../sherloq-browser/assets/feature-catalog.js';

const root=fileURLToPath(new URL('../',import.meta.url)),repository=path.resolve(root,'../..');
const currentBytes=file=>fs.readFileSync(path.join(repository,file));
const ela=JSON.parse(currentBytes('web/wordpress/runtime-patches/ela-runtime-20261014.json'));
const predecessor=new Map(ela.baseline.snapshots.map(record=>[record.file,record]));
// Historical contracts retain the original 57-file view, including index.js.
const bytes=file=>{const record=predecessor.get(file);if(!record)return currentBytes(file);const data=currentBytes(record.copy);assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);assert.equal(data.length,record.size);return data;};
const sha=data=>createHash('sha256').update(data).digest('hex');
const json=file=>JSON.parse(bytes(file));
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(sorted(value))+'\n'),identity=value=>sha(encode(value));
const overlay=json('web/wordpress/runtime-patches/feature-selection-overlay-0.18.0.json');
const increment=json('web/wordpress/runtime-patches/batch-scientific-regions-20261013.json');
const manifest=json('web/wordpress/compatibility-manifests/'+overlay.baseline.manifest+'.json');
const candidate=json(increment.manifest.file);
const catalog=json('web/wordpress/sherloq-browser/assets/feature-catalog.json');
const lock=json(overlay.locks.delivered.file),sourceLock=json(overlay.locks.source.file);
const historical=file=>execFileSync(process.env.SHERLOQ_TEST_GIT||'git',['show',increment.baseline.incomingCommit+':'+file],{cwd:repository,maxBuffer:8_000_000});
const slot=(lock,name='unified-engine')=>lock.runtimes.find(r=>r.destination==='sherloq-browser/assets/'+name);
function undoIncrement(lock,kind){
 const before=structuredClone(lock),files=slot(before).files;
 for(const r of increment.files){const name=r.file.replace('unified-engine/',''),hash=r[kind==='source'?'sourceBeforeSha256':'deliveredBeforeSha256'];hash===null?delete files[name]:files[name]=hash;}
 return before;
}
const oldSource=undoIncrement(sourceLock,'source'),oldDelivered=undoIncrement(lock,'delivered');

// The existing catalogue is the immutable 0.18 graph. A candidate release
// regenerates its catalogue from the additive inventory before packaging.
test('integrated catalogue covers the newer protected runtime without changing optional identities',()=>{
 const originalCatalog=JSON.parse(historical('web/wordpress/sherloq-browser/assets/feature-catalog.json'));
 validateFeatureCatalog(originalCatalog,manifest);
 assert.equal(originalCatalog.features.length,91);assert.equal(selectActiveFiles(originalCatalog).size,5461);
 const disabledGroups=['neural-detectors','segmentation','learned-clones','forgeryscope','composite'],selected=selectActiveFiles(originalCatalog,{disabledGroups});
 for(const name of ['unified-engine/src/dense-descriptor-cache.js','unified-engine/src/dense-gpu-transport.js','unified-engine/native/sparse-float-distance/copy-tree.wasm',overlay.preserved.d2prlWasm.file])assert.ok(selected.has(name),name);
 assert.ok(!selected.has('unified-assets/d2prl/model.json'));
 assert.equal(originalCatalog.features.find(f=>f.id==='ai.clones.d2prl').resources.length,1063);
 const deletion=featureDeletionPlan(originalCatalog,manifest,{},['ai.clones.d2prl'],{presentChunks:Object.keys(manifest.chunks)});
 assert.ok(!deletion.paths.includes(overlay.preserved.d2prlWasm.file));
 assert.ok(requiredFeatureChunks(originalCatalog,manifest,{disabledGroups}).has(overlay.preserved.d2prlWasm.sha256));
 validateFeatureCatalog(catalog,JSON.parse(currentBytes(ela.manifest.file)));assert.equal(catalog.features.length,91);assert.equal(selectActiveFiles(catalog).size,5476);
 for(const feature of originalCatalog.features.filter(feature=>feature.id!=='core'))assert.deepEqual(catalog.features.find(f=>f.id===feature.id),feature,'Optional identities and resources stay exact: '+feature.id);
 const active=selectActiveFiles(catalog,{disabledGroups});for(const record of [...increment.files,...ela.files].filter(r=>r.added))assert.ok(active.has(record.file),record.file);
});

test('the immutable six-file selection overlay remains verifiable before the additive increment',()=>{
 const allowed=new Map(overlay.files.map(file=>[file.file,file]));assert.equal(allowed.size,6);const changed=[];
 for(const runtime of oldDelivered.runtimes){const prefix=runtime.destination.replace('sherloq-browser/assets/','');for(const [name,hash] of Object.entries(runtime.files)){
  const file=prefix+'/'+name,baseline=manifest.files[file];assert.ok(baseline,file);if(hash!==baseline.sha256){changed.push(file);assert.equal(hash,allowed.get(file)?.after.sha256,file);}
 }}
 assert.deepEqual(changed.sort(),[...allowed.keys()].sort());
 assert.equal(sha(bytes(increment.baseline.selectionOverlay.file)),increment.baseline.selectionOverlay.sha256);
 for(const record of allowed.values()){
  assert.equal(record.before.sha256,manifest.files[record.file].sha256);assert.equal(record.before.size,manifest.files[record.file].size);
  const data=historical(record.asset);assert.equal(sha(data),record.after.sha256);assert.equal(data.length,record.after.size);assert.deepEqual(historical(record.mirror),data);assert.match(data.toString(),/excludedFeatures/);
  const [prefix,...parts]=record.file.split('/');assert.equal(slot(oldSource,prefix).files[parts.join('/')],record.sourceAfterSha256);assert.equal(sha(historical(record.source)),record.sourceAfterSha256);
  assert.deepEqual(overlay.release.runtimeOverrides[record.file],{before:record.before.sha256,after:record.after.sha256,size:record.after.size});
 }
 for(const r of overlay.sources){const data=historical(r.file);assert.equal(sha(data),r.after.sha256);assert.equal(data.length,r.after.size);}
 assert.equal(identity(oldSource),overlay.locks.source.sha256);assert.equal(identity(oldDelivered),overlay.locks.delivered.sha256);
 assert.deepEqual(encode(oldSource),historical(overlay.locks.source.file));assert.deepEqual(encode(oldDelivered),historical(overlay.locks.delivered.file));
 const baselineSource=structuredClone(oldSource),baselineDelivered=structuredClone(oldDelivered);
 for(const r of allowed.values()){const [prefix,...parts]=r.file.split('/');slot(baselineSource,prefix).files[parts.join('/')]=r.sourceBeforeSha256;slot(baselineDelivered,prefix).files[parts.join('/')]=r.before.sha256;}
 assert.equal(identity(baselineSource),overlay.baseline.runtimeSourceLockSha256);assert.equal(identity(baselineDelivered),overlay.baseline.runtimeLockSha256);
});

test('the additive 57-file increment preserves every undeclared descriptor, chunk, model and runtime identifier',()=>{
 assert.equal(increment.schema,'sherloq.batch-scientific-regions-runtime-increment/1');assert.equal(increment.published,false);
 assert.equal(increment.files.length,57);assert.equal(increment.files.filter(f=>f.added).length,14);assert.equal(new Set(increment.files.map(f=>f.file)).size,57);
 assert.equal(sha(bytes(increment.manifest.file)),increment.manifest.sha256);assert.equal(Object.keys(candidate.files).length,5475);
 const incoming=JSON.parse(historical(increment.baseline.manifest.file));assert.equal(identity(incoming),increment.baseline.manifest.sha256);
 const allowed=new Map(increment.files.map(r=>[r.file,r]));
 for(const [name,file] of Object.entries(incoming.files))if(!allowed.has(name))assert.deepEqual(candidate.files[name],file,name);
 for(const [hash,size] of Object.entries(incoming.chunks))assert.equal(candidate.chunks[hash],size,hash);
 assert.deepEqual(candidate.slots,incoming.slots);assert.equal(candidate.remoteBase,incoming.remoteBase);
 assert.deepEqual(candidate.localFiles,[...incoming.localFiles,...increment.manifest.addedLocalFiles]);
 const addedBinary=[];
 for(const r of increment.files){
  assert.deepEqual(r.before,incoming.files[r.file]??null);assert.deepEqual(candidate.files[r.file],r.after);
  const data=bytes(r.asset),raw=bytes(r.source);assert.equal(sha(data),r.after.sha256);assert.equal(data.length,r.after.size);assert.deepEqual(bytes(r.mirror),data);assert.equal(sha(raw),r.sourceAfter.sha256);assert.equal(raw.length,r.sourceAfter.size);
  const logic=/\.m?js$/.test(r.file)?Buffer.from(data.toString().replace(/^import [^\n]*runtime-context\.js\?v=[^\n]*;\n/,'')):data;
  assert.equal(sha(logic),sha(raw),'Source/deployment logic: '+r.file);
  assert.equal(slot(lock).files[r.file.replace('unified-engine/','')],r.after.sha256);assert.equal(slot(sourceLock).files[r.file.replace('unified-engine/','')],r.sourceAfter.sha256);
  assert.deepEqual(r.after.chunks,[r.after.sha256]);assert.equal(candidate.chunks[r.after.sha256],data.length);assert.ok(data.length<512_000);assert.ok(!r.after.localOnly);
  if(r.file.endsWith('.wasm'))addedBinary.push(r.file);
 }
 assert.deepEqual(addedBinary,['unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm']);
 assert.equal(allowed.get(addedBinary[0]).after.sha256,'a479db700aa63e8663226f1ddd653d01c8e5982d35a8086fdbe0778002bffe10');
 for(const [kind,current] of [['source',sourceLock],['delivered',lock]]){
  assert.equal(sha(bytes(increment.locks[kind].file)),increment.locks[kind].sha256);assert.equal(identity(undoIncrement(current,kind)),increment.baseline.locks[kind].sha256);
 }
 for(const name of ['automatic-analysis-plan.js','automatic-analyzer.js','automatic-runtime.js']){const source=bytes('web/engine-source/src/'+name).toString();assert.match(source,/excludedFeatures/);assert.match(source,/scientificScope/);}
});

test('new scientific modules and worker/vendor imports close against the additive inventory',()=>{
 let edges=0;
 const expressions=[/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?['"]([^'"]+)['"]/g,/\bimport\s*\(\s*['"]([^'"]+)['"]/g,/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g];
 for(const r of increment.files.filter(r=>/\.m?js$/.test(r.file))){const text=bytes(r.asset).toString();for(const re of expressions)for(const match of text.matchAll(re)){
  if(!match[1].startsWith('.'))continue;const target=path.posix.normalize(path.posix.join(path.posix.dirname(r.file),match[1].split(/[?#]/)[0]));
  if(!target.startsWith('unified-engine/'))continue;assert.ok(candidate.files[target],r.file+' → '+target);edges++;
 }}
 assert.ok(edges>100,edges);assert.ok(candidate.files['unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm']);
 const wasm=bytes('web/wordpress/sherloq-browser/assets/unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm');assert.deepEqual(wasm.subarray(0,8),Buffer.from([0,97,115,109,1,0,0,0]));
});

test('D2PRL bytes and scientific receipts remain immutable as compatibility manifests accumulate',()=>{
 for(const r of [overlay.preserved.d2prlWasm,overlay.preserved.d2prlPinned]){const delivered=bytes('web/wordpress/sherloq-browser/assets/'+r.file);assert.equal(sha(delivered),r.sha256);assert.equal(delivered.length,r.size);assert.deepEqual(bytes('web/engine-source/'+r.file.replace('unified-engine/','')),delivered);assert.equal(candidate.files[r.file].sha256,r.sha256);}
 for(const r of [overlay.baseline.runtimeManifest,overlay.baseline.sourceManifest,overlay.preserved.d2prlIncrement,overlay.preserved.cloneIncrement])assert.equal(sha(bytes(r.file)),r.sha256,r.file);
 assert.equal(slot(lock).d2prlIncrement.sha256,overlay.preserved.d2prlIncrement.sha256);assert.equal(slot(lock).cloneIncrement.sha256,overlay.preserved.cloneIncrement.sha256);
 const directory=path.join(root,'compatibility-manifests'),names=fs.readdirSync(directory).filter(name=>name.endsWith('.json'));
 const baselineNames=execFileSync(process.env.SHERLOQ_TEST_GIT||'git',['ls-tree','--name-only',increment.baseline.incomingCommit+':web/wordpress/compatibility-manifests'],{cwd:repository}).toString().trim().split('\n').filter(name=>name.endsWith('.json'));
 assert.equal(baselineNames.length,7);
 for(const name of baselineNames){assert.ok(names.includes(name),name);assert.deepEqual(fs.readFileSync(path.join(directory,name)),historical('web/wordpress/compatibility-manifests/'+name),name);}
 for(const version of ['0.18.0','0.19.0']){
  const previousRelease=json('releases/'+version+'.json'),previousManifest=previousRelease.manifest.sha256;
  assert.ok(names.includes(previousManifest+'.json'),'Previous public release remains compatible: '+version);
  assert.deepEqual(fs.readFileSync(path.join(directory,previousManifest+'.json')),bytes('web/local-sources/'+version+'/manifest.json'));
 }
 for(const name of names)assert.equal(sha(fs.readFileSync(path.join(directory,name))),name.slice(0,-5),name);
});
