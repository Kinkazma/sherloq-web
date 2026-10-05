import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
const copied=new URL('.build/segmentation-runtime-'+version+'/',root);
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const large=await read('neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-35-candidate-proof.json');
const largeNpz=await read('neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-35-candidate-npz-proof.json');
const cpuLarge=await read('neural-segmented-mgcfdn-tnt-large-rich-cpu-m1-34-extracted-proof.json');
const cpuNpz=await read('neural-segmented-mgcfdn-tnt-large-rich-cpu-m1-34-extracted-npz-proof.json');
const actual=await read('neural-segmented-mgcfdn-tnt-webgpu-m1-35-extracted-proof.json');
const actualNpz=await read('neural-segmented-mgcfdn-tnt-webgpu-m1-35-extracted-npz-proof.json');
const corpus=await read('tnt-gpu-model-corpus-proof.json'),baseline=await read('tnt-model-corpus-proof.json'),comparison=await read('tnt-backend-comparison-repeat-proof.json'),lifecycle=await read('tnt-gpu-lifecycle-proof.json');
for(const p of [large,largeNpz,cpuLarge,cpuNpz,actual,actualNpz,corpus,baseline,comparison,lifecycle])assert.equal(p.status,'passed');
assert.deepEqual(corpus.records.map(r=>r.sha256),baseline.records.map(r=>r.sha256));
assert.equal(actual.requestedBackend,'auto');assert.equal(actual.records[0].metrics.execution.backend,'webgpu-cpu');
assert(actual.checks.cancelled&&actual.checks.retry);assert.equal(comparison.records[0].sha256,comparison.records[1].sha256);
const bytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(bytes);
assert.equal(manifest.version,version);assert.equal(actual.runtimeManifestSha256,hash(bytes));
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);}
const matches=[];
for(const [file,sha256] of Object.entries(large.sources)){
  assert.equal(hash(await readFile(new URL(file,copied))),sha256,file);
  matches.push({file,largeRunSha256:sha256,deliveredSha256:sha256});
}
const runtimeFiles=new Set(manifest.files.map(r=>r.file));
for(const p of [corpus,comparison,lifecycle])for(const [file,sha256] of Object.entries(p.sources))if(file.startsWith('experiments/')||file.startsWith('vendor/'))assert.equal(hash(await readFile(new URL(file,runtimeFiles.has(file)?copied:root))),sha256,file);
for(let i=0;i<large.records.length;i++)for(const [key,value] of Object.entries(large.records[i].outputs))assert.equal(value.sha256,cpuLarge.records[i].outputs[key].sha256);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:hash(bytes),scope:'Every copied runtime file is verified. The actual96MP GPU/controller modules are byte-identical to this delivery, without normalized hashes. Fresh copied API automatically selects the shared-asset GPU path, checks JPEG zones, cache, complete NPZ, GPU submission cancellation and source reload. Independent CPU96MP proof was run on immutable M1.34; its complete plane hashes equal this GPU run. Historical recipe hashes remain those of their runs.',matches,
  large:{width:12000,height:8000,foreground:large.records[0].outputs.mask.nonzero,arrays:largeNpz.records.length,exportBytes:largeNpz.bytes,exportSha256:largeNpz.sha256,allPlaneHashesEqualToCpuM1_34:true},
  comparison:{cpuMs:comparison.records[0].milliseconds,gpuMs:comparison.records[1].milliseconds,speedup:comparison.records[0].milliseconds/comparison.records[1].milliseconds,probabilitySha256:comparison.records[0].sha256},
  copied:{automaticGpu:true,cancelled:actual.checks.cancelled,retry:actual.checks.retry}};
await writeFile(new URL('docs/tnt-gpu-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({status:proof.status,version,runtimeFiles:manifest.files.length,speedup:proof.comparison.speedup}));
