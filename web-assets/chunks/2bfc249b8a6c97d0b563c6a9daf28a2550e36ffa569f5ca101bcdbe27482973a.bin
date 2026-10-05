import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
const HEAP = 64 * 1024 ** 2;

export function createVigConvolution({budget, maxWorkers = 1}) {
  requireValue(budget?.reserve && budget?.registerReclaimer && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 32, 'VIG shared budget and worker limit');
  const pool = []; let busy = false, disposed = false, serial = 0;
  const remove = (error = new EngineError('CANCELLED', 'VIG worker released')) => {
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
    async run({input, weight, bias, geometry}, {signal, onProgress} = {}) {
      requireValue(!busy && !disposed, 'VIG linear unavailable');
      const known = [[3,256,256,80,3,1,2,1],[80,128,128,160,3,1,2,1],[160,64,64,320,3,1,2,1],[320,32,32,640,3,1,2,1],[640,16,16,640,3,1,1,1],[640,16,16,640,1,0,1,1],[1280,16,16,1280,1,0,1,4],[1280,16,16,640,1,0,1,1],[640,16,16,2560,1,0,1,1],[2560,16,16,640,1,0,1,1]];
      requireValue(Array.isArray(geometry) && known.some(g=>JSON.stringify(g)===JSON.stringify(geometry)), 'Pinned VIG convolution geometry');
      const [ci,h,w,co,k,pad,stride,groups]=geometry, oh=Math.floor((h+2*pad-k)/stride)+1, ow=Math.floor((w+2*pad-k)/stride)+1, rows=oh*ow, products=ci/groups*k*k, total=rows*co;
      requireValue(input instanceof Float32Array && input.length===ci*h*w && weight instanceof Float32Array && weight.length===products*co && bias instanceof Float32Array && bias.length===co, 'VIG convolution tensors');
      checkAbort(signal);
      const tile=Math.min(total,16384,Math.max(4,Math.floor(8*1024**2/products/4)*4));
      const inputs=input.byteLength+weight.byteLength+bias.byteLength, copiesPerWorker=inputs*2+tile*8+4096;
      budget.room(inputs + rows * co * 4); busy = true;
      let borrowed, copies, release, complete = false;
      const abort = () => drop(new EngineError('CANCELLED', 'VIG linear cancelled'));
      signal?.addEventListener('abort', abort, {once: true});
      try {
        borrowed = budget.reserve(inputs); release = budget.reserve(rows * co * 4);
        const available = budget.limit - budget.total() + pool.length * HEAP;
        const useful = Math.ceil(rows * products * co / (4 * 1024 ** 2));
        const count = Math.min(maxWorkers, globalThis.navigator?.hardwareConcurrency || 1, useful, Math.ceil(total / tile), Math.floor(available / (HEAP + copiesPerWorker)));
        if (count < 1) throw new EngineError('MEMORY_LIMIT', 'One VIG linear worker cannot be admitted');
        while (pool.length > count) remove(); copies = budget.reserve(count * copiesPerWorker);
        while (pool.length < count) {
          checkAbort(signal); const free = budget.reserve(HEAP); let worker;
          try { worker = new Worker(new URL('./vig-convolution-worker.js', import.meta.url), {type: 'module'}); }
          catch (error) { free(); throw error; }
          const entry = {worker, release: free, pending: new Map()}; pool.push(entry);
          worker.onmessage = ({data}) => {
            const job = entry.pending.get(data.id); if (!job) return; entry.pending.delete(data.id);
            if (!data.ok) job.reject(new EngineError('COMPUTE_FAILED', data.error));
            else if (data.heapBytes !== HEAP) job.reject(new EngineError('MEMORY_LIMIT', 'VIG worker heap'));
            else job.resolve(data);
          };
          const fail = error => { for (const job of entry.pending.values()) job.reject(error); entry.pending.clear(); };
          worker.onerror = event => fail(new EngineError('WORKER_FAILED', event.message));
          worker.onmessageerror = () => fail(new EngineError('WORKER_FAILED', 'VIG transport'));
          await rpc(entry, {kind: 'init', moduleUrl: new URL('../../vendor/segmentation/vig-math.js', import.meta.url).href});
        }
        checkAbort(signal);
        await Promise.all(pool.map(entry => rpc(entry, {kind: 'load', input, weight, bias, geometry, tile})));
        const data = new Float32Array(rows * co); let cursor = 0, completed = 0;
        await Promise.all(pool.map(async entry => {
          while (cursor < total) {
            checkAbort(signal); const first = cursor, size = Math.min(tile, total - first); cursor += size;
            const result = await rpc(entry, {kind: 'compute', first, count: size}); checkAbort(signal);
            requireValue(result.values instanceof Float32Array && result.values.length === size, 'VIG channel result');
            data.set(result.values, first); completed += size;
            onProgress?.({phase: 'vig-convolution', completed, total, workers: count});
          }
        }));
        await Promise.all(pool.map(entry => rpc(entry, {kind: 'clear'}))); checkAbort(signal);
        complete = true; return {data, workers: count, release};
      } catch (error) { drop(error); throw error; }
      finally { signal?.removeEventListener('abort', abort); copies?.(); borrowed?.(); if (!complete) release?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'VIG linear busy'); if (disposed) return; disposed = true; drop(); unregister(); }
  };
}
