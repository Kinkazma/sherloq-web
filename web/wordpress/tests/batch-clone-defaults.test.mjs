import test from 'node:test';
import assert from 'node:assert/strict';
import {batchCatalog, catalogRecipe, batchTask, batchRecipeView, recipeKey} from '../sherloq-browser/assets/batch-catalog.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {SSG_DEFAULTS, changeCloneAlgorithm} from '../sherloq-browser/assets/clone-methods.js';
import {sparseViewDefaults} from '../sherloq-browser/assets/sparse-controls.js';
import toolDefaults from '../sherloq-browser/assets/tool-defaults.js';

const recipe = algorithm => catalogRecipe(batchCatalog.find(item => item.params.algorithm === algorithm).id);
const expectedView = {low: 15, high: 100000, minimum: 4, circles: false, lines: false, points: false, areas: true, textExclusions: false};

test('new batch clone recipes use separation seven and displayed length fifteen, preserving the four witnesses', () => {
  for (const entry of batchCatalog.filter(item => item.id.startsWith('clone-') && item.params.algorithm !== 'SSG')) {
    const r = catalogRecipe(entry.id), task = batchTask(r, r.params.algorithm === 'EfficientLoFTR'
      ? {regions: [{x0: 0, y0: 0, x1: 16, y1: 16}, {x0: 20, y0: 20, x1: 32, y1: 32}]} : {});
    assert.equal(r.params.minimum, 7, r.params.algorithm);
    assert.equal(r.fields.find(field => field.key === 'minimum').value, 7, r.params.algorithm);
    assert.deepEqual(r.view, expectedView); assert.deepEqual(task.view, expectedView);
    assert.equal(task.params.minimum, 7);
  }
  assert.equal(catalogRecipe('clone-2').params.minimum, 7);
  assert.equal(catalogRecipe('clone-2').view.low, 15);
  assert.equal(sparseViewDefaults().low, 0); assert.equal(sparseViewDefaults().minimum, 4);
  const individual = structuredClone(toolDefaults['tampering.copyMove.sparse'].params);
  individual.algorithm = 'SIFT + G2NN + RANSAC'; changeCloneAlgorithm(individual, 'PatchMatch Zernike');
  assert.equal(individual.minimum, 10);
});

test('explicit user separation ten and displayed length zero reach both sparse and dense native requests unchanged', () => {
  for (const algorithm of ['SIFT + G2NN + RANSAC + Panels + Text', 'PatchMatch Zernike']) {
    const r = recipe(algorithm); r.params.minimum = 10; r.view = {low: 0}; const before = structuredClone(r);
    const task = batchTask(r);
    assert.equal(task.params.minimum, 10); assert.equal(task.view.low, 0); assert.equal(task.view.minimum, 4);
    assert.deepEqual(task.view, {...expectedView, low: 0}); assert.deepEqual(r, before);
    assert.notEqual(task.view, r.view);
  }
});

test('SSG and neural defaults retain their distinct contracts; catalog views do not alias between new recipes', () => {
  const ssg = recipe('SSG'), task = batchTask(ssg);
  for (const [key, value] of Object.entries(SSG_DEFAULTS)) assert.equal(task.params[key], value, key);
  assert.equal(Object.hasOwn(ssg.params, 'minimum'), false); assert.equal(Object.hasOwn(task.params, 'minimum'), false);
  assert.deepEqual(ssg.view, sparseViewDefaults()); assert.deepEqual(task.view, sparseViewDefaults());
  for (const id of ['ai.clones.d2prl', 'segmentation-selfdm-map', 'segmentation-selfdm-proposal', 'm2.forgeryscope']) {
    const r = catalogRecipe(id), before = structuredClone(r.params), native = batchTask(r);
    assert.deepEqual(native.params, before); assert.equal(native.view, undefined); assert.equal(r.view, undefined);
  }
  const a = recipe('SIFT'), b = recipe('SIFT'); a.view.low = 0;
  assert.equal(b.view.low, 15); assert.equal(recipe('SIFT').view.low, 15);
});

test('batch recipe identity includes its effective view without confusing separation with display witnesses', () => {
  const r = recipe('SIFT + G2NN + RANSAC'), key = recipeKey(r);
  assert.deepEqual(batchRecipeView(r), expectedView);
  const other = structuredClone(r); other.view.low = 0;
  assert.notEqual(recipeKey(other), key); assert.equal(other.params.minimum, 7);
  assert.equal(recipeKey({...r, view: {low: 15}}), key);
  other.view.minimum = 8; assert.equal(batchTask(other).view.minimum, 8);
});

function fixture(algorithm = 'SIFT + G2NN + RANSAC') {
  const image = {id: 'image', hash: 'same-pixels', name: 'native.png', width: 32, height: 32, selected: true,
    family: 'photography', blob: new Blob(['unchanged input']), occurrences: [{studyId: 'study'}], state: 'ready', runs: []};
  const artifacts = new Map(), calls = [], model = {images: [image], studies: [{id: 'study', name: 'Study', errors: []}], artifacts};
  let source;
  const tool = {
    get source() {return source;}, async load(input) {source = {id: input.id}; return source;},
    async run(task) {calls.push(structuredClone(task)); return {operation: task.operation,
      data: {points: new Float64Array(0), pairs: new Float64Array(0), groups: [], params: task.params, metadata: {}},
      provenance: {params: structuredClone(task.params), view: structuredClone(task.view)}, metrics: {}};},
    async export(format) {return new Blob([format]);}, async dispose() {source = null;}, cancel() {},
  };
  const runner = createBatchRunner({scientificFiltering: false, toolFactory: async options => {
    assert.equal(options.computeProfile, 'maximum'); assert.equal(options.memoryBudgetBytes, 4 * 1024 ** 3);
    assert.equal(options.m2MemoryBudgetBytes, 2 * 1024 ** 3); assert.equal(options.maxWorkers, undefined); return tool;
  }});
  return {image, model, artifacts, calls, runner, recipe: recipe(algorithm)};
}

async function deployment(fn) {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, json: async () => ({engineVersion: 'fixture', engineCommit: 'pinned', runtimeSourceIncrementSha256: 'pinned'})});
  try {return await fn();} finally {globalThis.fetch = prior;}
}

for (const algorithm of ['SIFT + G2NN + RANSAC', 'PatchMatch Zernike']) test(`${algorithm}: snapshots persist the exact native view and a changed view cannot reuse completed output`, () => deployment(async () => {
  const f = fixture(algorithm), run = () => f.runner.run(f.model, [f.recipe], {reuse: true});
  await run(); assert.equal(f.calls.length, 1); assert.equal(f.image.runs[0].status, 'done');
  assert.deepEqual(f.calls[0].view, expectedView);
  assert.deepEqual(f.model.configuration.recipes[0].view, expectedView);
  assert.deepEqual(f.image.runs[0].view, expectedView); assert.deepEqual(f.image.runs[0].effectiveView, expectedView);
  const evidencePath = f.image.runs[0].files.find(path => path.endsWith('.json'));
  const evidence = JSON.parse(await f.artifacts.get(evidencePath).text());
  assert.deepEqual(evidence.view, expectedView); assert.deepEqual(evidence.effectiveView, expectedView);
  await run(); assert.equal(f.image.reused, true); assert.equal(f.calls.length, 1);
  f.recipe.view.low = 0;
  assert.equal(f.model.configuration.recipes[0].view.low, 15, 'The running configuration cannot alias editable recipe controls');
  await run(); assert.equal(f.image.reused, false); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].view.low, 0);
  assert.equal(f.image.history.length, 1); assert.equal(f.image.history[0].runs[0].view.low, 15);
  assert.equal(f.image.history[0].runs[0].effectiveView.low, 15); assert.equal(f.image.history[0].configuration.recipes[0].view.low, 15);
  assert.equal(f.image.runs[0].effectiveView.minimum, 4);
  f.recipe.params.minimum = 10; await run(); assert.equal(f.calls.length, 3); assert.equal(f.calls[2].params.minimum, 10);
  assert.equal(f.calls[2].view.low, 0); assert.equal(f.model.configuration.recipes[0].params.minimum, 10);
  await run(); assert.equal(f.image.reused, true); assert.equal(f.calls.length, 3);
}));

test('a legacy batch completion with no recorded view cannot qualify as the new displayed-length configuration', () => deployment(async () => {
  const f = fixture(); await f.runner.run(f.model, [f.recipe], {reuse: true});
  delete f.image.restored.configuration.recipes[0].view;
  await f.runner.run(f.model, [f.recipe], {reuse: true});
  assert.equal(f.image.reused, false); assert.equal(f.calls.length, 2); assert.equal(f.image.history.length, 1);
}));
