import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {boundGpuAdapter} from '../experiments/segmentation/gpu-budget.js';

test('GPU admission holds destroyed buffers until submitted work completes and rejects validation failures', async () => {
  let finish, lose, error = null;
  const submitted = new Promise(resolve => {finish = resolve;}), lost = new Promise(resolve => {lose = resolve;});
  const device = {lost, limits: {}, addEventListener() {}, pushErrorScope() {}, async popErrorScope() {return error;}, destroy() {lose();},
    queue: {writeBuffer() {}, onSubmittedWorkDone() {return submitted;}},
    createBuffer({size}) {return {size, destroy() {}, async mapAsync() {}};}};
  const adapter = {async requestDevice(spec) {assert.equal(spec.requiredLimits.maxStorageBuffersPerShaderStage, 8); return device;}}, budget = new Budget(128), gpu = boundGpuAdapter(adapter, budget);
  await adapter.requestDevice(); const buffer = device.createBuffer({size: 100});
  assert.throws(() => device.createBuffer({size: 32}), {code: 'MEMORY_LIMIT'});
  buffer.destroy(); assert.equal(budget.total(), 100); finish(); await submitted; await Promise.resolve(); assert.equal(budget.total(), 0);
  await gpu.begin(); error = {message: 'invalid shader'}; await assert.rejects(gpu.end(), {code: 'GPU_FAILED'});
  device.createBuffer({size: 128}); await gpu.dispose(); assert.equal(budget.total(), 0);
});
