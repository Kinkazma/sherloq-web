import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {createWorkspaceEnginePool} from '../sherloq-browser/assets/workspace-engine-pool.js';
import {createSegmentationAdapter} from '../../engine-source/src/segmentation-adapter.js';
import {SEGMENTATION_MODELS} from '../../engine-source/experiments/segmentation/models.js';
import {EngineError, checkAbort, requireValue} from '../../engine-source/src/errors.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => resolve = done); return {promise, resolve};};
const variants = ['mgcfdn', 'selfdm-proposal', 'selfdm-map'];
const manifest = {segmentation: Object.fromEntries(variants.map(variant => {
  const model = SEGMENTATION_MODELS[variant];
  return [variant, {bytes: model.bytes, sha256: model.sha256, url: `https://example.test/models/${variant}`}];
}))};
const model = variant => ({...manifest.segmentation[variant], variant, url: `https://example.test/models/${variant}`});
const task = (id, variant) => ({id, operation: 'ai.clones.segmentation', backend: 'auto',
  params: {variant, selectionPresent: true}, regions: [{id: 'region', kind: 'rectangle', bounds: [1, 1, 3, 2]}]});

async function resources(fn) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/integrated-config.json')) return {ok: true, json: async () => ({assetBase: './unified-assets/'})};
    if (url.endsWith('/individual-models.json')) return {ok: true, json: async () => manifest};
    throw Error('Unexpected model download: ' + url);
  };
  try {return await fn();} finally {globalThis.fetch = previousFetch;}
}

// Model configuration uses the real guarded adapter; no model, image or runtime
// is downloaded. Only inference is replaced by an observable ownership fixture.
function nativeFixture() {
  const adapter = createSegmentationAdapter({}), calls = [], inputs = new Map(), surfaces = new Map();
  let unloadFailure, runFailure, holdRun, disposed = 0;
  const engine = {
    async capabilities() {await turn(); calls.push(['capabilities', adapter.configured()]); return {
      operations: [{id: 'ai.clones.segmentation', configuredVariant: adapter.configured()}],
      memory: {budgetBytes: 4 * 1024 ** 3, retainedBytes: 36 * inputs.size, cacheBytes: 0, knownHeapCapacityBytes: 0},
    };},
    async loadBlob(input) {
      const surface = {id: input.id + '-rgb', revision: 1, width: 4, height: 3, format: 'rgb8'};
      const descriptor = {id: input.id, sha256: 'a'.repeat(64), surface};
      inputs.set(input.id, descriptor); surfaces.set(surface.id, new Uint8Array(36).fill(7));
      calls.push(['image-load', input.id]); return descriptor;
    },
    async unload(id) {calls.push(['image-unload', id]); const source = inputs.get(id); inputs.delete(id); surfaces.delete(source?.surface.id); await adapter.clearImages();},
    async loadSegmentationModel(input, hooks) {await turn(); calls.push(['model-load', input.variant]); return adapter.load(input, hooks);},
    async unloadSegmentationModel() {
      calls.push(['model-unload', adapter.configured()]);
      if (unloadFailure) {const error = unloadFailure; unloadFailure = null; throw error;}
      await adapter.dispose();
    },
    async run(input, hooks = {}) {
      requireValue(input.params.variant === adapter.configured(), 'Explicit configured segmentation variant required');
      requireValue(inputs.has(input.imageId), 'Original image retained'); checkAbort(hooks.signal);
      calls.push(['run', input.id, input.params.variant]);
      if (holdRun) await holdRun(input, hooks);
      checkAbort(hooks.signal);
      if (runFailure) {const error = runFailure; runFailure = null;
        if (error.imagesCleared) {inputs.clear(); surfaces.clear(); await adapter.dispose();}
        throw error;
      }
      const surface = {id: input.id + '-map', revision: 1, width: 4, height: 3, format: 'rgb8'};
      surfaces.set(surface.id, new Uint8Array(36).fill(input.params.variant === 'mgcfdn' ? 31 : 47));
      return {id: input.id, imageId: input.imageId, operation: input.operation, status: 'ok', surface, provenance: {params: input.params, regions: input.regions, backend: input.backend}};
    },
    async readPixels({surfaceId}) {requireValue(surfaces.has(surfaceId), 'Result surface retained'); return {pixels: {width: 4, height: 3, format: 'rgb8', data: surfaces.get(surfaceId)}};},
    async releaseSurface(id) {calls.push(['result-release', id]); surfaces.delete(id);},
    async releaseTable() {},
    async dispose() {disposed++; await adapter.dispose(); inputs.clear(); surfaces.clear();},
  };
  return {engine, adapter, calls, inputs, surfaces, get disposed() {return disposed;},
    failUnload(error) {unloadFailure = error;}, failRun(error) {runFailure = error;}, hold(fn) {holdRun = fn;}};
}

async function load(client, id) {return client.load({id, blob: new Blob(['local fixture'])});}

test('two individual documents reconcile the real variant and keep each original and previous output', () => resources(async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine);
  const a = await createToolClient({engineFactory: factory}), b = await createToolClient({engineFactory: factory});
  try {
    await load(a, 'a'); await load(b, 'b');
    const submitted = task('mgcf-first', 'mgcfdn'), before = structuredClone(submitted);
    const first = await a.run(submitted); await b.run(task('selfdm-next', 'selfdm-proposal'));
    assert.deepEqual(submitted, before);
    assert.deepEqual(first.provenance, {params: before.params, regions: before.regions, backend: before.backend});
    assert.equal((await a.readWindow(first.surface, {x: 0, y: 0, width: 4, height: 3})).data[0], 31);
    assert.equal(a.source.id, 'a'); assert.equal(b.source.id, 'b');
    await a.run(task('mgcf-return', 'mgcfdn'));
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [
      ['model-load', 'mgcfdn'], ['model-unload', 'mgcfdn'], ['model-load', 'selfdm-proposal'],
      ['model-unload', 'selfdm-proposal'], ['model-load', 'mgcfdn'],
    ]);
  } finally {await a.dispose(); await b.dispose();}
  assert.equal(fixture.disposed, 1);
}));

test('concurrent documents configure and run atomically on their shared engine', () => resources(async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine);
  const a = await createToolClient({engineFactory: factory}), b = await createToolClient({engineFactory: factory});
  try {
    await load(a, 'a'); await load(b, 'b');
    const results = await Promise.all([a.run(task('a-task', 'mgcfdn')), b.run(task('b-task', 'selfdm-proposal'))]);
    assert.ok(results.every(result => result.status === 'ok'));
    assert.deepEqual(fixture.calls.filter(([name]) => ['capabilities', 'model-load', 'model-unload', 'run'].includes(name)), [
      ['capabilities', null], ['model-load', 'mgcfdn'], ['run', 'a-task', 'mgcfdn'],
      ['capabilities', 'mgcfdn'], ['model-unload', 'mgcfdn'], ['model-load', 'selfdm-proposal'], ['run', 'b-task', 'selfdm-proposal'],
    ]);
  } finally {await a.dispose(); await b.dispose();}
}));

test('another document can reuse the configured model without unloading or loading it again', () => resources(async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine);
  const a = await createToolClient({engineFactory: factory}), b = await createToolClient({engineFactory: factory});
  try {
    await load(a, 'a'); await load(b, 'b');
    await a.run(task('a-task', 'mgcfdn')); await b.run(task('b-task', 'mgcfdn'));
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [['model-load', 'mgcfdn']]);
  } finally {await a.dispose(); await b.dispose();}
}));

test('a replacement tool document reconciles a model retained after unloading the previous image', () => resources(async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine), anchor = factory({computeProfile: 'maximum'});
  const previous = await createToolClient({engineFactory: factory}); let replacement;
  try {
    await load(previous, 'previous'); await previous.run(task('previous-task', 'mgcfdn')); await previous.dispose();
    assert.equal(fixture.inputs.size, 0); assert.equal(fixture.adapter.configured(), 'mgcfdn'); assert.equal(fixture.disposed, 0);
    replacement = await createToolClient({engineFactory: factory}); await load(replacement, 'replacement');
    assert.equal((await replacement.run(task('replacement-task', 'selfdm-proposal'))).status, 'ok');
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [
      ['model-load', 'mgcfdn'], ['model-unload', 'mgcfdn'], ['model-load', 'selfdm-proposal'],
    ]);
  } finally {await previous.dispose(); await replacement?.dispose(); await anchor.dispose();}
  assert.equal(fixture.disposed, 1);
}));

for (const shared of [false, true]) test(`${shared ? 'shared' : 'standalone'} client retries a failed unload using the retained native configuration`, () => resources(async () => {
  const fixture = nativeFixture(), factory = shared ? createWorkspaceEnginePool(() => fixture.engine) : () => fixture.engine;
  const client = await createToolClient({engineFactory: factory});
  try {
    await load(client, 'source'); await client.run(task('first', 'mgcfdn'));
    const failure = new EngineError('BUSY', 'Native cleanup refused'); fixture.failUnload(failure);
    await assert.rejects(client.run(task('change', 'selfdm-proposal')), error => error === failure);
    assert.equal(fixture.adapter.configured(), 'mgcfdn'); assert.equal(client.source.id, 'source');
    assert.equal((await client.run(task('retry', 'selfdm-proposal'))).status, 'ok');
    assert.equal(fixture.calls.filter(([name]) => name === 'model-unload').length, 2);
    assert.deepEqual(fixture.calls.filter(([name]) => name === 'model-load'), [['model-load', 'mgcfdn'], ['model-load', 'selfdm-proposal']]);
  } finally {await client.dispose();}
}));

test('a same-variant inference retry preserves the model, source, scientific parameters and resource options', () => resources(async () => {
  const fixture = nativeFixture(), received = [], hints = {cpuThreads: 10};
  const client = await createToolClient({memoryBudgetBytes: 4 * 1024 ** 3, resourceHints: hints,
    engineFactory: options => {received.push(options); return fixture.engine;}});
  try {
    await load(client, 'source'); fixture.failRun(new EngineError('MEMORY_LIMIT', 'Declared native admission failure'));
    const submitted = task('first', 'selfdm-proposal');
    await assert.rejects(client.run(submitted), error => error.code === 'MEMORY_LIMIT');
    assert.equal((await client.run({...submitted, id: 'retry'})).status, 'ok');
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [['model-load', 'selfdm-proposal']]);
    assert.deepEqual(received, [{computeProfile: 'maximum', memoryBudgetBytes: 4 * 1024 ** 3, resourceHints: hints}]);
    assert.deepEqual(client.result.provenance.params, submitted.params); assert.equal(client.source.id, 'source');
  } finally {await client.dispose();}
}));

test('a cancelled queued transaction does not change the active document model and can retry', () => resources(async () => {
  const fixture = nativeFixture(), entered = deferred(), finish = deferred(), factory = createWorkspaceEnginePool(() => fixture.engine);
  fixture.hold(async input => {if (input.id === 'active') {entered.resolve(); await finish.promise;}});
  const a = await createToolClient({engineFactory: factory}), b = await createToolClient({engineFactory: factory});
  try {
    await load(a, 'a'); await load(b, 'b');
    const active = a.run(task('active', 'mgcfdn')); await entered.promise;
    const pending = b.run(task('cancelled', 'selfdm-proposal')); await turn(); b.cancel();
    const rejected = assert.rejects(pending, error => error.code === 'CANCELLED'); finish.resolve();
    await active; await rejected;
    assert.equal(fixture.adapter.configured(), 'mgcfdn');
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [['model-load', 'mgcfdn']]);
    assert.equal((await b.run(task('retry', 'selfdm-proposal'))).status, 'ok');
  } finally {finish.resolve(); await a.dispose(); await b.dispose();}
}));

test('cancelling active inference releases the queue and preserves the original for a different-variant retry', () => resources(async () => {
  const fixture = nativeFixture(), entered = deferred(), finish = deferred(), factory = createWorkspaceEnginePool(() => fixture.engine);
  fixture.hold(async input => {if (input.id === 'active') {entered.resolve(); await finish.promise;}});
  const client = await createToolClient({engineFactory: factory});
  try {
    await load(client, 'source'); const active = client.run(task('active', 'mgcfdn')); await entered.promise;
    const rejected = assert.rejects(active, error => error.code === 'CANCELLED'); client.cancel(); finish.resolve(); await rejected;
    assert.equal(client.source.id, 'source'); assert.equal(fixture.adapter.configured(), 'mgcfdn');
    assert.equal((await client.run(task('retry', 'selfdm-proposal'))).status, 'ok');
    assert.deepEqual(fixture.calls.filter(([name]) => name.startsWith('model-')), [
      ['model-load', 'mgcfdn'], ['model-unload', 'mgcfdn'], ['model-load', 'selfdm-proposal'],
    ]);
  } finally {finish.resolve(); await client.dispose();}
}));

test('closing a queued pool scope cancels its transaction without releasing another document output', async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine), a = factory({}), b = factory({});
  const entered = deferred(), finish = deferred();
  fixture.hold(async input => {if (input.id === 'active') {entered.resolve(); await finish.promise;}});
  try {
    await a.loadBlob({id: 'a', blob: new Blob(['a'])}); await b.loadBlob({id: 'b', blob: new Blob(['b'])});
    const active = a.runConfiguredSegmentation({...task('active', 'mgcfdn'), imageId: 'a'}, model('mgcfdn'), {});
    await entered.promise;
    const pending = b.runConfiguredSegmentation({...task('closed', 'selfdm-proposal'), imageId: 'b'}, model('selfdm-proposal'), {});
    const closed = b.dispose(), rejected = assert.rejects(pending, error => error.code === 'CANCELLED'); finish.resolve();
    const result = await active; await rejected; await closed;
    assert.equal((await a.readPixels({surfaceId: result.surface.id})).pixels.data[0], 31);
    assert.equal(fixture.disposed, 0); assert.equal(fixture.inputs.has('a'), true);
  } finally {finish.resolve(); await a.dispose(); await b.dispose();}
  assert.equal(fixture.disposed, 1);
});

test('separate pool engines keep independent admission and can compute simultaneously', async () => {
  const fixtures = [], factory = createWorkspaceEnginePool(() => {const fixture = nativeFixture(); fixtures.push(fixture); return fixture.engine;});
  const a = factory({memoryBudgetBytes: 1024 ** 3}), b = factory({memoryBudgetBytes: 2 * 1024 ** 3});
  const entered = [deferred(), deferred()], finish = deferred();
  fixtures.forEach((fixture, i) => fixture.hold(async () => {entered[i].resolve(); await finish.promise;}));
  try {
    await a.loadBlob({id: 'a', blob: new Blob(['a'])}); await b.loadBlob({id: 'b', blob: new Blob(['b'])});
    const active = a.runConfiguredSegmentation({...task('a-task', 'mgcfdn'), imageId: 'a'}, model('mgcfdn'), {});
    await entered[0].promise;
    const parallel = b.runConfiguredSegmentation({...task('b-task', 'selfdm-proposal'), imageId: 'b'}, model('selfdm-proposal'), {});
    await entered[1].promise; finish.resolve(); await Promise.all([active, parallel]);
  } finally {finish.resolve(); await a.dispose(); await b.dispose();}
});

test('shared worker invalidation resets all sources; reload and retry read the new model state', () => resources(async () => {
  const fixture = nativeFixture(), factory = createWorkspaceEnginePool(() => fixture.engine), invalidations = [];
  const a = await createToolClient({engineFactory: factory, onInvalidated: event => invalidations.push(['a', event])});
  const b = await createToolClient({engineFactory: factory, onInvalidated: event => invalidations.push(['b', event])});
  try {
    await load(a, 'a'); await load(b, 'b'); await a.run(task('first', 'mgcfdn'));
    fixture.failRun(Object.assign(new EngineError('WORKER_FAILED', 'Worker reset'), {imagesCleared: true}));
    await assert.rejects(b.run(task('failed', 'selfdm-proposal')), error => error.imagesCleared);
    assert.equal(a.source, null); assert.equal(b.source, null); assert.equal(a.result, null);
    assert.deepEqual(invalidations, [['a', {resultLost: true}], ['b', {resultLost: false}]]);
    await load(b, 'b'); assert.equal((await b.run(task('retry', 'selfdm-proposal'))).status, 'ok');
  } finally {await a.dispose(); await b.dispose();}
}));
