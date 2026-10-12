import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createAutomaticDetectorProviders} from '../src/automatic-detector-providers.js';
import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';

test('automatic SIFT provider rejects an injected SSG algorithm before native computation or evidence preparation', async () => {
  const budget = new Budget(1024 ** 2), image = {width: 48, height: 48, format: 'rgb8', data: new Uint8Array(48 * 48 * 3)};
  let computed = 0;
  const providers = createAutomaticDetectorProviders({image, budget,
    sparse: {async analyze() {computed++; throw Error('Unqualified native execution');}},
    geometry: {biomeSides() {throw Error('Unqualified point evidence');}},
  });
  await assert.rejects(providers.sift.run({id: 'sift', enabled: true, params: {algorithm: 'SSG'}}, {plan: {cpu: false}}), error =>
    error.code === 'INVALID_INPUT' && /automatic SIFT.*sparse tool or batch for SSG/.test(error.message));
  assert.equal(computed, 0);
  assert.equal(budget.total(), 0);
});

test('all production automatic SIFT plans still reach their original shared sparse engine and resource hooks', async () => {
  const budget = new Budget(1024 ** 2), image = {width: 48, height: 48, format: 'rgb8', data: new Uint8Array(48 * 48 * 3)};
  const marker = new EngineError('TEST_CALLER_REACHED', 'Qualified sparse caller reached; no fabricated scientific result.');
  const resources = {models: {retained: {sha256: 'a'.repeat(64)}}, language: {sha256: 'b'.repeat(64)}};
  let calls = 0, expectedPlan;
  const providers = createAutomaticDetectorProviders({image, budget, sparseOptions: resources,
    sparse: {async analyze(params, hooks) {
      calls++; assert.deepEqual(params, expectedPlan.jobs.find(job => job.id === 'sift').params);
      assert.equal(hooks.models, resources.models); assert.equal(hooks.language, resources.language);
      assert.equal(hooks.backend, expectedPlan.cpu ? 'cpu' : 'auto');
      throw marker;
    }}, geometry: {biomeSides() {throw Error('No scientific evidence fabricated');}},
  });
  const envelope = [[0, 0], [47, 0], [47, 47], [0, 47]];
  for (const complete of [false, true]) for (const cpu of [false, true]) {
    expectedPlan = automaticAnalysisPlan({width: 48, height: 48, regions: [envelope], envelope, complete, cpu});
    await assert.rejects(providers.sift.run(expectedPlan.jobs.find(job => job.id === 'sift'), {plan: expectedPlan}), error => error === marker);
  }
  assert.equal(calls, 4);
  assert.equal(budget.total(), 0);
});
