import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createD2prlAnalysis} from '../experiments/d2prl/analysis.js';

test('An evicted D2PRL raw grid cannot trigger inference through refilter or raw export', async () => {
  const budget = new Budget(16 * 1024 ** 2); let calls = 0;
  const original = new Float32Array(3 * 448 ** 2); original[0] = .25; original[448 ** 2] = -.125;
  const session = createD2prlAnalysis({budget, modelId: 'test-model', infer: async () => {calls++; return {raw: original, release() {}};}, project: {async run(input) {return {metadata: {exclusions: input.exclusions, zones: input.zones.map(({id, bounds}) => ({id, bounds}))}, release() {}};}}});
  const result = await session.run({pixels: {width: 8, height: 8, data: new Uint8Array(8 * 8 * 3)}, mode: 'whole-image', zones: [{id: 'whole', kind: 'whole-image', bounds: [0, 0, 8, 8]}]});
  const raw = session.readRaw(result.metadata.resultId); assert.deepEqual(raw.rawGrids[0].raw, original); raw.rawGrids[0].raw.fill(99); raw.release(); assert.equal(original[0], .25);
  const refiltered = await session.refilter({resultId: result.metadata.resultId, minimum: 0}); assert.equal(calls, 1);
  // A completed response may race a caller's cancellation. The stable analysis
  // token still authorizes a new filter, while obsolete result IDs stay invalid.
  const stable = await session.refilter({analysisId: result.metadata.analysisId, minimum: 17});
  assert.equal(stable.metadata.analysisId, result.metadata.analysisId); assert.notEqual(stable.metadata.resultId, result.metadata.resultId); assert.equal(calls, 1);
  assert.throws(() => session.refilter({resultId: result.metadata.resultId}), {code: 'INVALID_INPUT'});
  for (const key of [...budget.cache.keys()]) budget.remove(key);
  assert.throws(() => session.readRaw(stable.metadata.resultId), {code: 'CACHE_MISS'});
  await assert.rejects(session.refilter({analysisId: result.metadata.analysisId, minimum: 17}), {code: 'CACHE_MISS'});
  assert.equal(calls, 1); await session.dispose(); assert.equal(budget.total(), 0);
});

test('Memory pressure reclaims idle helper heaps before cached scientific results', () => {
  const budget = new Budget(100), idle = budget.reserve(80); budget.put('scientific-grid', {byteLength: 10});
  const unregister = budget.registerReclaimer(() => idle()), useful = budget.reserve(30);
  assert.ok(budget.get('scientific-grid')); assert.equal(budget.total(), 40);
  useful(); unregister(); budget.clear(); assert.equal(budget.total(), 0);
});
