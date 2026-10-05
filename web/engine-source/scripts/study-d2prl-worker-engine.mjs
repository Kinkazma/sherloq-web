import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), identity = JSON.parse(await readFile(path.join(root, '.build/d2prl-private-package/identity.json'))), hash = b => createHash('sha256').update(b).digest('hex'), sources = {};
const runtimeRoot = process.argv.find(a => a.startsWith('--runtime-root='))?.slice('--runtime-root='.length);
const backend = process.argv.includes('--cpu') ? 'cpu' : 'webgpu';
const runtimeAsset = name => path.join(runtimeRoot ?? root, name);
for (const file of ['src/index.js', 'src/worker.js', 'src/worker-client.js', 'src/d2prl-adapter.js', 'src/d2prl-runtime.js', 'src/d2prl-model-identity.js', 'src/exports.js', 'src/npz.js']) sources[file] = hash(await readFile(runtimeAsset(file)));
let parameterRequests = 0, runtimeRequests = 0;
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname; if (name === '/') return res.end('<!doctype html><title>D2PRL common worker API</title>'); if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  if (name === '/save-raw-npz' && req.method === 'POST') {const chunks = []; let size = 0; for await (const chunk of req) {size += chunk.length; if (size > 16 * 1024 ** 2) throw Error('Export size'); chunks.push(chunk);} await writeFile(path.join(root, '.build/d2prl-private-package/worker-raw-' + backend + '.npz'), Buffer.concat(chunks)); return res.end('ok');}
  if (name === '/counts') {res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({parameterRequests, runtimeRequests}));}
  if (name.startsWith('/.build/d2prl-private-package/assets/')) parameterRequests++; if (name.startsWith('/vendor/d2prl/')) runtimeRequests++;
  const relative = name.slice(1), base = path.resolve(runtimeRoot && /^(src|vendor|experiments\/d2prl)\//.test(relative) ? runtimeRoot : root);
  const file = path.resolve(base, relative); if (!file.startsWith(base + path.sep)) throw Error('Path'); res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
try {
  browser = await chromium.launch({headless: true, channel: 'chrome'}); const page = await browser.newPage(); page.on('console', m => console.log(m.text())); await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({identity, backend}) => {
    const {createWorkerEngine} = await import('/src/worker-client.js'), engine = createWorkerEngine({memoryBudgetBytes: 3 * 1024 ** 3, computeProfile: 'aggressive'}), hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2, '0')).join('');
    const json = async url => (await fetch(url)).json(), sourceRef = await json('/.build/d2prl-source/reference.json'), returnRef = await json('/.build/d2prl-model/source-return-reference.json'), entry = sourceRef.records[0].original;
    const original = new Uint8Array(await (await fetch('/.build/d2prl-source/' + entry.file)).arrayBuffer()), task = {id: 'd2prl-job', imageId: 'image', operation: 'ai.clones.d2prl', backend, params: {minimum: 500}}, records = [];
    const compare = async (result, minimum) => {
      const d = result.data, spec = returnRef.masks.find(r => r.minimum === minimum), expected = new Float32Array(await (await fetch('/.build/d2prl-model/' + spec.file)).arrayBuffer()), n = d.width * d.height;
      return await hash(d.map) === returnRef.map.sha256 && d.mask.every((v, i) => v === expected[i]) && await hash(d.target) === await hash(expected.subarray(n, 2 * n)) && await hash(d.source) === await hash(expected.subarray(2 * n));
    };
    try {
      await engine.load({id: 'image', bytes: original});
      let modelRequired = false; try {await engine.run(task);} catch (e) {modelRequired = e.code === 'MODEL_UNAVAILABLE';}
      const loaded = await engine.loadD2prlModel({...identity, url: new URL('/.build/d2prl-private-package/model.json', location.href).href}), before = await json('/counts');
      const lazyLoad = before.parameterRequests === 0 && before.runtimeRequests === 0 && loaded.runtimeInferencePerformed === false;
      const result = await engine.run(task, {onProgress: e => {if (e.phase === 'descriptors' || (e.phase === 'patchmatch' && e.completed % 40 === 0) || (e.phase === 'unet' && e.completed % 200 === 0)) console.log(JSON.stringify(e));}});
      records.push({name: 'actual-worker-model', exact: await compare(result, 500), oneInference: result.metrics.inferences === 1}); const afterInference = await json('/counts');
      const raw = await engine.readD2prlRaw({imageId: 'image', resultId: result.data.metadata.resultId}), rawHash = await hash(raw.data.rawGrids[0].raw);
      const rawExport = await engine.exportResult(raw, {format: 'npz', maxBytes: 16 * 1024 ** 2});
      if (!(await fetch('/save-raw-npz', {method: 'POST', body: rawExport.bytes})).ok) throw Error('Raw export save');
      raw.data.rawGrids[0].raw.fill(77); const rawAgain = await engine.readD2prlRaw({imageId: 'image', resultId: result.data.metadata.resultId});
      records.push({name: 'owned-raw-grids', exactOwnedCopy: await hash(rawAgain.data.rawGrids[0].raw) === rawHash, noInference: rawAgain.metrics.inferences === 0, noParameterRead: (await json('/counts')).parameterRequests === afterInference.parameterRequests});
      const exported = await engine.exportResult(result, {format: 'npz', maxBytes: 16 * 1024 ** 2}); const jsonResult = JSON.parse(new TextDecoder().decode((await engine.exportResult(result, {format: 'json', maxBytes: 64 * 1024 ** 2})).bytes));
      const actualExports = exported.bytes[0] === 80 && exported.bytes[1] === 75 && jsonResult.data.metadata.modelId === identity.modelId;
      result.data.mask.fill(77); const refiltered = await engine.run({...task, id: 'refilter-zero', params: {minimum: 0, refilterOf: result.data.metadata.analysisId}}); records.push({name: 'owned-results-and-refilter', exact: await compare(refiltered, 0), noInference: refiltered.metrics.inferences === 0});
      const controller = new AbortController(); let entered = false, cancelled = false, preserved = false;
      try {await engine.run({...task, id: 'cancel-refilter', params: {minimum: 17, refilterOf: refiltered.data.metadata.analysisId}}, {signal: controller.signal, onProgress: e => {if (e.phase === 'zone-projection') {entered = true; controller.abort();}}});} catch (e) {cancelled = e.code === 'CANCELLED'; preserved = e.imagesCleared === false;}
      const retry = await engine.run({...task, id: 'retry-refilter', params: {minimum: 17, refilterOf: refiltered.data.metadata.analysisId}}), noNewParameters = (await json('/counts')).parameterRequests === afterInference.parameterRequests;
      records.push({name: 'cooperative-filter-cancel', entered, cancelled, preserved, exact: await compare(retry, 17), noInference: retry.metrics.inferences === 0, noNewParameters});
      const modelController = new AbortController(); let modelEntered = false, modelCancelled = false, modelPreserved = false;
      try {await engine.run({...task, id: 'cancel-inference', regions: [{id: 'new-crop', kind: 'region', bounds: [3, 5, 311, 301]}]}, {signal: modelController.signal, onProgress: e => {if (e.phase === 'descriptors' && e.completed >= 2) {modelEntered = true; modelController.abort();}}});} catch (e) {modelCancelled = e.code === 'CANCELLED'; modelPreserved = e.imagesCleared === false;}
      const recovered = await engine.run({...task, id: 'recover-original'}); records.push({name: 'useful-inference-cancel', entered: modelEntered, cancelled: modelCancelled, preserved: modelPreserved, exact: await compare(recovered, 500), noInference: recovered.metrics.inferences === 0});
      const originalPreserved = await hash(await engine.original('image')) === entry.sha256 && await hash(original) === entry.sha256;
      await engine.unload('image'); await engine.unloadD2prlModel(); const memory = (await engine.capabilities()).memory, released = memory.activeReservationBytes === 0 && memory.retainedBytes === 0 && memory.cacheBytes === 0;
      const pass = records.every(r => Object.entries(r).every(([k, v]) => k === 'name' || v === true));
      return {schema: 1, status: pass && modelRequired && lazyLoad && actualExports && originalPreserved && released ? 'passed' : 'rejected', scope: 'Common real module-worker API, lazy verified model manifest and parameters, whole original-file inference at3GiB shared budget, owned result arrays, refilter, cooperative cancellation preserving raw caches, exports, source preservation and unload. No WordPress integration claim.', records, modelRequired, lazyLoad, actualExports, originalPreserved, released, memory, parameterRequestsAfterInference: afterInference.parameterRequests, npzBytes: exported.bytes.length};
    } finally {await engine.dispose();}
  }, {identity, backend});
  report.backend = backend; report.browser = browser.version(); report.package = identity; report.sources = sources; report.extractedRuntime = Boolean(runtimeRoot); report.runtimePinSha256 = hash(await readFile(runtimeAsset('vendor/d2prl/PINNED.json')));
  await writeFile(path.join(root, 'docs/d2prl-worker-engine-' + backend + (runtimeRoot ? '-extracted' : '') + '-chrome-proof.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status !== 'passed') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(r => server.close(r));}
