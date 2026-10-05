import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {segmentationProbabilities} from '../experiments/segmentation/probabilities.js';

test('Native sigmoid and source/target rules differ at exactly one half', async () => {
  const n = 256 ** 2, budget = new Budget(8 * 1024 ** 2), one = new Float32Array(n);
  one.set([.5, .5000000596046448, .4999999701976776]);
  const binary = await segmentationProbabilities({raw: one, side: 256, kind: 'sigmoid'}, {budget});
  assert.deepEqual([...binary.mask.subarray(0, 3)], [0, 1, 0]); assert.equal(binary.target, undefined); binary.release();
  const three = new Float32Array(3 * n); three.fill(1, 2 * n); three.set([.5, .4999999701976776, 0]); three.set([0, .4999999701976776, .5], n); three.set([.5, .000000059604644775390625, .5], 2 * n);
  const result = await segmentationProbabilities({raw: three, side: 256, kind: 'softmax'}, {budget});
  assert.deepEqual([...result.mask.subarray(0, 3)], [1, 0, 1]); // Union near one is not itself the binary decision.
  assert.equal(result.map[1], Math.fround(three[1] + three[n + 1]));
  assert.equal(result.target[0], .5); assert.equal(result.source[2], .5);
  result.target[0] = 0; assert.equal(three[0], .5); // Export/display edits cannot mutate the scientific grid.
  result.release(); assert.equal(budget.total(), 0);
});

test('Invalid probability, cancellation and partial budget failure release reservations', async () => {
  const budget = new Budget(8 * 1024 ** 2), raw = new Float32Array(256 ** 2); raw[5000] = NaN;
  const input = {raw, side: 256, kind: 'sigmoid'};
  await assert.rejects(segmentationProbabilities(input, {budget}), {code: 'INVALID_INPUT'}); assert.equal(budget.total(), 0);
  raw.fill(0); const controller = new AbortController(); controller.abort();
  await assert.rejects(segmentationProbabilities(input, {budget, signal: controller.signal}), {code: 'CANCELLED'}); assert.equal(budget.total(), 0);
  budget.limit = raw.byteLength + 1;
  await assert.rejects(segmentationProbabilities(input, {budget}), {code: 'MEMORY_LIMIT'}); assert.equal(budget.total(), 0);
});
