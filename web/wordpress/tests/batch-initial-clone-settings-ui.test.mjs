import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBatchUI} from '../sherloq-browser/assets/batch-ui.js';
import {catalogRecipe, batchTask} from '../sherloq-browser/assets/batch-catalog.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {batchArchive} from '../sherloq-browser/assets/batch-export.js';
import {unavailableResultDisplayFactory} from './batch-display-fixture.mjs';

const settingsKey = 'sherloq.batch.settings';
const selectedRecipe = () => {
  const r = catalogRecipe('clone-2'); r.params.minimum = 10; r.view.low = 0;
  return {id: r.id, params: structuredClone(r.params), view: structuredClone(r.view), signal: structuredClone(r.signal), backend: r.backend};
};
const savedSettings = () => ({recipes: [selectedRecipe()], options: {basis: 'clones', threshold: 1, reuse: true}});
const valid = input => {
  if (input.disabled || input.type !== 'number') return true;
  if (input.value === '') return !input.required;
  const value = Number(input.value); if (!Number.isFinite(value)) return false;
  if (input.min !== undefined && input.min !== '' && value < Number(input.min)) return false;
  if (input.max !== undefined && input.max !== '' && value > Number(input.max)) return false;
  const step = input.step || 1, base = Number(input.min || 0);
  return step === 'any' || Math.abs((value - base) / Number(step) - Math.round((value - base) / Number(step))) < 1e-7;
};

async function fixture({saved, configuration, configurationAfterImport, actualRunner = false} = {}) {
  const {document, window} = parseHTML('<html lang="fr"><body></body></html>');
  const previous = {document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch};
  globalThis.document = document; let stored = saved ? JSON.stringify(saved) : null;
  globalThis.localStorage = {getItem: key => key === settingsKey ? stored : null, setItem(key, value) {if (key === settingsKey) stored = value;}};
  globalThis.fetch = async () => ({ok: true, json: async () => ({engineVersion: 'ui-protocol', engineCommit: 'pinned', runtimeSourceIncrementSha256: 'pinned'})});
  window.HTMLInputElement.prototype.checkValidity = window.HTMLInputElement.prototype.reportValidity = function () {return valid(this);};
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true,
    get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value ?? this.options[0]?.value ?? '';},
    set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  window.HTMLElement.prototype.showModal = function () {this.setAttribute('open', '');};
  window.HTMLElement.prototype.close = function () {this.removeAttribute('open');};
  const original = new Blob(['original bytes untouched'], {type: 'image/png'}), artifacts = new Map(); artifacts.dispose = async () => {};
  const image = {id: 'image', hash: 'same-scientific-pixels', name: 'figure.png', width: 32, height: 32,
    selected: true, family: 'photography', state: 'ready', runs: [], blob: original, thumbnail: original,
    occurrences: [{studyId: 'study', page: 1}], preparation: {status: 'ready', fingerprint: 'f'.repeat(64), regions: [], excluded: []}};
  const model = {images: [image], studies: [{id: 'study', name: 'paper-image.png', kind: 'image', blob: original, errors: []}],
    errors: [], artifacts, ...(configuration ? {configuration: structuredClone(configuration)} : {}), async clear() {},
    async import() {if (configurationAfterImport) model.configuration = structuredClone(configurationAfterImport);}};
  const recipes = [], nativeTasks = []; let source;
  // The production UI/runner/export protocols are exercised, with no decoder,
  // detector, native engine, model inference, filesystem or browser invoked.
  const tool = {get source() {return source;}, async load(input) {source = {id: input.id}; return source;},
    async run(task) {nativeTasks.push(structuredClone(task)); return {operation: task.operation,
      data: {params: task.params, points: new Float64Array(0), pairs: new Float64Array(0), groups: [], metadata: {}},
      provenance: {params: structuredClone(task.params), view: structuredClone(task.view)}, metrics: {}};},
    async export(format) {return new Blob([format]);}, cancel() {}, async dispose() {source = null;}};
  const runnerFactory = options => actualRunner ? createBatchRunner({...options, scientificFiltering: false, toolFactory: async () => tool})
    : {async run(value, selected) {recipes.push(structuredClone(selected)); value.results = [];}, async clear() {}, cancel() {}};
  let ui;
  try {ui = await mountBatchUI({document, language: () => 'fr', importerFactory: async () => model,
    preparationFactory: () => ({async prepare() {}, async dispose() {}}), resultDisplayFactory: unavailableResultDisplayFactory, runnerFactory});}
  catch (error) {Object.assign(globalThis, previous); throw error;}
  const card = () => ui.dialog.querySelector('[data-batch-tool="clone-2"]').closest('.batch-tool');
  const parameter = () => card().querySelector('[data-parameter="minimum"]');
  const low = () => card().querySelector('[data-batch-view="low"]');
  const confirm = () => [...ui.dialog.querySelectorAll('.batch-selection-bar button')].find(button => button.textContent === 'Confirmer la sélection').onclick();
  return {ui, image, model, document, original, artifacts, nativeTasks, recipes, card, parameter, low, confirm,
    get persisted() {return stored ? JSON.parse(stored) : null;},
    chooseOnlyClone2() {for (const check of ui.dialog.querySelectorAll('[data-batch-tool]')) {check.checked = check.dataset.batchTool === 'clone-2'; check.onchange();}},
    async dispose() {try {await ui.dispose();} finally {Object.assign(globalThis, previous);}}};
}

function assertNoResultCalculationFields(f) {
  const results = f.ui.dialog.querySelector('[data-batch-step="3"]');
  assert.equal(results.querySelector('[data-parameter="minimum"]'), null);
  assert.equal(results.querySelector('[data-batch-view="low"]'), null);
  assert.equal(results.querySelector('[data-batch-view="minimum"]'), null);
  for (const label of results.querySelectorAll('label')) assert.doesNotMatch(label.querySelector('span')?.textContent ?? '', /Séparation minimum|Longueur affichée min\./);
}

test('initial Analyses defaults distinguish separation seven, displayed length fifteen and four witnesses, with no duplicate Results fields', async () => {
  const f = await fixture();
  try {
    f.chooseOnlyClone2(); f.confirm();
    const analyses = f.ui.dialog.querySelector('[data-batch-step="2"]');
    assert.equal(analyses.hidden, false); assert.equal(Number(f.parameter().value), 7); assert.equal(Number(f.low().value), 15);
    assert.match(f.parameter().closest('label').textContent, /Séparation minimum/);
    assert.match(f.low().closest('label').textContent, /Longueur affichée min\./);
    assert.equal(f.card().querySelectorAll('[data-parameter="minimum"]').length, 1);
    assert.equal(f.card().querySelector('[data-batch-view="minimum"]'), null);
    const selected = f.persisted.recipes.find(recipe => recipe.id === 'clone-2');
    assert.equal(selected.params.minimum, 7); assert.equal(selected.view.low, 15); assert.equal(selected.view.minimum, 4);
    await f.ui.run(); assert.equal(f.recipes[0][0].params.minimum, 7); assert.equal(f.recipes[0][0].view.low, 15);
    assert.equal(batchTask(f.recipes[0][0]).view.minimum, 4); assertNoResultCalculationFields(f);
  } finally {await f.dispose();}
});

test('localStorage restores explicit length zero and separation ten through initial controls, persistence and execution', async () => {
  const f = await fixture({saved: savedSettings()});
  try {
    assert.equal(f.card().querySelector('[data-batch-tool]').checked, true);
    assert.equal(Number(f.parameter().value), 10); assert.equal(Number(f.low().value), 0);
    f.ui.open(); assert.equal(Number(f.parameter().value), 10); assert.equal(Number(f.low().value), 0);
    f.parameter().onchange(); f.low().onchange();
    const saved = f.persisted.recipes.find(recipe => recipe.id === 'clone-2');
    assert.equal(saved.params.minimum, 10); assert.equal(saved.view.low, 0); assert.equal(saved.view.minimum, 4);
    f.confirm(); await f.ui.run();
    assert.equal(f.recipes.length, 1); assert.equal(f.recipes[0].length, 1);
    assert.equal(f.recipes[0][0].params.minimum, 10); assert.equal(f.recipes[0][0].view.low, 0);
    assert.equal(f.recipes[0][0].view.minimum, 4); assertNoResultCalculationFields(f);
  } finally {await f.dispose();}
});

test('an imported batch configuration restores its explicit length zero and separation ten when no local preference exists', async () => {
  const configuration = savedSettings(), before = structuredClone(configuration), f = await fixture({configuration});
  try {
    assert.equal(f.card().querySelector('[data-batch-tool]').checked, true, 'Retain the configured method from the imported lot');
    assert.equal(Number(f.parameter().value), 10); assert.equal(Number(f.low().value), 0);
    f.confirm(); await f.ui.run();
    assert.equal(f.recipes[0].length, 1); assert.equal(f.recipes[0][0].params.minimum, 10); assert.equal(f.recipes[0][0].view.low, 0);
    assert.equal(f.recipes[0][0].view.minimum, 4); assert.deepEqual(f.model.configuration, before);
    assertNoResultCalculationFields(f);
  } finally {await f.dispose();}
});

test('importing a saved lot after the interface opened restores its initial analysis controls and exact overrides', async () => {
  const configuration = savedSettings(), f = await fixture({configurationAfterImport: configuration});
  try {
    assert.equal(Number(f.parameter().value), 7); assert.equal(Number(f.low().value), 15);
    await f.ui.importFiles([{name: 'saved-batch.zip'}]);
    assert.equal(f.card().querySelector('[data-batch-tool]').checked, true);
    assert.equal(Number(f.parameter().value), 10); assert.equal(Number(f.low().value), 0);
    f.confirm(); await f.ui.run();
    assert.equal(f.recipes[0].length, 1); assert.equal(f.recipes[0][0].params.minimum, 10);
    assert.equal(f.recipes[0][0].view.low, 0); assert.equal(f.recipes[0][0].view.minimum, 4);
    assert.deepEqual(f.model.configuration, configuration); assertNoResultCalculationFields(f);
  } finally {await f.dispose();}
});

test('the imported archive configuration takes priority over unrelated local preferences at mount and after import', async () => {
  for (const afterOpen of [false, true]) {
    const configuration = savedSettings(), other = catalogRecipe('clone-3'); other.params.minimum = 18; other.view.low = 23;
    const saved = {recipes: [other], options: {basis: 'clones', threshold: 1, reuse: true}};
    const f = await fixture({saved, ...(afterOpen ? {configurationAfterImport: configuration} : {configuration})});
    try {
      if (afterOpen) {
        assert.equal(f.ui.dialog.querySelector('[data-batch-tool="clone-3"]').checked, true);
        await f.ui.importFiles([{name: 'saved-batch.zip'}]);
      }
      assert.equal(f.card().querySelector('[data-batch-tool]').checked, true);
      assert.equal(f.ui.dialog.querySelector('[data-batch-tool="clone-3"]').checked, false);
      assert.equal(Number(f.parameter().value), 10); assert.equal(Number(f.low().value), 0);
      f.confirm(); await f.ui.run(); assert.equal(f.recipes[0].length, 1);
      assert.equal(f.recipes[0][0].id, 'clone-2'); assert.equal(f.recipes[0][0].params.minimum, 10);
      assert.equal(f.recipes[0][0].view.low, 0); assert.equal(f.recipes[0][0].view.minimum, 4);
      assert.deepEqual(f.model.configuration, configuration); assertNoResultCalculationFields(f);
    } finally {await f.dispose();}
  }
});

test('an explicit empty tool selection remains empty from saved settings and an archive, and cannot start a runner', async () => {
  for (const values of [{saved: {recipes: [], options: {basis: 'total'}}},
    {saved: savedSettings(), configuration: {recipes: [], options: {basis: 'total'}}}]) {
    const f = await fixture(values);
    try {
      assert.equal([...f.ui.dialog.querySelectorAll('[data-batch-tool]')].filter(node => node.checked).length, 0);
      f.ui.open(); assert.equal([...f.ui.dialog.querySelectorAll('[data-batch-tool]')].filter(node => node.checked).length, 0);
      f.confirm(); await f.ui.run(); assert.equal(f.recipes.length, 0); assert.equal(f.nativeTasks.length, 0);
      assert.match(f.ui.dialog.querySelector('.batch-status').textContent, /Choisissez au moins un outil/);
      if (values.configuration) assert.deepEqual(f.model.configuration.recipes, []);
      assertNoResultCalculationFields(f);
    } finally {await f.dispose();}
  }
});

test('initial UI overrides propagate exactly into snapshots, reuse and archive JSON without any native analysis or model', async () => {
  const f = await fixture({saved: savedSettings(), actualRunner: true});
  try {
    f.confirm(); await f.ui.run(); assert.equal(f.nativeTasks.length, 1);
    assert.equal(f.nativeTasks[0].params.minimum, 10); assert.equal(f.nativeTasks[0].view.low, 0); assert.equal(f.nativeTasks[0].view.minimum, 4);
    const run = f.image.runs[0]; assert.equal(run.status, 'done');
    assert.equal(run.params.minimum, 10); assert.equal(run.effectiveParams.minimum, 10); assert.equal(run.view.low, 0); assert.equal(run.effectiveView.low, 0);
    assert.equal(f.model.configuration.recipes[0].params.minimum, 10); assert.equal(f.model.configuration.recipes[0].view.low, 0);
    await f.ui.run(); assert.equal(f.image.reused, true); assert.equal(f.nativeTasks.length, 1);
    const exported = new Map();
    await batchArchive(f.model, {dependencies: {
      libraryLoader: async () => ({pdf: {}}), report: async () => new Blob(['report fixture']),
      imageExporterFactory: () => ({async convert(blob) {return {blob, conversion: {format: 'png', scientificPixelsPreserved: true}};}, async dispose() {}}),
      zipWriter: async entries => {for (const entry of entries) exported.set(entry.path, await entry.read()); return new Blob(['archive fixture']);},
    }});
    const inventory = JSON.parse(await exported.get('sherloq-batch.json').text());
    assert.equal(inventory.configuration.recipes[0].params.minimum, 10); assert.equal(inventory.configuration.recipes[0].view.low, 0);
    assert.equal(inventory.configuration.recipes[0].view.minimum, 4); assert.equal(inventory.images[0].runs[0].effectiveView.low, 0);
    const evidencePath = inventory.images[0].runs[0].files.find(path => path.endsWith('.json'));
    const evidence = JSON.parse(await exported.get(evidencePath).text());
    assert.equal(evidence.params.minimum, 10); assert.equal(evidence.effectiveParams.minimum, 10);
    assert.equal(evidence.view.low, 0); assert.equal(evidence.effectiveView.low, 0); assert.equal(evidence.effectiveView.minimum, 4);
    f.low().value = '15'; f.low().onchange();
    assert.equal(f.model.configuration.recipes[0].view.low, 0, 'Editing the next run cannot mutate the previous configuration');
    await f.ui.run(); assert.equal(f.image.reused, false); assert.equal(f.nativeTasks.length, 2);
    assert.equal(f.nativeTasks[1].params.minimum, 10); assert.equal(f.nativeTasks[1].view.low, 15); assert.equal(f.nativeTasks[1].view.minimum, 4);
    assert.equal(f.image.history[0].configuration.recipes[0].view.low, 0); assert.equal(f.image.history[0].runs[0].effectiveView.low, 0);
    assert.equal(f.image.blob, f.original); assertNoResultCalculationFields(f);
  } finally {await f.dispose();}
});
