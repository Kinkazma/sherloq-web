// Private composed DLF + dedicated union head. Inputs are actual PatchMatch
// outputs. Only checkpoint parameters are loaded; no expected activation input.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
const SIDE = 448, N = SIDE * SIDE;
export function createUnionHead({dlf, convolution, featureMath, neuralMath, budget, layers, batchnorm, dlfWeights, layouts, loadParameter}) {
  requireValue(budget && layers?.length === 5 && batchnorm?.length === 4 && typeof loadParameter === 'function', 'Union model dependencies');
  let busy = false;
  const parameter = async (kind, spec, signal) => {
    const release = budget.reserve(spec.bytes); let staging;
    try {
      staging = budget.reserve(3 * spec.bytes);
      const data = await loadParameter(kind, spec, {signal}); checkAbort(signal);
      requireValue(data instanceof Float32Array && data.byteLength === spec.bytes, 'Union parameter');
      return {data, release};
    } catch (e) { release(); throw e; } finally { staging?.(); }
  };
  return {
    async run({offsets, coordinates}, {signal, onStage} = {}) {
      if (busy) throw new EngineError('BUSY', 'Union head busy');
      const arrays = [offsets?.zm?.x, offsets?.zm?.y, offsets?.cnn?.x, offsets?.cnn?.y, coordinates?.zm?.x, coordinates?.zm?.y, coordinates?.cnn?.x, coordinates?.cnn?.y];
      requireValue(arrays.every(a => a instanceof Float32Array && a.length === N), 'PatchMatch448 outputs required');
      checkAbort(signal); busy = true; let borrowed, current, pending, result, complete = false;
      const held = new Set();
      const get = async (kind, spec) => { const p = await parameter(kind, spec, signal); held.add(p); return p; };
      const free = p => { p.release(); held.delete(p); };
      try {
        borrowed = budget.reserve(arrays.reduce((n, a) => n + a.byteLength, 0));
        const release = budget.reserve(10 * N * 4);
        try { current = {data: new Float32Array(10 * N), shape: [1, 10, SIDE, SIDE], release}; } catch (e) { release(); throw e; }
        current.data.set(arrays[0], 0); current.data.set(arrays[1], N); current.data.set(arrays[2], 5 * N); current.data.set(arrays[3], 6 * N);
        for (let i = 0; i < 3; i++) {
          const kernel = [7, 9, 11][i], weights = await get('dlf', dlfWeights[kernel]);
          for (const kind of ['zm', 'cnn']) {
            const c = coordinates[kind];
            const values = await dlf.run({x: c.x, y: c.y, weights: weights.data, kernel}, {signal});
            try { await onStage?.('dlf-' + kernel + '-' + kind, values.scores); current.data.set(values.scores, (kind === 'zm' ? 2 + i : 7 + i) * N); }
            finally { values.release(); }
          }
          free(weights);
        }
        await onStage?.('union-input', current.data);
        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i], weights = await get('union', layer.weights), bias = await get('union', layer.bias);
          pending = await convolution.run({input: current.data, weights: weights.data, bias: bias.data, channels: current.shape[1], height: SIDE, width: SIDE, outChannels: layer.weights.shape[0], kernel: layer.weights.shape[2], padding: layer.padding, referenceLayout: layouts.records.find(r => r.name === layer.name)}, {signal});
          free(weights); free(bias); current.release(); current = pending; pending = null; await onStage?.(layer.name, current.data);
          if (i < batchnorm.length) {
            const bn = batchnorm[i], params = await get('union', bn.params);
            pending = await featureMath.run('affine', {input: current.data, channels: current.shape[1], height: SIDE, width: SIDE, params: params.data, epsilon: bn.epsilon}, {signal});
            pending.shape = current.shape; free(params); current.release(); current = pending; pending = null; await onStage?.(layer.name + '-relu', current.data);
          }
        }
        result = await neuralMath.run('Sigmoid', [current], {}, {signal}); await onStage?.('union-sigmoid', result.data); checkAbort(signal); complete = true; return result;
      } finally { current?.release(); pending?.release(); if (!complete) result?.release(); for (const p of held) p.release(); borrowed?.(); busy = false; }
    }
  };
}
