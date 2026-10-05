// Development-only hybrid study. GPU allocations and the WASM heap share one
// budget; CPU fallback (including TopK) is declared, never called pure GPU.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const variant = process.argv[2] ?? 'mgcfdn-mpdn';
if (!['mgcfdn-mpdn', 'mgcfdn', 'mgcfdn-16', 'mgcfdn-effnet', 'mgcfdn-st'].includes(variant)) throw Error('Variant');
const modelArg = process.argv.indexOf('--model'), modelName = modelArg < 0 ? 'unfolded' : process.argv[modelArg + 1];
if (!/^[a-z][a-z0-9-]*$/.test(modelName)) throw Error('Model filename');
const modelData = await readFile(path.join(root, '.build/segmentation-models', variant, modelName + '.onnx')), modelSpec = {file: modelName + '.onnx', bytes: modelData.length, sha256: createHash('sha256').update(modelData).digest('hex')};
const server = createServer(async (req, res) => {try {
  const name = new URL(req.url, 'http://local').pathname;
  if (name === '/') return res.end('<!doctype html><title>Bounded hybrid segmentation study</title>');
  if (name === '/favicon.ico') {res.statusCode = 204; return res.end();}
  const file = path.resolve(root, '.' + name); if (!file.startsWith(root + path.sep)) throw Error('Path');
  res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(file));
} catch {res.statusCode = 404; res.end();}});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage(), messages = [];
  page.on('console', m => {if (/CPU|assigned|fallback|error|validation/i.test(m.text()) && messages.length < 40) messages.push(m.text().slice(0, 1000));});
  await page.goto('http://127.0.0.1:' + server.address().port);
  const report = await page.evaluate(async ({variant, modelSpec}) => {
    const {Budget} = await import('/src/cache.js'), {createSegmentationPrepare} = await import('/experiments/segmentation/prepare.js');
    const {createSpatial} = await import('/experiments/d2prl/spatial.js'), {createSegmentationZones} = await import('/experiments/segmentation/zones.js');
    const budget = new Budget(3 * 1024 ** 3), gpuLimit = 512 * 1024 ** 2;
    const base = '/.build/segmentation-models/' + variant + '/', ref = await (await fetch(base + 'reference.json')).json();
    ref.model = modelSpec;
    const sha = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
    const read = async spec => {const response = await fetch(base + spec.file); if (!response.ok) throw Error('Missing fixture/model'); const bytes = await response.arrayBuffer(); if (bytes.byteLength !== spec.bytes || await sha(bytes) !== spec.sha256) throw Error('Identity'); return bytes;};
    const compare = (a, b) => {if (a.length !== b.length) throw Error('Shape'); let maxAbs = 0, sumAbs = 0, different = 0; for (let i = 0; i < a.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); sumAbs += Math.abs(a[i] - b[i]); different += a[i] !== b[i];} return {maxAbs, meanAbs: sumAbs / a.length, different, finite: a.every(Number.isFinite)};};
    const records = [], devices = [], activeBuffers = new Set(), pendingFrees = [], gpuErrors = [], kernels = new Map();
    const gpu = {limitBytes: gpuLimit, liveBytes: 0, peakBytes: 0, allocations: 0, writeBufferBytes: 0, readMappingBytes: 0, dispatchedProfiles: 0};
    let session, resident, prepare, spatial, runtime, failure, sessionMs;
    const adapter = await navigator.gpu?.requestAdapter({powerPreference: 'high-performance'});
    if (!adapter) return {status: 'unavailable', reason: 'No WebGPU adapter'};
    // Preserve the native GPUAdapter identity required by ORT; wrap only this
    // study's device factory so admission happens before every GPU allocation.
    const requestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = async descriptor => {
      descriptor.requiredLimits.maxStorageBuffersPerShaderStage = adapter.limits.maxStorageBuffersPerShaderStage;
      const device = await requestDevice(descriptor); devices.push(device);
      device.addEventListener('uncapturederror', e => gpuErrors.push(String(e.error.message)));
      const create = device.createBuffer.bind(device), destroyDevice = device.destroy.bind(device), write = device.queue.writeBuffer.bind(device.queue);
      device.queue.writeBuffer = (buffer, offset, data, dataOffset = 0, size) => {
        const unit = data.BYTES_PER_ELEMENT ?? 1;
        gpu.writeBufferBytes += (size ?? data.byteLength / unit - dataOffset) * unit;
        return write(buffer, offset, data, dataOffset, size);
      };
      device.createBuffer = descriptor => {
        const bytes = Math.ceil(Number(descriptor.size) / 4) * 4;
        if (!Number.isSafeInteger(bytes) || bytes < 0 || gpu.liveBytes + bytes > gpuLimit) throw Error('GPU buffer admission limit');
        const release = budget.reserve(bytes); let buffer;
        try {buffer = create(descriptor);} catch (error) {release(); throw error;}
        const entry = {device, bytes, release}; activeBuffers.add(entry);
        gpu.liveBytes += bytes; gpu.peakBytes = Math.max(gpu.peakBytes, gpu.liveBytes); gpu.allocations++;
        const free = () => {if (activeBuffers.delete(entry)) {gpu.liveBytes -= bytes; release();}};
        entry.free = free;
        const destroy = buffer.destroy.bind(buffer), map = buffer.mapAsync.bind(buffer);
        buffer.destroy = () => {destroy(); pendingFrees.push(device.queue.onSubmittedWorkDone().then(free, free));};
        buffer.mapAsync = (mode, offset = 0, size) => {if (mode & GPUMapMode.READ) gpu.readMappingBytes += size ?? buffer.size - offset; return map(mode, offset, size);};
        return buffer;
      };
      device.destroy = () => {destroyDevice(); pendingFrees.push(device.lost.then(() => {for (const entry of activeBuffers) if (entry.device === device) entry.free();}));};
      return device;
    };
    try {
      resident = budget.reserve(512 * 1024 ** 2 + 3 * ref.model.bytes);
      runtime = await import('/.build/segmentation-ort-gpu/factory.mjs');
      const ort = await import('/.build/segmentation-ort-gpu-bounded-cache/ort.all.min.mjs');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = {mjs: new URL('/.build/segmentation-ort-gpu/factory.mjs', location.href).href, wasm: new URL('/.build/ort130/package/dist/ort-wasm-simd-threaded.jsep.wasm', location.href).href};
      ort.env.webgpu.adapter = adapter;
      ort.env.webgpu.profiling = {mode: 'default', ondata: data => {gpu.dispatchedProfiles++; kernels.set(data.kernelType, (kernels.get(data.kernelType) ?? 0) + 1);}};
      const model = await read(ref.model), begin = performance.now();
      session = await ort.InferenceSession.create(model, {executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false});
      sessionMs = performance.now() - begin;
      prepare = createSegmentationPrepare({budget}); spatial = createSpatial({budget, moduleUrl: new URL('/vendor/d2prl/spatial.js', location.href).href}); const projector = createSegmentationZones({budget, spatial});
      for (const row of ref.records) {
        const [height, width] = row.rgb.shape, start = performance.now();
        const prepared = await prepare.run({data: new Uint8Array(await read(row.rgb)), width, height, side: ref.side});
        let input, outputs, projected;
        try {
          const preparationMs = performance.now() - start, preparationExact = await sha(prepared.tensor) === row.input.sha256;
          input = new ort.Tensor('float32', prepared.tensor, prepared.shape); const beforeRun = performance.now(); outputs = await session.run({rgb: input}); await ort.env.webgpu.device.queue.onSubmittedWorkDone(); if (gpuErrors.length) throw Error('GPU validation error; numerical output discarded'); const runMs = performance.now() - beforeRun;
          const raw = outputs.probability.data, probability = compare(raw, new Float32Array(await read(row.probability))), logits = compare(outputs.logits.data, new Float32Array(await read(row.logits)));
          const beforeProjection = performance.now(); projected = await projector.run({width, height, side: ref.side, kind: ref.kind, mode: 'whole-image', zones: [{id: 'whole', bounds: [0, 0, width, height], raw}]});
          const projectionMs = performance.now() - beforeProjection, mask = compare(projected.mask, new Uint8Array(await read(row.sourceMask))), map = compare(projected.map, new Float32Array(await read(row.sourceMap)));
          const record = {name: row.name, preparationExact, probability, logits, map, mask, foreground: projected.mask.reduce((n, v) => n + v, 0), preparationMs, runMs, projectionMs, heapBytes: runtime.heapBytes(), gpuLiveBytes: gpu.liveBytes};
          if (ref.kind === 'softmax') {record.target = compare(projected.target, new Float32Array(await read(row.target))); record.source = compare(projected.source, new Float32Array(await read(row.source)));}
          records.push(record);
        } finally {projected?.release(); input?.dispose(); for (const output of Object.values(outputs ?? {})) output.dispose(); prepared.release();}
      }
    } catch (error) {failure = String(error?.stack ?? error);}
    finally {
      await session?.release(); prepare?.dispose(); spatial?.dispose();
      for (const device of devices) device.destroy(); await Promise.allSettled(pendingFrees); resident?.();
    }
    const passed = !failure && !gpuErrors.length && records.length === ref.records.length && records.every(r => r.preparationExact && r.mask.different === 0 && [r.probability, r.map, ...r.target ? [r.target, r.source] : []].every(x => x.finite && x.maxAbs <= 1e-4)) && gpu.liveBytes === 0 && budget.total() === 0 && gpu.dispatchedProfiles > 0;
    return {schema: 1, status: passed ? 'passed-hybrid-corpus' : 'rejected', scope: 'Actual ORT WebGPU + CPU (including unsupported TopK), float32 model,512MiB WASM ceiling and individually admitted GPU buffers capped512MiB under one3GiB budget. Idle storage/uniform buffer caches are bounded by32795264B each through the pinned bucket count table; active and submitted buffers unchanged. Functional study with profiling; no speedup claim or product startup probe. Fixtures/oracles and server copies are outside model admission. Driver/compiler overhead is not RSS-accounted.', variant, model: ref.model, weights: ref.weights, sessionMs, records, gpu: {...gpu, kernelTypes: Object.fromEntries(kernels)}, gpuErrors, failure, memory: budget.snapshot(), adapter: {vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage, maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize}};
  }, {variant, modelSpec});
  report.browser = browser.version(); report.providerMessages = messages; report.sources = {};
  for (const name of ['scripts/study-mgcf-bounded-cache.mjs', 'scripts/build-segmentation-gpu-cache.py', '.build/segmentation-ort-gpu/runtime.json', '.build/segmentation-ort-gpu-bounded-cache/build.json', '.build/segmentation-ort-gpu-bounded-cache/ort.all.min.mjs']) report.sources[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
  await writeFile(path.join(root, 'docs/segmentation-' + variant + (modelName === 'unfolded' ? '' : '-' + modelName) + '-gpu-bounded-cache-candidate.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, failure: report.failure, gpu: report.gpu, memory: report.memory, records: report.records?.map(r => ({name: r.name, probability: r.probability, mask: r.mask}))}));
  if (report.status === 'rejected') process.exitCode = 1;
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
