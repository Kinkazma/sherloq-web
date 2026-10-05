// Offline measurements of requested jobs only. Never imported by the runtime.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoot = process.argv.find(a => a.startsWith('--runtime-root='))?.slice(15);
const identity = JSON.parse(await readFile(path.join(root, '.build/d2prl-private-package/identity.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimePath = name => path.join(runtimeRoot ?? root, name);
const sources = {};
for (const name of ['src/index.js', 'src/d2prl-adapter.js', 'src/worker-client.js', 'experiments/d2prl/model.js', 'vendor/d2prl/PINNED.json']) sources[name] = hash(await readFile(runtimePath(name)));
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname.slice(1);
  if (!name) return res.end('<!doctype html><title>D2PRL offline measurements</title><canvas id="view"></canvas>');
  if (name === 'favicon.ico') {res.statusCode = 204; return res.end();}
  const base = path.resolve(runtimeRoot && /^(src|vendor|experiments\/d2prl)\//.test(name) ? runtimeRoot : root), file = path.resolve(base, name);
  if (!file.startsWith(base + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(name) ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600, immutable'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser; const runs = [];
try {
  browser = await chromium.launch({channel: 'chrome', headless: true});
  for (const backend of ['cpu', 'webgpu']) {
    const context = await browser.newContext(), page = await context.newPage();
    page.on('console', message => console.log(message.text()));
    await page.goto('http://127.0.0.1:' + server.address().port);
    for (const repetition of ['cold-context', 'warm-http-wasm-new-engine']) {
      const row = await page.evaluate(async ({backend, repetition, identity}) => {
        const {createWorkerEngine} = await import('/src/worker-client.js');
        const json = async url => (await fetch(url)).json(), hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2, '0')).join('');
        const source = (await json('/.build/d2prl-source/reference.json')).records[0].original;
        const reference = await json('/.build/d2prl-model/source-return-reference.json');
        const engine = createWorkerEngine({memoryBudgetBytes: 3 * 1024 ** 3, computeProfile: 'aggressive'}), times = {}, start = performance.now();
        try {
          let stamp = performance.now(); const bytes = new Uint8Array(await (await fetch('/.build/d2prl-source/' + source.file)).arrayBuffer()); times.sourceFetchMs = performance.now() - stamp;
          stamp = performance.now(); await engine.load({id: 'image', bytes}); times.sourceDecodeRpcMs = performance.now() - stamp;
          stamp = performance.now(); await engine.loadD2prlModel({...identity, url: new URL('/.build/d2prl-private-package/model.json', location.href).href}); times.manifestVerifyRpcMs = performance.now() - stamp;
          const task = {id: 'measure', imageId: 'image', operation: 'ai.clones.d2prl', backend, params: {minimum: 500}}, milestones = [];
          stamp = performance.now(); const runStart = stamp;
          const result = await engine.run(task, {onProgress: event => {
            if ((event.phase === 'patchmatch' && event.completed % 40 === 0) || (event.phase === 'unet' && event.completed % 200 === 0) || event.phase === 'heads' || event.phase === 'preparation' || event.phase === 'zone-complete') {
              milestones.push({phase: event.phase, message: event.message, completed: event.completed, ms: performance.now() - runStart});
              console.log(JSON.stringify({backend, repetition, ...milestones.at(-1)}));
            }
          }}); times.runRpcMs = performance.now() - stamp; times.engineRunMs = result.metrics.totalMs; times.dispatchAndTransferApproxMs = times.runRpcMs - times.engineRunMs;
          stamp = performance.now(); const {width, height, mask} = result.data, rgba = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < mask.length; i++) {rgba[4 * i] = mask[i] * 255; rgba[4 * i + 3] = 255;}
          const raster = new ImageData(rgba, width, height); times.displayPreparationMs = performance.now() - stamp;
          const canvas = document.getElementById('view'); canvas.width = width; canvas.height = height;
          stamp = performance.now(); canvas.getContext('2d').putImageData(raster, 0, 0); times.canvasSubmissionMs = performance.now() - stamp;
          stamp = performance.now(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); times.twoAnimationFramesMs = performance.now() - stamp;
          times.sourceToDisplayMs = performance.now() - start;
          stamp = performance.now(); const exported = await engine.exportResult(result, {format: 'npz', maxBytes: 16 * 1024 ** 2}); times.npzRpcMs = performance.now() - stamp; times.sourceThroughNpzMs = performance.now() - start;
          const cached = []; for (const minimum of [0, 17, 5000, 500]) {stamp = performance.now(); const filtered = await engine.run({...task, id: 'filter-' + minimum, params: {minimum, refilterOf: result.data.metadata.analysisId}}); cached.push({minimum, rpcMs: performance.now() - stamp, inferences: filtered.metrics.inferences, cacheHits: filtered.metrics.cache.rawGrids});}
          // Oracle reads and comparisons are deliberately outside measured intervals.
          const spec = reference.masks.find(row => row.minimum === 500), expected = new Float32Array(await (await fetch('/.build/d2prl-model/' + spec.file)).arrayBuffer()), n = width * height;
          const exact = await hash(result.data.map) === reference.map.sha256 && result.data.mask.every((v, i) => v === expected[i]) && await hash(result.data.target) === await hash(expected.subarray(n, 2 * n)) && await hash(result.data.source) === await hash(expected.subarray(2 * n));
          await engine.unload('image'); await engine.unloadD2prlModel(); const memory = (await engine.capabilities()).memory;
          const adapter = backend === 'webgpu' ? await navigator.gpu?.requestAdapter({powerPreference: 'high-performance'}) : null;
          const adapterInfo = adapter ? Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(key => [key, adapter.info[key]])) : null;
          return {backend, repetition, times, milestones, cached, exact, inferences: result.metrics.inferences, execution: result.data.metadata, memory, exportBytes: exported.bytes.length, hardwareConcurrency: navigator.hardwareConcurrency, adapterInfo, adapterInfoScope: 'Read-only high-performance adapter query after the requested job; no extra device or compute dispatch'};
        } finally {await engine.dispose();}
      }, {backend, repetition, identity});
      runs.push(row); console.log(JSON.stringify({backend, repetition, exact: row.exact, times: row.times, peakAccountedBytes: row.memory.peakAccountedBytes}));
      await writeFile(path.join(root, '.build/d2prl-worker-benchmark-progress.json'), JSON.stringify(runs, null, 2) + '\n');
    }
    await context.close();
  }
  const report = {schema: 1, status: runs.every(r => r.exact && r.inferences === 1 && r.cached.every(c => c.inferences === 0) && r.memory.activeReservationBytes === 0 && r.memory.retainedBytes === 0 && r.memory.cacheBytes === 0) ? 'passed' : 'rejected', browser: browser.version(), scope: 'Offline common-worker original-file to source mask, display submission and NPZ; CPU and GPU sequential, 3GiB shared budget, one cold browser context and one fresh engine with warm browser caches per backend. No synthetic warm-up. Generated 521x389 source, fixed448 model. Ambient desktop applications remain active; a small development sample, not a device-wide or statistical speed guarantee.', timingLimits: 'Headless canvas submission and two animation frames do not measure physical display latency. RPC minus engine time approximates dispatch/serialization/transfer together. Progress milestones include model fetch/verification and are not isolated kernel timings. Accounted memory includes conservative WASM ceilings, not RSS.', package: identity, sources, extractedRuntime: Boolean(runtimeRoot), runs};
  await writeFile(path.join(root, 'docs/d2prl-worker-chrome-benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
