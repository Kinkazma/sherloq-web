// Bind complete execution evidence to the immutable runtime being delivered.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const version = JSON.parse(await readFile(new URL('package.json', root))).version;
assert.equal(version, '0.30.0-m1.40');
const copied = new URL('.build/segmentation-runtime-' + version + '/', root);
const baselineRoot = new URL('.build/segmentation-runtime-0.30.0-m1.39/', root);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await readFile(new URL('docs/' + file, root)));
const bytes = await readFile(new URL('runtime-manifest.json', copied));
const manifest = JSON.parse(bytes), manifestSha256 = hash(bytes);
assert.equal(manifest.version, version);
for (const spec of manifest.files) {
  const file = await readFile(new URL(spec.file, copied));
  assert.equal(file.length, spec.bytes);
  assert.equal(hash(file), spec.sha256);
  assert.equal(hash(await readFile(new URL(spec.file, root))), spec.sha256);
}
async function checkSources(proof, base) {
  for (const [file, sha] of Object.entries(proof.sources)) {
    if (!file.startsWith('experiments/') && !file.startsWith('vendor/') && !file.startsWith('src/')) continue;
    const location=file==='experiments/segmentation/cmseg-correlation.cpp'?root:base;
    assert.equal(hash(await readFile(new URL(file, location))), sha, file);
  }
}
function checkMemory(proof) {
  const memory = proof.memory;
  assert(memory.peakAccountedBytes <= memory.budgetBytes);
  for (const key of ['retainedBytes', 'cacheBytes', 'activeReservationBytes']) assert.equal(memory[key], 0);
}

const operations = await read('cmseg-correlation-gpu-streaming-r64-32m-probe.json');
const baseline = await read('correlation-reuse-cmseg-generalization-baseline-m1-39-proof.json');
const candidate = await read('correlation-reuse-cmseg-generalization-candidate-32m-proof.json');
const corpus = await read('cmseg-correlation-model-corpus-32m-proof.json');
const nativeCorpus = await read('cmseg-gpu-model-corpus-proof.json');
const large = await read('neural-segmented-cmseg-generalization-large-rich-webgpu-m1-40-candidate-proof.json');
const largeNpz = await read('neural-segmented-cmseg-generalization-large-rich-webgpu-m1-40-candidate-npz-proof.json');
const priorLarge = await read('neural-segmented-cmseg-generalization-large-rich-webgpu-m1-34-candidate-proof.json');
const actual = await read('neural-segmented-cmseg-generalization-webgpu-m1-40-extracted-proof.json');
const actualNpz = await read('neural-segmented-cmseg-generalization-webgpu-m1-40-extracted-npz-proof.json');
for (const proof of [operations, baseline, candidate, corpus, nativeCorpus, large, largeNpz, priorLarge, actual, actualNpz]) assert.equal(proof.status, 'passed');
for (const [browser, npz] of [[large, largeNpz], [actual, actualNpz]]) {
  assert.equal(browser.exported.sha256, npz.sha256);
  assert.equal(browser.exported.byteLength, npz.bytes);
  for (const row of npz.records) assert.equal(row.sha256, browser.records.at(-1).outputs[row.array].sha256);
}
assert.equal(operations.records.length, 3);
assert(operations.records.every(row => row.exactCpu && row.pair.length === 2 && row.pair[0].sha256 === row.pair[1].sha256 && row.pair.every(r => r.probability.maxAbs === 0)));
const pinned=JSON.parse(await readFile(new URL('vendor/segmentation/CORRELATION-GPU-POST-PINNED.json',copied)));
assert.equal(pinned.maximumMemoryBytes,32*1024**2);
for(const[file,spec]of Object.entries(pinned.files))assert.equal(hash(await readFile(new URL('vendor/segmentation/cmseg-correlation-gpu/'+file,copied))),spec.sha256);
for(const[file,sha]of Object.entries(pinned.sources))assert.equal(hash(await readFile(new URL(file,root))),sha);
assert.equal(hash(await readFile(new URL('.build/cmseg-correlation-gpu-post-32m/build.json',root))),operations.sources['.build/cmseg-correlation-gpu-post-32m/build.json']);
assert(Object.values(operations.checks).every(Boolean));
await checkSources(operations, copied);
await checkSources(candidate, copied);
await checkSources(corpus, copied);
await checkSources(large, copied);
await checkSources(actual, copied);
await checkSources(baseline, baselineRoot);
assert.equal(baseline.runtimeManifestSha256, hash(await readFile(new URL('runtime-manifest.json', baselineRoot))));
for (const proof of [baseline, candidate]) {
  assert.equal(proof.budgetMiB, 2048);
  assert.equal(proof.records.length, 3);
  for (const row of proof.records) {
    assert.equal(row.sha256, baseline.records[0].sha256);
    assert.equal(row.maskChanges, 0);
    assert(row.foreground > 0 && row.probability.maxAbs <= 1e-4);
  }
  for (const row of proof.records.slice(1)) {
    assert.equal(row.parameterRequests, 0);
    assert.equal(row.modelRequests, 0);
    assert.equal(row.sessionCache.reuses, 1);
  }
  checkMemory(proof);
}
assert.deepEqual(corpus.records.map(row => row.sha256), nativeCorpus.records.map(row => row.sha256));
assert(corpus.records.every(row => row.maskChanges === 0 && row.probability.maxAbs <= 1e-4));
for (let i = 0; i < large.records.length; i++) {
  for (const [key, value] of Object.entries(large.records[i].outputs)) assert.equal(value.sha256, priorLarge.records[i].outputs[key].sha256);
}
for (const proof of [large, actual]) {
  assert.equal(proof.requestedBackend, 'auto');
  assert.equal(proof.records[0].metrics.execution.backend, 'webgpu-cpu');
  assert.equal(proof.records[0].metrics.execution.correlationBackend, 'webgpu-dot-128-wasm-rest');
  assert(proof.records[0].metrics.timings.correlationGpuMs > 0);
  assert(proof.checks.correlationGpu && proof.checks.correlationGpuCacheOnlyView);
  assert(proof.checks.parameterReuse && proof.checks.sessionReuse);
  assert(proof.checks.parameterCacheOnlyView && proof.checks.sessionCacheOnlyView);
  assert.equal(proof.records[1].inferences, 0);
  checkMemory(proof);
}
assert(large.records[0].outputs.mask.nonzero > 0);
assert.equal(actual.runtimeManifestSha256, manifestSha256);
assert(actual.checks.cancelled && actual.checks.retry);
const proof = {
  schema: 1, status: 'passed', version, runtimeFiles: manifest.files.length, runtimeManifestSha256: manifestSha256,
  scope: 'Exact runtime bytes and component/96MP execution sources. Three native-exact complete global correlation geometries and shared-budget CPU/GPU measurements and real submitted-GPU lifecycle checks. Actual repeated inference against immutable M1.39 with both caches preserved, native corpus, positive96MP source with full plane hashes and independent NPZ readback. Fresh copied auto-GPU API, cached view, actual global-correlation submission cancellation and source reload. Earlier explicit CPU evidence is reused for its unchanged arithmetic. No WordPress or universal-device claim.',
  comparison: {
    baselineMs: baseline.records.map(row => row.milliseconds), candidateMs: candidate.records.map(row => row.milliseconds),
    probabilitySha256: baseline.records[0].sha256,
    baselinePeak: baseline.memory.peakAccountedBytes, candidatePeak: candidate.memory.peakAccountedBytes,
    timingQualification: 'Shared workstation; fresh browser per condition; OS and driver caches not flushed.'
  },
  large: {
    width: 12000, height: 8000, foreground: large.records[0].outputs.mask.nonzero,
    arrays: largeNpz.records.length, exportBytes: largeNpz.bytes, exportSha256: largeNpz.sha256,
    peakAccountedBytes: large.memory.peakAccountedBytes, allPlaneHashesEqualToM1_34: true
  },
  copied: {automaticGpu: true, cancelled: true, retry: true}
};
await writeFile(new URL('docs/cmseg-correlation-delivery-binding.json', root), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({status: proof.status, version, runtimeFiles: manifest.files.length}));
