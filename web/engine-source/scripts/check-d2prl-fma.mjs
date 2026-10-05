import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/d2prl-fma/fma.js';
import {checkFmaCorpus} from '../experiments/d2prl/fma-corpus.js';
const root = new URL('../', import.meta.url), base = new URL('.build/d2prl-fma/', root), hash = b => createHash('sha256').update(b).digest('hex');
const referenceBytes = await readFile(new URL('reference.json', base)), reference = JSON.parse(referenceBytes);
const report = await checkFmaCorpus(await factory(), reference, async spec => {
  const bytes = await readFile(new URL(spec.file, base));
  if (hash(bytes) !== spec.sha256) throw Error('Reference identity');
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});
report.node = process.version; report.referenceSha256 = hash(referenceBytes); report.build = JSON.parse(await readFile(new URL('build.json', base)));
await writeFile(new URL('docs/d2prl-fma-simd-node-proof.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
