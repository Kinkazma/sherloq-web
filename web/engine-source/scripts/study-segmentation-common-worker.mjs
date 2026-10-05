import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const variantArg = process.argv.indexOf('--variant'), variant = variantArg < 0 ? 'mgcfdn-mpdn' : process.argv[variantArg + 1];
if (!/^(mgcfdn(-mpdn|-16|-st|-effnet|-tnt|-vig)?|cmseg-(generalization|addnoise))$/.test(variant)) throw Error('Variant');
const fixtureName = variant === 'mgcfdn-mpdn' ? 'segmentation-zones' : 'segmentation-zones-' + variant, reportStem = variant === 'mgcfdn-mpdn' ? 'segmentation-mpdn' : 'segmentation-' + variant;
const backendArg = process.argv.indexOf('--backend'), backend = backendArg < 0 ? 'cpu' : process.argv[backendArg + 1];
if (!['cpu', 'webgpu', 'auto'].includes(backend)) throw Error('Backend');
const modelArg = process.argv.indexOf('--model'), modelName = modelArg < 0 ? 'unfolded' : process.argv[modelArg + 1];
if (!/^[a-z][a-z0-9-]*$/.test(modelName)) throw Error('Model name');
const runtimeArg = process.argv.indexOf('--runtime-root'), runtimeRoot = runtimeArg < 0 ? root : path.resolve(process.argv[runtimeArg + 1]);
const extracted = runtimeRoot !== root, proofName = reportStem + (backend !== 'cpu' ? '-gpu' : '') + (extracted ? '-extracted-worker-chrome-proof.json' : '-common-worker-chrome-proof.json');
const exportPrefix = (backend !== 'cpu' ? 'gpu-' : '') + (extracted ? 'extracted' : 'common');
let modelRequests = 0;
// Fixtures stay outside the candidate package; every runtime import is served
// exclusively from the staged tree, with no fallback to live source files.
const runtimeManifest = extracted ? JSON.parse(await readFile(path.join(runtimeRoot, 'runtime-manifest.json'))) : null;
if (runtimeManifest) for (const item of runtimeManifest.files) {
  const bytes = await readFile(path.join(runtimeRoot, item.file));
  if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Staged runtime identity: ' + item.file);
}
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>Segmentation common worker</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  if (name === '/model-request-count') return res.end(JSON.stringify(modelRequests));
  if (req.method === 'POST' && /^\/save-(source|raw)$/.test(name)) {const chunks = []; let bytes = 0; for await (const chunk of req) {bytes += chunk.length; if (bytes > 8 * 1024 ** 2) throw Error('Export too large'); chunks.push(chunk);} await writeFile(path.join(root, '.build/' + fixtureName + '/' + exportPrefix + '-' + name.slice(6) + '.npz'), Buffer.concat(chunks)); return res.end('saved');}
  if (name.endsWith('.onnx')) modelRequests++;
  const corrupt = name.startsWith('/corrupt-cmseg/');
  const mapped = corrupt ? '/.build/segmentation-models/' + name.slice('/corrupt-cmseg/'.length) : name;
  const fileRoot = mapped.startsWith('/.build/') ? root : runtimeRoot;
  const file = path.resolve(fileRoot, '.' + mapped); if (!file.startsWith(fileRoot + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); const served = await readFile(file); if (corrupt && name.endsWith('.onnx')) served[0] ^= 1; res.end(served);
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true}); const page = await browser.newPage(); page.on('console', m => console.log(m.text()));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({variant, fixtureName, backend, modelName}) => {
    const {createWorkerEngine} = await import('/src/worker-client.js'), {SEGMENTATION_MODEL_IDENTITIES} = await import('/src/index.js');
    const base = '/.build/' + fixtureName + '/', reference = await (await fetch(base + 'reference.json')).json(), engine = createWorkerEngine({memoryBudgetBytes: 3 * 1024 ** 3, computeProfile: 'aggressive'});
    const hash = async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a)), v => v.toString(16).padStart(2, '0')).join('');
    const read = async e => {const bytes = await (await fetch(base + e.file)).arrayBuffer(); if (bytes.byteLength !== e.bytes || await hash(bytes) !== e.sha256) throw Error('Fixture identity'); return bytes;};
    const compare = (a, b) => {if (a.length !== b.length) throw Error('Shape'); let maxAbs = 0, different = 0; for (let i = 0; i < a.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); different += a[i] !== b[i];} return {different, maxAbs, finite: a.every(Number.isFinite)};};
    const check = async (result, expected) => {const values = {}; for (const [name, spec] of Object.entries(expected)) values[name] = compare(result.data[name], spec.dtype === 'float32' ? new Float32Array(await read(spec)) : new Uint8Array(await read(spec))); return values;};
    const records = [], exports = [], zones = reference.zones.map(({id, kind, bounds}) => ({id, kind, bounds}));
    const task = {id: 'analysis', imageId: 'image', operation: 'ai.clones.segmentation', backend, params: {variant}, regions: zones};
    try {
      const source = new Uint8Array(await read(reference.sourceFile)); await engine.load({id: 'image', bytes: source});
      let missingRefused = false; try {await engine.run(task);} catch (e) {missingRefused = e.code === 'MODEL_UNAVAILABLE';}
      const identity = SEGMENTATION_MODEL_IDENTITIES[variant];
      const loaded = await engine.loadSegmentationModel({variant, url: new URL(identity.backbone ? '/.build/cmseg-backbone-candidate/bundle.json' : '/.build/segmentation-models/' + variant + (identity.family === 'cmseg' ? '/bundle.json' : '/' + modelName + '.onnx'), location.href).href, bytes: identity.bytes, sha256: identity.sha256, ...(backend !== 'cpu' ? {gpu: {url: new URL('/.build/segmentation-models/' + variant + '/gpu-concat.onnx', location.href).href, bytes: identity.gpu.bytes, sha256: identity.gpu.sha256}} : {})});
      const lazy = loaded.parametersLoaded === false && loaded.runtimeInferencePerformed === false && await (await fetch('/model-request-count')).json() === 0;
      const pixels = await engine.imagePixels('image'), decodeExact = await hash(pixels.data) === reference.source.sha256;
      const result = await engine.run(task); records.push({name: 'original-png-three-zones', inferences: result.metrics.inferences, execution: result.metrics.execution, selection: result.provenance.backendSelection, outputs: await check(result, reference.result)});
      const save = async (name, output) => {const exported = await engine.exportResult(output, {format: 'npz', maxBytes: 8 * 1024 ** 2}); const response = await fetch('/save-' + name, {method: 'POST', body: exported.bytes}); if (!response.ok) throw Error('Save'); exports.push({name, bytes: exported.bytes.length, sha256: await hash(exported.bytes)});};
      await save('source', result);
      const raw = await engine.readSegmentationRaw({imageId: 'image', resultId: result.data.metadata.resultId}); await save('raw', raw);
      const rawErrors = []; for (let i = 0; i < raw.data.rawGrids.length; i++) rawErrors.push(compare(raw.data.rawGrids[i].raw, new Float32Array(await read(reference.zones[i].raw))));
      let smallJsonBudgetRefused = null;
      if (identity.kind === 'softmax') {try {await engine.exportResult(raw, {format: 'json', maxBytes: 16 * 1024 ** 2}); smallJsonBudgetRefused = false;} catch(e) {smallJsonBudgetRefused = e.code === 'MEMORY_LIMIT';}}
      const json = JSON.parse(new TextDecoder().decode((await engine.exportResult(raw, {format: 'json', maxBytes: (identity.kind === 'softmax' || identity.side === 512 ? 64 : 16) * 1024 ** 2})).bytes));
      const jsonExact = json.data.rawGrids.every((g, i) => g.raw.every((v, j) => v === raw.data.rawGrids[i].raw[j]));
      const reprojection = ids => engine.run({id: 'view', imageId: 'image', operation: task.operation, params: {variant, reprojectOf: result.data.metadata.analysisId, zoneIds: ids}});
      const off = await reprojection(['roi-a', 'roi-b']); records.push({name: 'envelope-off', inferences: off.metrics.inferences, outputs: await check(off, reference.withoutEnvelope)});
      const restored = await reprojection(zones.map(z => z.id)); records.push({name: 'envelope-restored', inferences: restored.metrics.inferences, outputs: await check(restored, reference.result)});
      const controller = new AbortController(); let cancelled = false, imagesPreserved = false;
      try {await engine.run({...task, id: 'cancel', regions: [{id: 'new-roi', kind: 'region', bounds: [21, 20, 277, 276]}]}, {signal: controller.signal, onProgress: e => {if (identity.family === 'cmseg' ? e.phase === 'cmseg-correlation-statistics' : e.phase === 'inference') controller.abort();}});} catch (e) {cancelled = e.code === 'CANCELLED'; imagesPreserved = e.imagesCleared === false;}
      const retry = await engine.run({...task, id: 'retry'}); records.push({name: 'after-cancel-original-cached', inferences: retry.metrics.inferences, outputs: await check(retry, reference.result)});
      let backendSwitch = null;
      if (backend !== 'cpu') {
        let cachedSwitchRefused = false;
        try {await engine.run({id: 'wrong-view', imageId: 'image', operation: task.operation, backend: 'cpu', params: {variant, reprojectOf: retry.data.metadata.analysisId, zoneIds: ['roi-a']}});} catch(e) {cachedSwitchRefused = e.code === 'INVALID_INPUT';}
        const cpu = await engine.run({...task, id: 'cpu-button', backend: 'cpu', regions: [zones[0]]});
        const cpuRaw = await engine.readSegmentationRaw({imageId: 'image', resultId: cpu.data.metadata.resultId});
        backendSwitch = {cachedSwitchRefused, cpuInferences: cpu.metrics.inferences, cpuBackend: cpu.provenance.backend, raw: compare(cpuRaw.data.rawGrids[0].raw, new Float32Array(await read(reference.zones[0].raw)))};
      }
      let corruptChildRefused=null;
      if(identity.family==='cmseg'){
        await engine.unloadSegmentationModel();
        await engine.loadSegmentationModel({variant,url:new URL('/corrupt-cmseg/'+variant+'/bundle.json',location.href).href,bytes:identity.bytes,sha256:identity.sha256});
        try{await engine.run({...task,id:'corrupt-child'});corruptChildRefused=false;}catch(error){corruptChildRefused=error.code==='MODEL_FAILED';}
      }
      const originalPreserved = await hash(await engine.original('image')) === reference.sourceFile.sha256;
      await engine.unload('image'); await engine.unloadSegmentationModel(); const capability = await engine.capabilities(), memory = capability.memory;
      const good = rows => Object.entries(rows).every(([key, r]) => r.finite && (['map', 'source', 'target'].includes(key) ? r.maxAbs <= 1e-4 : r.different === 0));
      const passed = (corruptChildRefused===null||corruptChildRefused===true) && (backend !== 'auto' || result.provenance.backend === 'webgpu-cpu' && result.provenance.backendSelection === 'qualified-hybrid-gpu-with-budget') && missingRefused && lazy && decodeExact && records[0].inferences === 3 && records.slice(1).every(r => r.inferences === 0) && records.every(r => good(r.outputs)) && rawErrors.every(r => r.finite && r.maxAbs <= 1e-4) && (smallJsonBudgetRefused === null || smallJsonBudgetRefused === true) && jsonExact && cancelled && imagesPreserved && originalPreserved && (!backendSwitch || backendSwitch.cachedSwitchRefused && backendSwitch.cpuInferences === 1 && backendSwitch.cpuBackend === 'cpu-wasm' && backendSwitch.raw.finite && backendSwitch.raw.maxAbs <= 1e-4) && memory.retainedBytes === 0 && memory.cacheBytes === 0 && memory.activeReservationBytes === 0;
      return {schema: 1, status: passed ? 'passed-corpus-tolerance' : 'rejected', variant, backend, scope: 'Original PNG through common worker API and bounded configured segmentation model; three native crops, cache-only views, original/raw/NPZ/JSON, cooperative cancellation and lifecycle. Continuous maps are not bit exact; UI not claimed. WebGPU results are hybrid with CPU nodes.', version: capability.version, records, rawErrors, exports, missingRefused, lazy, decodeExact, jsonExact, smallJsonBudgetRefused, cancelled, imagesPreserved, originalPreserved, backendSwitch, corruptChildRefused, memory};
    } finally {await engine.dispose();}
  }, {variant, fixtureName, backend, modelName});
  report.browser = browser.version(); report.sources = {}; report.modelRequests = modelRequests; report.runtime = extracted ? {kind: 'staged-manifest-only', version: runtimeManifest.version, files: runtimeManifest.files.length, manifestSha256: createHash('sha256').update(await readFile(path.join(runtimeRoot, 'runtime-manifest.json'))).digest('hex')} : {kind: 'live-development'};
  for (const name of ['src/index.js', 'src/worker.js', 'src/worker-client.js', 'src/segmentation-adapter.js', 'src/exports.js', 'experiments/segmentation/inference.js', 'experiments/segmentation/analysis.js', 'experiments/segmentation/npz.js', 'experiments/segmentation/cmseg-inference.js', 'experiments/segmentation/cmseg-inference-worker.js', 'experiments/segmentation/cmseg-correlation.js', 'experiments/segmentation/cmseg-correlation-worker.js', 'scripts/study-segmentation-common-worker.mjs']) report.sources[name] = createHash('sha256').update(await readFile(path.join(name.startsWith('scripts/') ? root : runtimeRoot, name))).digest('hex');
  await writeFile(path.join(root, 'docs', proofName), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report)); if (report.status === 'rejected') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
