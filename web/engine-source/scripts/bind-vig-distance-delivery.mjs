// Bind complete execution evidence to the immutable runtime being delivered.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const version = JSON.parse(await readFile(new URL('package.json', root))).version;
assert.equal(version, '0.30.0-m1.39');
const copied = new URL('.build/segmentation-runtime-' + version + '/', root);
const baselineRoot = new URL('.build/segmentation-runtime-0.30.0-m1.38/', root);
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
    assert.equal(hash(await readFile(new URL(file, base))), sha, file);
  }
}
function checkMemory(proof) {
  const memory = proof.memory;
  assert(memory.peakAccountedBytes <= memory.budgetBytes);
  for (const key of ['retainedBytes', 'cacheBytes', 'activeReservationBytes']) assert.equal(memory[key], 0);
}

const operations = await read('vig-distance-operations-proof.json');
const baseline = await read('distance-reuse-mgcfdn-vig-baseline-m1-38-proof.json');
const candidate = await read('distance-reuse-mgcfdn-vig-candidate-proof.json');
const corpus = await read('vig-distance-model-corpus-proof.json');
const nativeCorpus = await read('vig-model-corpus-proof.json');
const large = await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-proof.json');
const largeNpz = await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-npz-proof.json');
const priorLarge = await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-37-candidate-proof.json');
const actual = await read('neural-segmented-mgcfdn-vig-webgpu-m1-39-extracted-proof.json');
const actualNpz = await read('neural-segmented-mgcfdn-vig-webgpu-m1-39-extracted-npz-proof.json');
for (const proof of [operations, baseline, candidate, corpus, nativeCorpus, large, largeNpz, priorLarge, actual, actualNpz]) assert.equal(proof.status, 'passed');
for (const [browser, npz] of [[large, largeNpz], [actual, actualNpz]]) {
  assert.equal(browser.exported.sha256, npz.sha256);
  assert.equal(browser.exported.byteLength, npz.bytes);
  for (const row of npz.records) assert.equal(row.sha256, browser.records.at(-1).outputs[row.array].sha256);
}
assert.equal(operations.records.length, 2);
assert(operations.records.every(row => row.nativeExact && row.samples.length === 3));
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
  assert.equal(proof.records[0].metrics.execution.graphDistanceBackend, 'webgpu-dot-wasm-postprocess');
  assert(proof.records[0].metrics.timings.graphDistanceMs > 0);
  assert(proof.checks.graphDistance && proof.checks.graphDistanceCacheOnlyView);
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
  scope: 'Exact runtime bytes and component/96MP execution sources. Native-exact random/tied graph distances, neighbor indices and gather, cold/warm pairs and real submitted-GPU lifecycle checks. Actual repeated inference against immutable M1.38 with both caches preserved, native corpus, positive96MP source with full plane hashes and independent NPZ readback. Fresh copied auto-GPU API, cached view, actual graph-distance submission cancellation and source reload. Earlier explicit CPU evidence is reused for its unchanged arithmetic. No WordPress or universal-device claim.',
  comparison: {
    baselineMs: baseline.records.map(row => row.milliseconds), candidateMs: candidate.records.map(row => row.milliseconds),
    probabilitySha256: baseline.records[0].sha256,
    baselinePeak: baseline.memory.peakAccountedBytes, candidatePeak: candidate.memory.peakAccountedBytes,
    timingQualification: 'Shared workstation; fresh browser per condition; OS and driver caches not flushed.'
  },
  large: {
    width: 12000, height: 8000, foreground: large.records[0].outputs.mask.nonzero,
    arrays: largeNpz.records.length, exportBytes: largeNpz.bytes, exportSha256: largeNpz.sha256,
    peakAccountedBytes: large.memory.peakAccountedBytes, allPlaneHashesEqualToM1_37: true
  },
  copied: {automaticGpu: true, cancelled: true, retry: true}
};
await writeFile(new URL('docs/vig-distance-delivery-binding.json', root), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({status: proof.status, version, runtimeFiles: manifest.files.length}));
