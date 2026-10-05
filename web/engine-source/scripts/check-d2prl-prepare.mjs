import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/d2prl-prepare/prepare.js';
import {prepareStudy} from '../experiments/d2prl/prepare-study.js';
const root = new URL('../', import.meta.url), base = new URL('.build/d2prl-prepare/', root), hash = b => createHash('sha256').update(b).digest('hex'), reference = JSON.parse(await readFile(new URL('reference.json', base)));
const read = async e => { const b = await readFile(new URL(e.file, base)); if (hash(b) !== e.sha256) throw Error('Fixture identity'); return b; };
const report = await prepareStudy(await factory(), reference, read); report.build = JSON.parse(await readFile(new URL('build.json', base))); report.node = process.version;
await writeFile(new URL('docs/d2prl-prepare-candidates-node-proof.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({cases: reference.records.length, failures: report.records.filter(r => r.different || r.nonfinite)}));
