import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSelfDMPrepare} from '../src/selfdm-prepare.js';
import {createSegmentationInference} from '../experiments/segmentation/inference.js';
import {SEGMENTATION_MODELS} from '../experiments/segmentation/models.js';
import {createSegmentationAnalysis} from '../experiments/segmentation/analysis.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const MiB = 1024 ** 2, model = SEGMENTATION_MODELS['selfdm-map'];
const zones = [0, 1, 2].map(index => ({id: 'region-' + index, kind: 'region', bounds: [index * 16, 0, (index + 1) * 16, 16]}));
function environment({workers = 4, action, parallelRegions = true} = {}) {
  const originalWorker = globalThis.Worker, coi = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated'), hardware = Object.getOwnPropertyDescriptor(globalThis.navigator, 'hardwareConcurrency');
  Object.defineProperty(globalThis, 'crossOriginIsolated', {value: true, configurable: true});
  Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', {value: workers, configurable: true});
  const instances = [], budget = new Budget(3 * 1024 ** 3), scheduler = getExecutionScheduler(budget, {maxWorkers: workers});
  class Worker {
    constructor(url) {assert.equal(url.pathname.endsWith('/neural-graph-worker.js'), true); this.jobs = []; instances.push(this);}
    postMessage(job) {
      if (job.command === 'execute') {this.timer = setTimeout(() => {if (!this.terminated) action ? action(this, this.jobs.at(-1)) : this.result();}, 5); return;}
      this.jobs.push(job);
      queueMicrotask(() => {
        if (this.terminated) return;
        if (this.jobs.length === 1) this.onmessage?.({data: {phase: 'model-load'}});
        this.onmessage?.({data: {executionReady: true, initializationMs: this.jobs.length === 1 ? 10 : 0, heapBytes: 16 * MiB}});
      });
    }
    result({heapBytes = 32 * MiB, probability = .7} = {}) {
      assert.ok(scheduler.snapshot().active.cpu <= workers);
      this.onmessage?.({data: {phase: 'inference'}});
      this.onmessage?.({data: {heapBytes, result: {probability: {data: new Float32Array(512 ** 2).fill(probability), dims: [1, 1, 512, 512], type: 'float32'}}, provider: 'wasm', runtime: {web: '1.30.0'}, runtimeLifecycle: {runtimeInitializations: 1, modelInitializations: 1, modelSwitches: 0}}});
    }
    terminate() {this.terminated = true; clearTimeout(this.timer);}
  }
  globalThis.Worker = Worker;
  const createLane = () => ({prepare: createSelfDMPrepare({budget}), inference: createSegmentationInference({budget, profile: {maxWorkers: workers}, variant: 'selfdm-map', modelUrl: 'https://example.invalid/selfdm-map-512.onnx', backend: 'cpu'})});
  const first = createLane(), project = {async run(input) {return {width: input.width, height: input.height, values: input.zones.map(zone => zone.raw[0]), metadata: {zones: input.zones.map(zone => ({id: zone.id, bounds: zone.bounds}))}, release() {}};}};
  const analysis = createSegmentationAnalysis({budget, ...first, project, ...(parallelRegions ? {createLane} : {})});
  let identity = 'a'.repeat(64);
  const inputSource = {width: 48, height: 16, async sha256() {return identity;}, region(bounds) {return {width: bounds[2] - bounds[0], height: 16, data: new Uint8Array((bounds[2] - bounds[0]) * 16 * 3).fill(bounds[0] + 32)};}};
  return {budget, scheduler, analysis, instances, inputSource, setIdentity(value) {identity = value;}, async dispose() {
    await analysis.dispose(); first.inference.dispose(); first.prepare.dispose();
    globalThis.Worker = originalWorker;
    if (coi) Object.defineProperty(globalThis, 'crossOriginIsolated', coi); else delete globalThis.crossOriginIsolated;
    if (hardware) Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', hardware); else delete globalThis.navigator.hardwareConcurrency;
    assert.equal(budget.total(), 0); assert.equal(scheduler.snapshot().active.cpu, 0); assert.equal(scheduler.snapshot().queued, 0);
  }};
}

test('SelfDM registry dispatch preserves native512/profile and reports shared admitted teams for independent regions', async () => {
  let gateOpen = false;
  const env = environment({action(worker) {
    if (gateOpen) {worker.result(); return;}
    const awaitQueuedSiblings = () => {
      if (env.scheduler.snapshot().queued >= 2) {gateOpen = true; worker.result();}
      else worker.timer = setTimeout(awaitQueuedSiblings, 1);
    };
    awaitQueuedSiblings();
  }});
  try {
    const result = await env.analysis.run({inputSource: env.inputSource, zones: [...zones, {...zones[0], id: 'duplicate-bounds'}]});
    const execution = result.metadata.execution, neural = execution.neuralPool;
    assert.equal(env.instances.length, 3); assert.equal(result.metadata.inferences, 3); assert.equal(result.metadata.cache_hits, 1);
    assert.equal(model.side, 512); assert.equal(model.family, 'selfdm'); assert.equal(env.instances[0].jobs[0].threads, 4);
    assert.equal(execution.independentZones.requested, 3); assert.equal(execution.independentZones.observed, 3);
    assert.equal(execution.independentZones.internalThreadsPerWorker, 4); assert.deepEqual(execution.independentZones.admittedThreadsPerWorker, {minimum: 4, maximum: 4});
    assert.equal(neural.jobs, 3); assert.equal(neural.runtimeInitializations, 3); assert.equal(neural.modelInitializations, 3); assert.equal(neural.workerReuses, 0);
    assert.deepEqual(neural.admittedTeams.map(team => team.zoneIds), [['region-0', 'duplicate-bounds'], ['region-1'], ['region-2']]);
    assert.ok(neural.admittedTeams.every(team => team.cpuGranted === 4 && team.threads === 4 && team.provider === 'wasm'));
    assert.equal(neural.preflightExecutions, 0); assert.equal(neural.sharedBroker.peakCpu, 4); assert.ok(neural.sharedBroker.peakQueued >= 2);
    assert.equal(neural.sharedBroker.active.cpu, 0); assert.equal(neural.sharedBroker.queued, 0); assert.ok(neural.sharedBroker.waitMs > 0);
    assert.match(neural.sharedBroker.scope, /not a per-request/); assert.match(execution.independentZones.meaning, /not physical/);
    assert.equal(execution.wasmMaximumBytes, 512 * MiB); result.release();
  } finally {await env.dispose();}
});

test('SelfDM variable admitted teams remain explicit when other engine work returns CPU capacity', async () => {
  let held;
  const env = environment({parallelRegions: false, action(worker) {held?.release(); held = undefined; worker.result();}});
  held = await env.scheduler.acquire({cpu: 3, label: 'another-engine-phase'});
  try {
    const result = await env.analysis.run({inputSource: env.inputSource, zones: zones.slice(0, 2)}), execution = result.metadata.execution, neural = execution.neuralPool;
    assert.deepEqual(neural.admittedTeams.map(team => team.threads), [1, 4]);
    assert.equal(execution.independentZones.internalThreadsPerWorker, null); assert.deepEqual(execution.independentZones.admittedThreadsPerWorker, {minimum: 1, maximum: 4});
    assert.equal(neural.runtimeInitializations, 2); assert.equal(neural.modelInitializations, 2); assert.equal(neural.workerReuses, 0);
    assert.equal(neural.admittedTeams[1].threadReconfigured, true); assert.equal(env.instances.length, 2); assert.equal(env.instances[0].terminated, true); result.release();
  } finally {held?.release(); await env.dispose();}
});

test('SelfDM cache-only analysis and reprojection report zero new teams, waits and initialization work', async () => {
  const env = environment();
  try {
    const initial = await env.analysis.run({inputSource: env.inputSource, zones});
    const calls = env.instances.reduce((sum, worker) => sum + worker.jobs.length, 0);
    for (const result of [await env.analysis.reproject({analysisId: initial.metadata.analysisId, zoneIds: ['region-2', 'region-0']}), await env.analysis.run({inputSource: env.inputSource, zones})]) {
      const execution = result.metadata.execution, neural = execution.neuralPool;
      assert.equal(result.metadata.inferences, 0); assert.equal(result.metadata.inference_performed, false);
      assert.equal(execution.independentZones.internalThreadsPerWorker, 0); assert.deepEqual(execution.independentZones.admittedThreadsPerWorker, {minimum: 0, maximum: 0});
      assert.equal(neural.jobs, 0); assert.deepEqual(neural.admittedTeams, []); assert.equal(neural.runtimeInitializations, 0); assert.equal(neural.modelInitializations, 0); assert.equal(neural.workerReuses, 0);
      assert.equal(neural.sharedBroker.active.cpu, 0); assert.equal(neural.sharedBroker.queued, 0); assert.equal(neural.sharedBroker.admitted, 3); // clearly shared cumulative history, not new work
      assert.equal(execution.wasmMaximumBytes, 512 * MiB); assert.match(execution.wasmMaximumScope, /cached grid provenance/);
      result.release();
    }
    assert.equal(env.instances.reduce((sum, worker) => sum + worker.jobs.length, 0), calls); initial.release();
  } finally {await env.dispose();}
});

test('SelfDM fresh source work on warm lanes counts actual reuses without summing cumulative session counters', async () => {
  const env = environment();
  try {
    const initial = await env.analysis.run({inputSource: env.inputSource, zones}); initial.release(); env.setIdentity('b'.repeat(64));
    const next = await env.analysis.run({inputSource: env.inputSource, zones}), neural = next.metadata.execution.neuralPool;
    assert.equal(next.metadata.inferences, 3); assert.equal(env.instances.length, 3); assert.equal(neural.jobs, 3);
    assert.equal(neural.workerReuses, 3); assert.equal(neural.modelReuses, 3); assert.equal(neural.runtimeInitializations, 0); assert.equal(neural.modelInitializations, 0);
    assert.equal(neural.laneSnapshots.length, 3); assert.ok(neural.laneSnapshots.every(snapshot => snapshot.runtime.runtimeInitializations === 1 && snapshot.runtime.modelInitializations === 1));
    assert.ok(neural.admittedTeams.every(team => team.workerReused)); next.release();
  } finally {await env.dispose();}
});

test('SelfDM reports the larger cap admitted after a useful allocation failure and retains retry evidence', async () => {
  let failed = false;
  const env = environment({action(worker, job) {
    if (!failed) {failed = true; worker.onmessage({data: {error: {code: 'MEMORY_ALLOCATION', message: 'Native allocator refused useful inference', details: {allocationKind: 'wasm', executionPhase: 'inference', nativeHeapExhausted: true}, cause: {name: 'Error', message: 'std::bad_alloc'}}}});}
    else {assert.equal(job.memoryMaximumBytes, 1024 * MiB); worker.result({heapBytes: 800 * MiB});}
  }});
  try {
    const whole = [{id: 'whole', kind: 'whole-image', bounds: [0, 0, 48, 16]}], result = await env.analysis.run({inputSource: env.inputSource, zones: whole, mode: 'whole-image'}), execution = result.metadata.execution;
    assert.equal(result.metadata.inferences, 1); assert.equal(execution.wasmMaximumBytes, 1024 * MiB); assert.equal(execution.runtimeMaximumBytes, 2048 * MiB);
    assert.equal(execution.neuralPool.admittedTeams[0].memoryMaximumBytes, 1024 * MiB); assert.equal(execution.observedHeapBytes, 800 * MiB);
    assert.match(execution.neuralPool.admittedTeams[0].recovery.reason, /Larger admitted heap/); assert.equal(execution.neuralPool.laneSnapshots[0].pool.workerStarts, 2);
    assert.equal(execution.neuralPool.runtimeInitializations, 1); assert.match(execution.neuralPool.initializationMeaning, /successful final/); result.release();
  } finally {await env.dispose();}
});

test('SelfDM analysis preserves a fatal worker cause, cancels sibling regions and releases their shared ownership', async () => {
  const env = environment({action(worker) {worker.onmessage({data: {error: {code: 'MODEL_IDENTITY', message: 'Pinned model size differs', cause: {name: 'Error', message: 'Model length mismatch'}, details: {executionPhase: 'initialization'}}}});}});
  try {
    await assert.rejects(env.analysis.run({inputSource: env.inputSource, zones}), error => error.code === 'MODEL_IDENTITY' && error.cause.message === 'Model length mismatch');
    assert.equal(env.scheduler.snapshot().active.cpu, 0); assert.equal(env.scheduler.snapshot().queued, 0);
    assert.ok(env.instances.every(worker => worker.terminated));
  } finally {await env.dispose();}
});

test('SelfDM missing metric evidence is unknown rather than an invented single-thread claim', async () => {
  const budget = new Budget(16 * MiB), inference = {model, backend: 'cpu', async run() {return {raw: new Float32Array(512 ** 2), heapBytes: 16 * MiB, release() {}};}}, prepare = {async run() {return {tensor: new Float32Array(1), release() {}};}}, project = {async run(input) {return {metadata: {zones: input.zones.map(zone => ({id: zone.id}))}, release() {}};}};
  const analysis = createSegmentationAnalysis({budget, prepare, inference, project});
  try {
    const result = await analysis.run({inputSource: {width: 16, height: 16, async sha256() {return 'c'.repeat(64);}, region() {return {};}}, zones: [zones[0]]}), execution = result.metadata.execution;
    assert.equal(execution.neuralPool.jobs, 1); assert.equal(execution.independentZones.internalThreadsPerWorker, null);
    assert.deepEqual(execution.independentZones.admittedThreadsPerWorker, {minimum: null, maximum: null}); assert.equal(execution.neuralPool.admittedTeams[0].threads, null); assert.equal(execution.neuralPool.admittedTeams[0].admissionWaitMs, null); assert.equal(execution.wasmMaximumBytes, null); result.release();
  } finally {await analysis.dispose();}
  assert.equal(budget.total(), 0);
});
