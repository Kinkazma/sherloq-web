import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/d2prl-convolution-cpu/convolution.js';
const root = new URL('../', import.meta.url), hash = b => createHash('sha256').update(b).digest('hex'), module = await factory(), records = [];
const tails = {'encoder_stages.3.0.downsample.0': 768, 'encoder_stages.4.0.downsample.0': 192, 'decoder_stages.3.layer.1': 768, 'bottlenecks.0.seq.0': 768};
for (const [kind, file, layoutFile] of [['convolution', 'all-reference.json', 'gemm-layout-all.json'], ['union', 'reference.json', 'gemm-layout-union.json'], ['unet-convolution', 'reference.json', 'gemm-layout-unet.json']]) {
  const base = new URL('.build/d2prl-' + kind + '/', root), reference = JSON.parse(await readFile(new URL(file, base))), layout = JSON.parse(await readFile(new URL('fixtures/d2prl/' + layoutFile, root)));
  const read = async spec => { const b = await readFile(new URL(spec.file, base)); if (hash(b) !== spec.sha256) throw Error('Reference identity'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  for (const row of reference.records) {
    if (row.input.shape[2] === 1 && row.input.shape[3] === 1) continue; // Separately qualified point-reduction helper.
    const arrays = await Promise.all([row.input, row.weights, row.bias, row.output].map(read));
    const [, ci, ih, iw] = row.input.shape, [co, , kernel] = row.weights.shape, [, , oh, ow] = row.output.shape, plane = oh * ow;
    const ranges = layout.records.find(r => r.name === row.name)?.biasAfterRanges ?? [];
    const shape = new Int32Array([ci, ih, iw, co, oh, ow, kernel, row.padding, row.stride ?? 1, row.groups ?? 1, Number(row.hasBias ?? true), tails[row.name] ?? plane, 2, ranges.length]);
    const inputs = [...arrays.slice(0, 3), shape, Int32Array.from(ranges.flat())], pointers = inputs.map(a => module._malloc(Math.max(8, a.byteLength))), out = module._malloc(256 * 4);
    let different = 0, checked = 0; const samples = [];
    try {
      if (!out || pointers.some(p => !p)) throw Error('Allocation');
      inputs.forEach((a, i) => module.HEAPU8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), pointers[i]));
      const positions = [...new Set([0, 1, Math.floor(plane / 2), Math.max(0, plane - 33), ...ranges.flat().map(x => Math.max(0, x - 2)), tails[row.name]].filter(x => Number.isInteger(x) && x < plane))];
      const channels = [...new Set([0, 1, Math.floor(co / 2), co - 1].filter(c => c < co))];
      const expected = new Uint32Array(arrays[3].buffer);
      for (const channel of channels) for (const position of positions) {
        const start = channel * plane + position, count = Math.min(33, co * plane - start);
        if (module._d2prl_convolution_range(...pointers, start, count, out) !== 1) throw Error('Convolution rejected');
        const actual = new Uint32Array(module.HEAPU8.buffer, out, count);
        for (let i = 0; i < count; i++) { checked++; if (actual[i] !== expected[start + i]) { different++; if (samples.length < 8) samples.push({index: start + i, actualBits: actual[i], expectedBits: expected[start + i]}); } }
      }
    } finally { pointers.forEach(p => module._free(p)); module._free(out); }
    const record = {kind, name: row.name, checked, different, samples}; records.push(record); console.log(JSON.stringify(record));
  }
}
const report = {schema: 1, status: records.every(r => !r.different) ? 'passed' : 'rejected', scope: 'Sampled native convolution boundaries across all spatial feature, union and UNet layers; includes channel, bias-domain, row and tail edges. Not full tensor or composed-model parity.', records, node: process.version, build: JSON.parse(await readFile(new URL('.build/d2prl-convolution-cpu/build.json', root)))};
await writeFile(new URL('docs/d2prl-convolution-cpu-sampled-node-proof.json', root), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, cases: records.length, values: records.reduce((n, r) => n + r.checked, 0)})); if (report.status !== 'passed') process.exitCode = 1;
