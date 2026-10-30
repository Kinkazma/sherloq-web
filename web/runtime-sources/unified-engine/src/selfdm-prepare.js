import "../../runtime-context.js?v=0.30.0";
// SelfDM utilsdm.imreadtonumpy: OpenCV INTER_LINEAR on float64 BGR, channel
// means, then float32 NCHW. This is deliberately not Pillow RGB / 255.
import {EngineError, requireValue, checkAbort, createCooperator, serializeEngineError} from './errors.js';
import {validateRgbRows} from './rgb-row-source.js';

const MEANS = [104.008, 116.669, 122.675];
function coordinates(input, output) {
  const starts = new Int32Array(output), weights = new Float32Array(output);
  const scale = input / output;
  for (let i = 0; i < output; i++) {
    // OpenCV's float64 resize uses float32 interpolation coefficients and
    // half-pixel coordinates; edge pixels are replicated.
    let position = Math.fround((i + .5) * scale - .5), first = Math.floor(position);
    position = Math.fround(position - first);
    if (first < 0) {first = 0; position = 0;}
    if (first >= input - 1) {first = input - 1; position = 0;}
    starts[i] = first; weights[i] = position;
  }
  return {starts, weights};
}

export function createSelfDMPrepare({budget}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  let busy = false, disposed = false;
  return {
    async run({data, readRows, width, height, side}, {signal, onProgress, rowsPerRead} = {}) {
      if (busy) throw new EngineError('BUSY', 'SelfDM preparation busy');
      const streamed = typeof readRows === 'function';
      requireValue(!disposed && [width, height].every(value => Number.isInteger(value) && value > 0 && value <= (streamed ? 131072 : 8192)) && (streamed || width * height <= 32 * 1024 ** 2) && side === 512, 'SelfDM preparation geometry');
      requireValue(streamed ? data === undefined : (readRows === undefined && (data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.length === width * height * 3), 'Exclusive qualified RGB8 data or row provider required');
      requireValue(rowsPerRead === undefined || Number.isSafeInteger(rowsPerRead) && rowsPerRead > 0, 'Preparation row group');
      const batchRows = Math.min(height, rowsPerRead ?? Math.max(1, Math.floor(262144 / width)));
      checkAbort(signal); busy = true;
      let scratchRelease, outputRelease, window, primaryError, windowY = 0, windowRows = 0, complete = false, sourceReads = 0, readMs = 0;
      const started = performance.now(), cooperate = createCooperator(signal);
      try {
        // The caller owns data; a readRows result owns its source-window lease.
        // Neither is copied here. Charge only our coefficients and two rows,
        // so a shared image surface is not counted again as preparation RAM.
        scratchRelease = budget.reserve(side * 16 + side * 3 * 8 * 2);
        outputRelease = budget.reserve(side * side * 15);
        const cx = coordinates(width, side), cy = coordinates(height, side);
        const rgb = new Uint8Array(side * side * 3), tensor = new Float32Array(side * side * 3), rows = new Map();
        const horizontal = async sourceY => {
          if (rows.has(sourceY)) return rows.get(sourceY);
          let source = data, rowY = sourceY;
          if (streamed) {
            if (!window || sourceY < windowY || sourceY >= windowY + windowRows) {
              const previous = window; window = null; previous?.release(); windowY = sourceY; windowRows = Math.min(batchRows, height - sourceY);
              const at = performance.now(); window = await readRows(windowY, windowRows, {signal});
              validateRgbRows(window, width, windowRows); checkAbort(signal);
              sourceReads++; readMs += performance.now() - at;
            }
            source = window.pixels.data; rowY = sourceY - windowY;
          }
          const result = new Float64Array(side * 3), rowOffset = rowY * width * 3;
          for (let x = 0; x < side; x++) {
            const first = cx.starts[x], right = Math.min(width - 1, first + 1);
            const secondWeight = cx.weights[x], firstWeight = Math.fround(1 - secondWeight);
            for (let c = 0; c < 3; c++) result[x * 3 + c] = source[rowOffset + first * 3 + c] * firstWeight + source[rowOffset + right * 3 + c] * secondWeight;
          }
          rows.set(sourceY, result); return result;
        };
        for (let y = 0; y < side; y++) {
          const first = cy.starts[y], below = Math.min(height - 1, first + 1);
          for (const key of rows.keys()) if (key !== first && key !== below) rows.delete(key);
          const top = await horizontal(first), bottom = await horizontal(below);
          const secondWeight = cy.weights[y], firstWeight = Math.fround(1 - secondWeight);
          for (let x = 0; x < side; x++) for (let c = 0; c < 3; c++) {
            const value = top[x * 3 + c] * firstWeight + bottom[x * 3 + c] * secondWeight;
            rgb[(y * side + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(value)));
            tensor[(2 - c) * side * side + y * side + x] = value - MEANS[2 - c];
          }
          if ((y + 1) % 16 === 0 || y + 1 === side) onProgress?.({phase: 'selfdm-preparation', completed: y + 1, total: side});
          await cooperate();
        }
        checkAbort(signal); complete = true;
        return {rgb, tensor, shape: [1, 3, side, side], release: outputRelease, metrics: {totalMs: performance.now() - started, sourceReads, readMs, rowsPerRead: streamed ? batchRows : 0}};
      } catch (error) {
        primaryError = error; throw error;
      } finally {
        let cleanupFailure;
        const cleanup = release => {
          try {release?.();} catch (error) {
            const retained = primaryError ?? cleanupFailure;
            if (retained) retained.details = {...retained.details, cleanupErrors: [...(retained.details?.cleanupErrors ?? []), serializeEngineError(error)]};
            else cleanupFailure = error;
          }
        };
        const previous = window; window = null;
        cleanup(previous && (() => previous.release?.())); cleanup(scratchRelease);
        if (!complete || primaryError || cleanupFailure) cleanup(outputRelease);
        busy = false;
        if (!primaryError && cleanupFailure) throw cleanupFailure;
      }
    },
    dispose() {requireValue(!busy, 'SelfDM preparation busy'); disposed = true;}
  };
}
