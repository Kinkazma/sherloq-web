import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = process.argv[2] ?? 'chrome';
const launcher = {chrome: chromium, firefox, webkit}[name];
if (!launcher) throw Error('Unknown browser');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/') return res.end('<!doctype html><title>D2PRL BatchNorm qualification</title>');
    if (pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root)) throw Error('Path');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launcher.launch({headless: true, ...(name === 'chrome' ? {channel: 'chrome'} : {})});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const base = '/.build/d2prl-batchnorm/';
    const reference = await (await fetch(base + 'reference.json')).json();
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async entry => {
      const response = await fetch((entry.source === 'convolution' ? '/.build/d2prl-convolution/' : base) + entry.file);
      if (!response.ok) throw Error('Missing fixture');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (await hash(bytes) !== entry.sha256) throw Error('Fixture identity');
      return bytes;
    };
    const {default: factory} = await import('/.build/d2prl-resize/resize.js');
    const {batchnormStudy} = await import('/experiments/d2prl/batchnorm-study.js');
    return batchnormStudy(await factory(), reference, read);
  });
  report.browser = browser.version();
  report.referenceSha256 = hash(await readFile(path.join(root, '.build/d2prl-batchnorm/reference.json')));
  report.build = JSON.parse(await readFile(path.join(root, '.build/d2prl-resize/build.json')));
  await writeFile(path.join(root, 'docs/d2prl-batchnorm-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, cases: report.cases, failures: report.records.filter(r => r.different || r.nonfinite)}));
  if (report.status !== 'passed') process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
