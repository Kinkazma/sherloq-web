import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), backend = process.argv.includes('--cpu') ? 'cpu' : 'gpu', zones = process.argv.includes('--zones'), tag = backend + (zones ? '-zones' : '-whole');
const hash = b => createHash('sha256').update(b).digest('hex'), identity = JSON.parse(await readFile(path.join(root, '.build/d2prl-private-package/identity.json'))), sources = {};
for (const name of ['model', 'analysis', 'descriptors', 'zones', 'export']) sources[name] = hash(await readFile(path.join(root, 'experiments/d2prl/' + name + '.js')));
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname; if (name === '/') return res.end('<!doctype html><title>D2PRL actual model API study</title>'); if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  if (req.method === 'POST' && name === '/save-npz') {const chunks = []; let size = 0; for await (const chunk of req) {size += chunk.length; if (size > 16 * 1024 ** 2) throw Error('Export size'); chunks.push(chunk);} await writeFile(path.join(root, '.build/d2prl-private-package/export-' + tag + '.npz'), Buffer.concat(chunks)); return res.end('ok');}
  if (req.method !== 'GET') throw Error('Method'); const file = path.resolve(root, '.' + name); if (!file.startsWith(root)) throw Error('Path'); res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await chromium.launch({headless: true, channel: 'chrome'}); const page = await browser.newPage(); page.on('console', m => console.log(m.text())); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({identity, backend, zones}) => {
    const {Budget} = await import('/src/cache.js'), {createD2prlModel, readVerifiedModelAsset} = await import('/experiments/d2prl/model.js'), {developmentRuntime} = await import('/experiments/d2prl/development-runtime.js'), {createD2prlAnalysis} = await import('/experiments/d2prl/analysis.js'), {createD2prlSource} = await import('/experiments/d2prl/source.js'), {createD2prlZones} = await import('/experiments/d2prl/zones.js'), {createPostprocess} = await import('/experiments/d2prl/postprocess.js'), {createSpatial} = await import('/experiments/d2prl/spatial.js'), {exportD2prlNpz} = await import('/experiments/d2prl/export.js');
    const budget = new Budget(8 * 1024 ** 3), absolute = p => new URL(p, location.href).href, hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2, '0')).join('');
    const json = async p => (await fetch(p)).json(), read = async (base, spec, Type = Float32Array) => {const b = await (await fetch(base + spec.file)).arrayBuffer(); if (await hash(b) !== spec.sha256) throw Error('Reference identity'); return new Type(b);};
    const metadataRelease = budget.reserve(identity.bytes * 4), packageBase = absolute('/.build/d2prl-private-package/');
    const model = JSON.parse(new TextDecoder().decode(await readVerifiedModelAsset(new URL(identity.file, packageBase), identity)));
    const sourceBase = zones ? '/.build/d2prl-model-zones/' : '/.build/d2prl-source/', sourceRef = await json(sourceBase + 'reference.json');
    const originalSpec = zones ? sourceRef.original : sourceRef.records[0].original, bytes = await read(sourceBase, originalSpec, Uint8Array), source = await createD2prlSource({budget}).run(bytes);
    const runtime = await developmentRuntime(), pipeline = await createD2prlModel({budget, model, assetBaseUrl: packageBase, runtime, backend, maxWorkers: Math.min(32, navigator.hardwareConcurrency || 1)});
    const postprocess = createPostprocess({budget, moduleUrl: absolute('/.build/d2prl-postprocess/postprocess.js')}), spatial = createSpatial({budget, moduleUrl: absolute('/.build/d2prl-spatial/spatial.js')}), project = createD2prlZones({budget, postprocess, spatial});
    let actualInferences = 0; const session = createD2prlAnalysis({budget, project, modelId: model.modelId, infer: async (input, options) => {actualInferences++; return pipeline.run(input, options);}});
    const originalPreserved = await hash(source.original) === originalSpec.sha256 && await hash(bytes) === originalSpec.sha256;
    const geometry = zones ? sourceRef.zones.map(({id, kind, bounds}) => ({id, kind, bounds})) : [{id: 'whole-image', kind: 'whole-image', bounds: [0, 0, source.pixels.width, source.pixels.height]}];
    const args = {pixels: source.pixels, mode: zones ? 'regions' : 'whole-image', zones: geometry, exclusions: zones ? sourceRef.exclusions : [], minimum: 500, backend, provenance: source.descriptor};
    const returnRef = zones ? sourceRef : await json('/.build/d2prl-model/source-return-reference.json'), records = [], progress = []; let result;
    const compare = async (result, minimum, envelope = true) => {
      const checks = {}; if (zones) {
        const row = returnRef.records.find(r => r.minimum === minimum && r.envelope === envelope);
        for (const [name, spec] of Object.entries(row.outputs)) checks[name] = await hash(result[name]) === spec.sha256;
      } else {
        checks.map = await hash(result.map) === returnRef.map.sha256;
        const spec = returnRef.masks.find(r => r.minimum === minimum), expected = await read('/.build/d2prl-model/', spec), n = result.width * result.height;
        checks.mask = result.mask.every((v, i) => v === expected[i]); checks.target = await hash(result.target) === await hash(expected.subarray(n, 2 * n)); checks.source = await hash(result.source) === await hash(expected.subarray(2 * n)); checks.analyzed = result.analyzed.every(v => v === 1);
      }
      checks.candidates = result.candidates.every(v => v === 0); return checks;
    };
    try {
      result = await session.run(args, {onProgress: e => {progress.push({phase: e.phase, revision: e.revision, completed: e.completed, total: e.total}); if (e.phase === 'zone-complete' || (e.phase === 'unet' && e.completed % 100 === 0) || (e.phase === 'patchmatch' && e.completed % 40 === 0)) console.log(JSON.stringify(e));}});
      records.push({name: 'detect-500', checks: await compare(result, 500), inferenceCount: actualInferences === geometry.length}); console.log(JSON.stringify(records.at(-1)));
      for (const minimum of [0, 17, 5000]) {const previous = result; result = await session.refilter({resultId: previous.metadata.resultId, minimum}); previous.release(); records.push({name: 'refilter-' + minimum, checks: await compare(result, minimum), inferenceCount: actualInferences === geometry.length});}
      if (zones) {result.release(); result = await session.run({...args, zones: geometry.filter(z => z.kind !== 'envelope')}); records.push({name: 'envelope-disabled', checks: await compare(result, 500, false), inferenceCount: actualInferences === geometry.length});}
      const numericExport = exportD2prlNpz(result, {budget, maxBytes: 16 * 1024 ** 2}); let exported;
      try {const response = await fetch('/save-npz', {method: 'POST', body: numericExport.bytes}); if (!response.ok) throw Error('Save export'); exported = {bytes: numericExport.bytes.length, sha256: await hash(numericExport.bytes), minimum: result.metadata.min_component, envelope: !zones};} finally {numericExport.release();}
      const metadata = result.metadata; result.release(); result = null; await session.dispose(); pipeline.dispose(); postprocess.dispose(); spatial.dispose(); source.release(); metadataRelease();
      const allReservationsReleased = budget.total() === 0, passed = records.every(r => r.inferenceCount && Object.values(r.checks).every(Boolean));
      return {schema: 1, status: passed && allReservationsReleased && originalPreserved ? 'passed' : 'rejected', scope: 'Real model API from generated original file through source pixels, independent neural zone inference, source-coordinate composition, cached refilter and numeric NPZ export. No expected tensors enter the model. WordPress integration remains separate.', backend, modelId: model.modelId, records, actualInferences, metadata, exported, originalPreserved, progressEvents: progress.length, allReservationsReleased, peakAccountedBytes: budget.peak, memoryScope: 'Conservative engine reservations, not RSS; reference comparator excluded.'};
    } finally {result?.release(); await session.dispose(); pipeline.dispose(); postprocess.dispose(); spatial.dispose(); source.release(); metadataRelease();}
  }, {identity, backend, zones});
  report.browser = browser.version(); report.package = identity; report.sources = sources;
  await writeFile(path.join(root, 'docs/d2prl-model-api-' + tag + '-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({status: report.status, actualInferences: report.actualInferences, records: report.records, allReservationsReleased: report.allReservationsReleased})); if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(r => server.close(r));}
