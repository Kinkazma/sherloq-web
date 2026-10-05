// Independent native segmentation grids -> source coordinates. Spatial kernels
// are supplied by the qualified backend; this module performs no inference.
import {requireValue, checkAbort, controlCheckpoint, EngineError} from '../../src/errors.js';
import {segmentationProbabilities} from './probabilities.js';

export function createSegmentationZones({budget, spatial}) {
  requireValue(budget && typeof budget.reserve === 'function' && typeof spatial?.run === 'function', 'Shared budget and spatial backend required');
  let busy = false;
  return {
    async run({width, height, zones, side, kind, mode = 'regions', exclusions = [], compare = false}, {signal, onProgress} = {}) {
      if (busy) throw new EngineError('BUSY', 'Segmentation projection busy');
      requireValue([width, height].every(v => Number.isInteger(v) && v > 0 && v <= 8192) && width * height <= 32 * 1024 ** 2, 'Segmentation source geometry');
      requireValue([256, 512].includes(side) && ['sigmoid', 'softmax'].includes(kind) && (kind !== 'softmax' || side === 256), 'Native model grid');
      requireValue(Array.isArray(exclusions) && exclusions.length === 0 && compare === false, 'Native CMSeg/MGCF detectors do not support exclusions or Compare');
      requireValue(['regions', 'whole-image'].includes(mode) && Array.isArray(zones) && zones.length > 0 && zones.length <= 256, 'Explicit independent model grids required');
      if (mode === 'whole-image') requireValue(zones.length === 1 && JSON.stringify(zones[0].bounds) === JSON.stringify([0, 0, width, height]), 'Whole image must cover the source');
      const roles = kind === 'softmax', ids = new Set(), channels = roles ? 3 : 1;
      for (const zone of zones) {
        const b = zone.bounds, minimum = mode === 'whole-image' ? 1 : 8;
        requireValue(Array.isArray(b) && b.length === 4 && b.every(Number.isInteger) && b[0] >= 0 && b[1] >= 0 && b[2] <= width && b[3] <= height && b[2] - b[0] >= minimum && b[3] - b[1] >= minimum, 'Valid half-open source rectangle required');
        requireValue(typeof zone.id === 'string' && zone.id.length > 0 && !ids.has(zone.id) && zone.raw instanceof Float32Array && zone.raw.length === channels * side * side, 'Unique zone identity and raw probability grid required');
        ids.add(zone.id);
      }
      checkAbort(signal); busy = true;
      let borrowed, outputRelease, complete = false, stamp = performance.now();
      const checkpoint = async () => {if (performance.now() - stamp >= 8) {await controlCheckpoint(signal); stamp = performance.now();}};
      try {
        borrowed = budget.reserve(zones.reduce((n, zone) => n + zone.raw.byteLength, 0));
        outputRelease = budget.reserve(width * height * (roles ? 15 : 7));
        const n = width * height, map = new Float32Array(n), mask = new Uint8Array(n), analyzed = new Uint8Array(n), candidates = new Uint8Array(n);
        const target = roles ? new Float32Array(n) : undefined, source = roles ? new Float32Array(n) : undefined, metadata = [];
        for (let index = 0; index < zones.length; index++) {
          const zone = zones[index], [x0, y0, x1, y1] = zone.bounds, w = x1 - x0, h = y1 - y0;
          const grid = await segmentationProbabilities({raw: zone.raw, side, kind}, {budget, signal});
          let projectedForeground = false;
          try {
            for (const [name, destination] of [['map', map], ['mask', mask], ...(roles ? [['target', target], ['source', source]] : [])]) {
              let temporaryRelease, input = grid[name];
              try {
                if (name === 'mask') {temporaryRelease = budget.reserve(input.length * 4); input = Float32Array.from(input);}
                const resized = await spatial.run({input, width: side, height: side, outWidth: w, outHeight: h, nearest: name === 'mask'}, {signal});
                try {
                  requireValue(resized.data instanceof Float32Array && resized.data.length === w * h, 'Spatial backend output shape');
                  for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                      const value = resized.data[y * w + x], at = (y + y0) * width + x + x0;
                      requireValue(Number.isFinite(value) && (name !== 'mask' || value === 0 || value === 1), 'Spatial backend finite map or binary mask');
                      destination[at] = Math.max(destination[at], value);
                      if (name === 'map') analyzed[at] = 1;
                      if (name === 'mask' && value) projectedForeground = true;
                    }
                    await checkpoint();
                  }
                } finally {resized.release();}
              } finally {temporaryRelease?.();}
            }
          } finally {grid.release();}
          metadata.push({id: zone.id, bounds: [...zone.bounds], origin: [x0, y0], analysis_shape: [channels, side, side], status: projectedForeground ? 'ok' : 'empty'});
          onProgress?.({phase: 'segmentation-projection', completed: index + 1, total: zones.length}); checkAbort(signal);
        }
        checkAbort(signal); complete = true;
        return {width, height, map, mask, analyzed, candidates, ...(roles ? {target, source} : {}), metadata: {boxes: zones.map(z => [...z.bounds]), zones: metadata, status: mask.some(Boolean) ? 'ok' : 'empty', channel_order: roles ? ['target', 'source', 'background'] : ['union_probability'], threshold: .5, threshold_rule: roles ? 'target>=0.5 OR source>=0.5' : 'probability>0.5', probability_interpolation: 'bilinear', mask_interpolation: 'nearest', inference_performed: false, raw_filter_applied: false}, release: outputRelease};
      } finally {borrowed?.(); if (!complete) outputRelease?.(); busy = false;}
    }
  };
}
