import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
const root = new URL('../', import.meta.url), base = new URL('.build/segmentation-preprocess/', root);
const hash = data => createHash('sha256').update(data).digest('hex');
const reference = JSON.parse(await readFile(new URL('reference.json', base))), records = [];
const read = async spec => { const data = await readFile(new URL(spec.file, base)); if (hash(data) !== spec.sha256) throw Error('Fixture integrity'); return data; };
for (const row of reference.records) {
  const budget = new Budget(64 * 1024 ** 2), prepare = createSegmentationPrepare({budget});
  const source = await read(row.input), [height, width] = row.input.shape;
  const result = await prepare.run({data: source, width, height, side: row.side});
  const rgb = await read(row.rgb), tensorBytes = await read(row.tensor), tensor = new Float32Array(tensorBytes.buffer, tensorBytes.byteOffset, tensorBytes.byteLength / 4);
  let differentRgb = 0, differentTensor = 0, maxAbs = 0;
  for (let i = 0; i < rgb.length; i++) if (result.rgb[i] !== rgb[i]) differentRgb++;
  for (let i = 0; i < tensor.length; i++) { if (result.tensor[i] !== tensor[i]) differentTensor++; maxAbs = Math.max(maxAbs, Math.abs(result.tensor[i] - tensor[i])); }
  result.release(); prepare.dispose();
  records.push({name: row.name, differentRgb, differentTensor, maxAbs, clean: budget.total() === 0});
}
const report = {schema: 1, status: records.every(r => r.differentRgb === 0 && r.differentTensor === 0 && r.clean) ? 'passed' : 'rejected', scope: reference.scope, node: process.version, reference: hash(await readFile(new URL('reference.json', base))), source: hash(await readFile(new URL('experiments/segmentation/prepare.js', root))), pillow: reference.pillow, torch: reference.torch, records};
await writeFile(new URL('docs/segmentation-prepare-node-proof.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
