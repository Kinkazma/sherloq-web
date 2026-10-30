import "../../runtime-context.js?v=0.30.0";
import {EngineError, requireValue, checkAbort, createCooperator} from './errors.js';
import {allocateWasmMemory, allocateOwnedTypedArray, wasmAllocationFailure} from './allocation.js';

const MiB = 1024 ** 2, page = 65536, maximum = 2 * 1024 ** 3;
export const SSG_VLFEAT_REFERENCE = Object.freeze({
  source: 'https://github.com/ChaoWang1016/word2phraseCMFD',
  sourceCommit: '66bb26eca0c7e95c76042d5bcca58f744d70a27d',
  version: '0.9.18', scope: 'VLFeat detector component only', completeDetector: false,
  peakThreshold: 0, edgeThreshold: 50, levels: 3, firstOctave: 0,
});

export function ssgVlfeatMemoryPlan({width, height, heapBytes} = {}) {
  requireValue([width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 32768) && Number.isSafeInteger(width * height), 'Invalid VLFeat image geometry.');
  // S=3, first octave=0: temp + 6 Gaussian + 5 DoG + 10 gradient
  // planes use 88 bytes/pixel. The native input is another Float32 plane.
  // Keys/frames grow from actual detections; this is an admission estimate,
  // never a claim that image content cannot exhaust the chosen arena.
  const fixedBytes = width * height * 92;
  const recommended = Math.ceil(Math.max(32 * MiB, fixedBytes * 1.25 + 8 * MiB) / page) * page;
  const bytes = heapBytes ?? recommended;
  requireValue(Number.isSafeInteger(bytes) && bytes % page === 0 && bytes >= 32 * MiB && bytes <= maximum, 'Invalid VLFeat heap extent.');
  return {fixedBytes, reservedHeapBytes: bytes, maximumHeapBytes: bytes, initialHeapBytes: 32 * MiB, suggestedHeapBytes: recommended};
}

const factory = async options => (await import('../vendor/ssg-vlfeat/vlfeat.mjs')).default(options);

/** Worker-local scalar native detector. A broker may own multiple independent
 * instances; one instance cannot share its mutable arena between active jobs.
 * Input already has the qualified analysis geometry/grayscale. No implicit
 * resize, OpenCV detector substitution or complete SSG claim is made here. */
export function createSsgVlfeat({budget, moduleFactory = factory} = {}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof moduleFactory === 'function', 'VLFeat shared budget and module factory required.');
  let module, memory, releaseHeap, heapMaximum = 0, busy = false, disposed = false;
  const retire = () => {
    if (busy) return 0;
    const bytes = module?.HEAPU8?.byteLength ?? memory?.buffer.byteLength ?? 0;
    module = memory = null; heapMaximum = 0;
    releaseHeap?.(); releaseHeap = null;
    if (bytes) budget.notifyBackingRelease?.('wasm', bytes);
    return bytes;
  };
  const unregister = budget.registerReclaimer?.(retire, {owner: 'ssg-vlfeat', label: 'idle VLFeat arena', allocationKind: 'wasm'});
  async function ensure(plan, signal) {
    if (module && heapMaximum >= plan.maximumHeapBytes) return true;
    // Only this idle arena is retired. A larger job gets a newly admitted cap.
    const previousBusy = busy; busy = false; retire(); busy = previousBusy;
    releaseHeap = budget.reserve(plan.reservedHeapBytes);
    heapMaximum = plan.maximumHeapBytes;
    try {
      checkAbort(signal);
      memory = allocateWasmMemory({initial: plan.initialHeapBytes / page, maximum: heapMaximum / page}, {label: 'SSG VLFeat arena'});
      module = await moduleFactory({wasmMemory: memory, maximumHeapBytes: heapMaximum});
      requireValue(module?.HEAPU8 instanceof Uint8Array && module.HEAPU8.buffer === memory.buffer && module.HEAPU8.byteLength <= heapMaximum && typeof module._ssg_vlfeat_detect === 'function', 'Invalid VLFeat runtime.');
      checkAbort(signal); return false;
    } catch (error) {
      const previousBusy = busy; busy = false; retire(); busy = previousBusy; throw error;
    }
  }
  return {
    get residentBytes() {return module?.HEAPU8.byteLength ?? 0;},
    get reservedBytes() {return releaseHeap ? heapMaximum : 0;},
    async run({gray, width, height, layout = 'row-major'}, {signal, onProgress, heapBytes} = {}) {
      if (disposed) throw new EngineError('DISPOSED', 'VLFeat detector disposed.');
      if (busy) throw new EngineError('BUSY', 'VLFeat detector busy.');
      const plan = ssgVlfeatMemoryPlan({width, height, heapBytes});
      requireValue(gray instanceof Float32Array && gray.length === width * height && gray.every(Number.isFinite) && ['row-major', 'matlab-column-major'].includes(layout), 'Qualified Float32 grayscale and memory layout required.');
      checkAbort(signal); busy = true;
      let input = 0, framesOwner, pointsOwner, complete = false, invalidArena = false;
      const started = performance.now(), cooperate = createCooperator(signal);
      const allocationError = (label, bytes, cause, details = {}) => {
        const error = wasmAllocationFailure(module, label, bytes, cause);
        error.details = {...error.details, maximumBytes: heapMaximum, width, height, stage: 'ssg-vlfeat-detect', ...details}; return error;
      };
      try {
        const reused = await ensure(plan, signal), inputBytes = gray.byteLength;
        input = module._malloc(inputBytes);
        if (!input) {invalidArena = true; throw allocationError('VLFeat input allocation failed.', inputBytes, undefined, {stage: 'ssg-vlfeat-input'});}
        const offset = input / 4;
        if (layout === 'matlab-column-major') module.HEAPF32.set(gray, offset);
        else for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) module.HEAPF32[offset + x * height + y] = gray[y * width + x];
          if ((x + 1) % 64 === 0) await cooperate();
        }
        checkAbort(signal); onProgress?.({phase: 'ssg-vlfeat', stage: 'detect', completed: 0, total: 1}); checkAbort(signal);
        const detectStart = performance.now(); let count;
        try {count = module._ssg_vlfeat_detect(input, height, width);}
        catch (cause) {
          invalidArena = true;
          const bytes = module._ssg_vlfeat_allocation_bytes?.() ?? 0;
          if (bytes) throw allocationError('VLFeat native allocator refused a workspace.', bytes, cause);
          throw new EngineError('FEATURE_EXTRACTION_FAILED', 'VLFeat native detector failed.', {cause, details: {stage: 'ssg-vlfeat-detect'}});
        }
        const detectMs = performance.now() - detectStart;
        if (count === -2 || count === -3) {
          invalidArena = true;
          throw allocationError('VLFeat native allocator refused a workspace.', module._ssg_vlfeat_allocation_bytes?.(), undefined, {nativeStatus: count});
        }
        requireValue(Number.isSafeInteger(count) && count >= 0, 'VLFeat native frame count invalid.');
        const pointer = module._ssg_vlfeat_output();
        requireValue(Number.isSafeInteger(pointer) && pointer >= 0 && pointer % 8 === 0 && pointer + count * 32 <= module.HEAPU8.byteLength && (!count || pointer > 0), 'VLFeat native frame span invalid.');
        checkAbort(signal);
        framesOwner = allocateOwnedTypedArray(Float64Array, count * 4, {budget, owner: 'ssg-vlfeat-result', label: 'VLFeat frames'});
        pointsOwner = allocateOwnedTypedArray(Float64Array, count * 3, {budget, owner: 'ssg-vlfeat-result', label: 'VLFeat point geometry'});
        const frames = framesOwner.data, points = pointsOwner.data;
        frames.set(module.HEAPF64.subarray(pointer / 8, pointer / 8 + count * 4));
        requireValue(frames.every(Number.isFinite), 'VLFeat returned nonfinite geometry.');
        for (let i = 0; i < count; i++) {
          // Native MATLAB frames are one-based x,y. The scientific core uses
          // zero-based x,y,sigma; keep every orientation duplicate intact.
          points[i * 3] = Math.round(frames[i * 4]) - 1;
          points[i * 3 + 1] = Math.round(frames[i * 4 + 1]) - 1;
          points[i * 3 + 2] = frames[i * 4 + 2];
        }
        const heapActual = module.HEAPU8.byteLength;
        onProgress?.({phase: 'ssg-vlfeat', stage: 'complete', completed: 1, total: 1, count}); checkAbort(signal);
        complete = true;
        const result = {frames, points, count, heapBytes: heapActual, reference: SSG_VLFEAT_REFERENCE,
          metrics: {totalMs: performance.now() - started, detectMs, runtimeReused: reused, heapActualBytes: heapActual, reservedHeapBytes: heapMaximum, inputLayout: layout, scalarKernel: true},
          release() {framesOwner.release(); pointsOwner.release(); result.frames = result.points = null;}};
        return result;
      } finally {
        if (!invalidArena) {module?._ssg_vlfeat_release?.(); if (input) module?._free(input);}
        if (!complete) {framesOwner?.release(); pointsOwner?.release();}
        busy = false; if (invalidArena) retire();
      }
    },
    releaseIdle: retire,
    dispose() {if (busy) throw new EngineError('BUSY', 'VLFeat detector busy.'); retire(); unregister?.(); disposed = true;},
  };
}
