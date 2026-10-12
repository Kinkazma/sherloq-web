import {NeuralGraphPool} from './neural-graph-pool.js';
import {EngineError, requireValue, checkAbort} from './errors.js';

const MiB = 1024 ** 2, SIDE = 512;
// Largest global attention/correlation tensors are 4096² floats. The complete
// released VGG/ASPP graph passed real inference in a 512MiB WASM address space.
// This live-workspace bound plus graph bytes yields that admitted ceiling.
const WORKSPACE_BYTES = 320 * MiB, OUTPUT_BYTES = SIDE ** 2 * 4;
const runtime = Object.freeze({
  factoryUrl: new URL('./selfdm-runtime-factory.mjs', import.meta.url).href,
  ortUrl: new URL('../vendor/m3-ort/ort.wasm.min.mjs', import.meta.url).href,
  wasmUrl: new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm', import.meta.url).href
});

export function createSelfDMInference({budget, profile, model, modelUrl, backend = 'cpu', workerFactory}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof budget.registerReclaimer === 'function', 'Shared budget required');
  requireValue(Number.isSafeInteger(profile?.maxWorkers) && profile.maxWorkers > 0, 'Shared SelfDM compute profile required');
  requireValue(backend === 'cpu', 'SelfDM initial map is qualified for CPU');
  requireValue(model?.family === 'selfdm' && model.side === SIDE && model.kind === 'sigmoid' && Number.isSafeInteger(model.bytes) && model.bytes > 0 && /^[a-f0-9]{64}$/.test(model.sha256) && typeof model.id === 'string' && model.id.length > 0, 'Qualified SelfDM model identity required');
  requireValue(typeof modelUrl === 'string' && /^https?:$/.test(new URL(modelUrl).protocol), 'Absolute HTTP SelfDM model URL required');
  const identity = structuredClone(model);
  const pool = new NeuralGraphPool(budget, profile, {
    assets: {selfdm: {...identity, url: modelUrl, graphOptimizationLevel: 'disabled', wasmMaximumBytes: 2048 * MiB}},
    runtimes: {wasm: runtime}, resourceOwner: 'selfdm', ...(workerFactory ? {workerFactory} : {})
  });
  let busy = false, disposed = false;
  return {
    model: identity, backend: 'cpu',
    // Independent region instances still share the global pool context and
    // execution broker. They cannot each claim their own CPU/RAM quota.
    independentZoneWorker: true,
    get residentBytes() {return pool.slots.reduce((bytes, slot) => bytes + slot.bytes + (slot.threadLeases?.length ?? 0) * 2 * MiB, 0);},
    releaseIdle() {for (const slot of [...pool.slots]) if (!slot.busy) pool.drop(slot);},
    async run(input, {signal, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'SelfDM inference busy');
      requireValue(!disposed && input instanceof Float32Array && input.length === 3 * SIDE ** 2 && input.every(Number.isFinite), 'Prepared SelfDM tensor required');
      checkAbort(signal); busy = true;
      const started = performance.now(); let inferenceStarted, result, transferred = false;
      try {
        result = await pool.run('selfdm', {rgb: {data: input, dims: [1, 3, SIDE, SIDE]}}, {
          signal, backend: 'cpu', workspaceBytes: WORKSPACE_BYTES, outputBytes: OUTPUT_BYTES,
          onProgress(progress) {if (progress.phase === 'inference') inferenceStarted = performance.now(); onProgress?.(progress);}
        });
        checkAbort(signal);
        const output = result.result.probability;
        requireValue(output?.data instanceof Float32Array && output.data.length === SIDE ** 2 && Array.isArray(output.dims) && output.dims.length === 4 && output.dims.every((value, index) => value === [1, 1, SIDE, SIDE][index]) && output.data.every(value => Number.isFinite(value) && value >= 0 && value <= 1), 'Qualified SelfDM probability output required');
        const ended = performance.now(); transferred = true;
        return {raw: output.data, heapBytes: result.heapBytes, ort: result.runtime, modelId: identity.id,
          timings: {totalMs: ended - started, ...(inferenceStarted !== undefined ? {modelLoadMs: inferenceStarted - started, inferenceMs: ended - inferenceStarted} : {})},
          metrics: result.metrics, release: result.release};
      } finally {
        if (!transferred) {result?.release(); if (result) for (const slot of [...pool.slots]) if (!slot.busy) pool.drop(slot);}
        busy = false;
      }
    },
    dispose() {requireValue(!busy, 'SelfDM inference busy'); if (!disposed) {disposed = true; pool.dispose();}}
  };
}
