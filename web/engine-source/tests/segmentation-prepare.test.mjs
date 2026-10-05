import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';

test('Segmentation preparation refuses memory before allocation and releases partial admission', async () => {
  const budget = new Budget(1), engine = createSegmentationPrepare({budget});
  const input = {width: 1, height: 1, data: new Uint8Array([12, 126, 249]), side: 256};
  await assert.rejects(engine.run(input), {code: 'MEMORY_LIMIT'}); assert.equal(budget.total(), 0);
  budget.limit = 100000; // Scratch fits but owned output does not.
  await assert.rejects(engine.run(input), {code: 'MEMORY_LIMIT'}); assert.equal(budget.total(), 0);
  budget.limit = 4 * 1024 ** 2;
  const result = await engine.run(input);
  assert.equal(result.tensor[0], Math.fround(12 / 255));
  assert.equal(result.tensor[256 ** 2], Math.fround(126 / 255));
  assert.equal(result.tensor[2 * 256 ** 2], Math.fround(249 / 255));
  result.release(); engine.dispose(); assert.equal(budget.total(), 0);
  await assert.rejects(engine.run(input), {code: 'INVALID_INPUT'});
});

test('Segmentation preparation cancellation keeps source bytes and permits retry', async () => {
  const budget = new Budget(16 * 1024 ** 2), engine = createSegmentationPrepare({budget}), controller = new AbortController();
  const data = Uint8Array.from({length: 31 * 17 * 3}, (_, i) => i % 256), original = data.slice();
  const input = {width: 31, height: 17, data, side: 512};
  const pending = engine.run(input, {signal: controller.signal});
  await assert.rejects(engine.run(input), {code: 'BUSY'});
  controller.abort(); await assert.rejects(pending, {code: 'CANCELLED'});
  assert.equal(budget.total(), 0); assert.deepEqual(data, original);
  const retry = await engine.run(input); assert.deepEqual(retry.shape, [1, 3, 512, 512]);
  retry.release(); engine.dispose(); assert.equal(budget.total(), 0);
});
