// The pinned module has a512MiB maximum heap. Whole-module admission permits
// immediate worker termination during native connected-components/DFT calls.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
export function createPostprocess({budget, moduleUrl}) {
  let busy = false, disposed = false;
  return {
    async run({raw, width = 448, height = 448, minimum = 500}, {signal, onCompute} = {}) {
      if (busy) throw new EngineError('BUSY', 'Postprocess busy');
      requireValue(!disposed && [width, height, minimum].every(Number.isInteger) && width >= 1 && height >= 1 && width <= 448 && height <= 448 && minimum >= 0 && minimum <= 5000 && raw instanceof Float32Array && raw.length === 3 * width * height, 'Postprocess inputs'); checkAbort(signal); busy = true;
      let admitted, outputRelease, worker, abort, complete = false;
      try {
        const outputBytes = width * height * 16;
        admitted = budget.reserve(512 * 1024 ** 2 + raw.byteLength * 2 + outputBytes); outputRelease = budget.reserve(outputBytes);
        worker = new Worker(new URL('./postprocess-worker.js', import.meta.url), {type: 'module'});
        const result = await new Promise((resolve, reject) => {
          abort = () => reject(new EngineError('CANCELLED', 'Postprocess cancelled')); signal?.addEventListener('abort', abort, {once: true});
          worker.onerror = e => reject(new EngineError('WORKER_FAILED', e.message));
          worker.onmessage = ({data}) => {
            try { if (data.phase === 'compute') { onCompute?.(); return; } if (!data.ok) throw new EngineError('COMPUTE_FAILED', data.error); requireValue(data.heapBytes <= 512 * 1024 ** 2 && data.masks?.length === raw.length && data.filtered?.length === width * height, 'Postprocess result'); resolve(data); }
            catch (e) { reject(e); }
          };
          const copy = raw.slice(); worker.postMessage({raw: copy, width, height, minimum, moduleUrl}, [copy.buffer]); if (signal?.aborted) abort();
        });
        checkAbort(signal); complete = true; return {...result, release: outputRelease};
      } finally { signal?.removeEventListener('abort', abort); worker?.terminate(); admitted?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Postprocess busy'); disposed = true; }
  };
}
