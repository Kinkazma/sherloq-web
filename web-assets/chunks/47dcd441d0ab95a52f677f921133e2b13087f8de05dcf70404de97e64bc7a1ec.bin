// Cancellable native-coordinate interpolation under the shared admission.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createSpatial({budget, moduleUrl, maxInputSide = 448}) {
  requireValue(budget && typeof budget.reserve === 'function' && [448, 512].includes(maxInputSide), 'Shared budget and qualified spatial domain required'); let busy = false, disposed = false;
  return {
    async run({input, width = 448, height = 448, outWidth, outHeight, nearest}, {signal, onCompute} = {}) {
      if (busy) throw new EngineError('BUSY', 'Spatial resize busy');
      requireValue(!disposed && [width, height, outWidth, outHeight].every(Number.isInteger) && width > 0 && height > 0 && width <= maxInputSide && height <= maxInputSide && outWidth > 0 && outHeight > 0 && outWidth <= 8192 && outHeight <= 8192 && outWidth * outHeight <= 32 * 1024 ** 2 && typeof nearest === 'boolean' && input instanceof Float32Array && input.length === width * height, 'Spatial resize domain'); checkAbort(signal); busy = true;
      let admitted, outputRelease, worker, abort, complete = false;
      try {
        const outputBytes = outWidth * outHeight * 4;
        admitted = budget.reserve(512 * 1024 ** 2 + input.byteLength * 2 + outputBytes); outputRelease = budget.reserve(outputBytes);
        worker = new Worker(new URL('./spatial-worker.js', import.meta.url), {type: 'module'});
        const result = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Spatial resize cancelled')); signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = e => reject(new EngineError('WORKER_FAILED', e.message));
          worker.onmessage = ({data}) => {
            try { if (data.phase === 'compute') { onCompute?.(); return; } if (!data.ok) throw new EngineError('COMPUTE_FAILED', data.error); requireValue(data.heapBytes <= 512 * 1024 ** 2 && data.values instanceof Float32Array && data.values.length === outWidth * outHeight, 'Spatial result'); resolve(data); }
            catch (e) { reject(e); }
          };
          const copy = input.slice(); worker.postMessage({input: copy, width, height, outWidth, outHeight, nearest, moduleUrl}, [copy.buffer]); if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {data: result.values, width: outWidth, height: outHeight, heapBytes: result.heapBytes, release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Spatial resize busy'); disposed = true; }
  };
}
