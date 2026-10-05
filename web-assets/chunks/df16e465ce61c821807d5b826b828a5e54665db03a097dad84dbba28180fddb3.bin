// Independent cached model grids -> source-coordinate maps and masks.
// Exclusions follow the native D2PRL output-mask policy; they do not blacken
// inference crops. Refiltering calls no neural model and retains no fake scores.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
const SIDE = 448, N = SIDE * SIDE;
export function createD2prlZones({budget, postprocess, spatial}) {
  let busy = false;
  return {
    async run({width, height, zones, exclusions = [], minimum = 500, mode = 'regions'}, {signal, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'D2PRL zone projection busy');
      requireValue([width, height, minimum].every(Number.isInteger) && width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 32 * 1024 ** 2 && minimum >= 0 && minimum <= 5000, 'D2PRL source geometry and component minimum');
      requireValue(Array.isArray(zones) && zones.length >= 1 && zones.length <= 256 && Array.isArray(exclusions) && exclusions.length <= 256, 'Explicit independent zones required');
      requireValue(mode === 'regions' || mode === 'whole-image', 'Explicit D2PRL region mode');
      if (mode === 'whole-image') requireValue(zones.length === 1 && JSON.stringify(zones[0].bounds) === JSON.stringify([0, 0, width, height]), 'Whole-image mode requires its single complete rectangle');
      const bounds = (rect, minimumSide = 8) => requireValue(Array.isArray(rect) && rect.length === 4 && rect.every(Number.isInteger) && rect[0] >= 0 && rect[1] >= 0 && rect[2] <= width && rect[3] <= height && rect[2] - rect[0] >= minimumSide && rect[3] - rect[1] >= minimumSide, 'Valid half-open source rectangle required');
      const ids = new Set();
      for (const zone of zones) { bounds(zone.bounds, mode === 'whole-image' ? 1 : 8); requireValue(typeof zone.id === 'string' && zone.id.length > 0 && !ids.has(zone.id) && zone.raw instanceof Float32Array && zone.raw.length === 3 * N, 'Unique zone and owned native-grid scores required'); ids.add(zone.id); }
      exclusions.forEach(rect => bounds(rect)); checkAbort(signal); busy = true;
      let borrowed, outputRelease, complete = false, stamp = performance.now();
      const checkpoint = async () => { if (performance.now() - stamp >= 8) { await controlCheckpoint(signal); stamp = performance.now(); } };
      try {
        borrowed = budget.reserve(zones.reduce((n, z) => n + z.raw.byteLength, 0)); outputRelease = budget.reserve(width * height * 15);
        const n = width * height, map = new Float32Array(n), mask = new Uint8Array(n), target = new Float32Array(n), source = new Float32Array(n), analyzed = new Uint8Array(n), candidates = new Uint8Array(n), metadata = [];
        for (let index = 0; index < zones.length; index++) {
          const zone = zones[index], [x0, y0, x1, y1] = zone.bounds, w = x1 - x0, h = y1 - y0;
          const processed = await postprocess.run({raw: zone.raw, minimum}, {signal});
          try {
            let present = false;
            for (const value of processed.masks.subarray(0, N)) if (value) { present = true; break; }
            for (let plane = 0; plane < 4; plane++) {
              const input = plane === 0 ? zone.raw.subarray(0, N) : processed.masks.subarray((plane - 1) * N, plane * N);
              const resized = await spatial.run({input, outWidth: w, outHeight: h, nearest: plane !== 0}, {signal});
              try {
                const dest = [map, mask, target, source][plane];
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) { const at = (y + y0) * width + x + x0; dest[at] = Math.max(dest[at], resized.data[y * w + x]); if (plane === 0) analyzed[at] = 1; }
                  await checkpoint();
                }
              } finally { resized.release(); }
            }
            metadata.push({id: zone.id, bounds: [...zone.bounds], origin: [x0, y0], analysis_shape: [3, SIDE, SIDE], status: present ? 'ok' : 'empty', input_side: SIDE, patchmatch_iterations: 40, seed: 22, min_component: minimum, role_filter: 50});
          } finally { processed.release(); }
          onProgress?.({phase: 'zone-projection', completed: index + 1, total: zones.length}); checkAbort(signal);
        }
        for (const [x0, y0, x1, y1] of exclusions) for (let y = y0; y < y1; y++) {
          const start = y * width + x0, end = y * width + x1;
          for (const a of [map, mask, target, source, analyzed]) a.fill(0, start, end); await checkpoint();
        }
        checkAbort(signal); complete = true;
        return {width, height, map, mask, target, source, analyzed, candidates, metadata: {boxes: zones.map(z => [...z.bounds]), zones: metadata, exclusions: exclusions.map(r => [...r]), min_component: minimum, status: mask.some(Boolean) ? 'ok' : 'empty', probability_interpolation: 'bilinear', mask_interpolation: 'nearest', exclusion_policy: 'output-only-native-d2prl', inference_performed: false}, release: outputRelease};
      } finally { borrowed?.(); if (!complete) outputRelease?.(); busy = false; }
    }
  };
}
