import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), name = process.argv[2] ?? 'chrome', launcher = {chrome: chromium, firefox, webkit}[name];
if (!launcher) throw Error('Unknown browser'); const hash = b => createHash('sha256').update(b).digest('hex');
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/') return res.end('<!doctype html><title>D2PRL point convolution qualification</title>');
    if (name === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await launcher.launch({headless: true, ...(name === 'chrome' ? {channel: 'chrome'} : {})}); const page = await browser.newPage(); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {pointStudy} = await import('/experiments/d2prl/point-study.js'), {default: factory} = await import('/.build/d2prl-neural-math/neural-math.js');
    const json = async name => { const r = await fetch(name); if (!r.ok) throw Error('Missing JSON'); return r.json(); }, cases = [];
    for (const kind of ['point-reduction', 'unet-convolution']) {
      const ref = await json('/.build/d2prl-' + kind + '/reference.json');
      for (const row of ref.records) if (row.output.shape.slice(-2).every(n => n === 1)) cases.push({kind, row});
    }
    const layouts = await json('/fixtures/d2prl/point-reduction-layout.json'), hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async (kind, spec) => { const r = await fetch('/.build/d2prl-' + kind + '/' + spec.file); if (!r.ok) throw Error('Missing fixture'); const b = await r.arrayBuffer(); if (await hash(b) !== spec.sha256) throw Error('Fixture identity'); return new Float32Array(b); };
    return pointStudy(factory, cases, layouts, read);
  });
  report.browser = browser.version(); report.mathBuild = JSON.parse(await readFile(path.join(root, '.build/d2prl-neural-math/build.json'))); report.wrapperSha256 = hash(await readFile(path.join(root, 'experiments/d2prl/neural-math.js'))); report.layoutSha256 = hash(await readFile(path.join(root, 'fixtures/d2prl/point-reduction-layout.json')));
  await writeFile(path.join(root, 'docs/d2prl-point-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, cases: report.records.length, failures: report.records.filter(r => r.different || r.nonfinite)})); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
