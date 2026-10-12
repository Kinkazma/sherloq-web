import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createSelfDMPrepare} from '../src/selfdm-prepare.js';
import {createSelfDMInference} from '../src/selfdm-inference.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {Budget} from '../src/cache.js';

const root = resolve(process.argv[2]), maxWorkers = Number(process.argv[3] ?? 4);
const reference = JSON.parse(await readFile(resolve(root, 'reference.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = async spec => {
  const bytes = await readFile(resolve(root, spec.file));
  if (bytes.byteLength !== spec.bytes || hash(bytes) !== spec.sha256) throw Error('Pinned file mismatch: ' + spec.file);
  return bytes;
};
const modelUrl = 'https://selfdm-local-qualification.invalid/selfdm-map-512.onnx', workers = [];
class BrowserWorker {
  constructor(endpoint) {
    this.native = new NodeWorker(new URL('./selfdm-pool-node-worker.mjs', import.meta.url), {workerData: {endpoint: endpoint.href, modelUrl, modelFile: resolve(root, reference.model.file)}});
    this.native.on('message', data => this.onmessage?.({data}));
    this.native.on('messageerror', error => this.onmessageerror?.({type: 'messageerror', error}));
    this.native.on('error', error => this.onerror?.({type: 'error', message: error.message, error, filename: endpoint.href}));
    workers.push(this);
  }
  postMessage(message, transfer) {this.native.postMessage(message, transfer);}
  terminate() {this.terminated = this.native.terminate();}
}
// Node has real shared memory. This marks that eligibility in the adapter;
// browser COOP/COEP and browser UI remain separate qualifications.
globalThis.crossOriginIsolated = true;
const budget = new Budget(1024 * 1024 ** 2), profile = {maxWorkers};
const model = {id: 'selfdm-initial-map-512-v1', family: 'selfdm', side: 512, kind: 'sigmoid', ...reference.model};
const inference = createSelfDMInference({budget, profile, model, modelUrl, workerFactory: url => new BrowserWorker(url)});
const scheduler = getExecutionScheduler(budget), records = [], started = performance.now();
const report = {schema: 1, scope: 'Actual common NeuralGraphPool/NeuralGraphWorker and admitted ORT WASM thread team under Node worker_threads; local pinned Response transport. Not a browser/UI/WebGPU qualification.', node: process.version, maxWorkers, model: reference.model, referenceSha256: hash(await readFile(resolve(root, 'reference.json'))), probabilityTolerance: 1e-3, allowedMaskChanges: 0};
try {
  for (const record of reference.records) {
    const rgb = await exact(record.rgb), [height, width] = record.rgb.shape, prepare = createSelfDMPrepare({budget});
    const prepared = await prepare.run({width, height, data: new Uint8Array(rgb), side: 512});
    let result;
    try {
      const preparationExact = hash(new Uint8Array(prepared.tensor.buffer)) === record.input.sha256;
      if (!preparationExact) throw Error('Native preparation mismatch');
      const progress = [];
      result = await inference.run(prepared.tensor, {onProgress(event) {progress.push({...event, cpuAdmitted: scheduler.snapshot().active.cpu});}});
      const bytes = await exact(record.probability), expected = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      let maxAbs = 0, nonfinite = 0, changed = 0, foreground = 0;
      for (let i = 0; i < expected.length; i++) {
        if (!Number.isFinite(result.raw[i]) || result.raw[i] < 0 || result.raw[i] > 1) nonfinite++;
        maxAbs = Math.max(maxAbs, Math.abs(result.raw[i] - expected[i])); changed += Number((result.raw[i] > .5) !== (expected[i] > .5)); foreground += Number(result.raw[i] > .5);
      }
      records.push({name: record.name, preparationExact, maxAbs, nonfinite, maskChanged: changed, foreground, rawSha256: hash(new Uint8Array(result.raw.buffer)), heapBytes: result.heapBytes, timings: result.timings, metrics: result.metrics, progress, residentBytes: inference.residentBytes, ort: result.ort});
      console.log(JSON.stringify(records.at(-1)));
      if (result.metrics.threads !== maxWorkers || result.metrics.cpuGranted !== maxWorkers || result.metrics.preflightExecutions || nonfinite || maxAbs > 1e-3 || changed) throw Error('Common-pool native parity or real admission failed');
    } finally {result?.release(); prepared.release(); prepare.dispose();}
  }
  if (workers.length !== 1) throw Error('Same model did not reuse its initialized worker');
  report.status = 'native-and-common-wasm-thread-team-qualified';
} catch (error) {report.status = 'failed'; report.error = {name: error.name, code: error.code, message: error.message, stack: error.stack, details: error.details, cause: error.cause && {name: error.cause.name, message: error.cause.message}}; process.exitCode = 1;}
finally {
  inference.dispose(); await Promise.allSettled(workers.map(worker => worker.terminated));
  report.records = records; report.elapsedMs = performance.now() - started; report.workerStarts = workers.length; report.scheduler = scheduler.snapshot(); report.memoryAfterDispose = budget.snapshot();
  if (budget.total() !== 0 || report.scheduler.active.cpu !== 0 || report.scheduler.queued !== 0) {report.status = 'failed-resource-release'; process.exitCode = 1;}
  report.sources = {};
  for (const name of ['../src/selfdm-inference.js', '../src/selfdm-runtime-factory.mjs', '../src/selfdm-prepare.js', '../src/neural-graph-pool.js', '../src/neural-graph-worker.js', '../src/execution-scheduler.js', '../vendor/m3-ort/factory.mjs', '../vendor/m3-ort/ort-wasm-simd-threaded.mjs', '../vendor/d2prl/ort-wasm-simd-threaded.wasm', './selfdm-pool-node-worker.mjs']) report.sources[name] = hash(await readFile(new URL(name, import.meta.url)));
  await writeFile(resolve(root, 'common-pool-node-qualification-' + maxWorkers + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, workerStarts: report.workerStarts, elapsedMs: report.elapsedMs, error: report.error}));
}
