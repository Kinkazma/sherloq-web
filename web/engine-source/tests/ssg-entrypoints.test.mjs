import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {SparseCopyEngine} from '../src/sparse-copy.js';
import {createEngine} from '../src/index.js';
import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';
import {SIFT_SOURCE} from '../src/clone-relations.js';

const model = {url: 'https://fixture.invalid/forest-manifest.json', bytes: 4266,
  sha256: 'b428fe9626dfd59ea3161e2b79786b2a4713e13770e8d75c80477b5805f57157'};
const source = () => ({format: 'rgb8', width: 48, height: 48, data: new Uint8Array(48 * 48 * 3).fill(90)});
const polygon = [[1.25, 2.5], [44.75, 2.5], [44.75, 43.125], [1.25, 43.125]];
const params = {algorithm: 'SSG', normalizationLongEdge: 0, maskThreshold: .423,
  regions: [polygon], excluded: [[[3.25, 4.5], [7.75, 4.5], [7.75, 8.125], [3.25, 8.125]]]};
const assertNative = result => {
  assert.equal(result.status, 'ok');
  assert.equal(result.metadata.algorithm, 'SSG');
  assert.equal(result.metadata.completeDetector, true);
  assert.equal(result.metadata.modelSha256, model.sha256);
  assert.equal(result.feature_policy, 'ssg-paper-v2-full');
  assert.equal(result.params.maskThreshold, params.maskThreshold);
  assert.deepEqual(result.params.regions, params.regions);
  assert.deepEqual(result.params.excluded, params.excluded);
  assert.equal(result.width, 48); assert.equal(result.height, 48);
  assert.ok(result.mask instanceof Uint8Array);
  assert.equal(result.mask.length, 48 * 48);
};

// These real empty-image calls exercise dispatch, native VLFeat and localization,
// not the forest download. Real positive forest qualification uses the existing
// private original fixture; restricted assets are not copied into these tests.
test('shared SparseCopyEngine dispatches SSG to the full native engine and reuses its successful checkpoint', async () => {
  const budget = new Budget(128 * 1024 ** 2), pixels = source(), before = pixels.data.slice();
  const engine = new SparseCopyEngine(pixels, budget, {maxWorkers: 4});
  let result;
  try {
    await assert.rejects(engine.analyze(params, {models: {}}), error =>
      error.code === 'INVALID_INPUT' && /original pinned structured-forest/.test(error.message));
    assert.equal(engine.running, false);
    assert.equal(budget.total(), 0);
    result = await engine.analyze(params, {models: {'ssg-edges': model}});
    assertNative(result);
    assert.equal(result.metadata.stageCache.nativeCheckpoint, false);
    const nativeEngine = engine.ssg;
    result.release(); result = null;
    result = await engine.analyze({...params, maskThreshold: .8}, {models: {'ssg-edges': model}});
    assert.equal(engine.ssg, nativeEngine);
    assert.equal(result.metadata.stageCache.nativeCheckpoint, true);
    assert.equal(result.metadata.stageCache.newVlfeat, 0);
    assert.deepEqual(pixels.data, before);
  } finally {result?.release(); await engine.dispose();}
  assert.equal(budget.total(), 0);
});

test('public M3 API preserves native SSG resources, fractional polygons, provenance and explicit unsupported modes', async () => {
  // The public M3 path also admits the shared compiled display arena (264 MiB).
  const engine = createEngine({memoryBudgetBytes: 512 * 1024 ** 2, cpuKernel: 'reference'});
  const pixels = source(), bytes = pixels.data.slice();
  const task = {id: 'ssg-native', imageId: 'source', operation: 'tampering.copyMove.sparse', params, backend: 'cpu'};
  try {
    await engine.load({id: 'source', pixels, bytes});
    await engine.loadM3Models({models: {'ssg-edges': model}});
    const result = await engine.run(task);
    assertNative(result.data);
    assert.equal(result.provenance.native, 'word2phraseCMFD/PostP.m');
    assert.equal(result.provenance.protocol, 'ssg-paper-v2-full');
    assert.equal(result.provenance.backend, 'cpu');
    assert.deepEqual(result.provenance.params.regions, params.regions);
    const comparisonRegions = [[[0, 0], [20, 0], [20, 47], [0, 47]], [[25, 0], [47, 0], [47, 47], [25, 47]]];
    const compared = await engine.run({...task, params: {...params, regions: comparisonRegions, compare: true}});
    assert.equal(compared.data.metadata.algorithm, 'SSG');
    assert.equal(compared.data.compare, true);
    assert.deepEqual(compared.data.regions, comparisonRegions);
    assert.equal(compared.data.width, pixels.width); assert.equal(compared.data.height, pixels.height);
    await assert.rejects(engine.run({...task, params: {...params, compare: true}}), {code: 'INVALID_INPUT'});
    await assert.rejects(engine.run({...task, backend: 'webgpu'}), {code: 'UNSUPPORTED_OPERATION'});
    await assert.rejects(engine.run({...task, params: {...params, reflections: true}}), {code: 'UNSUPPORTED_OPERATION'});
    assert.deepEqual(engine.original('source'), bytes);
    assert.equal(engine.capabilities().memory.activeReservationBytes, 0);
    await engine.unload('source'); await engine.unloadM3Models();
    assert.equal(engine.capabilities().memory.retainedBytes, 0);
    assert.equal(engine.capabilities().memory.cacheBytes, 0);
  } finally {await engine.dispose();}
});

test('automatic production plans keep their declared SIFT job and never silently activate SSG', () => {
  const envelope = [[0, 0], [47, 0], [47, 47], [0, 47]];
  for (const complete of [false, true]) for (const cpu of [false, true]) {
    const plan = automaticAnalysisPlan({width: 48, height: 48, regions: [envelope], envelope, complete, cpu});
    assert.equal(plan.jobs.find(job => job.id === 'sift').params.algorithm, SIFT_SOURCE);
    assert.equal(plan.jobs.some(job => job.id === 'ssg' || job.params.algorithm === 'SSG'), false);
    assert.deepEqual(plan.jobs.map(job => job.id), ['patchmatch', 'sift', 'forgeryscope', 'd2prl', ...(complete ? ['ela'] : [])]);
  }
});
