import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import createModule from '../vendor/ssg-vlfeat/vlfeat.mjs';
import {Budget} from '../src/cache.js';
import {createSsgVlfeat} from '../src/ssg-vlfeat.js';
import {SsgFullEngine} from '../src/ssg-full.js';

const wasmBinary = await fs.readFile(new URL('../vendor/ssg-vlfeat/vlfeat.wasm', import.meta.url));

test('SSG rejected VLFeat loader calls do not publish checkpoints or poison the next native attempt', async () => {
  const budget = new Budget(128 * 1024 ** 2);
  const pixels = new Uint8Array(48 * 48 * 3).fill(90);
  const original = pixels.slice();
  const engine = new SsgFullEngine({format: 'rgb8', width: 48, height: 48, data: pixels}, budget, {maxWorkers: 4});
  const failure = new TypeError('Failed to fetch dynamically imported module: fixture://ssg-vlfeat/vlfeat.mjs');
  let factories = 0;
  engine.vlfeat.dispose();
  engine.vlfeat = createSsgVlfeat({budget, moduleFactory: async options => {
    if (++factories <= 2) throw failure;
    return createModule({...options, wasmBinary});
  }});
  // A uniform fixture has no matched words, so its complete empty detector
  // path does not need forest downloads. This tests application ownership and
  // recovery, not browser import-map recovery or real forest qualification.
  const params = {algorithm: 'SSG', normalizationLongEdge: 0};
  const hooks = {models: {'ssg-edges': {url: 'https://fixture.invalid/not-needed.json', bytes: 1, sha256: '0'.repeat(64)}}};
  let result;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await assert.rejects(engine.analyze(params, hooks), error => error === failure);
      assert.equal(factories, attempt);
      assert.equal(engine.running, false);
      assert.equal(engine.vlfeat.reservedBytes, 0);
      assert.equal(engine.vlfeat.residentBytes, 0);
      assert.equal(budget.total(), 0);
      assert.deepEqual(pixels, original);
    }
    result = await engine.analyze(params, hooks);
    assert.equal(factories, 3);
    assert.equal(result.status, 'ok');
    assert.equal(result.metadata.completeDetector, true);
    assert.equal(result.metadata.stageCache.nativeCheckpoint, false);
    assert.equal(result.metadata.stageCache.newVlfeat, 1);
    assert.equal(result.metadata.stageCache.newForest, 0);
    assert.equal(result.pairs.length, 0);
    assert.ok(result.mask.every(value => value === 0));
    result.release(); result = null;
    result = await engine.analyze(params, hooks);
    assert.equal(factories, 3);
    assert.equal(result.metadata.stageCache.nativeCheckpoint, true);
    assert.equal(result.metadata.stageCache.newVlfeat, 0);
    assert.deepEqual(pixels, original);
  } finally {
    result?.release();
    await engine.dispose();
  }
  assert.equal(budget.total(), 0);
});
