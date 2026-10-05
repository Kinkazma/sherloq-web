// Native clone_detectors.py probability semantics on the model grid.
// No components, hole filling, thresholds supplied by the UI or role residuals.
import {requireValue, checkAbort, controlCheckpoint} from '../../src/errors.js';

export async function segmentationProbabilities({raw, side, kind}, {budget, signal} = {}) {
  requireValue(budget && typeof budget.reserve === 'function', 'Shared budget required');
  requireValue([256, 512].includes(side) && ['sigmoid', 'softmax'].includes(kind), 'Native segmentation model grid required');
  const n = side * side, roles = kind === 'softmax';
  requireValue(!roles || side === 256, 'Only MGCFDN source/target has three channels');
  requireValue(raw instanceof Float32Array && raw.length === n * (roles ? 3 : 1), 'Probability grid shape');
  checkAbort(signal); let borrowed, outputRelease, complete = false;
  try {
    borrowed = budget.reserve(raw.byteLength); outputRelease = budget.reserve(n * (roles ? 13 : 5));
    const map = new Float32Array(n), mask = new Uint8Array(n), target = roles ? new Float32Array(n) : undefined, source = roles ? new Float32Array(n) : undefined;
    let foreground = 0, stamp = performance.now();
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < (roles ? 3 : 1); c++) requireValue(Number.isFinite(raw[c * n + i]) && raw[c * n + i] >= 0 && raw[c * n + i] <= 1, 'Finite probabilities in [0,1] required');
      if (roles) {
        target[i] = raw[i]; source[i] = raw[n + i];
        map[i] = raw[i] + raw[n + i]; mask[i] = Number(raw[i] >= .5 || raw[n + i] >= .5);
      } else {map[i] = raw[i]; mask[i] = Number(raw[i] > .5);}
      foreground += mask[i];
      if ((i & 4095) === 0 && performance.now() - stamp >= 8) {await controlCheckpoint(signal); stamp = performance.now();}
    }
    checkAbort(signal); complete = true;
    return {map, mask, ...(roles ? {target, source} : {}), metadata: {threshold: .5, thresholdRule: roles ? 'target>=0.5 OR source>=0.5' : 'probability>0.5', foreground, status: foreground ? 'ok' : 'empty', channelOrder: roles ? ['target', 'source', 'background'] : ['union_probability'], rawFilterApplied: false}, release: outputRelease};
  } finally {borrowed?.(); if (!complete) outputRelease?.();}
}
