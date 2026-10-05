import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
const HEAP = 64 * 1024 ** 2;

export function createTntLinear({budget, maxWorkers = 1}) {
  requireValue(budget?.reserve && budget?.registerReclaimer && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 32, 'TNT shared budget and worker limit');
  const pool = []; let busy = false, disposed = false, serial = 0;
  const remove = (error = new EngineError('CANCELLED', 'TNT worker released')) => {
    const entry = pool.pop(); if (!entry) return;
    entry.worker.terminate(); for (const job of entry.pending.values()) job.reject(error);
    entry.pending.clear(); entry.release();
  };
  const drop = error => { while (pool.length) remove(error); };
  const unregister = budget.registerReclaimer(bytes => { if (!busy) while (pool.length && budget.total() + bytes > budget.limit) remove(); });
  const rpc = (entry, message) => new Promise((resolve, reject) => {
    const id = ++serial; entry.pending.set(id, {resolve, reject});
    try { entry.worker.postMessage({...message, id}); }
    catch (error) { entry.pending.delete(id); reject(error); }
  });
  return {
    async run({input, weight, bias, rows, ci, co, hasBias}, {signal, onProgress} = {}) {
      requireValue(!busy && !disposed, 'TNT linear unavailable');
      requireValue([256, 257, 4096].includes(rows) && [40, 160, 640, 2560].includes(ci) && [40, 80, 160, 640, 1280, 2560].includes(co) && typeof hasBias === 'boolean', 'Pinned TNT linear geometry');
      requireValue(input instanceof Float32Array && input.length === rows * ci && weight instanceof Float32Array && weight.length === ci * co && bias instanceof Float32Array && bias.length === co && (hasBias || bias.every(v => v === 0)), 'TNT linear tensors');
      checkAbort(signal);
      const tile = Math.min(co, 64, Math.max(4, Math.floor(8 * 1024 ** 2 / (rows * ci) / 4) * 4));
      const inputs = input.byteLength + weight.byteLength + bias.byteLength, copiesPerWorker = inputs * 2 + tile * rows * 8 + 4096;
      budget.room(inputs + rows * co * 4); busy = true;
      let borrowed, copies, release, complete = false;
      const abort = () => drop(new EngineError('CANCELLED', 'TNT linear cancelled'));
      signal?.addEventListener('abort', abort, {once: true});
      try {
        borrowed = budget.reserve(inputs); release = budget.reserve(rows * co * 4);
        const available = budget.limit - budget.total() + pool.length * HEAP;
        const useful = Math.ceil(rows * ci * co / (4 * 1024 ** 2));
        const count = Math.min(maxWorkers, globalThis.navigator?.hardwareConcurrency || 1, useful, Math.ceil(co / tile), Math.floor(available / (HEAP + copiesPerWorker)));
        if (count < 1) throw new EngineError('MEMORY_LIMIT', 'One TNT linear worker cannot be admitted');
        while (pool.length > count) remove(); copies = budget.reserve(count * copiesPerWorker);
        while (pool.length < count) {
          checkAbort(signal); const free = budget.reserve(HEAP); let worker;
          try { worker = new Worker(new URL('./tnt-linear-worker.js', import.meta.url), {type: 'module'}); }
          catch (error) { free(); throw error; }
          const entry = {worker, release: free, pending: new Map()}; pool.push(entry);
          worker.onmessage = ({data}) => {
            const job = entry.pending.get(data.id); if (!job) return; entry.pending.delete(data.id);
            if (!data.ok) job.reject(new EngineError('COMPUTE_FAILED', data.error));
            else if (data.heapBytes !== HEAP) job.reject(new EngineError('MEMORY_LIMIT', 'TNT worker heap'));
            else job.resolve(data);
          };
          const fail = error => { for (const job of entry.pending.values()) job.reject(error); entry.pending.clear(); };
          worker.onerror = event => fail(new EngineError('WORKER_FAILED', event.message));
          worker.onmessageerror = () => fail(new EngineError('WORKER_FAILED', 'TNT transport'));
          await rpc(entry, {kind: 'init', moduleUrl: new URL('../../vendor/segmentation/tnt-math.js', import.meta.url).href});
        }
        checkAbort(signal);
        await Promise.all(pool.map(entry => rpc(entry, {kind: 'load', input, weight, bias, geometry: {rows, ci, co, hasBias, tile}})));
        const data = new Float32Array(rows * co); let cursor = 0, completed = 0;
        await Promise.all(pool.map(async entry => {
          while (cursor < co) {
            checkAbort(signal); const first = cursor, size = Math.min(tile, co - first); cursor += size;
            const result = await rpc(entry, {kind: 'compute', first, count: size}); checkAbort(signal);
            requireValue(result.values instanceof Float32Array && result.values.length === rows * size, 'TNT channel result');
            data.set(result.values, first * rows); completed += size;
            onProgress?.({phase: 'tnt-linear', completed, total: co, workers: count});
          }
        }));
        await Promise.all(pool.map(entry => rpc(entry, {kind: 'clear'}))); checkAbort(signal);
        complete = true; return {data, workers: count, release};
      } catch (error) { drop(error); throw error; }
      finally { signal?.removeEventListener('abort', abort); copies?.(); borrowed?.(); if (!complete) release?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'TNT linear busy'); if (disposed) return; disposed = true; drop(); unregister(); }
  };
}
