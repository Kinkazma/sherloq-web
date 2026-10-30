import {Budget} from '../../src/cache.js';
import {createNeuralMath} from './neural-math.js';
export async function pointStudy(factory, cases, layouts, read) {
  const budget = new Budget(128 * 1024 ** 2), math = await createNeuralMath(factory, {budget}), records = [];
  try {
    for (const {kind, row} of cases) {
      const tensors = []; for (const spec of [row.input, row.weights, row.bias]) tensors.push({data: await read(kind, spec), shape: spec.shape});
      const mode = layouts.records.find(r => r.channels === row.input.shape[1] && r.outChannels === row.weights.shape[0])?.mode;
      if (!mode) throw Error('Missing point layout');
      const result = await math.run('PointConvProbe', tensors, {mode});
      try {
        const expected = await read(kind, row.output), actual = result.data, ab = new Uint32Array(actual.buffer, actual.byteOffset, actual.length), eb = new Uint32Array(expected.buffer, expected.byteOffset, expected.length);
        if (actual.length !== expected.length) throw Error('Point shape'); let different = 0, maxAbs = 0, nonfinite = 0;
        for (let i = 0; i < actual.length; i++) { different += ab[i] !== eb[i]; maxAbs = Math.max(maxAbs, Math.abs(actual[i] - expected[i])); nonfinite += !Number.isFinite(actual[i]); }
        records.push({kind, name: row.name, mode, elements: actual.length, different, maxAbs, nonfinite});
      } finally { result.release(); }
    }
    math.dispose(); const released = budget.total() === 0;
    return {schema: 1, status: released && records.every(r => !r.different && !r.nonfinite) ? 'passed' : 'rejected', scope: '64 independently generated point-convolution cases plus all108 native UNet point boundaries on the generated model source. Global output-channel index preserved across cooperative chunks. No complete-model claim.', records, peakAccountedBytes: budget.peak, allReservationsReleased: released};
  } finally { math.dispose(); }
}
