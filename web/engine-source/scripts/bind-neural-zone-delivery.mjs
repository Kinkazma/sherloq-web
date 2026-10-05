// Reuse the real96MP run when the delivered numerical/controller files match.
// A public version string change is checked separately, not ignored wholesale.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),hash=b=>createHash('sha256').update(b).digest('hex');
const read=async name=>JSON.parse(await readFile(new URL('docs/'+name+'.json',root)));
const large=await read('neural-segmented-mgcfdn-st-large-rich-cpu-projection-retention-proof');
const npz=await read('neural-segmented-mgcfdn-st-large-rich-cpu-projection-retention-npz-proof');
const actual=await read('neural-segmented-mgcfdn-mpdn-cpu-m1-32-extracted-proof');
const actualNpz=await read('neural-segmented-mgcfdn-mpdn-cpu-m1-32-extracted-npz-proof');
for(const proof of [large,npz,actual,actualNpz])assert.equal(proof.status,'passed');
assert.equal(actual.checks.cancelStartedZones,2);assert(actual.checks.retry);
const manifestBytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.version,version);assert.equal(actual.runtimeManifestSha256,hash(manifestBytes));
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);}
const matches=[];
for(const[file,sha256]of Object.entries(large.sources)){
  const b=await readFile(new URL(file,copied));let match=hash(b)===sha256,normalization;
  if(!match&&file==='src/index.js'){
    const source=b.toString();assert(source.includes("const VERSION='"+version+"'"));
    match=hash(source.replace("const VERSION='"+version+"'","const VERSION='0.30.0-m1.31'"))===sha256;
    normalization='Only the VERSION literal changed from0.30.0-m1.31; the complete remaining file hash matches.';
  }
  assert(match,file);matches.push({file,largeRunSha256:sha256,deliveredSha256:hash(b),...(normalization?{normalization}:{})});
}
for(const[file,sha256]of Object.entries(large.recipeSources))assert.equal(hash(await readFile(new URL(file,root))),sha256,file);
const baseline=await read('segmentation-mpdn-common-benchmark-serial-m1-31'),parallel=await read('segmentation-mpdn-common-benchmark-parallel-candidate');
for(let i=0;i<2;i++)assert.deepEqual(baseline.cases[0].records[i].arrayHashes,parallel.cases[0].records[i].arrayHashes);
const retained=await read('neural-segmented-mgcfdn-st-large-rich-cpu-parallel-candidate-proof');
for(let i=0;i<large.records.length;i++)for(const[key,result]of Object.entries(large.records[i].outputs))assert.equal(result.sha256,retained.records[i].outputs[key].sha256);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:hash(manifestBytes),
  scope:'Every copied runtime file verified. The actual positive96MP CPU ONNX/ST run is reused only for byte-identical numerical/controller modules; index differs solely by its version literal. A fresh copied concurrent MPDN JPEG/API/NPZ run verifies cancellation after two inference-start events, reload and ownership. No universal model/device or WordPress claim.',
  largeSource:{width:12000,height:8000,foreground:large.records[0].outputs.mask.nonzero,arrays:npz.records.length,exportBytes:npz.bytes,exportSha256:npz.sha256},matches,
  copiedCancellation:{startedZones:actual.checks.cancelStartedZones,cancelled:actual.checks.cancelled,retry:actual.checks.retry},
  unchangedArrayComparisons:['serial versus concurrent MPDN cold/warm grids/map/mask','96MP ST before versus after idle-session retirement, all six full-size arrays for analysis and cached view']};
await writeFile(new URL('docs/neural-zone-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({status:proof.status,version,files:manifest.files.length,largeArrays:npz.records.length}));
