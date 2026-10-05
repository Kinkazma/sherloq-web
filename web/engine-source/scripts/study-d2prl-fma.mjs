import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), name = process.argv[2] ?? 'chrome', launcher = {chrome: chromium, firefox, webkit}[name];
if (!launcher) throw Error('Browser');
const hash = b => createHash('sha256').update(b).digest('hex');
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/') return res.end('<!doctype html><title>D2PRL FMA offline corpus</title>');
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
    const {default: factory} = await import('/.build/d2prl-fma/fma.js'), {checkFmaCorpus} = await import('/experiments/d2prl/fma-corpus.js');
    const base = '/.build/d2prl-fma/', reference = await (await fetch(base + 'reference.json')).json();
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    return checkFmaCorpus(await factory(), reference, async spec => {
      const response = await fetch(base + spec.file); if (!response.ok) throw Error('Missing tensor');
      const bytes = await response.arrayBuffer(); if (await hash(bytes) !== spec.sha256) throw Error('Reference identity'); return new Float32Array(bytes);
    });
  });
  report.browser = browser.version(); report.build = JSON.parse(await readFile(path.join(root, '.build/d2prl-fma/build.json'))); report.referenceSha256 = hash(await readFile(path.join(root, '.build/d2prl-fma/reference.json')));
  await writeFile(path.join(root, 'docs/d2prl-fma-simd-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
