import {roleModelWorkspaceBytes} from './role-model.js';
// Private fixed448 ONNX role heads, with a cancellable single-threaded worker.
// ORT1.30's pinned WASM binary declares a 4GiB maximum linear memory. Reserve
// that whole ceiling: this is admission accounting, not measured resident RAM.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createRoles({budget, model, modelUrl, ortUrl, wasmPath}) {
  requireValue(budget && Number.isInteger(model?.modelBytes) && model.modelBytes > 0 && model.modelBytes <= 32 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(model.modelSha256), 'Pinned role model required');
  let busy = false, disposed = false;
  return {
    async run({rgb, coordinates, union}, {signal, onInference} = {}) {
      if (busy) throw new EngineError('BUSY', 'Role worker busy');
      const inputs = {rgb, x_cor: coordinates?.zm?.x, y_cor: coordinates?.zm?.y, x_cor2: coordinates?.cnn?.x, y_cor2: coordinates?.cnn?.y, union};
      requireValue(!disposed && Object.entries(inputs).every(([name, a]) => a instanceof Float32Array && a.length === (name === 'rgb' ? 3 : 1) * 448 ** 2), 'Role448 inputs'); checkAbort(signal); busy = true;
      let worker, admitted, outputRelease, complete = false, abort;
      try {
        const inputBytes = Object.values(inputs).reduce((n, a) => n + a.byteLength, 0), outputBytes = 2 * 448 ** 2 * 4;
        admitted = budget.reserve(4 * 1024 ** 3 + roleModelWorkspaceBytes(model.modelBytes) + 2 * inputBytes + 3 * outputBytes); outputRelease = admitted.split(outputBytes);
        worker = new Worker(new URL('./roles-worker.js', import.meta.url), {type: 'module'});
        const output = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Role inference cancelled'));
          signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = event => reject(new EngineError('WORKER_FAILED', event.message));
          worker.onmessage = ({data}) => {
            try {
              if (data.phase === 'inference') { onInference?.(); return; }
              if (!data.ok) throw new EngineError('MODEL_FAILED', data.error);
              requireValue(data.target instanceof Float32Array && data.source instanceof Float32Array && data.target.length === 448 ** 2 && data.source.length === 448 ** 2, 'Role result'); resolve(data);
            } catch (e) { reject(e); }
          };
          const copies = Object.fromEntries(Object.entries(inputs).map(([name, a]) => [name, a.slice()]));
          worker.postMessage({inputs: copies, modelUrl, ortUrl, wasmPath, modelBytes: model.modelBytes, modelSha256: model.modelSha256}, Object.values(copies).map(a => a.buffer));
          if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {target: output.target, source: output.source, ort: output.ort, release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Role worker busy'); disposed = true; }
  };
}
