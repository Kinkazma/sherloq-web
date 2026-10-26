import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticClient} from '../sherloq-browser/assets/automatic-client.js';

const configuration = {assetBase: './unified-assets/', engineCommit: 'injected-test', englishSha256: 'a'.repeat(64)};
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

// This engine models independent image, result, presentation and archive owners.
// It never imports, downloads or executes a detector/model implementation.
async function harness() {
  const events = [], images = new Map(), surfaces = new Map(), archives = new Map();
  const models = new Set(), fetches = [];
  const state = {analysis: null, disposed: false, disposals: 0, serial: 0,
    failLoad: false, failUnload: false, retainNext: false, cropNext: false,
    archiveReleaseGate: null, archiveReleaseStarted: null};
  const record = (kind, id) => events.push({kind, ...(id === undefined ? {} : {id})});
  const open = () => assert.equal(state.disposed, false, 'engine calls must precede disposal');
  const source = id => {
    open();
    assert.ok(images.has(id), 'the imageId must name a live original, not its surface');
    return images.get(id);
  };
  const analysis = id => {
    open();
    assert.equal(state.analysis?.analysisId, id, 'analysis handle must be live and exact');
    source(state.analysis.imageId);
    return state.analysis;
  };
  const engine = {
    capabilities: async () => ({memory: {budgetBytes: 64 * 1024 ** 2}}),
    async loadBlob(input) {
      open();
      assert.equal(input.layout, 'segmented');
      assert.equal(images.size, 0, 'replacement must unload the previous original first');
      assert.equal(state.analysis, null);
      assert.equal(surfaces.size, 0);
      assert.equal(archives.size, 0);
      record('load', input.id);
      if (state.failLoad) throw Object.assign(Error('decode rejected'), {code: 'INVALID_IMAGE'});
      const revision = ++state.serial;
      const descriptor = {id: input.id, sha256: 'b'.repeat(64), width: 4, height: 2,
        surface: {id: `source-surface:${input.id}:${revision}`, revision, width: 4, height: 2, format: 'rgb8'}};
      images.set(input.id, descriptor);
      return descriptor;
    },
    async unload(id) {
      source(id);
      assert.equal(state.analysis, null, 'analysis must release before its original');
      assert.equal(surfaces.size, 0, 'maps and source-crop aliases must release before the original');
      assert.equal(archives.size, 0, 'archive ownership must settle before unload');
      record('unload', id);
      if (state.failUnload) throw Object.assign(Error('unload rejected'), {code: 'STORAGE_UNAVAILABLE'});
      images.delete(id);
    },
    async loadAutomaticModels() { open(); assert.equal(models.has('forgeryscope'), false); models.add('forgeryscope'); record('model', 'forgeryscope'); },
    async loadD2prlModel() { open(); assert.equal(models.has('d2prl'), false); models.add('d2prl'); record('model', 'd2prl'); },
    async loadM3Models() { open(); assert.equal(models.has('ocr'), false); models.add('ocr'); record('model', 'ocr'); },
    async run(task) {
      const original = source(task.imageId);
      assert.equal(state.analysis, null, 'one automatic result owns the source at a time');
      assert.deepEqual([...models].sort(), ['d2prl', 'forgeryscope', 'ocr']);
      const result = {analysisId: `analysis:${task.imageId}:${++state.serial}`, imageId: task.imageId,
        operation: task.operation, status: 'ok',
        data: {state: {states: {patchmatch: 'done'}, completed: ['patchmatch'], resumable: []}, entries: []}};
      state.analysis = result;
      record('run', result.analysisId);
      if (state.retainNext) {
        state.retainNext = false;
        result.data.state = {states: {patchmatch: 'cancelled'}, completed: [], resumable: ['patchmatch']};
        throw Object.assign(Error('paused with a retained result'), {code: 'CANCELLED', details: {
          retainedAnalysis: {analysisId: result.analysisId, state: result.data.state, completed: []}}});
      }
      if (state.cropNext) {
        state.cropNext = false;
        const crop = {id: `source-crop:${result.analysisId}`, revision: original.surface.revision,
          width: 3, height: 2, format: 'rgb8'};
        surfaces.set(crop.id, {kind: 'crop', imageId: task.imageId});
        result.sourceRegionSourceSurface = crop;
        result.sourceRegionDomain = {fingerprint: `crop:${result.analysisId}`};
      }
      return result;
    },
    async renderAutomatic(request) {
      const result = analysis(request.analysisId);
      const surface = {id: `render:${result.analysisId}:${++state.serial}`, revision: state.serial,
        width: 4, height: 2, format: 'int32'};
      surfaces.set(surface.id, {kind: 'render', imageId: result.imageId});
      record('render', surface.id);
      return {surface};
    },
    async releaseSurface(id) {
      open();
      assert.ok(surfaces.has(id), 'each owned presentation/crop handle releases exactly once');
      record('release-surface', id);
      surfaces.delete(id);
    },
    async releaseAutomatic() {
      open();
      assert.ok(state.analysis, 'release must name an acquired automatic result');
      assert.equal([...surfaces.values()].some(owner => owner.kind === 'render'), false,
        'rendered result must release before its automatic analysis');
      assert.equal(archives.size, 0);
      record('release-analysis', state.analysis.analysisId);
      state.analysis = null;
    },
    async exportAutomatic(request) {
      const result = analysis(request.analysisId);
      assert.equal(request.storage, 'temporary');
      const archive = {id: `archive:${result.analysisId}`, revision: ++state.serial, byteLength: 1024 * 1024 + 3};
      archives.set(archive.id, {...archive, imageId: result.imageId});
      record('export', archive.id);
      return archive;
    },
    async readExport(request) {
      open();
      const archive = archives.get(request.exportId);
      assert.ok(archive, 'archive must remain owned while chunks are read');
      source(archive.imageId);
      assert.equal(request.revision, archive.revision);
      assert.ok(request.offset >= 0 && request.offset + request.length <= archive.byteLength);
      record('read-export', request.offset);
      return {bytes: new Uint8Array(request.length).fill(7)};
    },
    async releaseExport(id) {
      open();
      assert.ok(archives.has(id));
      record('release-export-start', id);
      state.archiveReleaseStarted?.resolve();
      await state.archiveReleaseGate?.promise;
      assert.ok(archives.delete(id));
      record('release-export-end', id);
    },
    async dispose() {
      open();
      assert.equal(archives.size, 0, 'queued export must settle before engine disposal');
      record('dispose');
      state.disposals++;
      state.disposed = true;
      state.analysis = null;
      images.clear();
      surfaces.clear();
      models.clear();
    }
  };
  const fetcher = async url => {
    fetches.push(String(url));
    return {ok: true, json: async () => String(url).includes('neural-runtime/') ? {providers: {}} : {assets: {}},
      arrayBuffer: async () => new ArrayBuffer(1)};
  };
  const client = await createAutomaticClient({config: configuration, engineFactory: () => engine, fetcher});
  const load = id => client.load({id, blob: new Blob([id])});
  const run = id => client.run({imageId: id, operation: 'analysis.complete', params: {}});
  return {client, events, images, surfaces, archives, models, fetches, state, load, run, record};
}

test('automatic source replacement preserves configured models across A, B and same-id reload', async () => {
  const h = await harness();
  try {
    for (const id of ['A', 'B', 'B']) {
      const descriptor = await h.load(id);
      assert.equal(descriptor.id, id);
      assert.equal(h.client.source, descriptor);
      await h.run(id);
      assert.equal(h.images.size, 1);
    }
    assert.deepEqual(h.events.filter(event => event.kind === 'model').map(event => event.id), ['forgeryscope', 'd2prl', 'ocr']);
    assert.equal(h.fetches.length, 4, 'three manifest requests and the injected OCR bytes occur once');
    assert.deepEqual(h.events.filter(event => event.kind === 'unload').map(event => event.id), ['A', 'B']);
    assert.equal(h.client.source.id, 'B');
  } finally { await h.client.dispose(); }
});

test('replacement releases the rendered map, automatic result and source-crop alias before unloading', async () => {
  const h = await harness();
  try {
    await h.load('A');
    h.state.cropNext = true;
    const result = await h.run('A'), display = await h.client.display();
    const start = h.events.length;
    await h.load('B');
    assert.deepEqual(h.events.slice(start), [
      {kind: 'release-surface', id: display.id},
      {kind: 'release-analysis', id: result.analysisId},
      {kind: 'release-surface', id: result.sourceRegionSourceSurface.id},
      {kind: 'unload', id: 'A'}, {kind: 'load', id: 'B'}
    ]);
    assert.equal(h.client.result, null);
    assert.equal(h.client.checkpoint, null);
    assert.equal(h.surfaces.size, 0);
  } finally { await h.client.dispose(); }
});

test('replacement releases an unpublished retained checkpoint before unloading its original', async () => {
  const h = await harness();
  try {
    await h.load('A');
    h.state.retainNext = true;
    await assert.rejects(h.run('A'), {code: 'CANCELLED'});
    const id = h.client.checkpoint.analysisId, start = h.events.length;
    await h.load('B');
    assert.deepEqual(h.events.slice(start), [
      {kind: 'release-analysis', id}, {kind: 'unload', id: 'A'}, {kind: 'load', id: 'B'}
    ]);
    assert.equal(h.client.checkpoint, null);
  } finally { await h.client.dispose(); }
});

test('queued replacement waits for sink writes and asynchronous archive release before unloading', async () => {
  const h = await harness(), writeStarted = deferred(), writeGate = deferred();
  h.state.archiveReleaseStarted = deferred();
  h.state.archiveReleaseGate = deferred();
  let exporting, replacing;
  try {
    await h.load('A');
    await h.run('A');
    let writes = 0;
    exporting = h.client.exportTo({async write(bytes) {
      const index = writes++;
      h.record('sink-write-start', index);
      if (index === 0) { writeStarted.resolve(); await writeGate.promise; }
      assert.ok(bytes.every(value => value === 7));
      h.record('sink-write-end', index);
    }});
    await writeStarted.promise;
    replacing = h.load('B');
    await turn();
    assert.equal(writes, 1, 'the next export chunk must await the pending sink.write');
    assert.equal(h.events.some(event => event.kind === 'release-export-start'), false,
      'archive release cannot overtake a pending sink.write');
    assert.equal(h.events.some(event => event.kind === 'unload'), false);
    assert.equal(h.archives.size, 1);
    writeGate.resolve();
    await h.state.archiveReleaseStarted.promise;
    assert.equal(writes, 2);
    assert.equal(h.events.some(event => event.kind === 'unload'), false,
      'replacement must also wait for releaseExport, not only the last sink.write');
    h.state.archiveReleaseGate.resolve();
    await exporting;
    await replacing;
    const kinds = h.events.map(event => event.kind);
    assert.ok(kinds.lastIndexOf('sink-write-end') < kinds.indexOf('release-export-end'));
    assert.ok(kinds.indexOf('release-export-end') < kinds.indexOf('unload'));
    assert.equal(h.archives.size, 0);
    assert.equal(h.client.source.id, 'B');
  } finally {
    writeGate.resolve();
    h.state.archiveReleaseGate.resolve();
    await Promise.allSettled([exporting, replacing]);
    await h.client.dispose();
  }
});

test('a failed replacement load leaves no old source descriptor or owned original', async () => {
  const h = await harness();
  try {
    await h.load('A');
    await h.run('A');
    h.state.failLoad = true;
    await assert.rejects(h.load('B'), {code: 'INVALID_IMAGE'});
    assert.equal(h.client.source, null);
    assert.equal(h.client.result, null);
    assert.equal(h.client.checkpoint, null);
    assert.equal(h.images.size, 0);
    assert.deepEqual(h.events.filter(event => event.kind === 'unload').map(event => event.id), ['A']);
  } finally { await h.client.dispose(); }
});

test('an unload failure clears the source descriptor, skips the new load and remains disposable', async () => {
  const h = await harness();
  await h.load('A');
  await h.run('A');
  h.state.failUnload = true;
  try {
    await assert.rejects(h.load('B'), {code: 'STORAGE_UNAVAILABLE'});
    assert.equal(h.client.source, null);
    assert.equal(h.client.result, null);
    assert.equal(h.client.checkpoint, null);
    assert.equal(h.images.has('A'), true, 'failed native unload may still own the original');
    assert.deepEqual(h.events.filter(event => event.kind === 'load').map(event => event.id), ['A']);
  } finally { await h.client.dispose(); }
  assert.equal(h.state.disposals, 1);
  assert.equal(h.images.size, 0);
  assert.equal(h.client.source, null);
});

test('loads queued before or after dispose cannot create another original', async () => {
  const h = await harness();
  await h.load('A');
  const queued = h.load('B');
  const disposing = h.client.dispose();
  const after = h.load('C');
  await Promise.all([
    assert.rejects(queued, {code: 'CANCELLED'}),
    assert.rejects(after, {code: 'CANCELLED'}),
    disposing
  ]);
  await h.client.dispose();
  assert.deepEqual(h.events.filter(event => event.kind === 'load').map(event => event.id), ['A']);
  assert.equal(h.state.disposals, 1);
  assert.equal(h.images.size, 0);
  assert.equal(h.client.source, null);
});
