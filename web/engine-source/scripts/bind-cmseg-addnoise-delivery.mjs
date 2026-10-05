// Bind the distinct addnoise hybrid memory path to exact delivered bytes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
assert.equal(version,'0.30.0-m1.45');
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),prior=new URL('.build/segmentation-runtime-0.30.0-m1.44/',root);
const hash=b=>createHash('sha256').update(b).digest('hex'),json=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const manifestBytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(manifestBytes),runtimeManifestSha256=hash(manifestBytes);
assert.equal(manifest.version,version);
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256,spec.file);assert.equal(hash(await readFile(new URL(spec.file,root))),spec.sha256,spec.file);}
async function sources(proof){
  for(const[file,sha]of Object.entries(proof.sources)){
    if(!/^(src|vendor|experiments)\//.test(file))continue;
    const base=file.endsWith('.cpp')?root:copied;
    assert.equal(hash(await readFile(new URL(file,base))),sha,file);
  }
}
function released(memory,peakBudget=memory.budgetBytes){assert(memory.peakAccountedBytes<=peakBudget);for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(memory[key],0);}
const ops=await json('cmseg-addnoise-correlation-gpu-resident-r64-32m-m1-45-proof.json');
const streamed=await json('cmseg-addnoise-correlation-gpu-streaming-r64-32m-probe.json');
const corpus=await json('cmseg-addnoise-candidate-correlation-model-corpus-m1-45-proof.json');
const initial=await json('cmseg-addnoise-candidate-correlation-backend-comparison-1g-proof.json');
const regression=await json('cmseg-correlation-backend-comparison-m1-45-regression-proof.json');
const priorGeneralization=await json('cmseg-correlation-model-corpus-32m-proof.json');
const large=await json('neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-proof.json');
const largeNpz=await json('neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-npz-proof.json');
const actual=await json('neural-segmented-cmseg-addnoise-webgpu-m1-45-extracted-proof.json');
const actualNpz=await json('neural-segmented-cmseg-addnoise-webgpu-m1-45-extracted-npz-proof.json');
for(const proof of [ops,streamed,corpus,initial,regression,priorGeneralization,large,largeNpz,actual,actualNpz])assert.equal(proof.status,'passed');
for(const proof of [ops,corpus,regression,large,actual])await sources(proof);
// Lifecycle snapshot retains its historical2GiB peak after lowering the budget
// to64MiB for retry; it is not a peak measured solely during the smaller run.
assert.equal(ops.records.length,3);assert(Object.values(ops.checks).every(Boolean));assert.equal(ops.memory.budgetBytes,64*1024**2);released(ops.memory,2*1024**3);
for(const row of ops.records){const gpu=row.pair.find(r=>r.backend==='gpu');assert.equal(gpu.sha256,streamed.records.find(r=>r.name===row.name).pair.find(r=>r.backend==='gpu').sha256);assert(gpu.probability.maxAbs<=3e-8);assert.equal(gpu.gpu.allocations,4);released(gpu.memory);}
const largest=ops.records.find(r=>r.name==='corr24').pair.find(r=>r.backend==='gpu');
assert.equal(largest.timings.gpuWriteBytes,1581056);assert.equal(largest.timings.gpuReadBytes,2147483648);
assert.equal(corpus.records.length,4);
for(const row of corpus.records){assert(row.preparationExact&&row.probability.finite&&row.probability.maxAbs<=1e-4);assert.equal(row.maskChanges,0);assert.equal(row.sha256,initial.records.find(r=>r.name===row.name&&r.backend==='webgpu').sha256);released(row.memoryAfterRelease);}
assert.equal(corpus.records.find(r=>r.name==='blobs-copy').foreground,245);
const comparisons=[];
for(const budget of [1,2]){
  const pair=[];
  for(const backend of ['cpu','webgpu']){
    const proof=await json('correlation-reuse-cmseg-addnoise-'+backend+'-m1-45-'+budget+'g-proof.json');assert.equal(proof.status,'passed');assert.equal(proof.backend,backend);assert.equal(proof.budgetMiB,budget*1024);await sources(proof);released(proof.memory);
    for(const row of proof.records){assert.equal(row.sha256,proof.records[0].sha256);assert.equal(row.maskChanges,0);assert.equal(row.foreground,245);assert(row.probability.finite&&row.probability.maxAbs<=1e-4);}
    assert.equal(proof.records[0].modelRequests,2);
    for(const row of proof.records.slice(1,3)){assert.equal(row.modelRequests,0);if(backend==='webgpu')assert.equal(row.sessionCache.reuses,1);}
    if(proof.pressure){assert.equal(proof.records[3].modelRequests,2);assert.equal(proof.records[3].sessionCache.creations,1);assert(proof.afterPressure.activeReservationBytes<=6*1024**2);}
    pair.push({backend,milliseconds:proof.records.slice(0,3).map(r=>r.milliseconds),peakAccountedBytes:proof.memory.peakAccountedBytes,workers:proof.records[0].workers});
  }
  comparisons.push({budgetMiB:budget*1024,pair});
}
const pin=JSON.parse(await readFile(new URL('vendor/segmentation/ADDNOISE-CORRELATION-GPU-POST-PINNED.json',copied)));
assert.equal(pin.maximumMemoryBytes,32*1024**2);
for(const[file,spec]of Object.entries(pin.files)){const b=await readFile(new URL('vendor/segmentation/cmseg-addnoise-correlation-gpu/'+file,copied));assert.equal(hash(b),spec.sha256);assert.equal(b.length,spec.bytes);}
for(const[file,sha]of Object.entries(pin.sources))assert.equal(hash(await readFile(new URL(file,root))),sha);
const before=(await import(new URL('experiments/segmentation/models.js',prior))).SEGMENTATION_MODELS;
const after=(await import(new URL('experiments/segmentation/models.js',copied))).SEGMENTATION_MODELS;
const {gpu,...unchangedCpu}=after['cmseg-addnoise'];assert.deepEqual(unchangedCpu,before['cmseg-addnoise']);
assert(gpu.sharedAssets&&gpu.correlationGpuOnly);assert.equal(gpu.sha256,unchangedCpu.sha256);assert.equal(gpu.bytes,unchangedCpu.bytes);
for(const variant of Object.keys(before).filter(v=>v!=='cmseg-addnoise'))assert.deepEqual(after[variant],before[variant]);
const unchanged=['experiments/segmentation/cmseg-inference-worker.js','experiments/segmentation/cmseg-backbone.js','experiments/segmentation/cmseg-correlation.js','experiments/segmentation/cmseg-correlation-worker.js','experiments/segmentation/prepare.js','experiments/segmentation/analysis.js','src/neural-input.js','src/neural-projector.js','src/neural-exports.js','vendor/segmentation/correlation.js','vendor/segmentation/correlation.wasm','vendor/segmentation/correlation-fma.js','vendor/segmentation/correlation-fma.wasm','vendor/segmentation/cmseg-correlation-gpu/post.js','vendor/segmentation/cmseg-correlation-gpu/post.wasm'];
for(const file of unchanged)assert.equal(hash(await readFile(new URL(file,copied))),hash(await readFile(new URL(file,prior))),file);
for(const row of regression.records){assert.equal(row.maskChanges,0);assert.equal(row.sha256,priorGeneralization.records.find(r=>r.name===row.name).sha256);released(row.memoryAfterRelease);}
for(const[proof,npz]of [[large,largeNpz],[actual,actualNpz]]){
  assert.equal(proof.requestedBackend,'auto');released(proof.memory);
  assert.equal(proof.records[0].metrics.execution.correlationBackend,'webgpu-resident-dot-128-wasm-rest');
  assert(proof.checks.correlationGpu&&proof.checks.correlationGpuCacheOnlyView&&proof.checks.sessionReuse&&proof.checks.sessionCacheOnlyView);
  assert.equal(proof.records[1].inferences,0);assert.equal(proof.exported.sha256,npz.sha256);assert.equal(proof.exported.byteLength,npz.bytes);assert.equal(npz.records.length,4);
  for(const row of npz.records){assert(row.accepted);assert.equal(row.sha256,proof.records.at(-1).outputs[row.array].sha256);}
  for(const row of proof.records){assert(row.outputs.mask.nonzero>0);assert.equal(row.outputs.mask.different,0);assert(Object.values(row.outputs).every(v=>v.accepted));}
}
assert.equal(large.exported.width*large.exported.height,96000000);assert.equal(large.records[0].outputs.mask.nonzero,216407);assert.equal(large.records[1].outputs.mask.nonzero,65705);
assert.equal(actual.runtimeManifestSha256,runtimeManifestSha256);assert(actual.checks.cancelled&&actual.checks.retry);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256,
  scope:'Exact delivered files, new addnoise hybrid global-correlation operator and complete corpus, budget-matched actual CPU/GPU warm work and pressure reload, new rich96MP source path and full NPZ, copied automatic common-worker API, cancellation after correlation GPU submission and source reload. CPU assets/arithmetic unchanged. Existing generalization numerical path is reused with a targeted final-model regression, not a new96MP claim. WordPress cohabitation and other physical GPU devices remain unqualified.',
  comparisons,corpus:{cases:4,foreground:245,maximumProbabilityError:Math.max(...corpus.records.map(r=>r.probability.maxAbs)),maskChanges:0},
  large:{width:12000,height:8000,foreground:216407,cachedForeground:65705,arrays:largeNpz.records.length,bytes:largeNpz.bytes,sha256:largeNpz.sha256,peakAccountedBytes:large.memory.peakAccountedBytes},
  copied:{automaticGpu:true,cancelled:true,retry:true},unchangedCpuAndGeneralizationFiles:unchanged};
await writeFile(new URL('docs/cmseg-addnoise-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:'passed',version,runtimeFiles:manifest.files.length}));
