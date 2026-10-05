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
    if (name === '/') return res.end('<!doctype html><title>D2PRL bounded RGB preparation</title>');
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
    const {Budget} = await import('/src/cache.js'), {createPreparation} = await import('/experiments/d2prl/prepare.js'), {default: factory} = await import('/.build/d2prl-prepare/prepare.js');
    const base = '/.build/d2prl-prepare/', reference = await (await fetch(base + 'reference.json')).json();
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async e => { const r = await fetch(base + e.file); if (!r.ok) throw Error('Missing fixture'); const b = await r.arrayBuffer(); if (await hash(b) !== e.sha256) throw Error('Fixture identity'); return b; };
    const budget = new Budget(256 * 1024 ** 2), engine = await createPreparation(factory, {budget}), records = [];
    const compare = (actual, expected) => {
      const a = new Uint32Array(actual.buffer, actual.byteOffset, actual.length), b = new Uint32Array(expected.buffer, expected.byteOffset, expected.length); let different = 0, maxAbs = 0, nonfinite = 0;
      if (actual.length !== expected.length) throw Error('Shape');
      for (let i = 0; i < actual.length; i++) { different += a[i] !== b[i]; maxAbs = Math.max(maxAbs, Math.abs(actual[i] - expected[i])); nonfinite += !Number.isFinite(actual[i]); } return {different, maxAbs, nonfinite};
    };
    try {
      for (const row of reference.records) {
        const rgb = new Uint8Array(await read(row.input)), [height, width] = row.input.shape, result = await engine.run({rgb, height, width});
        try { records.push({name: row.name, elements: result.data.length, ...compare(result.data, new Float32Array(await read(row.output)))}); } finally { result.release(); }
      }
      const row = reference.records.find(r => r.name === '1025x997-random'), input = {rgb: new Uint8Array(await read(row.input)), height: 1025, width: 997}, controller = new AbortController();
      const pending = engine.run(input, {signal: controller.signal}); let busy = false;
      try { await engine.run(input); } catch (e) { busy = e.code === 'BUSY'; }
      controller.abort(); let cancelled = false; try { await pending; } catch (e) { cancelled = e.code === 'CANCELLED'; }
      const baseline = budget.total(), retry = await engine.run(input), retryExact = await hash(retry.data.buffer) === row.output.sha256; retry.release();
      const retryReleased = budget.total() === baseline, inputPreserved = await hash(input.rgb.buffer) === row.input.sha256;
      const oldLimit = budget.limit; budget.limit = baseline; let refused = false;
      try { await engine.run(input); } catch (e) { refused = e.code === 'MEMORY_LIMIT'; } finally { budget.limit = oldLimit; }
      const refusalReleased = baseline === budget.total(); engine.dispose(); const released = budget.total() === 0, lifecycle = {busy, cancelled, retryExact, retryReleased, inputPreserved, refused, refusalReleased, released};
      return {schema: 1, status: records.every(r => !r.different && !r.nonfinite) && Object.values(lifecycle).every(Boolean) ? 'passed' : 'rejected', scope: reference.scope, records, lifecycle, peakAccountedBytes: budget.peak};
    } finally { engine.dispose(); }
  });
  report.browser = browser.version(); report.build = JSON.parse(await readFile(path.join(root, '.build/d2prl-prepare/build.json'))); report.wrapperSha256 = hash(await readFile(path.join(root, 'experiments/d2prl/prepare.js'))); report.referenceSha256 = hash(await readFile(path.join(root, '.build/d2prl-prepare/reference.json')));
  await writeFile(path.join(root, 'docs/d2prl-prepare-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, cases: report.records.length, lifecycle: report.lifecycle, failures: report.records.filter(r => r.different || r.nonfinite)})); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
