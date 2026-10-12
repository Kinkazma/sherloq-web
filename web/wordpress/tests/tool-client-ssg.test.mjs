import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {SSG_DEFAULTS, cloneOperation, isDenseClone} from '../sherloq-browser/assets/clone-methods.js';
import {sparseParameters} from '../sherloq-browser/assets/sparse-controls.js';

test('general clone tool loads the same pinned SSG resource catalog once and preserves its native task', async () => {
  const previousFetch = globalThis.fetch, fetched = [], loaded = [], tasks = [];
  const model = {url: '../individual-assets/m3/ssg/forest-manifest.json', bytes: 4266,
    sha256: 'b428fe9626dfd59ea3161e2b79786b2a4713e13770e8d75c80477b5805f57157'};
  const original = {id: 'source', sha256: 'a'.repeat(64), surface: {id: 'source-rgb', revision: 1, width: 48, height: 48, format: 'rgb8'}};
  let created = 0;
  globalThis.fetch = async input => {
    const url = String(input); fetched.push(url);
    if (url.endsWith('/integrated-config.json')) return {ok: true, json: async () => ({assetBase: './unified-assets/'})};
    if (url.endsWith('/individual-models.json')) return {ok: true, json: async () => ({m3: {'ssg-edges': model}})};
    throw Error('Unexpected resource fetch; SSG does not use legacy OCR: ' + url);
  };
  const engine = {
    async loadBlob() {return original;},
    async loadM3Models(resources) {loaded.push(resources);},
    async run(task) {tasks.push(task); return {operation: task.operation, status: 'ok', data: {params: task.params}};},
    async dispose() {},
  };
  let client;
  try {
    client = await createToolClient({computeProfile: 'maximum', engineFactory: options => {
      created++; assert.equal(options.computeProfile, 'maximum'); return engine;
    }});
    await client.load({id: 'source', blob: new Blob(['protocol fixture'])});
    assert.equal(isDenseClone('SSG'), false);
    const operation = cloneOperation('SSG'); assert.equal(operation, 'tampering.copyMove.sparse');
    const regions = [{x0: 1.25, y0: 2.5, x1: 44.75, y1: 43.125}];
    const params = sparseParameters({algorithm: 'SSG', ...SSG_DEFAULTS, maskThreshold: .423}, regions);
    const task = {id: 'ssg-tool', operation, params, backend: 'auto'}, before = structuredClone(task);
    await client.run(task); await client.run({...task, id: 'ssg-tool-again'});
    assert.equal(created, 1);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].models['ssg-edges'].bytes, model.bytes);
    assert.equal(loaded[0].models['ssg-edges'].sha256, model.sha256);
    assert.ok(loaded[0].models['ssg-edges'].url.endsWith('/individual-assets/m3/ssg/forest-manifest.json'));
    assert.equal(Object.hasOwn(loaded[0], 'language'), false);
    assert.equal(fetched.length, 2);
    assert.deepEqual(tasks[0], {...before, imageId: 'source'});
    assert.deepEqual(task, before);
    assert.equal(client.source, original);
  } finally {await client?.dispose(); globalThis.fetch = previousFetch;}
});
