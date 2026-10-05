import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentationZones} from '../experiments/segmentation/zones.js';

const input = () => ({width: 17, height: 13, side: 256, kind: 'sigmoid', mode: 'whole-image', zones: [{id: 'whole', bounds: [0, 0, 17, 13], raw: new Float32Array(256 ** 2)}]});

test('Unsupported native segmentation modes refuse before any spatial work', async () => {
  const budget = new Budget(16 * 1024 ** 2); let calls = 0;
  const projector = createSegmentationZones({budget, spatial: {run() {calls++; throw Error('Unexpected work');}}});
  await assert.rejects(projector.run({...input(), compare: true}), {code: 'INVALID_INPUT'});
  await assert.rejects(projector.run({...input(), exclusions: [[0, 0, 8, 8]]}), {code: 'INVALID_INPUT'});
  await assert.rejects(projector.run({...input(), zones: []}), {code: 'INVALID_INPUT'});
  assert.equal(calls, 0); assert.equal(budget.total(), 0);
});

test('A failing spatial job releases the projection and raw-grid reservations', async () => {
  const budget = new Budget(16 * 1024 ** 2), source = input(), projector = createSegmentationZones({budget, spatial: {async run() {throw Error('Backend failure');}}});
  await assert.rejects(projector.run(source), /Backend failure/); assert.equal(budget.total(), 0);
  // The lock must also have been released: a second request reaches the backend.
  await assert.rejects(projector.run(source), /Backend failure/); assert.equal(budget.total(), 0);
  assert.ok(source.zones[0].raw.every(value => value === 0));
});
