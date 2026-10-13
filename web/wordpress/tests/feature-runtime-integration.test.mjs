import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateFeatureCatalog,selectActiveFiles,requiredFeatureChunks,featureDeletionPlan} from '../sherloq-browser/assets/feature-catalog.js';

const root=fileURLToPath(new URL('../',import.meta.url)),repository=path.resolve(root,'../..');
const bytes=file=>fs.readFileSync(path.join(repository,file));
const sha=data=>createHash('sha256').update(data).digest('hex');
const json=file=>JSON.parse(bytes(file));
const overlay=json('web/wordpress/runtime-patches/feature-selection-overlay-0.18.0.json');
const manifest=json('web/wordpress/compatibility-manifests/'+overlay.baseline.manifest+'.json');
const catalog=json('web/wordpress/sherloq-browser/assets/feature-catalog.json');
const lock=json(overlay.locks.delivered.file),sourceLock=json(overlay.locks.source.file);

test('integrated catalogue covers the newer protected runtime without changing optional identities',()=>{
 validateFeatureCatalog(catalog,manifest);
 assert.equal(catalog.features.length,91);
 assert.equal(selectActiveFiles(catalog).size,5461);
 const disabledGroups=['neural-detectors','segmentation','learned-clones','forgeryscope','composite'];
 const selected=selectActiveFiles(catalog,{disabledGroups});
 for(const name of ['unified-engine/src/dense-descriptor-cache.js','unified-engine/src/dense-gpu-transport.js','unified-engine/native/sparse-float-distance/copy-tree.wasm',overlay.preserved.d2prlWasm.file])assert.ok(selected.has(name),name);
 assert.ok(!selected.has('unified-assets/d2prl/model.json'));
 assert.equal(catalog.features.find(f=>f.id==='ai.clones.d2prl').resources.length,1063);
 const deletion=featureDeletionPlan(catalog,manifest,{},['ai.clones.d2prl'],{presentChunks:Object.keys(manifest.chunks)});
 assert.ok(!deletion.paths.includes(overlay.preserved.d2prlWasm.file));
 assert.ok(requiredFeatureChunks(catalog,manifest,{disabledGroups}).has(overlay.preserved.d2prlWasm.sha256));
});

test('only the six declared delivered selection overrides diverge from the immutable manifest',()=>{
 const allowed=new Map(overlay.files.map(file=>[file.file,file]));
 assert.equal(allowed.size,6);
 const changed=[];
 for(const runtime of lock.runtimes){
  const slot=runtime.destination.replace('sherloq-browser/assets/','');
  for(const [name,identity] of Object.entries(runtime.files)){
   const file=slot+'/'+name,baseline=manifest.files[file];assert.ok(baseline,file);
   if(identity!==baseline.sha256){changed.push(file);assert.equal(identity,allowed.get(file)?.after.sha256,file);}
  }
 }
 assert.deepEqual(changed.sort(),[...allowed.keys()].sort());
 for(const record of allowed.values()){
  assert.equal(record.before.sha256,manifest.files[record.file].sha256);
  assert.equal(record.before.size,manifest.files[record.file].size);
  const data=bytes(record.asset);assert.equal(sha(data),record.after.sha256);assert.equal(data.length,record.after.size);
  assert.deepEqual(bytes(record.mirror),data);
  assert.match(data.toString(),/excludedFeatures/);
  const [slot,...parts]=record.file.split('/'),source=sourceLock.runtimes.find(r=>r.destination==='sherloq-browser/assets/'+slot);
  assert.equal(source.files[parts.join('/')],record.sourceAfterSha256);
  assert.equal(sha(bytes(record.source)),record.sourceAfterSha256);
  assert.deepEqual(overlay.release.runtimeOverrides[record.file],{before:record.before.sha256,after:record.after.sha256,size:record.after.size});
 }
 for(const record of overlay.sources){const data=bytes(record.file);assert.equal(sha(data),record.after.sha256);assert.equal(data.length,record.after.size);}
 for(const value of Object.values(overlay.locks))assert.equal(sha(bytes(value.file)),value.sha256);
 const baselineSource=structuredClone(sourceLock),baselineDelivered=structuredClone(lock);
 for(const record of allowed.values()){
  const [slot,...parts]=record.file.split('/'),destination='sherloq-browser/assets/'+slot,name=parts.join('/');
  baselineSource.runtimes.find(r=>r.destination===destination).files[name]=record.sourceBeforeSha256;
  baselineDelivered.runtimes.find(r=>r.destination===destination).files[name]=record.before.sha256;
 }
 const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
 const identity=value=>sha(Buffer.from(JSON.stringify(sorted(value))+'\n'));
 assert.equal(identity(baselineSource),overlay.baseline.runtimeSourceLockSha256,'All source lock entries and metadata outside the declared overlay stay exact');
 assert.equal(identity(baselineDelivered),overlay.baseline.runtimeLockSha256,'All delivered lock entries and metadata outside the declared overlay stay exact');
});

test('new D2PRL bytes, scientific receipts and seven compatibility manifests stay exact',()=>{
 for(const record of [overlay.preserved.d2prlWasm,overlay.preserved.d2prlPinned]){
  const delivered=bytes('web/wordpress/sherloq-browser/assets/'+record.file);
  assert.equal(sha(delivered),record.sha256);assert.equal(delivered.length,record.size);
  assert.deepEqual(bytes('web/engine-source/'+record.file.replace('unified-engine/','')),delivered);
  assert.equal(manifest.files[record.file].sha256,record.sha256);
 }
 for(const record of [overlay.baseline.runtimeManifest,overlay.baseline.sourceManifest,overlay.preserved.d2prlIncrement,overlay.preserved.cloneIncrement])assert.equal(sha(bytes(record.file)),record.sha256,record.file);
 const unified=lock.runtimes.find(r=>r.destination.endsWith('/unified-engine'));
 assert.equal(unified.d2prlIncrement.sha256,overlay.preserved.d2prlIncrement.sha256);
 assert.equal(unified.cloneIncrement.sha256,overlay.preserved.cloneIncrement.sha256);
 const directory=path.join(root,'compatibility-manifests'),names=fs.readdirSync(directory).filter(name=>name.endsWith('.json'));
 assert.equal(names.length,7);
 for(const name of names)assert.equal(sha(fs.readFileSync(path.join(directory,name))),name.slice(0,-5),name);
});
