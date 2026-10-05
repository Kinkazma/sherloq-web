import {Budget} from '../../src/cache.js';
import {boundGpuAdapter} from './gpu-budget.js';
let session, ort, runtime, gpu;
self.onmessage = async ({data}) => {
  let input, outputs, scoped = false;
  try {
    const started = performance.now(); let modelLoadMs = 0;
    const gpuBefore = typeof gpu === 'undefined' ? null : gpu?.snapshot();
    if (!session) {
      const adapter = await navigator.gpu?.requestAdapter({powerPreference: 'high-performance'});
      if (!adapter) throw Object.assign(Error('WebGPU adapter unavailable'), {code: 'GPU_UNAVAILABLE'});
      if (data.gpuBudgetBytes !== 512 * 1024 ** 2) throw Error('Pinned GPU admission required');
      gpu = boundGpuAdapter(adapter, new Budget(data.gpuBudgetBytes));
      self.postMessage({phase: 'model-load'});
      const response = await fetch(data.modelUrl);
      if (!response.ok || !response.body) throw Error('Model response unavailable');
      const bytes = new Uint8Array(data.model.bytes), reader = response.body.getReader(); let at = 0;
      try {
        while (true) {const {value, done} = await reader.read(); if (done) break; if (at + value.byteLength > bytes.length) throw Error('Model exceeds pinned size'); bytes.set(value, at); at += value.byteLength;}
      } finally {await reader.cancel(); reader.releaseLock();}
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
      if (at !== data.model.bytes || sha !== data.model.sha256) throw Error('Model identity mismatch');
      runtime = await import(data.runtimeFactoryUrl); ort = await import(data.ortUrl);
      ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = data.wasmPaths; ort.env.webgpu.adapter = gpu.adapter;
      session = await ort.InferenceSession.create(bytes, {executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false});
      if (!gpu.snapshot().devices) throw Object.assign(Error('WebGPU provider was removed; CPU-only result refused'), {code: 'GPU_UNAVAILABLE'});
    }
    if (performance.now() - started > 0) modelLoadMs = performance.now() - started;
    input = new ort.Tensor('float32', data.input, [1, 3, data.model.side, data.model.side]);
    self.postMessage({phase: 'inference'}); const inferStarted = performance.now(); await gpu.begin(); scoped = true;
    outputs = await session.run({rgb: input}); scoped = false; await gpu.end(); const inferenceMs = performance.now() - inferStarted, copyStarted = performance.now();
    const raw = outputs.probability.data.slice(), expected = (data.model.kind === 'softmax' ? 3 : 1) * data.model.side ** 2;
    if (raw.length !== expected || !raw.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw Error('Invalid model probability output');
    const stats = gpu.snapshot(); if (!stats.allocations || stats.activeReservationBytes > data.gpuBudgetBytes) throw Error('Bounded GPU execution not established');
    self.postMessage({ok: true, raw, heapBytes: runtime.heapBytes(), ort: ort.env.versions, gpu: stats, timings: {modelLoadMs, inferenceMs, outputCopyMs: performance.now() - copyStarted, gpuWriteBytes: stats.writeBufferBytes - (gpuBefore?.writeBufferBytes ?? 0), gpuReadBytes: stats.readMappingBytes - (gpuBefore?.readMappingBytes ?? 0)}}, [raw.buffer]);
  } catch (error) {self.postMessage({ok: false, code: error.code ?? 'MODEL_FAILED', error: String(error?.message ?? error)});}
  finally {
    if (scoped) {try {await gpu.end();} catch { /* The request already failed. */ }}
    input?.dispose(); for (const output of Object.values(outputs ?? {})) output.dispose();
  }
};
