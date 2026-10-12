// Real useful inference of the pinned initial map; no browser/server required.
// This exercises the same bounded ORT WASM module used in the application.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createSelfDMPrepare} from '../src/selfdm-prepare.js';
import {Budget} from '../src/cache.js';
import * as ort from '../vendor/d2prl/ort.wasm.min.mjs';
import * as runtime from '../vendor/d2prl/factory.mjs';

const root = resolve(process.argv[2]), reference = JSON.parse(await readFile(resolve(root, 'reference.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = async spec => {
  const bytes = await readFile(resolve(root, spec.file));
  if (bytes.byteLength !== spec.bytes || hash(bytes) !== spec.sha256) throw Error('Pinned file mismatch: ' + spec.file);
  return bytes;
};
const floats = bytes => new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {mjs: new URL('../vendor/d2prl/factory.mjs', import.meta.url).href, wasm: new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm', import.meta.url).href};
const records = [], started = performance.now();
let session;
const report = {schema: 1, scope: 'Actual ORT WASM512MiB useful inference on native validation images; no browser UI/GPU claim', runtime: 'ort130-wasm-512mib', node: process.version, model: reference.model, referenceSha256: hash(await readFile(resolve(root, 'reference.json'))), probabilityTolerance: 1e-3, allowedMaskChanges: 0};
try {
  session = await ort.InferenceSession.create(await exact(reference.model), {executionProviders: ['wasm'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false});
  report.modelLoadMs = performance.now() - started;
  for (const record of reference.records) {
    const budget = new Budget(32 * 1024 ** 2), prepare = createSelfDMPrepare({budget});
    const bytes = await exact(record.rgb), [height, width] = record.rgb.shape;
    const prepared = await prepare.run({width, height, data: new Uint8Array(bytes), side: 512});
    let input, outputs;
    try {
      const preparationExact = hash(new Uint8Array(prepared.tensor.buffer)) === record.input.sha256;
      if (!preparationExact) throw Error('SelfDM preparation differs from OpenCV native input');
      input = new ort.Tensor('float32', prepared.tensor, prepared.shape);
      const at = performance.now(); outputs = await session.run({rgb: input}); const inferenceMs = performance.now() - at;
      const expected = floats(await exact(record.probability)), actual = outputs.probability.data;
      if (actual.length !== 512 ** 2) throw Error('SelfDM output geometry');
      let maxAbs = 0, nonfinite = 0, changed = 0, foreground = 0;
      for (let i = 0; i < expected.length; i++) {
        if (!Number.isFinite(actual[i]) || actual[i] < 0 || actual[i] > 1) nonfinite++;
        maxAbs = Math.max(maxAbs, Math.abs(actual[i] - expected[i]));
        changed += Number((actual[i] > .5) !== (expected[i] > .5)); foreground += Number(actual[i] > .5);
      }
      records.push({name: record.name, preparationExact, inferenceMs, heapBytes: runtime.heapBytes(), maxAbs, nonfinite, maskChanged: changed, foreground});
      console.log(JSON.stringify(records.at(-1)));
      if (nonfinite || maxAbs > 1e-3 || changed) throw Error('Native/WASM decision parity failed');
    } finally {input?.dispose(); for (const output of Object.values(outputs ?? {})) output.dispose(); prepared.release(); prepare.dispose();}
    if (budget.total() !== 0) throw Error('Preparation resource leak');
  }
  report.status = 'native-and-wasm-cpu-qualified';
} catch (error) {
  report.status = 'failed'; report.error = {name: error.name, message: error.message, stack: error.stack};
  process.exitCode = 1;
} finally {
  await session?.release(); report.elapsedMs = performance.now() - started; report.records = records;
  report.sources = {};
  for (const file of ['../src/selfdm-prepare.js', '../vendor/d2prl/factory.mjs', '../vendor/d2prl/ort-wasm-simd-threaded.mjs', '../vendor/d2prl/ort-wasm-simd-threaded.wasm']) report.sources[file] = hash(await readFile(new URL(file, import.meta.url)));
  await writeFile(resolve(root, 'wasm-qualification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status: report.status, elapsedMs: report.elapsedMs, error: report.error}));
}
