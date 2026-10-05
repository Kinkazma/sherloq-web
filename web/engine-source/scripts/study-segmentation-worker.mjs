import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>Segmentation worker qualification</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  if (name === '/corrupt-model') return res.end(new Uint8Array([1, 2, 3]));
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true}); const page = await browser.newPage();
  page.on('console', m => console.log(m.text())); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {Budget} = await import('/src/cache.js'), {createSegmentationPrepare} = await import('/experiments/segmentation/prepare.js');
    const {createSegmentationInference} = await import('/experiments/segmentation/inference.js'), {createSegmentationZones} = await import('/experiments/segmentation/zones.js'), {createSpatial} = await import('/experiments/d2prl/spatial.js');
    const base = '/.build/segmentation-models/mgcfdn-mpdn/', reference = await (await fetch(base + 'reference.json')).json();
    const hash = async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a)), v => v.toString(16).padStart(2, '0')).join('');
    const read = async e => {const bytes = await (await fetch(base + e.file)).arrayBuffer(); if (bytes.byteLength !== e.bytes || await hash(bytes) !== e.sha256) throw Error('Fixture identity'); return bytes;};
    const budget = new Budget(3 * 1024 ** 3), url = p => new URL(p, location.href).href;
    const config = {budget, variant: 'mgcfdn-mpdn', modelUrl: url(base + reference.model.file)};
    const prepare = createSegmentationPrepare({budget}), inference = createSegmentationInference(config), spatial = createSpatial({budget, moduleUrl: url('/vendor/d2prl/spatial.js')}), project = createSegmentationZones({budget, spatial});
    const records = []; let modelLoads = 0, usefulInferences = 0;
    const onProgress = event => {if (event.phase === 'model-load') modelLoads++; if (event.phase === 'inference') usefulInferences++;};
    const compare = (a, b) => {if (a.length !== b.length) throw Error('Shape'); let maxAbs = 0, different = 0; for (let i = 0; i < a.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); different += a[i] !== b[i];} return {different, maxAbs, finite: a.every(Number.isFinite)};};
    try {
      for (const row of reference.records) {
        const [height, width] = row.rgb.shape, rgb = new Uint8Array(await read(row.rgb)), prepared = await prepare.run({data: rgb, width, height, side: 256});
        let inferred, result;
        try {
          inferred = await inference.run(prepared.tensor, {onProgress});
          result = await project.run({width, height, side: 256, kind: 'sigmoid', mode: 'whole-image', zones: [{id: 'whole', bounds: [0, 0, width, height], raw: inferred.raw}]});
          const record = {name: row.name, preparationExact: await hash(prepared.tensor) === row.input.sha256, probability: compare(inferred.raw, new Float32Array(await read(row.probability))), sourceMap: compare(result.map, new Float32Array(await read(row.sourceMap))), sourceMask: compare(result.mask, new Uint8Array(await read(row.sourceMask))), foreground: result.mask.reduce((n, v) => n + v, 0), sourcePreserved: await hash(rgb) === row.rgb.sha256, heapBytes: inferred.heapBytes};
          records.push(record); console.log(JSON.stringify(record));
        } finally {result?.release(); inferred?.release(); prepared.release();}
      }
      const reused = modelLoads === 1 && usefulInferences === reference.records.length;
      const row = reference.records.at(-1), [height, width] = row.rgb.shape, prepared = await prepare.run({data: new Uint8Array(await read(row.rgb)), width, height, side: 256});
      const controller = new AbortController(); let cancelled = false, busy = false;
      try {
        const pending = inference.run(prepared.tensor, {signal: controller.signal, onProgress: e => {if (e.phase === 'inference') controller.abort();}});
        try {await inference.run(prepared.tensor);} catch (e) {busy = e.code === 'BUSY';}
        try {await pending;} catch (e) {cancelled = e.code === 'CANCELLED';}
        const retry = await inference.run(prepared.tensor); const expected = new Float32Array(await read(row.probability));
        const retryError = compare(retry.raw, expected); retry.release();
        // Force idle-session reclamation before scientific data is evicted.
        const total = budget.total(), reservation = budget.reserve(budget.limit - total + 1); reservation();
        const reclaimed = budget.total() === prepared.tensor.byteLength + prepared.rgb.byteLength;
        const resumed = await inference.run(prepared.tensor); const resumedError = compare(resumed.raw, expected); resumed.release();
        prepared.release(); inference.dispose(); prepare.dispose(); spatial.dispose();
        const released = budget.total() === 0;
        const bad = createSegmentationInference({...config, modelUrl: url('/corrupt-model')}); let corruptionRefused = false;
        try {await bad.run(new Float32Array(3 * 256 ** 2));} catch (e) {corruptionRefused = e.code === 'MODEL_FAILED' && /identity/.test(e.message);}
        bad.dispose(); const corruptionReleased = budget.total() === 0;
        const low = new Budget(1), denied = createSegmentationInference({...config, budget: low}); let memoryRefused = false;
        try {await denied.run(new Float32Array(3 * 256 ** 2));} catch (e) {memoryRefused = e.code === 'MEMORY_LIMIT';} denied.dispose();
        const lifecycle = {reused, busy, cancelled, retryError, reclaimed, resumedError, released, corruptionRefused, corruptionReleased, memoryRefused};
        const numeric = records.every(r => r.preparationExact && r.sourcePreserved && r.probability.finite && r.probability.maxAbs <= 1e-4 && r.sourceMap.finite && r.sourceMap.maxAbs <= 1e-4 && r.sourceMask.different === 0);
        const ok = numeric && Object.entries(lifecycle).every(([k, v]) => k.endsWith('Error') ? v.finite && v.maxAbs <= 1e-4 : v === true);
        return {schema: 1, status: ok ? 'passed-corpus-tolerance' : 'rejected', scope: 'Actual bounded CPU worker, unchanged MGCFDN MPDN model, prepared RGB to original-coordinate maps/masks. Continuous outputs are not bit exact. Three public synthetic inputs include189 native positive pixels. No multiple ROI/export/common API/WordPress qualification.', model: reference.model, records, lifecycle, memory: budget.snapshot(), modelLoads, usefulInferences};
      } finally {prepared.release();}
    } finally {inference.dispose(); prepare.dispose(); spatial.dispose();}
  });
  report.browser = browser.version(); report.sources = {};
  for (const name of ['scripts/study-segmentation-worker.mjs', 'experiments/segmentation/models.js', 'experiments/segmentation/inference.js', 'experiments/segmentation/inference-worker.js', 'experiments/segmentation/prepare.js', 'experiments/segmentation/probabilities.js', 'experiments/segmentation/zones.js', 'vendor/d2prl/PINNED.json']) report.sources[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  await writeFile(path.join(root, 'docs/segmentation-mpdn-worker-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, lifecycle: report.lifecycle, memory: report.memory})); if (report.status === 'rejected') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
