// RGB8 -> Pillow12.2 bilinear RGB8 -> float32 NCHW, as clone_models.segment.
// Coefficient/rounding rules adapted from Pillow's MIT-CMU Resample.c;
// see Pillow-LICENSE and README.md. This is not D2PRL's tensor interpolation.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
import {validateRgbRows} from '../../src/rgb-row-source.js';
const SCALE = 2 ** 22, HALF = SCALE / 2;

function coefficients(input, output) {
  const scale = input / output, support = Math.max(1, scale), stride = Math.ceil(support) * 2 + 1;
  const starts = new Int32Array(output), counts = new Int32Array(output), weights = new Int32Array(output * stride), scratch = new Float64Array(stride);
  for (let i = 0; i < output; i++) {
    const center = (i + .5) * scale, first = Math.max(0, Math.trunc(center - support + .5));
    const count = Math.min(input, Math.trunc(center + support + .5)) - first;
    let sum = 0;
    for (let j = 0; j < count; j++) { const x = Math.abs((j + first - center + .5) * (1 / support)); scratch[j] = x < 1 ? 1 - x : 0; sum += scratch[j]; }
    for (let j = 0; j < count; j++) weights[i * stride + j] = Math.trunc(.5 + scratch[j] / sum * SCALE);
    starts[i] = first; counts[i] = count;
  }
  return {starts, counts, weights, stride};
}
const clip = sum => Math.min(255, Math.max(0, Math.floor(sum / SCALE)));

export function createSegmentationPrepare({budget}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  let busy = false, disposed = false;
  return {
    async run({data, readRows, width, height, side}, {signal, onProgress, rowsPerRead} = {}) {
      if (busy) throw new EngineError('BUSY', 'Segmentation preparation busy');
      const streamed=typeof readRows==='function';
      requireValue(!disposed && [width, height].every(v => Number.isInteger(v) && v > 0 && v <= (streamed?131072:8192)) && (streamed||width * height <= 32 * 1024 ** 2) && [256, 512].includes(side), 'Segmentation preparation geometry');
      requireValue(streamed?data===undefined:(readRows===undefined&&(data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.length === width * height * 3), 'Exclusive qualified RGB8 data or row provider required');
      requireValue(rowsPerRead===undefined||Number.isSafeInteger(rowsPerRead)&&rowsPerRead>0,'Preparation row group');
      const batchRows=Math.min(height,rowsPerRead??Math.max(1,Math.floor(262144/width)));
      checkAbort(signal); busy = true;
      let scratchRelease, outputRelease, window,windowY=0,windowRows=0,sourceReads=0,readMs=0,complete = false, stamp = performance.now();const began=stamp;
      const yieldIfNeeded = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        const xStride = 2 * Math.ceil(Math.max(1, width / side)) + 1, yStride = 2 * Math.ceil(Math.max(1, height / side)) + 1;
        // At most yStride horizontally filtered rows, not a full source-height
        // intermediate. Integer sums are exact in Number (well below 2^53).
        const scratchBytes = (streamed?width*batchRows*3:data.byteLength) + side * (xStride + yStride) * 4 + side * 16 + (xStride + yStride) * 8 + yStride * side * 3;
        scratchRelease = budget.reserve(scratchBytes); outputRelease = budget.reserve(side * side * 15);
        const cx = coefficients(width, side), cy = coefficients(height, side);
        const rgb = new Uint8Array(side * side * 3), tensor = new Float32Array(side * side * 3), rows = new Map();
        for (let y = 0; y < side; y++) {
          const first = cy.starts[y], count = cy.counts[y];
          for (const key of rows.keys()) if (key < first || key >= first + count) rows.delete(key);
          for (let j = 0; j < count; j++) {
            const sy = first + j; if (rows.has(sy)) continue;
            let source=data,sourceY=sy;
            if(streamed){
              if(!window||sy<windowY||sy>=windowY+windowRows){window?.release();window=null;windowY=sy;windowRows=Math.min(batchRows,height-sy);const at=performance.now();window=await readRows(windowY,windowRows,{signal});validateRgbRows(window,width,windowRows);checkAbort(signal);readMs+=performance.now()-at;sourceReads++;}
              source=window.pixels.data;sourceY=sy-windowY;
            }
            const row = new Uint8Array(side * 3);
            if (width === side) row.set(source.subarray(sourceY * width * 3, (sourceY + 1) * width * 3));
            else for (let x = 0; x < side; x++) {
              const start = (sourceY * width + cx.starts[x]) * 3, offset = x * cx.stride;
              for (let c = 0; c < 3; c++) {
                let sum = HALF; for (let k = 0; k < cx.counts[x]; k++) sum += source[start + k * 3 + c] * cx.weights[offset + k];
                row[x * 3 + c] = clip(sum);
              }
            }
            rows.set(sy, row); await yieldIfNeeded();
          }
          for (let x = 0; x < side * 3; x++) {
            let value;
            if (height === side) value = rows.get(y)[x];
            else { let sum = HALF; for (let j = 0; j < count; j++) sum += rows.get(first + j)[x] * cy.weights[y * cy.stride + j]; value = clip(sum); }
            rgb[y * side * 3 + x] = value;
            tensor[(x % 3) * side * side + y * side + Math.floor(x / 3)] = value / 255;
          }
          if ((y + 1) % 16 === 0 || y + 1 === side) onProgress?.({phase: 'segmentation-preparation', completed: y + 1, total: side});
          await yieldIfNeeded();
        }
        checkAbort(signal); complete = true;
        return {rgb, tensor, shape: [1, 3, side, side], release: outputRelease,metrics:{totalMs:performance.now()-began,readMs,sourceReads,rowsPerRead:streamed?batchRows:0}};
      } finally { window?.release?.();scratchRelease?.(); if (!complete) outputRelease?.(); busy = false; }
    },
    dispose() { requireValue(!busy, 'Segmentation preparation busy'); disposed = true; }
  };
}
