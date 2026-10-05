// Private fixed448 ONNX role heads, with a cancellable single-threaded worker.
// The isolated pinned factory caps instantiated memory at512MiB. Numerical
// WASM code stays identical. Reserve the cap, report actual capacity, never RSS.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createBoundedRoles({budget, model, modelUrl, ortUrl, wasmPath, runtime, runtimeFactoryUrl}) {
  requireValue(budget && Number.isInteger(model?.modelBytes) && model.modelBytes > 0 && model.modelBytes <= 32 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(model.modelSha256), 'Pinned role model required');
  requireValue(runtime?.runtimeId === 'ort130-wasm-512mib' && runtime.memoryMaximumBytes === 512 * 1024 ** 2 && typeof runtimeFactoryUrl === 'string', 'Pinned bounded ORT runtime');
  let busy = false, disposed = false;
  return {
    async run({rgb, coordinates, union}, {signal, onInference} = {}) {
      if (busy) throw new EngineError('BUSY', 'Role worker busy');
      const inputs = {rgb, x_cor: coordinates?.zm?.x, y_cor: coordinates?.zm?.y, x_cor2: coordinates?.cnn?.x, y_cor2: coordinates?.cnn?.y, union};
      requireValue(!disposed && Object.entries(inputs).every(([name, a]) => a instanceof Float32Array && a.length === (name === 'rgb' ? 3 : 1) * 448 ** 2), 'Role448 inputs'); checkAbort(signal); busy = true;
      let worker, admitted, outputRelease, complete = false, abort;
      try {
        const inputBytes = Object.values(inputs).reduce((n, a) => n + a.byteLength, 0), outputBytes = 2 * 448 ** 2 * 4;
        admitted = budget.reserve(runtime.memoryMaximumBytes + 3 * model.modelBytes + 2 * inputBytes + 2 * outputBytes); outputRelease = budget.reserve(outputBytes);
        worker = new Worker(new URL('./roles-bounded-worker.js', import.meta.url), {type: 'module'});
        const output = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Role inference cancelled'));
          signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = event => reject(new EngineError('WORKER_FAILED', event.message));
          worker.onmessage = ({data}) => {
            try {
              if (data.phase === 'inference') { onInference?.(); return; }
              if (!data.ok) throw new EngineError('MODEL_FAILED', data.error);
              requireValue(data.target instanceof Float32Array && data.source instanceof Float32Array && data.target.length === 448 ** 2 && data.source.length === 448 ** 2 && data.heapBytes > 0 && data.heapBytes <= runtime.memoryMaximumBytes, 'Role result'); resolve(data);
            } catch (e) { reject(e); }
          };
          const copies = Object.fromEntries(Object.entries(inputs).map(([name, a]) => [name, a.slice()]));
          worker.postMessage({inputs: copies, modelUrl, ortUrl, runtimeFactoryUrl, wasmPath: {mjs: runtimeFactoryUrl, wasm: new URL('ort-wasm-simd-threaded.wasm', wasmPath).href}, modelBytes: model.modelBytes, modelSha256: model.modelSha256}, Object.values(copies).map(a => a.buffer));
          if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {target: output.target, source: output.source, ort: output.ort, heapBytes: output.heapBytes, release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Role worker busy'); disposed = true; }
  };
}
