// Ordered DLF wrapper for composition. No checkpoint or reference activations.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const HEAP = 16 * 1024 ** 2, SIDE = 448, N = SIDE * SIDE;
export async function createDlf(factory, {budget} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  const resident = budget.reserve(HEAP); let module, busy = false, disposed = false;
  try { module = await factory(); requireValue(module.HEAPU8.length <= HEAP, 'DLF initial heap'); }
  catch (e) { resident(); throw e; }
  return {
    async run({x, y, weights, kernel}, {signal} = {}) {
      if (busy) throw new EngineError('BUSY', 'DLF busy');
      requireValue(!disposed && [7, 9, 11].includes(kernel) && x instanceof Float32Array && y instanceof Float32Array && x.length === N && y.length === N && weights instanceof Float32Array && weights.length === 4 * kernel * kernel, 'DLF448 inputs');
      checkAbort(signal); busy = true;
      let borrowed, resultRelease, complete = false, stamp = performance.now(); const pointers = [];
      const checkpoint = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        borrowed = budget.reserve(x.byteLength + y.byteLength + weights.byteLength); resultRelease = budget.reserve(N * 8);
        const allocate = bytes => { const p = module._malloc(bytes); if (p) pointers.push(p); requireValue(p > 0 && module.HEAPU8.length <= HEAP, 'DLF heap limit'); return p; };
        for (const a of [x, y, weights]) for (let i = 0; i < a.length; i++) { requireValue(Number.isFinite(a[i]), 'Nonfinite DLF input'); if ((i & 8191) === 0) await checkpoint(); }
        const inputs = [x, y, weights].map(a => { const p = allocate(a.byteLength); module.HEAPF32.set(a, p / 4); return p; }), out = allocate(N * 8);
        for (let begin = 0; begin < N; begin += 256) {
          requireValue(module._d2prl_dlf_range(...inputs, SIDE, kernel, begin, Math.min(N, begin + 256), out, out + N * 4) === 1, 'DLF rejected'); await checkpoint();
        }
        checkAbort(signal); const data = module.HEAPF32.slice(out / 4, out / 4 + N * 2); complete = true;
        return {errors: data.subarray(0, N), scores: data.subarray(N), release: resultRelease};
      } finally { for (const p of pointers) module._free(p); borrowed?.(); if (!complete) resultRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'DLF busy'); if (disposed) return; disposed = true; module = null; resident(); }
  };
}
