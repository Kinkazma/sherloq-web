import {chromium, firefox, webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), name = process.argv[2] ?? 'chrome', launcher = {chrome: chromium, firefox, webkit}[name]; if (!launcher) throw Error('Browser');
const hash = b => createHash('sha256').update(b).digest('hex');
const server = createServer(async (req, res) => {
  try { const name = new URL(req.url, 'http://local').pathname; if (name === '/') return res.end('<!doctype html><title>D2PRL CPU pool qualification</title>'); if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
    const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path'); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
  } catch {res.statusCode = 404; res.end();}
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await launcher.launch({headless: true, ...(name === 'chrome' ? {channel: 'chrome'} : {})}); const page = await browser.newPage(); page.on('console', m => console.log(m.text())); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {Budget} = await import('/src/cache.js'), {createConvolutionCpu} = await import('/experiments/d2prl/convolution-cpu.js');
    const budget = new Budget(4 * 1024 ** 3), cpu = createConvolutionCpu({budget, moduleUrl: new URL('/.build/d2prl-convolution-cpu/convolution.js', location.href).href, maxWorkers: 8}), records = [];
    const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    let sample;
    try {
      for (const [kind, file, layoutFile, names] of [['convolution', 'all-reference.json', 'gemm-layout-all.json', ['448-cnn-0']], ['union', 'reference.json', 'gemm-layout-union.json', ['union-12']], ['unet-convolution', 'reference.json', 'gemm-layout-unet.json', ['encoder_stages.2.0.conv2', 'encoder_stages.4.2.conv2']]]) {
        const base = '/.build/d2prl-' + kind + '/', reference = await (await fetch(base + file)).json(), layout = await (await fetch('/fixtures/d2prl/' + layoutFile)).json();
        const read = async e => { const response = await fetch(base + e.file); if (!response.ok) throw Error('Missing tensor'); const bytes = await response.arrayBuffer(); if (await hash(bytes) !== e.sha256) throw Error('Identity'); return new Float32Array(bytes); };
        for (const row of reference.records.filter(r => names.includes(r.name))) {
          const input = {input: await read(row.input), weights: await read(row.weights), bias: await read(row.bias), channels: row.input.shape[1], height: row.input.shape[2], width: row.input.shape[3], outChannels: row.weights.shape[0], kernel: row.weights.shape[2], padding: row.padding, stride: row.stride ?? 1, groups: row.groups ?? 1, hasBias: row.hasBias ?? true, referenceLayout: layout.records.find(r => r.name === row.name)};
          if (row.name === 'union-12') sample = {row, input};
          const output = await cpu.run(input);
          try { const record = {name: row.name, exact: await hash(output.data) === row.output.sha256, workers: output.workers, heapBytes: output.heapBytes}; records.push(record); console.log(JSON.stringify(record)); }
          finally {output.release();}
        }
      }
      cpu.releaseIdleWorkers(); const initialReleased = budget.total() === 0, controller = new AbortController(), identity = await hash(sample.input.input);
      let busy = false, entered = false, cancelled = false;
      const pending = cpu.run(sample.input, {signal: controller.signal, onProgress() {entered = true; controller.abort();}});
      try {await cpu.run(sample.input);} catch (e) {busy = e.code === 'BUSY';}
      try {await pending;} catch (e) {cancelled = e.code === 'CANCELLED';}
      const cancellationReleased = budget.total() === 0, retry = await cpu.run(sample.input), retryExact = await hash(retry.data) === sample.row.output.sha256; retry.release(); cpu.releaseIdleWorkers();
      const retryReleased = budget.total() === 0, limit = budget.limit; budget.limit = 1; let refused = false;
      try {await cpu.run(sample.input);} catch (e) {refused = e.code === 'MEMORY_LIMIT';} finally {budget.limit = limit;}
      const refusalReleased = budget.total() === 0;
      // Same useful operation, smaller admission: the pool must shrink without
      // changing arithmetic or silently lowering image/model quality.
      budget.limit = 300 * 1024 ** 2; const small = await cpu.run(sample.input);
      const reducedWorkers = small.workers === 1, reducedExact = await hash(small.data) === sample.row.output.sha256; small.release();
      budget.put('raw-grid-fixture', {byteLength: 1024}); const pressure = budget.reserve(60 * 1024 ** 2);
      const idleHeapsReclaimed = budget.active === 60 * 1024 ** 2, rawCachePreserved = Boolean(budget.get('raw-grid-fixture'));
      pressure(); budget.remove('raw-grid-fixture'); budget.limit = limit;
      const afterPressure = await cpu.run(sample.input), pressureRetryExact = await hash(afterPressure.data) === sample.row.output.sha256; afterPressure.release();
      cpu.dispose(); const lifecycle = {initialReleased, busy, entered, cancelled, cancellationReleased, retryExact, retryReleased, refused, refusalReleased, reducedWorkers, reducedExact, idleHeapsReclaimed, rawCachePreserved, pressureRetryExact, inputPreserved: await hash(sample.input.input) === identity, released: budget.total() === 0};
      return {schema: 1, status: records.length === 4 && records.every(r => r.exact) && Object.values(lifecycle).every(Boolean) ? 'passed' : 'rejected', scope: 'Four complete native convolution tensors through bounded SIMD worker pool; bias ranges, grouped/strided layers, useful-compute cancellation, retry and resource reduction. Not full model inference.', records, lifecycle, peakAccountedBytes: budget.peak};
    } finally {cpu.dispose();}
  });
  report.browser = browser.version(); report.sources = {};
  for (const file of ['convolution-cpu.js', 'convolution-cpu-worker.js']) report.sources[file] = hash(await readFile(path.join(root, 'experiments/d2prl/' + file)));
  report.build = JSON.parse(await readFile(path.join(root, '.build/d2prl-convolution-cpu/build.json')));
  await writeFile(path.join(root, 'docs/d2prl-convolution-cpu-' + name + '-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, cases: report.records.length, lifecycle: report.lifecycle})); if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(r => server.close(r));}
