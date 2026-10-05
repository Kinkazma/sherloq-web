// Development measurements on requested jobs, never a product calibration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)??'';if(tag&&!/^[a-z0-9-]+$/.test(tag))throw Error('Proof tag');const runtime=process.argv.find(a=>a.startsWith('--runtime-root='))?.slice(15);
const variant=process.argv[2]??'mgcfdn-mpdn';if(!['mgcfdn-mpdn','cmseg-generalization','cmseg-addnoise'].includes(variant))throw Error('Variant');
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>MPDN useful-job measurements</title><canvas id="preview"></canvas>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); const relative=path.relative(root,file),asset=runtime&&/^(src|vendor|experiments)\//.test(relative)?path.resolve(runtime,relative):file;res.end(await readFile(asset));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  const cases = [];
  browser = await chromium.launch({channel: 'chrome', headless: true});
  for (const backend of (variant==='mgcfdn-mpdn'&&!process.argv.includes('--cpu-only')?['cpu', 'webgpu']:['cpu'])) {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    cases.push(await page.evaluate(async ({backend,variant}) => {
      const {createWorkerEngine} = await import('/src/worker-client.js'), {SEGMENTATION_MODEL_IDENTITIES} = await import('/src/index.js');
      const base = '/.build/' + (variant==='mgcfdn-mpdn'?'segmentation-zones':'segmentation-zones-'+variant) + '/', reference = await (await fetch(base + 'reference.json')).json();
      const hash = async a => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a)), v => v.toString(16).padStart(2, '0')).join('');
      const read = async spec => {const bytes = await (await fetch(base + spec.file)).arrayBuffer(); if (bytes.byteLength !== spec.bytes || await hash(bytes) !== spec.sha256) throw Error('Fixture identity'); return bytes;};
      const expectedMap = new Float32Array(await read(reference.result.map)), expectedMask = new Uint8Array(await read(reference.result.mask));
      const expectedRaw = await Promise.all(reference.zones.map(async z => new Float32Array(await read(z.raw))));
      const compare = (a, b) => {if (a.length !== b.length) throw Error('Shape'); let maxAbs = 0, different = 0, sumAbs = 0; for (let i = 0; i < a.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); different += a[i] !== b[i]; sumAbs += Math.abs(a[i]-b[i]);} return {maxAbs, meanAbs:sumAbs/a.length, different, finite: a.every(Number.isFinite)};};
      const engine = createWorkerEngine({memoryBudgetBytes: 3 * 1024 ** 3, computeProfile: 'aggressive'}), model = SEGMENTATION_MODEL_IDENTITIES[variant];
      const regions = reference.zones.map(({id, kind, bounds}) => ({id, kind, bounds})), records = [];
      try {
        for (const temperature of ['cold-context', 'warm-session']) {
          const spec = temperature === 'cold-context' ? reference.sourceFile : reference.warmSourceFile, imageId = temperature;
          const start = performance.now(), bytes = new Uint8Array(await (await fetch(base + spec.file)).arrayBuffer()), acquired = performance.now();
          await engine.load({id: imageId, bytes}); const decoded = performance.now();
          if (!records.length) await engine.loadSegmentationModel({variant, url: new URL(model.backbone?'/.build/cmseg-backbone-candidate/bundle.json':'/.build/segmentation-models/'+variant+(model.family==='cmseg'?'/bundle.json':'/unfolded.onnx'), location.href).href, bytes: model.bytes, sha256: model.sha256, ...(backend === 'webgpu' ? {gpu: {url: new URL('/.build/segmentation-models/mgcfdn-mpdn/gpu-concat.onnx', location.href).href, bytes: model.gpu.bytes, sha256: model.gpu.sha256}} : {})});
          const configured = performance.now();
          const result = await engine.run({id: imageId, imageId, operation: 'ai.clones.segmentation', backend, params: {variant}, regions});
          const returned = performance.now();
          const canvas = document.getElementById('preview'); canvas.width = result.data.width; canvas.height = result.data.height;
          const rgba = new Uint8ClampedArray(result.data.mask.length * 4);
          for (let i = 0; i < result.data.mask.length; i++) {const k = i * 4, value = result.data.mask[i] * 255; rgba[k] = rgba[k + 1] = rgba[k + 2] = value; rgba[k + 3] = 255;}
          canvas.getContext('2d').putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0);
          await new Promise(requestAnimationFrame); const displayed = performance.now();
          const raw = await engine.readSegmentationRaw({imageId, resultId: result.data.metadata.resultId}), rawRead = performance.now();
          const exported = await engine.exportResult(result, {format: 'npz', maxBytes: 8 * 1024 ** 2}), sourceNpz = performance.now();
          const rawExported = await engine.exportResult(raw, {format: 'npz', maxBytes: 8 * 1024 ** 2}), finished = performance.now();
          records.push({temperature, source: spec, milliseconds: {sourceAcquisition: acquired - start, decodeAndLoad: decoded - acquired, configure: configured - decoded, analysisRpc: returned - configured, presentation: displayed - returned, rawRead: rawRead - displayed, sourceNpz: sourceNpz - rawRead, rawNpz: finished - sourceNpz, sourceThroughExports: finished - start, ...result.metrics.timings}, execution: result.metrics.execution, inferences: result.metrics.inferences, cacheHits: result.metrics.cache.rawGrids, outputs: {map: compare(result.data.map, expectedMap), mask: compare(result.data.mask, expectedMask), raw: raw.data.rawGrids.map((grid, i) => compare(grid.raw, expectedRaw[i]))}, arrayHashes:{map:await hash(result.data.map),mask:await hash(result.data.mask),raw:await Promise.all(raw.data.rawGrids.map(g=>hash(g.raw)))}, npzBytes: exported.bytes.length + rawExported.bytes.length, memory: result.metrics.memory, originalExact: await hash(await engine.original(imageId)) === spec.sha256});
        }
        await engine.unload('cold-context'); await engine.unload('warm-session'); await engine.unloadSegmentationModel();
        const capability = await engine.capabilities();
        const accepted = records.every(r => r.inferences === 3 && r.cacheHits === 0 && r.originalExact && r.outputs.mask.different === 0 && [r.outputs.map, ...r.outputs.raw].every(v => v.finite && v.maxAbs <= 1e-4)) && capability.memory.activeReservationBytes === 0 && capability.memory.cacheBytes === 0 && capability.memory.retainedBytes === 0;
        return {backend, status: accepted ? 'passed' : 'rejected', version: capability.version, records, finalMemory: capability.memory};
      } finally {await engine.dispose();}
    }, {backend,variant}));
    await context.close(); console.log(backend, cases.at(-1).status);
  }
  const report = {schema: 1, extractedRuntime:!!runtime, status: cases.every(c => c.status === 'passed') ? 'passed' : 'rejected', browser: browser.version(), scope: String(cases.length*2)+' actual common-worker jobs, each three native crops. Cold means a new browser context/engine, not an OS or GPU-driver cache reset. Warm keeps the actual model session and changes one synthetic source pixel outside all crops, forcing three new inferences with identical crop inputs. One observation per condition; no universal speedup or startup calibration. Loopback model/runtime reads; headless mask canvas presentation is not WordPress or physical display latency. The desktop and neighbouring light development remain active.', cases, sources: {}};
  for (const name of ['scripts/benchmark-segmentation-common.mjs', 'src/segmentation-adapter.js', 'experiments/segmentation/analysis.js', 'experiments/segmentation/inference.js', 'experiments/segmentation/inference-worker.js', 'experiments/segmentation/inference-gpu-worker.js', 'experiments/segmentation/gpu-budget.js','experiments/segmentation/cmseg-inference.js','experiments/segmentation/cmseg-inference-worker.js','vendor/segmentation/CMSEG-PINNED.json']) report.sources[name] = createHash('sha256').update(await readFile(path.join(runtime&&!name.startsWith('scripts/')?runtime:root, name))).digest('hex');
  await writeFile(path.join(root, 'docs/'+(variant==='mgcfdn-mpdn'?'segmentation-mpdn':'segmentation-'+variant)+'-common-benchmark'+(tag?'-'+tag:'')+'.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(cases.map(c => ({backend: c.backend, records: c.records.map(r => ({temperature: r.temperature, milliseconds: r.milliseconds, execution: r.execution}))}))));
  if (report.status === 'rejected') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
