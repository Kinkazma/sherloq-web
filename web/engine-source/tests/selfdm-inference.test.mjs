import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelfDMInference} from '../src/selfdm-inference.js';
import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';

const MiB = 1024 ** 2, model = {id: 'selfdm-initial-map-512-v1', family: 'selfdm', side: 512, kind: 'sigmoid', bytes: 62971505, sha256: '933ce196b044f0df1d3e0aa2dabe79907b6406e1aa9384cc7bb831922b1d4d59'};
const input = () => new Float32Array(3 * 512 ** 2);
const turn = () => new Promise(resolve => setImmediate(resolve));
class Worker {
  constructor(action) {this.action = action; this.jobs = []; this.terminated = false; this.executing = false;}
  postMessage(job) {
    if (job.command === 'execute') {this.executing = true; queueMicrotask(() => {if (!this.terminated) this.action(this, this.jobs.at(-1));}); return;}
    this.jobs.push(job); this.executing = false;
    queueMicrotask(() => {if (!this.terminated) this.onmessage({data: {executionReady: true, initializationMs: 10, heapBytes: 16 * MiB}});});
  }
  result(output = {data: new Float32Array(512 ** 2).fill(.75), dims: [1, 1, 512, 512], type: 'float32'}) {
    this.onmessage({data: {phase: 'inference'}});
    this.onmessage({data: {heapBytes: 32 * MiB, result: {probability: output}, runtime: {web: '1.30.0'}, provider: 'wasm'}});
  }
  terminate() {this.terminated = true;}
}
function setup({maxWorkers = 4, action = worker => worker.result(), budget = new Budget(2048 * MiB), backend='cpu'} = {}) {
  const workers = [], inference = createSelfDMInference({budget, profile: {maxWorkers}, model, backend, modelUrl: 'https://example.invalid/selfdm-map-512.onnx', workerFactory() {const worker = new Worker(action); workers.push(worker); return worker;}});
  return {budget, inference, workers};
}

test('SelfDM uses the common elastic CPU broker and reuses its initialized worker', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
  Object.defineProperty(globalThis, 'crossOriginIsolated', {configurable: true, value: true});
  const {budget, inference, workers} = setup();
  try {
    const pixels = input(), original = pixels.slice(), first = await inference.run(pixels);
    assert.equal(first.metrics.threads, 4); assert.equal(first.metrics.cpuGranted, 4); assert.equal(first.metrics.preflightExecutions, 0);
    assert.equal(workers[0].jobs[0].threads, 4); assert.equal(workers[0].jobs[0].memoryMaximumBytes, 512 * MiB);
    assert.equal(workers[0].jobs[0].runtime.factoryUrl.endsWith('/selfdm-runtime-factory.mjs'), true);
    assert.equal(first.raw.length, 512 ** 2); assert.equal(first.raw[0], .75); assert.deepEqual(pixels, original);
    assert.equal(first.ort.web, '1.30.0'); assert.ok(first.timings.inferenceMs >= 0); first.release();
    const next = await inference.run(pixels); assert.equal(next.metrics.pool.workerStarts, 1); assert.equal(next.metrics.workerReused, true); assert.equal(workers.length, 1);
    assert.equal(next.metrics.threads, 4); next.release(); next.release();
    assert.equal(getExecutionScheduler(budget).snapshot().active.cpu, 0);
    assert.ok(inference.residentBytes > 512 * MiB); inference.releaseIdle(); assert.equal(inference.residentBytes, 0); assert.equal(budget.total(), 0);
  } finally {inference.dispose(); if (descriptor) Object.defineProperty(globalThis, 'crossOriginIsolated', descriptor); else delete globalThis.crossOriginIsolated;}
});

test('SelfDM independent region instances share CPU admission rather than multiplying quotas', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
  Object.defineProperty(globalThis, 'crossOriginIsolated', {configurable: true, value: true});
  const budget = new Budget(2048 * MiB), first = setup({budget, action() {}}), second = setup({budget, action() {}});
  try {
    const a = first.inference.run(input()), b = second.inference.run(input()); await turn();
    const scheduler = getExecutionScheduler(budget); assert.equal(scheduler.snapshot().active.cpu, 4); assert.equal(scheduler.snapshot().queued, 1);
    assert.equal(first.workers[0].executing, true); assert.equal(second.workers[0].executing, false);
    first.workers[0].result(); const resultA = await a; await turn(); assert.equal(second.workers[0].executing, true);
    second.workers[0].result(); const resultB = await b;
    assert.equal(scheduler.snapshot().peakCpu, 4); assert.equal(scheduler.snapshot().active.cpu, 0);
    resultA.release(); resultB.release(); assert.equal(first.inference.independentZoneWorker, true);
  } finally {first.inference.dispose(); second.inference.dispose(); if (descriptor) Object.defineProperty(globalThis, 'crossOriginIsolated', descriptor); else delete globalThis.crossOriginIsolated;}
  assert.equal(budget.total(), 0);
});

test('SelfDM preserves structured worker causes and returns all allocations on failure', async () => {
  const {budget, inference} = setup({action(worker) {worker.onmessage({data: {error: {code: 'NEURAL_EXECUTION', message: 'Model download: 503', details: {executionPhase: 'initialization'}, cause: {code: 'NETWORK_TRANSIENT', name: 'TypeError', message: 'Failed to fetch', details: {url: 'https://example.invalid/selfdm-map-512.onnx'}}}}});}});
  try {
    await assert.rejects(inference.run(input()), error => error.code === 'NEURAL_EXECUTION' && error.cause.code === 'NETWORK_TRANSIENT' && error.cause.message === 'Failed to fetch' && error.details.executionPhase === 'initialization');
    assert.equal(budget.total(), 0); assert.equal(getExecutionScheduler(budget).snapshot().active.cpu, 0);
  } finally {inference.dispose();}
});

test('SelfDM rejects output geometry or nonfinite probabilities without leaking its output lease', async () => {
  for (const output of [{data: new Float32Array(512 ** 2).fill(NaN), dims: [1, 1, 512, 512]}, {data: new Float32Array(512 ** 2).fill(.5), dims: [512, 512]}]) {
    const {budget, inference} = setup({action(worker) {worker.result(output);}});
    try {await assert.rejects(inference.run(input()), {code: 'INVALID_INPUT'}); assert.equal(budget.active, 0);}
    finally {inference.dispose();}
    assert.equal(budget.total(), 0);
  }
});

test('SelfDM releaseIdle leaves active work running and cancellation keeps caller input intact', async () => {
  const {budget, inference, workers} = setup({action() {}}), controller = new AbortController(), pixels = input(), original = pixels.slice();
  const pending = inference.run(pixels, {signal: controller.signal}); await turn();
  inference.releaseIdle(); assert.equal(workers[0].terminated, false);
  assert.throws(() => inference.dispose(), {code: 'INVALID_INPUT'});
  await assert.rejects(inference.run(pixels), {code: 'BUSY'});
  controller.abort(); await assert.rejects(pending, {code: 'CANCELLED'});
  assert.equal(workers[0].terminated, true); assert.deepEqual(pixels, original); assert.equal(budget.total(), 0);
  inference.dispose(); assert.equal(getExecutionScheduler(budget).snapshot().active.cpu, 0);
});

test('SelfDM admission refusal never starts a worker or probes memory', async () => {
  const {budget, inference, workers} = setup({budget: new Budget(64 * MiB)});
  try {await assert.rejects(inference.run(input()), {code: 'MEMORY_LIMIT'}); assert.equal(workers.length, 0); assert.equal(budget.total(), 0);}
  finally {inference.dispose();}
});

test('SelfDM GPU dispatch uses the bounded asyncify runtime and common GPU admission',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{}}});
  const {budget,inference,workers}=setup({backend:'webgpu'});
  try{
    const output=await inference.run(input());
    assert.equal(workers[0].jobs[0].provider,'webgpu');assert.match(workers[0].jobs[0].runtime.factoryUrl,/selfdm-runtime-gpu-factory.mjs$/);
    assert.match(workers[0].jobs[0].runtime.wasmUrl,/ort-wasm-simd-threaded.asyncify.wasm$/);
    assert.equal(output.metrics.provider,'webgpu');assert.equal(output.metrics.gpuGranted,1);assert.equal(output.metrics.cpuGranted,1);
    output.release();inference.releaseIdle();assert.equal(budget.total(),0);
  }finally{inference.dispose();if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});

test('SelfDM rejects incompatible models, profiles and unsupported backends', () => {
  const budget = new Budget(2048 * MiB), options = {budget, profile: {maxWorkers: 4}, model, modelUrl: 'https://example.invalid/selfdm-map-512.onnx'};
  for (const patch of [{profile: undefined}, {model: {...model, side: 256}}, {model: {...model, kind: 'softmax'}}, {backend: 'metal'}]) assert.throws(() => createSelfDMInference({...options, ...patch}), {code: 'INVALID_INPUT'});
  assert.equal(budget.total(), 0);
});

test('SelfDM keeps original all-admitted path and transports compact domains without reducing CPU workers',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');Object.defineProperty(globalThis,'crossOriginIsolated',{configurable:true,value:true});
 const {budget,inference,workers}=setup(),sha='a'.repeat(64),base={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width:512,height:512,fingerprint:'all',status:'ready',regions:[{x0:0,y0:0,x1:512,y1:512}],excluded:[]},context=scope=>({scope,width:512,height:512,sourceSha256:sha,bounds:[0,0,512,512]}),pixels=input(),original=pixels.slice();
 try{
  const all=await inference.run(pixels,{scientificScope:context(base)});assert.equal(all.metadata.scientificScope.bypassOriginal,true);assert.equal(all.metadata.scientificScope.totalCentres,4096);assert.equal(workers[0].jobs[0].asset.graphTransform,undefined);assert.deepEqual(Object.keys(workers[0].jobs[0].inputs),['rgb']);all.release();
  const partial={...base,fingerprint:'partial',excluded:[[[16,16],[24,16],[24,24],[16,24]]]},limited=await inference.run(pixels,{scientificScope:context(partial)}),job=workers.flatMap(w=>w.jobs).at(-1);
  assert.equal(limited.metadata.scientificScope.bypassOriginal,false);assert.ok(limited.metadata.scientificScope.admittedCentres<4096);assert.equal(job.inputs.scientific_scope_indices.type,'int64');assert.equal(job.inputs.scientific_scope_indices.dims[0],limited.metadata.scientificScope.admittedCentres);assert.equal(job.asset.graphTransform.id,'selfdm-native-scope-v2');assert.equal(job.threads,4);assert.equal(limited.metrics.cpuGranted,4);limited.release();
  const next=await inference.run(pixels,{scientificScope:context(base)});assert.equal(next.metadata.scientificScope.bypassOriginal,true);next.release();assert.deepEqual(pixels,original);
 }finally{inference.dispose();if(descriptor)Object.defineProperty(globalThis,'crossOriginIsolated',descriptor);else delete globalThis.crossOriginIsolated;}
 assert.equal(budget.total(),0);
});
