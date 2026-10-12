import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import evaluatorFactory from '../vendor/d2prl/evaluator-tiled.js';
import {createEvaluatorPool} from '../experiments/d2prl/evaluator-pool.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const moduleUrl = new URL('../vendor/d2prl/evaluator-tiled.js', import.meta.url).href;
const workerUrl = new URL('../experiments/d2prl/evaluator-worker.js', import.meta.url).href;
const bytes = value => new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
const digest = value => createHash('sha256').update(bytes(value)).digest('hex');

function field(side, channels, candidates) {
  const n = side * side;
  // Finite half values include both zero signs, subnormals and signed normals.
  const half = [0, 0x8000, 1, 0x03ff, 0x0400, 0x2c00, 0x3555, 0x3800, 0x3c00, 0xbc00, 0xb555, 0x4200];
  const features = Uint16Array.from({length: channels * n}, (_, i) => half[(Math.imul(i + 19, 1103515245) >>> 16) % half.length]);
  const offsetX = new Float32Array(candidates * n), offsetY = new Float32Array(candidates * n);
  for (let k = 0; k < candidates; k++) for (let i = 0; i < n; i++) {
    const at = k * n + i, x = i % side, y = Math.floor(i / side);
    offsetX[at] = Math.fround(((Math.imul(at + 3, 1664525) >>> 0) % ((side + 2) * 17)) / 17 - 1 - x);
    offsetY[at] = Math.fround(((Math.imul(at + 11, 22695477) >>> 0) % ((side + 2) * 13)) / 13 - 1 - y);
  }
  return {features, offsetX, offsetY, side, channels, candidates, referenceThreads: 8};
}

// Call the qualified WASM kernel directly on the complete field. This oracle
// does not use the worker's transport packing or its subkernel loop.
function direct(module, input) {
  const n = input.side * input.side, pointers = [];
  const allocate = length => {
    const pointer = module._malloc(length);
    assert.ok(pointer, 'Native oracle allocation refused');
    pointers.push(pointer);
    return pointer;
  };
  try {
    const fp = allocate(input.features.byteLength), xp = allocate(input.offsetX.byteLength), yp = allocate(input.offsetY.byteLength), out = allocate(8 * n);
    module.HEAPU8.set(bytes(input.features), fp);
    module.HEAPF32.set(input.offsetX, xp / 4);
    module.HEAPF32.set(input.offsetY, yp / 4);
    assert.equal(module._d2prl_evaluate_tile(fp, xp, yp, input.side, input.channels, input.candidates, 0, n, out, out + 4 * n, input.referenceThreads), 1);
    return {x: module.HEAPF32.slice(out / 4, out / 4 + n), y: module.HEAPF32.slice(out / 4 + n, out / 4 + 2 * n)};
  } finally {
    for (const pointer of pointers) module._free(pointer);
  }
}

async function pooled(input, tileSize) {
  const budget = new Budget(256 * 1024 ** 2), closing = [], messages = [];
  const workerFactory = () => {
    const worker = new Worker(new URL('./helpers/browser-module-worker.mjs', import.meta.url), {workerData: {module: workerUrl}});
    const adapter = {
      postMessage(data, transfer) {messages.push({type: data.type, begin: data.begin, end: data.end}); worker.postMessage(data, transfer);},
      terminate() {closing.push(worker.terminate());}
    };
    worker.on('message', data => adapter.onmessage?.({data}));
    worker.on('messageerror', () => adapter.onmessageerror?.({}));
    worker.on('error', error => adapter.onerror?.({message: error.message}));
    return adapter;
  };
  const pool = await createEvaluatorPool(moduleUrl, {budget, maxWorkers: 1, tileSize, workerFactory});
  let result;
  try {
    result = await pool.evaluate(input);
    assert.equal(pool.stats.tiles, Math.ceil(input.side ** 2 / tileSize));
    assert.equal(pool.stats.activeWorkers, 1);
  } finally {
    pool.dispose();
    await Promise.all(closing);
  }
  assert.equal(budget.total(), 0);
  assert.equal(getExecutionScheduler(budget).snapshot().active.cpu, 0);
  return {...result, messages};
}

test('native evaluator transport batches preserve every output bit and global thread tails', {timeout: 30000}, async t => {
  const pins = JSON.parse(await readFile(new URL('../vendor/d2prl/PINNED.json', import.meta.url), 'utf8'));
  for (const [name, identity] of Object.entries(pins.builds['evaluator-tiled'].files)) {
    const file = await readFile(new URL('../vendor/d2prl/' + name, import.meta.url));
    assert.equal(file.byteLength, identity.bytes, name + ' pinned size');
    assert.equal(digest(file), identity.sha256, name + ' pinned SHA256');
  }
  const module = await evaluatorFactory();
  // 8 is divisible by the native lane sizes. 17 and 65 exercise both softmax
  // tails in each reference-thread chunk and the final global reduction tail.
  // 65 also crosses 4096 and the final partial 512-pixel subkernel.
  let cases = 0, values = 0;
  for (const side of [8, 17, 65]) for (const channels of [36, 96]) for (const candidates of [1, 5, 13]) {
    const input = field(side, channels, candidates), names = ['features', 'offsetX', 'offsetY'], before = names.map(name => digest(input[name]));
    const expected = direct(module, input);
    for (const tileSize of [512, 4096]) {
      const actual = await pooled(input, tileSize), label = `${side}/${channels}/${candidates}/${tileSize}`;
      for (const axis of ['x', 'y']) assert.deepEqual(bytes(actual[axis]), bytes(expected[axis]), label + '/' + axis);
      assert.deepEqual(names.map(name => digest(input[name])), before, label + ' changed its borrowed inputs');
      const calls = actual.messages.filter(message => message.type === 'evaluate');
      assert.equal(calls.length, Math.ceil(side ** 2 / tileSize), label + ' RPC count');
      assert.equal(calls[0].begin, 0);
      assert.equal(calls.at(-1).end, side ** 2);
      for (let i = 1; i < calls.length; i++) assert.equal(calls[i].begin, calls[i - 1].end, label + ' global range continuity');
      cases++;
      values += 2 * side ** 2;
    }
  }
  t.diagnostic(`Exact native WASM output comparison: ${cases} worker cases, ${values} float32 values; no model inference or benchmark.`);
});

test('abort after useful native work terminates an unpublished transport group', {timeout: 15000}, async () => {
  const budget = new Budget(256 * 1024 ** 2), controller = new AbortController(), closing = [], kernels = [], replies = [];
  const input = field(65, 36, 5), before = ['features', 'offsetX', 'offsetY'].map(name => digest(input[name]));
  const barrier = new Int32Array(new SharedArrayBuffer(4));
  // This test-only gate pauses after the actual native kernel wrote its output,
  // before the worker can return the group. Only the control barrier is shared.
  const instrumentedModule = 'data:text/javascript,' + encodeURIComponent(`
    import {workerData} from 'node:worker_threads';
    import factory from ${JSON.stringify(moduleUrl)};
    export default async function() {
      const module = await factory(), evaluate = module._d2prl_evaluate_tile;
      let first = true;
      module._d2prl_evaluate_tile = (...args) => {
        const result = evaluate(...args);
        if (first) {
          first = false;
          self.postMessage({testKernel: {begin: args[6], end: args[7], result}});
          Atomics.wait(workerData.barrier, 0, 0, 5000);
        }
        return result;
      };
      return module;
    }
  `);
  const workerFactory = () => {
    const worker = new Worker(new URL('./helpers/browser-module-worker.mjs', import.meta.url), {workerData: {module: workerUrl, barrier}});
    const adapter = {postMessage: (data, transfer) => worker.postMessage(data, transfer), terminate: () => closing.push(worker.terminate())};
    worker.on('message', data => {
      if (data.testKernel) {kernels.push(data.testKernel); controller.abort();}
      else {replies.push(data); adapter.onmessage?.({data});}
    });
    worker.on('error', error => adapter.onerror?.({message: error.message}));
    return adapter;
  };
  const pool = await createEvaluatorPool(instrumentedModule, {budget, maxWorkers: 1, tileSize: 4096, workerFactory});
  let progress = 0;
  try {
    await assert.rejects(pool.evaluate(input, {signal: controller.signal, onProgress: () => progress++}), {code: 'CANCELLED'});
    assert.deepEqual(kernels, [{begin: 0, end: 512, result: 1}], 'A useful native 512-pixel kernel must precede cancellation');
    assert.equal(progress, 0, 'The interrupted group must not publish progress');
    assert.equal(replies.some(reply => reply.x || reply.y), false, 'No partial scientific plane is published');
    assert.deepEqual(['features', 'offsetX', 'offsetY'].map(name => digest(input[name])), before);
  } finally {
    Atomics.store(barrier, 0, 1);
    Atomics.notify(barrier, 0);
    pool.dispose();
    await Promise.all(closing);
  }
  assert.equal(budget.total(), 0);
  assert.equal(getExecutionScheduler(budget).snapshot().active.cpu, 0);
});
