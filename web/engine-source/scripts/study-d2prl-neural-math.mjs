import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), name = process.argv[2] ?? 'chrome', launcher = {chrome: chromium, firefox, webkit}[name];
if (!launcher) throw Error('Unknown browser');
const hash = b => createHash('sha256').update(b).digest('hex');
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/') return res.end('<!doctype html><title>D2PRL bounded neural helpers</title>');
    if (name === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await launcher.launch({headless: true, ...(name === 'chrome' ? {channel: 'chrome'} : {})}); const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {Budget} = await import('/src/cache.js'), {createNeuralMath} = await import('/experiments/d2prl/neural-math.js'), {default: factory} = await import('/.build/d2prl-neural-math/neural-math.js');
    const base = '/.build/d2prl-neural-math-corpus/', reference = await (await fetch(base + 'reference.json')).json();
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async spec => { const r = await fetch(base + spec.file); if (!r.ok) throw Error('Missing tensor'); const b = await r.arrayBuffer(); if (await hash(b) !== spec.sha256) throw Error('Tensor identity'); return {data: new Float32Array(b), shape: spec.shape}; };
    const budget = new Budget(256 * 1024 ** 2), math = await createNeuralMath(factory, {budget}), records = [];
    try {
      for (const row of reference.records) {
        const inputs = []; for (const e of row.inputs) inputs.push(await read(e));
        const result = await math.run(row.operation, inputs, row.attributes);
        try {
          const expected = await read(row.output); if (JSON.stringify(result.shape) !== JSON.stringify(expected.shape)) throw Error('Shape');
          const actual = result.data, ab = new Uint32Array(actual.buffer), eb = new Uint32Array(expected.data.buffer);
          let different = 0, maxAbs = 0, nonfinite = 0;
          for (let i = 0; i < actual.length; i++) { different += ab[i] !== eb[i]; maxAbs = Math.max(maxAbs, Math.abs(actual[i] - expected.data[i])); nonfinite += !Number.isFinite(actual[i]); }
          records.push({name: row.name, elements: actual.length, different, maxAbs, nonfinite});
        } finally { result.release(); }
      }
      const sample = reference.records.find(r => r.name === 'sigmoid-1x64x112x112'), inputs = [await read(sample.inputs[0])], originalHash = await hash(inputs[0].data.buffer), controller = new AbortController();
      const pending = math.run(sample.operation, inputs, sample.attributes, {signal: controller.signal});
      let busy = false; try { await math.run(sample.operation, inputs); } catch (e) { busy = e.code === 'BUSY'; }
      controller.abort(); let cancelled = false; try { await pending; } catch (e) { cancelled = e.code === 'CANCELLED'; }
      const baseline = budget.total(), result = await math.run(sample.operation, inputs, sample.attributes);
      const retryExact = await hash(result.data.buffer) === sample.output.sha256; result.release();
      const retryReleased = baseline === budget.total(), inputPreserved = await hash(inputs[0].data.buffer) === originalHash;
      const oldLimit = budget.limit; budget.limit = budget.total(); let refused = false;
      try { await math.run(sample.operation, inputs, sample.attributes); } catch (e) { refused = e.code === 'MEMORY_LIMIT'; } finally { budget.limit = oldLimit; }
      const refusalReleased = baseline === budget.total(); math.dispose(); const released = budget.total() === 0;
      const lifecycle = {busy, cancelled, retryExact, retryReleased, inputPreserved, refused, refusalReleased, released};
      return {schema: 1, status: records.every(r => !r.different && !r.nonfinite) && Object.values(lifecycle).every(Boolean) ? 'passed' : 'rejected', scope: reference.scope, records, lifecycle, peakAccountedBytes: budget.peak};
    } finally { math.dispose(); }
  });
  report.browser = browser.version(); report.build = JSON.parse(await readFile(path.join(root, '.build/d2prl-neural-math/build.json'))); report.wrapperSha256 = hash(await readFile(path.join(root, 'experiments/d2prl/neural-math.js'))); report.referenceSha256 = hash(await readFile(path.join(root, '.build/d2prl-neural-math-corpus/reference.json')));
  await writeFile(path.join(root, 'docs/d2prl-neural-math-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, cases: report.records.length, lifecycle: report.lifecycle, failures: report.records.filter(r => r.different || r.nonfinite)})); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
