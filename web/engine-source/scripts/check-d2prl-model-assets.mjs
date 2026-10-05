import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {readVerifiedModelAsset} from '../experiments/d2prl/model.js';
const bytes = Uint8Array.from([1, 3, 17, 99, 5, 7, 23, 11]), spec = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
let signalStarted;
const server = createServer((req, res) => {
  if (req.url === '/good') return res.end(bytes);
  if (req.url === '/long') return res.end(new Uint8Array(9));
  if (req.url === '/short') return res.end(bytes.subarray(0, 4));
  if (req.url === '/corrupt') return res.end(new Uint8Array(8));
  if (req.url === '/cancel') {res.write(bytes.subarray(0, 4)); signalStarted(); return;}
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
try {
  const records = [{name: 'verified', passed: Buffer.from(await readVerifiedModelAsset(base + '/good', spec)).equals(bytes)}];
  for (const [name, code] of [['long', 'MODEL_IDENTITY'], ['short', 'MODEL_IDENTITY'], ['corrupt', 'MODEL_IDENTITY'], ['absent', 'MODEL_UNAVAILABLE']]) {
    let passed = false; try {await readVerifiedModelAsset(base + '/' + name, spec);} catch (e) {passed = e.code === code;} records.push({name, passed});
  }
  const controller = new AbortController(), entered = new Promise(r => {signalStarted = r;}); const pending = readVerifiedModelAsset(base + '/cancel', spec, {signal: controller.signal}); await entered; controller.abort();
  let cancelled = false; try {await pending;} catch (e) {cancelled = e.code === 'CANCELLED';} records.push({name: 'stream-cancelled', passed: cancelled});
  records.push({name: 'retry', passed: Buffer.from(await readVerifiedModelAsset(base + '/good', spec)).equals(bytes)});
  const source = await readFile(new URL('../experiments/d2prl/model.js', import.meta.url)), report = {schema: 1, status: records.every(r => r.passed) ? 'passed' : 'rejected', scope: 'Bounded actual model-asset loader, identity/refusal/cancellation; tiny synthetic payload only.', node: process.version, sourceSha256: createHash('sha256').update(source).digest('hex'), records};
  await writeFile(new URL('../docs/d2prl-model-assets-node-proof.json', import.meta.url), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
} finally {server.closeAllConnections(); await new Promise(r => server.close(r));}
