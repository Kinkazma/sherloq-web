import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
// Ordered DLF wrapper for composition. No checkpoint or reference activations.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const HEAP = 16 * 1024 ** 2, SIDE = 448, N = SIDE * SIDE;
export async function createDlf(factory, {budget,arena,operation:recover=(_label,work)=>work()} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  const ownsArena=!arena;
  let resident; let backing;let module, busy = false, disposed = false;
  try { resident=budget.reserve(HEAP);arena??=createWasmTensorArena({budget});module = await factory(); requireValue(module.HEAPU8.length <= HEAP, 'DLF initial heap'); }
  catch (e) { resident?.();if(ownsArena)arena?.dispose(); throw e; }
  let trackedHeapBytes=0;const trackHeap=()=>{const bytes=module.HEAPU8.byteLength;if(bytes===trackedHeapBytes)return;backing?.();backing=budget.registerBacking?.('wasm',bytes,{owner:'d2prl',label:'dlf-heap'});trackedHeapBytes=bytes;};trackHeap();
  return {
    async run({x, y, weights, kernel}, {signal,resourceOperation} = {}) {
      if (busy) throw new EngineError('BUSY', 'DLF busy');
      requireValue(!disposed && [7, 9, 11].includes(kernel) && x instanceof Float32Array && y instanceof Float32Array && x.length === N && y.length === N && weights instanceof Float32Array && weights.length === 4 * kernel * kernel, 'DLF448 inputs');
      checkAbort(signal); busy = true;
      let borrowed, resultRelease, complete = false, stamp = performance.now(); const pointers = [];
      const checkpoint = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        resourceOperation?.setState('compute');
        borrowed = budget.reserve(x.byteLength + y.byteLength + weights.byteLength);
        const allocate = bytes => { const p = module._malloc(bytes);trackHeap(); if (p) pointers.push(p); if(!p)throw new EngineError('MEMORY_ALLOCATION','Native D2PRL allocation refused'); requireValue(module.HEAPU8.length <= HEAP, 'DLF heap limit'); return p; };
        for (const a of [x, y, weights]) for (let i = 0; i < a.length; i++) { requireValue(Number.isFinite(a[i]), 'Nonfinite DLF input'); if ((i & 8191) === 0) await checkpoint(); }
        const inputs = [x, y, weights].map(a => { const p = allocate(a.byteLength); module.HEAPF32.set(a, p / 4); return p; }), out = allocate(N * 8);
        for (let begin = 0; begin < N; begin += 256) {
          requireValue(module._d2prl_dlf_range(...inputs, SIDE, kernel, begin, Math.min(N, begin + 256), out, out + N * 4) === 1, 'DLF rejected'); await checkpoint();
        }
        checkAbort(signal);resourceOperation?.commit();resourceOperation?.setState('waiting-child'); const result=await recover('dlf:copy',({resourceOperation:copyOperation}={})=>{copyOperation?.setState('compute');const value=arena.allocate(Float32Array,N*2,{signal,zero:false,label:'dlf'});try{value.data.set(module.HEAPF32.subarray(out/4,out/4+N*2));return value;}catch(error){value.release();throw error;}},{bytes:N*8});resultRelease=result.release;complete=true;
        return {get errors(){return result.data.subarray(0,N);},get scores(){return result.data.subarray(N);},release:result.release};
      } finally { resourceOperation?.setState('waiting-child');for (const p of pointers) module._free(p); borrowed?.(); if (!complete) resultRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'DLF busy'); if (disposed) return; disposed = true; if(ownsArena)arena.dispose(); const heapBytes=module.HEAPU8.byteLength;module = null;backing?.();backing=null;budget.notifyBackingRelease?.('wasm',heapBytes); resident(); }
  };
}
