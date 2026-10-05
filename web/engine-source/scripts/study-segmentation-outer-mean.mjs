// Development check of the actual TNT channels-last mean and synthetic tails.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sum=process.argv.includes('--sum');
const layernorm=process.argv.includes('--layernorm');if(sum&&layernorm)throw Error('One primitive per study');
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>Native channels-last mean</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
  res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true}); const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({sum,layernorm}) => {
    const ort = await import('/vendor/d2prl/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = {mjs: new URL('/vendor/d2prl/factory.mjs', location.href).href, wasm: new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm', location.href).href};
    const base = layernorm?'/.build/segmentation-models/mgcfdn-tnt/layernorm/':sum?'/.build/segmentation-models/mgcfdn-vig/topk-paired-spots/':'/.build/segmentation-models/mgcfdn-tnt/', reference = await (await fetch(base + (layernorm?'reference.json':sum?'sum-reference.json':'outer-mean-reference.json'))).json(), records = [];
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
    const read = async spec => {const response = await fetch(base + spec.file); if (!response.ok) throw Error('Missing fixture'); const bytes = await response.arrayBuffer(); if (bytes.byteLength !== spec.bytes || await hash(bytes) !== spec.sha256) throw Error('Fixture identity'); return bytes;};
    for (const row of reference.records) {
      const session = await ort.InferenceSession.create(await read(row.model), {executionProviders: ['wasm'], graphOptimizationLevel: 'disabled'});
      let input, outputs;
      try {
        input = new ort.Tensor('float32', new Float32Array(await read(row.input)), row.input.shape); outputs = await session.run({input});
        for(const key of layernorm?['output','mean','rstd']:['output']){
        const a = outputs[key].data, b = new Float32Array(await read(row[key])); if (a.length !== b.length) throw Error('Shape');
        const ab = new Uint32Array(a.buffer, a.byteOffset, a.length), bb = new Uint32Array(b.buffer); let different = 0, maxAbs = 0;
        for (let i = 0; i < a.length; i++) {different += ab[i] !== bb[i]; maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i]));}
        records.push({name: row.name, output:key, elements: a.length, different, maxAbs, finite: a.every(Number.isFinite)});
        }
      } finally {input?.dispose(); for(const output of Object.values(outputs??{}))output.dispose(); await session.release();}
    }
    return {schema: 1, status: records.every(r => r.finite && !r.different) ? 'passed' : 'rejected', scope: layernorm?'Torch2.8 LayerNorm Welford candidate: four actual and two synthetic inputs, output/mean/rstd; no full-network qualification.':sum?'Torch2.8 strided channel sums on16 actual VIG squared-feature tensors; no full-network qualification.':'Torch2.8 channels-last global mean; real TNT pool tensor and three signed synthetic non-power-of-two/regular geometries. This primitive does not qualify the full network.', records, ort: ort.env.versions};
  },{sum,layernorm});
  report.browser = browser.version(); report.sources = {};
  for (const name of ['scripts/rewrite-segmentation-mean.py', 'scripts/study-segmentation-outer-mean.mjs',...(sum?['scripts/rewrite-vig-sums.py']:[]),...(layernorm?['scripts/rewrite-tnt-layernorm.py']:[])]) report.sources[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  await writeFile(path.join(root, layernorm?'docs/segmentation-tnt-layernorm-chrome-candidate.json':sum?'docs/segmentation-vig-sums-chrome-proof.json':'docs/segmentation-outer-mean-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
