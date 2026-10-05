// Offline candidate comparison only: browser preparation and actual ONNX CPU.
// Reuses the bounded ORT1.30 build qualified by D2PRL; no runtime registration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url))), variant = process.argv[2] ?? 'mgcfdn-mpdn';
if (!/^(cmseg-(generalization|addnoise)|mgcfdn(-st|-16|-effnet|-mpdn|-tnt|-vig)?)$/.test(variant)) throw Error('Variant');
const heapArg = process.argv.indexOf('--heap-mib'), heapMiB = heapArg < 0 ? 512 : Number(process.argv[heapArg + 1]);
if (![512, 1024].includes(heapMiB)) throw Error('Known study heap required');
const modelArg = process.argv.indexOf('--model'), modelName = modelArg < 0 ? 'unfolded' : process.argv[modelArg + 1];
if (!/^[a-z][a-z0-9-]*$/.test(modelName)) throw Error('Model name');
const optimizationArg=process.argv.indexOf('--optimization'),optimization=optimizationArg<0?'disabled':process.argv[optimizationArg+1];
if(!['disabled','all'].includes(optimization))throw Error('Explicit graph optimization');
const modelBytes = await readFile(path.join(root, '.build/segmentation-models', variant, modelName + '.onnx')), modelSpec = {file: modelName + '.onnx', bytes: modelBytes.length, sha256: createHash('sha256').update(modelBytes).digest('hex')};
const server = createServer(async (req, res) => { try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>Segmentation model candidate</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
  res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();} });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage(); page.on('console', message => console.log(message.text()));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({variant, modelSpec, heapMiB, optimization}) => {
    const {Budget} = await import('/src/cache.js'), {createSegmentationPrepare} = await import('/experiments/segmentation/prepare.js');
    const {segmentationProbabilities} = await import('/experiments/segmentation/probabilities.js'), {createSpatial} = await import('/experiments/d2prl/spatial.js');
    const {createSegmentationZones} = await import('/experiments/segmentation/zones.js');
    const factoryUrl = heapMiB === 512 ? '/vendor/d2prl/factory.mjs' : '/.build/segmentation-ort-1024/factory.mjs';
    const runtime = await import(factoryUrl), ort = await import('/vendor/d2prl/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {mjs: new URL(factoryUrl, location.href).href, wasm: new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm', location.href).href};
    const base = '/.build/segmentation-models/' + variant + '/', ref = await (await fetch(base + 'reference.json')).json();
    ref.model = modelSpec;
    const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async spec => { const res = await fetch(base + spec.file); if (!res.ok) throw Error('Missing data'); const b = await res.arrayBuffer(); if (b.byteLength !== spec.bytes || await hash(b) !== spec.sha256) throw Error('Identity'); return b; };
    const budget = new Budget(3 * 1024 ** 3), ortRelease = budget.reserve(heapMiB * 1024 ** 2 + 3 * ref.model.bytes);
    const session = await ort.InferenceSession.create(await read(ref.model), {executionProviders: ['wasm'], graphOptimizationLevel: optimization, enableCpuMemArena: false, enableMemPattern: false}), records = [];
    const compare = (actual, expected) => {
      if (actual.length !== expected.length) throw Error('Shape');
      const a = new Uint32Array(actual.buffer, actual.byteOffset, actual.length), b = new Uint32Array(expected.buffer, expected.byteOffset, expected.length);
      let different = 0, maxAbs = 0, absoluteSum = 0, nonfinite = 0;
      for (let i = 0; i < actual.length; i++) {different += a[i] !== b[i]; const delta = Math.abs(actual[i] - expected[i]); maxAbs = Math.max(maxAbs, delta); absoluteSum += delta; nonfinite += !Number.isFinite(actual[i]);}
      return {elements: actual.length, different, maxAbs, meanAbs: absoluteSum / actual.length, nonfinite};
    };
    const decisions = (actual, expected) => {
      const n = ref.side ** 2, isForeground = (data, i) => ref.kind === 'softmax' ? data[i] >= .5 || data[n + i] >= .5 : data[i] > .5;
      if (actual.length !== n * (ref.kind === 'softmax' ? 3 : 1)) throw Error('Decision geometry');
      let changed = 0, nativeForeground = 0, browserForeground = 0;
      for (let i = 0; i < n; i++) {const a = isForeground(actual, i), b = isForeground(expected, i); changed += a !== b; browserForeground += a; nativeForeground += b;}
      return {pixels: n, changed, nativeForeground, browserForeground, rule: ref.kind === 'softmax' ? 'target>=0.5 OR source>=0.5' : 'probability>0.5'};
    };
    try {
      for (const row of ref.records) {
        const prepare = createSegmentationPrepare({budget}), [height, width] = row.rgb.shape;
        const prepared = await prepare.run({data: new Uint8Array(await read(row.rgb)), width, height, side: ref.side});
        try {
          const preparationExact = await hash(prepared.tensor) === row.input.sha256;
          const input = new ort.Tensor('float32', prepared.tensor, prepared.shape); let output;
          try {
            output = await session.run({rgb: input});
            const expected = new Float32Array(await read(row.probability));
            const logits = compare(output.logits.data, new Float32Array(await read(row.logits))), probability = compare(output.probability.data, expected), mask = decisions(output.probability.data, expected);
            const processed = await segmentationProbabilities({raw: output.probability.data, side: ref.side, kind: ref.kind}, {budget});
            let projection;
            try {
              const gridMap = compare(processed.map, new Float32Array(await read(row.gridMap))), expectedMask = new Uint8Array(await read(row.gridMask));
              const gridMaskChanges = processed.mask.reduce((n, value, i) => n + Number(value !== expectedMask[i]), 0);
              if (ref.side <= 448) {
                const spatial = createSpatial({budget, moduleUrl: new URL('/vendor/d2prl/spatial.js', location.href).href});
                const projector = createSegmentationZones({budget, spatial});
                const mapped = await projector.run({width, height, side: ref.side, kind: ref.kind, mode: 'whole-image', zones: [{id: 'whole', bounds: [0, 0, width, height], raw: output.probability.data}]});
                try {
                  const sourceMap = compare(mapped.map, new Float32Array(await read(row.sourceMap))), expectedSource = new Uint8Array(await read(row.sourceMask));
                  projection = {gridMap, gridMaskChanges, sourceMap, sourceMaskChanges: mapped.mask.reduce((n, value, i) => n + Number(value !== expectedSource[i]), 0), analyzedExact: mapped.analyzed.every(v => v === 1), candidatesExact: mapped.candidates.every(v => v === 0), metadata: mapped.metadata};
                  if (ref.kind === 'softmax') {projection.target = compare(mapped.target, new Float32Array(await read(row.target))); projection.source = compare(mapped.source, new Float32Array(await read(row.source)));}
                } finally {mapped.release(); spatial.dispose();}
              } else projection = {gridMap, gridMaskChanges, sourceProjection: 'unavailable-512-domain-extension-pending'};
            } finally {processed.release();}
            records.push({name: row.name, preparationExact, logits, probability, mask, projection, heapBytes: runtime.heapBytes()}); console.log(JSON.stringify(records.at(-1)));
          } finally {input.dispose(); for (const tensor of Object.values(output ?? {})) tensor.dispose();}
        } finally {prepared.release(); prepare.dispose();}
      }
    } finally {await session.release(); ortRelease();}
    const maskChanges = records.reduce((n, r) => n + r.mask.changed + (r.projection.sourceMaskChanges ?? 0), 0);
    const probabilityBoundPassed=records.every(r=>r.preparationExact&&[r.probability,r.projection.gridMap,r.projection.sourceMap,r.projection.target,r.projection.source].filter(Boolean).every(v=>!v.nonfinite&&v.maxAbs<=1e-4));
    return {schema: 1, status: maskChanges ? 'rejected-decision-parity' : !probabilityBoundPassed ? 'rejected-probability-bound' : 'candidate-comparison', maskChanges, probabilityBoundPassed, scope: 'Generated RGB inputs including paired synthetic spots through native PIL-compatible preparation and pinned ONNX CPU candidate, model-grid decisions and source projection where supported. No common-worker lifecycle or UI qualification. Oracle arrays are outside measured model admission.', variant: ref.variant, reference: await hash(new TextEncoder().encode(JSON.stringify(ref))), model: ref.model, weights: ref.weights, graphOptimizationLevel: optimization, ortThreads: 1, heapMaximumBytes: heapMiB * 1024 ** 2, memory: budget.snapshot(), records};
  }, {variant, modelSpec, heapMiB, optimization});
  report.browser = browser.version();
  report.sources = Object.fromEntries(await Promise.all(['scripts/study-segmentation-model.mjs', 'experiments/segmentation/prepare.js', 'experiments/segmentation/probabilities.js', 'experiments/segmentation/zones.js', 'vendor/d2prl/PINNED.json'].map(async name => [name, createHash('sha256').update(await readFile(path.join(root, name))).digest('hex')])));
  await writeFile(path.join(root, 'docs/segmentation-' + variant + (modelName === 'unfolded' ? '' : '-' + modelName) + (heapMiB === 512 ? '' : '-heap1024') + (optimization==='disabled'?'':'-optimized') + '-onnx-cpu-candidate.json'), JSON.stringify(report, null, 2) + '\n');
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
