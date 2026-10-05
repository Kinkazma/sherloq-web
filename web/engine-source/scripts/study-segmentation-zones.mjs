import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (req.method === 'POST' && /^\/save-(source|raw)$/.test(name)) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {bytes += chunk.length; if (bytes > 8 * 1024 ** 2) throw Error('Export too large'); chunks.push(chunk);}
    await writeFile(path.join(root, '.build/segmentation-zones/browser-' + name.slice(6) + '.npz'), Buffer.concat(chunks)); res.end('saved'); return;
  }
  if (name === '/') return res.end('<!doctype html><title>Segmentation native zones</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true}); const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async () => {
    const {Budget} = await import('/src/cache.js'), {createSegmentationPrepare} = await import('/experiments/segmentation/prepare.js'), {createSegmentationInference} = await import('/experiments/segmentation/inference.js'), {createSegmentationZones} = await import('/experiments/segmentation/zones.js'), {createSegmentationAnalysis} = await import('/experiments/segmentation/analysis.js'), {createSpatial} = await import('/experiments/d2prl/spatial.js');
    const {segmentationNpz} = await import('/experiments/segmentation/npz.js');
    const base = '/.build/segmentation-zones/', reference = await (await fetch(base + 'reference.json')).json(), url = p => new URL(p, location.href).href;
    const hash = async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a)), v => v.toString(16).padStart(2, '0')).join('');
    const read = async e => {const bytes = await (await fetch(base + e.file)).arrayBuffer(); if (bytes.byteLength !== e.bytes || await hash(bytes) !== e.sha256) throw Error('Fixture identity'); return bytes;};
    const budget = new Budget(3 * 1024 ** 3), prepare = createSegmentationPrepare({budget}), inference = createSegmentationInference({budget, variant: 'mgcfdn-mpdn', modelUrl: url('/.build/segmentation-models/mgcfdn-mpdn/unfolded.onnx')}), spatial = createSpatial({budget, moduleUrl: url('/vendor/d2prl/spatial.js')});
    const project = createSegmentationZones({budget, spatial}), analysis = createSegmentationAnalysis({budget, prepare, inference, project});
    const [height, width] = reference.source.shape, pixels = {width, height, data: new Uint8Array(await read(reference.source))}, zones = reference.zones.map(({id, kind, bounds}) => ({id, kind, bounds}));
    const compare = (a, b) => {if (a.length !== b.length) throw Error('Shape'); let maxAbs = 0, different = 0; for (let i = 0; i < a.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); different += a[i] !== b[i];} return {different, maxAbs, finite: a.every(Number.isFinite)};};
    const check = async (result, expected) => {const values = {}; for (const [name, spec] of Object.entries(expected)) values[name] = compare(result[name], spec.dtype === 'float32' ? new Float32Array(await read(spec)) : new Uint8Array(await read(spec))); return values;};
    const records = [], exports = []; let result, raw, dropped, restored, cached;
    const saveExport = async (name, data) => {const exported = segmentationNpz(data, {budget, maxBytes: 8 * 1024 ** 2, provenance: {engine: 'experimental-segmentation', originalPixels: reference.source.sha256, note: 'Public synthetic ROI — modèle CPU'}}); try {const response = await fetch('/save-' + name, {method: 'POST', body: exported.bytes}); if (!response.ok) throw Error('Export save'); exports.push({name, bytes: exported.bytes.length, sha256: await hash(exported.bytes)});} finally {exported.release();}};
    try {
      result = await analysis.run({pixels, zones}); records.push({name: 'three-real-zones', inferences: result.metadata.inferences, cacheHits: result.metadata.cache_hits, outputs: await check(result, reference.result), foreground: result.mask.reduce((n, v) => n + v, 0)});
      await saveExport('source', result);
      raw = analysis.readRaw(result.metadata.resultId); const rawErrors = [];
      for (let i = 0; i < raw.rawGrids.length; i++) rawErrors.push(compare(raw.rawGrids[i].raw, new Float32Array(await read(reference.zones[i].raw))));
      await saveExport('raw', raw);
      raw.rawGrids[0].raw.fill(99); raw.release(); raw = undefined; // Defensive copies.
      dropped = await analysis.reproject({analysisId: result.metadata.analysisId, zoneIds: ['roi-a', 'roi-b']}); records.push({name: 'envelope-off', inferences: dropped.metadata.inferences, cacheHits: dropped.metadata.cache_hits, outputs: await check(dropped, reference.withoutEnvelope)});
      restored = await analysis.reproject({analysisId: result.metadata.analysisId, zoneIds: zones.map(z => z.id)}); records.push({name: 'envelope-restored', inferences: restored.metadata.inferences, cacheHits: restored.metadata.cache_hits, outputs: await check(restored, reference.result)});
      cached = await analysis.run({pixels, zones}); records.push({name: 'explicit-analysis-cached', inferences: cached.metadata.inferences, cacheHits: cached.metadata.cache_hits, outputs: await check(cached, reference.result)});
      for (const key of [...budget.cache.keys()]) budget.remove(key);
      let cacheMiss = false, rawMiss = false;
      try {await analysis.reproject({analysisId: cached.metadata.analysisId, zoneIds: ['roi-a']});} catch (e) {cacheMiss = e.code === 'CACHE_MISS';}
      try {analysis.readRaw(cached.metadata.resultId);} catch (e) {rawMiss = e.code === 'CACHE_MISS';}
      const sourcePreserved = await hash(pixels.data) === reference.source.sha256;
      for (const value of [result, dropped, restored, cached]) value.release(); result = dropped = restored = cached = undefined;
      await analysis.dispose(); inference.dispose(); prepare.dispose(); spatial.dispose();
      const accepted = values => Object.entries(values).every(([name, value]) => value.finite && (name === 'map' ? value.maxAbs <= 1e-4 : value.different === 0));
      const pass = records.every(r => accepted(r.outputs)) && records[0].inferences === 3 && records.slice(1).every(r => r.inferences === 0) && rawErrors.every(r => r.finite && r.maxAbs <= 1e-4) && cacheMiss && rawMiss && sourcePreserved && budget.total() === 0;
      return {schema: 1, status: pass ? 'passed-corpus-tolerance' : 'rejected', scope: 'Actual CPU model on two ROI plus envelope, native raw probabilities and source outputs; continuous tensors are not bit exact. Cache-only removal/restoration, defensive raw copies and explicit misses. No common runtime or WordPress claim.', records, rawErrors, exports, cacheMiss, rawMiss, sourcePreserved, memory: budget.snapshot()};
    } finally {for (const value of [result, raw, dropped, restored, cached]) value?.release(); await analysis.dispose(); inference.dispose(); prepare.dispose(); spatial.dispose();}
  });
  report.browser = browser.version(); report.sources = {};
  for (const name of ['scripts/study-segmentation-zones.mjs', 'experiments/segmentation/analysis.js', 'experiments/segmentation/npz.js', 'experiments/segmentation/inference.js', 'experiments/segmentation/inference-worker.js', 'experiments/segmentation/prepare.js', 'experiments/segmentation/probabilities.js', 'experiments/segmentation/zones.js']) report.sources[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  await writeFile(path.join(root, 'docs/segmentation-mpdn-zones-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status === 'rejected') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
