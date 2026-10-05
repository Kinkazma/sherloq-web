import test from 'node:test';
import assert from 'node:assert/strict';
import {createD2prlAdapter} from '../src/d2prl-adapter.js';
import {D2PRL_MODEL_IDENTITY} from '../src/d2prl-model-identity.js';
import {Budget} from '../src/cache.js';

const input = {...D2PRL_MODEL_IDENTITY, url: 'https://models.invalid/model.json'};
const setup = () => {
  const budget = new Budget(8 * 1024 ** 2);
  return {budget, adapter: createD2prlAdapter({budget, profile: {maxWorkers: 1}, version: 'test'})};
};

test('D2PRL rejects unqualified identities and relative URLs before fetching or reserving', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {requests++; throw Error('Unexpected fetch');});
  const {adapter, budget} = setup();
  await assert.rejects(adapter.load({...input, sha256: '0'.repeat(64)}), {code: 'MODEL_IDENTITY'});
  await assert.rejects(adapter.load({...input, bytes: input.bytes + 1}), {code: 'MODEL_IDENTITY'});
  await assert.rejects(adapter.load({...input, url: 'model.json'}), {code: 'INVALID_INPUT'});
  assert.equal(requests, 0);
  assert.equal(budget.total(), 0);
  assert.equal(adapter.configured(), false);
  await adapter.dispose();
});

test('D2PRL verifies actual manifest bytes and releases failed admissions for retry', async t => {
  const {adapter, budget} = setup();
  let body = new Uint8Array(input.bytes);
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  await assert.rejects(adapter.load(input), {code: 'MODEL_IDENTITY'});
  assert.equal(budget.total(), 0);
  body = body.subarray(0, body.length - 1);
  await assert.rejects(adapter.load(input), {code: 'MODEL_IDENTITY'});
  assert.equal(budget.total(), 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.load(input, {signal: controller.signal}), {code: 'CANCELLED'});
  assert.equal(budget.total(), 0);
  assert.equal(adapter.configured(), false);
  await adapter.dispose();
});

test('D2PRL manifest respects the shared budget before any network allocation', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {requests++; throw Error('Unexpected fetch');});
  const budget = new Budget(input.bytes), adapter = createD2prlAdapter({budget, profile: {maxWorkers: 1}, version: 'test'});
  await assert.rejects(adapter.load(input), {code: 'MEMORY_LIMIT'});
  assert.equal(requests, 0);
  assert.equal(budget.total(), 0);
  await adapter.dispose();
});
