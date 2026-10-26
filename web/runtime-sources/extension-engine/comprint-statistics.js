import "../runtime-context.js?v=0.25.0";
/** Browser-only Comprint preprocessing and statistics bridge.
 * The network uses ONNX Runtime Web; postprocess uses the exact original
 * SPAM/PCA/EM functions inside Pyodide WASM, not an installed Python runtime.
 */
export const COMPRINT_STATISTICS_SHA256 = '857ce24f89f3fd87aec58de96b72024f9343910f69b9ae2502b9cb00eb435ec9';
export const COMPRINT_SOURCE_REVISION = 'e79cd7d9bc768cde6d0fbf77d4cea79ec31ce2aa';
import {allocateTypedArray} from '../unified-engine/src/allocation.js';
const f = Math.fround;

export function prepareComprintInput(rgb, width, height) {
  const n = width * height;
  if (!(rgb instanceof Uint8Array) || !Number.isSafeInteger(n) || n < 1 || rgb.length !== n * 3) throw Error('Comprint requires original RGB8 pixels');
  const luminance = new Float32Array(n), normalized = new Float32Array(n);
  const r = f(.299), g = f(.587), b = f(.114), scale = f(1 / 255);
  for (let i = 0; i < n; i++) {
    // NumPy float32 arithmetic from the official Pillow loader, no RGB rounding.
    const y = f(f(f(r * rgb[3*i]) + f(g * rgb[3*i+1])) + f(b * rgb[3*i+2]));
    luminance[i] = f(y / 256);
    normalized[i] = f(f(f(luminance[i] * 256) - 127.5) * scale);
  }
  return {luminance, normalized, dims: [1, height, width, 1], width, height};
}

/** Match the authors' nearest-coordinate extrapolation, without stretching a
 * grid by image dimensions or restarting the global model at tile boundaries.
 */
export function rasterComprintMap(map, valid, range0, range1, width, height, output) {
  const ny = range0.length, nx = range1.length;
  if (map.length !== nx*ny || valid.length !== map.length) throw Error('Comprint grid geometry mismatch');
  let min = Infinity; for (let i = 0; i < map.length; i++) if (valid[i]) min = Math.min(min, map[i]);
  if (!Number.isFinite(min)) throw Error('No valid Comprint map cells');
  const index = (coordinate, values) => {
    let lo = 0, hi = values.length - 1;
    while (lo < hi) { const middle = (lo + hi) >>> 1; if (coordinate <= (values[middle] + values[middle+1])/2) hi = middle; else lo = middle + 1; }
    return lo;
  };
  const columns = Int32Array.from({length: width}, (_, x) => index(x, range1));
  output ??= allocateTypedArray(Float64Array,width * height,{label:'Comprint full native anomaly map'});
  if(!(output instanceof Float64Array)||output.length!==width*height)throw Error('Comprint full map output must be matching Float64Array');
  for (let y = 0; y < height; y++) { const row = index(y, range0) * nx; for (let x = 0; x < width; x++) { const at = row + columns[x]; output[y*width+x] = valid[at] ? map[at] : min; } }
  return output;
}

export {runComprintFingerprint,runComprintFingerprintSource} from './comprint-inference.js';

export {createComprintParallelStatistics as createComprintStatistics} from './comprint-parallel-statistics.js';
export {estimateComprintStatisticsPlan} from './comprint-streaming-statistics.js';

export {runComprintNativeContexts} from './comprint-native-contexts.js';
