// One coordinated pool, one WASM thread per worker. It executes only useful
// convolution tiles; no calibration, warm-up or nested library pool.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const HEAP_MAX = 256 * 1024 ** 2;
export function createConvolutionCpu({budget, moduleUrl, maxWorkers = 1} = {}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof moduleUrl === 'string' && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 32, 'Explicit shared budget, module and worker ceiling required');
  const pool = []; let busy = false, disposed = false;
  const remove = () => { const slot = pool.pop(); slot?.worker.terminate(); slot?.release(); };
  // A later graph stage can need memory while these workers are idle. Release
  // idle compiled heaps before evicting raw results or rejecting useful work.
  const unregister = budget.registerReclaimer?.(bytes => {if (!busy) while (pool.length && budget.total() + bytes > budget.limit) remove();});
  const rpc = (slot, data, signal) => new Promise((resolve, reject) => {
    const cleanup = () => { slot.worker.onmessage = null; slot.worker.onerror = null; slot.worker.onmessageerror = null; signal?.removeEventListener('abort', abort); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new EngineError('CANCELLED', 'CPU convolution cancelled'));
    slot.worker.onmessage = ({data}) => { cleanup(); if (!data.ok) return reject(new EngineError('CPU_FAILED', data.error)); if (!Number.isInteger(data.heapBytes) || data.heapBytes > HEAP_MAX) return reject(new EngineError('MEMORY_LIMIT', 'CPU convolution heap')); resolve(data); };
    slot.worker.onerror = event => fail(new EngineError('CPU_FAILED', event.message)); slot.worker.onmessageerror = () => fail(new EngineError('CPU_FAILED', 'CPU convolution transport'));
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) return abort();
    try { slot.worker.postMessage(data); } catch (error) { fail(error); }
  });
  return {
    async run({input, weights, bias, channels, height, width, outChannels, kernel, padding = 0, stride = 1, groups = 1, hasBias = true, referenceLayout, experimentalBiasBefore = false, experimentalTailStart, experimentalTailMode = 'lane16'}, {signal, onSubmitted, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'CPU convolution busy'); requireValue(!disposed, 'CPU convolution disposed');
      requireValue([channels, height, width, outChannels, kernel, padding, stride, groups].every(Number.isInteger) && channels > 0 && channels <= 4096 && outChannels > 0 && outChannels <= 4096 && height > 0 && height <= 1024 && width > 0 && width <= 1024 && kernel > 0 && kernel <= 13 && padding >= 0 && padding <= 6 && stride >= 1 && stride <= 2 && groups >= 1 && groups <= channels && channels % groups === 0 && outChannels % groups === 0, 'Convolution dimensions');
      const oh = Math.floor((height + 2 * padding - kernel) / stride) + 1, ow = Math.floor((width + 2 * padding - kernel) / stride) + 1, plane = oh * ow, count = plane * outChannels, k = channels / groups * kernel * kernel;
      requireValue(oh > 0 && ow > 0 && input instanceof Float32Array && input.length === channels * height * width && weights instanceof Float32Array && weights.length === outChannels * k && bias instanceof Float32Array && bias.length === outChannels, 'Convolution tensors');
      const zeroBias = bias.every(v => v === 0), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      requireValue(typeof hasBias === 'boolean' && (hasBias || zeroBias) && typeof experimentalBiasBefore === 'boolean' && (!experimentalBiasBefore || !referenceLayout), 'Explicit bias arithmetic');
      requireValue(zeroBias || experimentalBiasBefore || (referenceLayout && same(referenceLayout.inputShape, [1, channels, height, width]) && same(referenceLayout.weightShape, [outChannels, channels / groups, kernel, kernel]) && referenceLayout.padding === padding && (referenceLayout.stride ?? 1) === stride && (referenceLayout.groups ?? 1) === groups), 'Qualified native convolution layout required');
      const ranges = zeroBias || experimentalBiasBefore ? [] : referenceLayout.biasAfterRanges;
      requireValue(Array.isArray(ranges) && ranges.length <= 64, 'Convolution arithmetic ranges'); let previous = 0;
      for (const range of ranges) { requireValue(Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= previous && range[1] > range[0] && range[1] <= plane, 'Convolution arithmetic range'); previous = range[1]; }
      const tailStart = experimentalTailStart ?? plane;
      requireValue(Number.isInteger(tailStart) && tailStart >= 0 && tailStart <= plane && ['lane16', 'block1024'].includes(experimentalTailMode), 'Convolution tail domain'); checkAbort(signal);
      const inputBytes = input.byteLength + weights.byteLength + bias.byteLength, tile = Math.max(4, Math.min(16384, Math.floor(8 * 1024 ** 2 / k / 4) * 4));
      budget.room(inputBytes + count * 4); busy = true;
      let borrowed, copies, outputRelease, complete = false, healthy = false;
      try {
        if (inputBytes + tile * 4 + 8 * 1024 ** 2 > HEAP_MAX) throw new EngineError('MEMORY_LIMIT', 'Layer exceeds bounded CPU convolution heap');
        borrowed = budget.reserve(inputBytes); outputRelease = budget.reserve(count * 4);
        const copyBytes = inputBytes + tile * 8 + 4096;
        const available = budget.limit - budget.total() + pool.length * HEAP_MAX;
        const useful = Math.max(1, Math.ceil(count * k / (4 * 1024 ** 2)));
        const workers = Math.min(maxWorkers, Math.max(1, navigator.hardwareConcurrency || 1), useful, Math.ceil(count / tile), Math.floor(available / (HEAP_MAX + copyBytes)));
        if (workers < 1) throw new EngineError('MEMORY_LIMIT', 'One CPU convolution worker cannot be admitted');
        while (pool.length > workers) remove();
        copies = budget.reserve(workers * copyBytes);
        let stamp = performance.now(); for (const values of [input, weights, bias]) for (let i = 0; i < values.length; i++) {
          requireValue(Number.isFinite(values[i]), 'Nonfinite convolution tensor'); if ((i & 8191) === 0 && performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); }
        }
        while (pool.length < workers) {
          checkAbort(signal); const release = budget.reserve(HEAP_MAX); let worker;
          try { worker = new Worker(new URL('./convolution-cpu-worker.js', import.meta.url), {type: 'module'}); pool.push({worker, release}); } catch (error) { release(); throw error; }
          await rpc(pool.at(-1), {kind: 'init', moduleUrl}, signal);
        }
        const shape = new Int32Array([channels, height, width, outChannels, oh, ow, kernel, padding, stride, groups, Number(hasBias), tailStart, experimentalTailMode === 'block1024' ? 2 : 1, ranges.length]), arithmeticRanges = Int32Array.from(ranges.flat());
        await Promise.all(pool.map(slot => rpc(slot, {kind: 'load', input, weights, bias, shape, ranges: arithmeticRanges, tile}, signal)));
        const data = new Float32Array(count); let next = 0, finished = 0, heapBytes = 0;
        onSubmitted?.(); checkAbort(signal);
        await Promise.all(pool.map(async slot => {
          while (next < count) {
            checkAbort(signal); const start = next, size = Math.min(tile, count - start); next += size;
            const result = await rpc(slot, {kind: 'compute', start, count: size}, signal); checkAbort(signal);
            requireValue(result.values instanceof Float32Array && result.values.length === size, 'CPU convolution result'); data.set(result.values, start); heapBytes = Math.max(heapBytes, result.heapBytes); finished += size;
            onProgress?.({phase: 'convolution', completed: finished, total: count, workers});
          }
        }));
        await Promise.all(pool.map(slot => rpc(slot, {kind: 'clear'}, signal))); checkAbort(signal); healthy = true; complete = true;
        return {data, shape: [1, outChannels, oh, ow], workers, heapBytes, release: outputRelease};
      } finally { if (!healthy) while (pool.length) remove(); copies?.(); borrowed?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    releaseIdleWorkers() { requireValue(!busy, 'CPU convolution busy'); while (pool.length) remove(); },
    dispose() { requireValue(!busy, 'CPU convolution busy'); if (disposed) return; disposed = true; unregister?.(); while (pool.length) remove(); }
  };
}
