import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),hash=b=>createHash('sha256').update(b).digest('hex'),read=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const large=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-gpu-candidate-proof.json'),npz=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-gpu-candidate-npz-proof.json');
const actual=await read('neural-segmented-mgcfdn-vig-webgpu-m1-33-extracted-proof.json'),actualNpz=await read('neural-segmented-mgcfdn-vig-webgpu-m1-33-extracted-npz-proof.json');
const corpus=await read('vig-gpu-model-corpus-proof.json'),baseline=await read('vig-model-corpus-proof.json'),comparison=await read('vig-backend-comparison-proof.json'),operators=await read('vig-gpu-operations-proof.json');
for(const p of [large,npz,actual,actualNpz,corpus,baseline,comparison,operators])assert.equal(p.status,'passed');
assert.equal(actual.requestedBackend,'auto');assert.equal(actual.records[0].metrics.execution.backend,'webgpu-cpu');assert(actual.checks.cancelled&&actual.checks.retry);
assert.deepEqual(corpus.records.map(r=>r.sha256),baseline.records.map(r=>r.sha256));assert.equal(comparison.records[0].sha256,comparison.records[1].sha256);
const bytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(bytes);assert.equal(manifest.version,version);assert.equal(actual.runtimeManifestSha256,hash(bytes));
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);}
const matches=[];
for(const[file,sha256]of Object.entries(large.sources)){
 const b=await readFile(new URL(file,copied));let match=hash(b)===sha256,normalization;
 if(!match&&file==='src/index.js'){
  const normalized=b.toString().replace("const VERSION='"+version+"'","const VERSION='0.30.0-m1.32'")
   .replace('Single-thread MGCF CPU models admit independent zone jobs under the shared budget;','MGCF segmentation uses one bounded neural worker;')
   .replace('MPDN can select its measured WebGPU/CPU hybrid with a pinned GPU mirror; VIG can select ordered WebGPU convolutions using its shared CPU/GPU assets, with CPU graph arithmetic and decoder. Selection uses capabilities and memory, with explicit CPU retained.','MPDN can select the measured WebGPU/CPU hybrid when its pinned mirror, capabilities and memory permit, with explicit CPU retained.');
  match=hash(normalized)===sha256;normalization='Only VERSION and the two documented concurrencyReason prose replacements differ; complete remaining file hash matches.';
 }
 assert(match,file);matches.push({file,largeRunSha256:sha256,deliveredSha256:hash(b),...(normalization?{normalization}:{})});
}
const runtimeFiles=new Set(manifest.files.map(row=>row.file));
for(const proof of [corpus,comparison,operators])for(const[file,sha256]of Object.entries(proof.sources))if(file.startsWith('experiments/')||file.startsWith('vendor/'))assert.equal(hash(await readFile(new URL(file,runtimeFiles.has(file)?copied:root))),sha256,file);
const cpuJpeg=await read('neural-segmented-mgcfdn-vig-cpu-m1-31-extracted-proof.json');
for(let i=0;i<actual.records.length;i++)for(const[key,value]of Object.entries(actual.records[i].outputs))assert.equal(value.sha256,cpuJpeg.records[i].outputs[key].sha256);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:hash(bytes),scope:'All copied runtime files verified. Actual96MP GPU run reused for identical numerical/controller/selection modules; index differs only by the checked version and descriptive capability prose. Fresh copied API selects GPU automatically from shared assets and verifies JPEG regions, cache view, NPZ, GPU-phase cancellation and reload. Recipe hashes in older reports remain those of their original runs.',matches,
 largeSource:{width:12000,height:8000,foreground:large.records[0].outputs.mask.nonzero,arrays:npz.records.length,exportBytes:npz.bytes,exportSha256:npz.sha256},
  cpuGpuExactCorpus:corpus.records.map(r=>({name:r.name,sha256:r.sha256,maskChanges:r.maskChanges})),comparison:{cpuMs:comparison.records[0].milliseconds,gpuMs:comparison.records[1].milliseconds,speedup:comparison.records[0].milliseconds/comparison.records[1].milliseconds},copied:{automaticGpu:true,allJpegArrayHashesEqualToCpuM1_31:true,cancelled:actual.checks.cancelled,retry:actual.checks.retry}};
await writeFile(new URL('docs/vig-gpu-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,version,runtimeFiles:manifest.files.length,speedup:proof.comparison.speedup}));
