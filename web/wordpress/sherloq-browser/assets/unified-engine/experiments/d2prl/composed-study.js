import {Budget} from '../../src/cache.js';
import {createConvolutionCpu} from './convolution-cpu.js';
import {createConvolutionGpu} from './convolution-gpu.js';
import {createConvolutionGeneralGpu} from './convolution-general-gpu.js';
import {createFeatureMath} from './feature-math.js';
import {createNeuralMath} from './neural-math.js';
import {createDlf} from './dlf.js';
import {createUnionHead} from './union-head.js';
import {createUnetGraph} from './unet-graph.js';
import {createHeads} from './heads.js';
import {createRoles} from './roles.js';
import {createPostprocess} from './postprocess.js';
// Comparators live only in this development harness. Expected tensors never
// become computation inputs, except the explicitly named native PM boundary
// mode. full=true instead computes pixels->preparation->features->PM->heads.
export async function composedStudy({full = false, trace = false, fromFile = false, caseName = null, boundedOrt = false, cpu = false} = {}) {
  const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
  const json = async url => { const r = await fetch(url); if (!r.ok) throw Error('Missing JSON'); return r.json(); };
  const read = async (base, spec, Type = Float32Array, {signal} = {}) => {
    const r = await fetch(base + spec.file, {signal}); if (!r.ok) throw Error('Missing tensor'); const b = await r.arrayBuffer();
    if (b.byteLength !== spec.bytes || await hash(b) !== spec.sha256) throw Error('Tensor identity'); return new Type(b);
  };
  if (caseName && (!['jpeg', 'flat'].includes(caseName) || !full || trace)) throw Error('Additional source study mode');
  const modelBase = caseName ? '/.build/d2prl-additional/' + caseName + '/' : '/.build/d2prl-model/', unionBase = caseName ? modelBase : '/.build/d2prl-union/';
  const model = await json(modelBase + 'reference.json'), unionRef = await json(unionBase + (caseName ? 'union-reference.json' : 'reference.json')), dlfRef = await json('/.build/d2prl-dlf/reference.json'), dlfModel = await json(modelBase + (caseName ? 'dlf-reference.json' : 'dlf-unfolded-model.json')), roleModel = await json('/.build/d2prl-model/roles-native-resize-batchnorm-model.json'), masksRef = await json(modelBase + 'masks-reference.json'), returnRef = fromFile ? await json(modelBase + 'source-return-reference.json') : null;
  const graph = await json('/.build/d2prl-unet-graph/graph.json'), layouts = await json('/fixtures/d2prl/gemm-layout-unet.json'), pointLayouts = await json('/fixtures/d2prl/point-reduction-layout.json'), unionLayouts = await json('/fixtures/d2prl/gemm-layout-union.json');
  const {default: featureFactory} = await import('/.build/d2prl-feature-math/feature-math.js'), {default: mathFactory} = await import('/.build/d2prl-neural-math/neural-math.js'), {default: dlfFactory} = await import('/.build/d2prl-dlf/dlf.js');
  // Explicit development admission. ORT reserves its entire4GiB WASM ceiling,
  // not an observed RSS amount; no device-brand rule or runtime calibration.
  const budget = new Budget(8 * 1024 ** 3), gpu = cpu ? createConvolutionCpu({budget, moduleUrl: new URL('/.build/d2prl-convolution-cpu/convolution.js', location.href).href, maxWorkers: Math.min(32, navigator.hardwareConcurrency || 1)}) : await createConvolutionGpu({budget}), generalGpu = cpu ? gpu : await createConvolutionGeneralGpu({budget}), featureMath = await createFeatureMath(featureFactory, {budget}), math = await createNeuralMath(mathFactory, {budget}), dlf = await createDlf(dlfFactory, {budget});
  const absolute = value => new URL(value, location.href).href;
  const roleFactory = boundedOrt ? (await import('./roles-bounded.js')).createBoundedRoles : createRoles;
  const roleRuntime = boundedOrt ? await json('/.build/d2prl-roles-runtime/runtime.json') : null;
  const roles = roleFactory({budget, ...(boundedOrt ? {runtime: roleRuntime, runtimeFactoryUrl: absolute('/.build/d2prl-roles-runtime/factory.mjs')} : {}), model: roleModel, modelUrl: absolute('/.build/d2prl-model/' + roleModel.modelFile), ortUrl: absolute('/.build/ort130/package/dist/ort.wasm.min.mjs'), wasmPath: absolute('/.build/ort130/package/dist/')});
  const postprocess = createPostprocess({budget, moduleUrl: absolute('/.build/d2prl-postprocess/postprocess.js')});
  const dlfWeights = Object.fromEntries([7, 9, 11].map(k => [k, dlfRef.records.find(r => r.kernel === k).weights]));
  const unionHead = createUnionHead({dlf, convolution: gpu, featureMath, neuralMath: math, budget, layers: unionRef.records, batchnorm: unionRef.batchnorm, dlfWeights, layouts: unionLayouts, loadParameter: (kind, spec, options) => read('/.build/d2prl-' + kind + '/', spec, Float32Array, options)});
  const unet = createUnetGraph({graph, layouts, pointLayouts, tailProbe: true, tailMode: 'block1024', convolution: generalGpu, math, budget, loadParameter: (_name, spec, options) => read('/.build/d2prl-unet-graph/', spec, spec.dtype === 'int64' ? BigInt64Array : Float32Array, options)});
  const heads = createHeads({unionHead, unet, math, roles, budget}), records = [], times = {};
  const compare = (name, actual, expected, threshold = null) => {
    if (actual.length !== expected.length) throw Error('Shape ' + name); const Bits = actual instanceof Uint8Array ? Uint8Array : actual instanceof Uint16Array ? Uint16Array : Uint32Array;
    const ab = new Bits(actual.buffer, actual.byteOffset, actual.length), eb = new Bits(expected.buffer, expected.byteOffset, expected.length);
    let different = 0, maxAbs = 0, sumAbs = 0, thresholdChanged = 0, nonfinite = 0;
    for (let i = 0; i < actual.length; i++) { different += ab[i] !== eb[i]; const d = Math.abs(actual[i] - expected[i]); maxAbs = Math.max(maxAbs, d); sumAbs += d; if (threshold !== null) thresholdChanged += (actual[i] > threshold) !== (expected[i] > threshold); nonfinite += !Number.isFinite(actual[i]); }
    const row = {name, elements: actual.length, different, maxAbs, meanAbs: sumAbs / actual.length, threshold, thresholdChanged, nonfinite}; records.push(row); console.log(JSON.stringify(row)); return row;
  };
  const onStage = async (name, actual) => {
    let expected, threshold = null;
    if (name.startsWith('dlf-')) { const [, k, branch] = name.split('-'); expected = await read(modelBase, dlfModel.expected[6 + [7, 9, 11].indexOf(Number(k)) * 2 + (branch === 'cnn' ? 1 : 0)]); }
    else if (name === 'union-input') expected = await read(unionBase, unionRef.input);
    else if (name === 'union-sigmoid' || name === 'unet-sigmoid') { expected = await read(unionBase, name === 'union-sigmoid' ? unionRef.sigmoid : unionRef.unet); threshold = .5; }
    else if (['combined-union', 'target', 'source'].includes(name)) { const i = ['combined-union', 'target', 'source'].indexOf(name); expected = await read(modelBase, model.raw[i]); threshold = i === 0 ? .5 : 0; }
    else if (name.endsWith('-relu')) expected = await read(unionBase, unionRef.batchnorm.find(r => r.name === name.replace(/-relu$/, '')).relu);
    else expected = await read(unionBase, unionRef.records.find(r => r.name === name).output);
    compare(name, actual, expected, threshold);
  };
  let preparation, prepared, descriptorResult, pmEngine, pm, result, rawRelease, nativeInputRelease, pool, sourceResult, spatial;
  const started = performance.now();
  try {
    let rgb;
    if (full) {
      const {createPreparation} = await import('./prepare.js'), {default: factory} = await import('/.build/d2prl-prepare/prepare.js'); preparation = await createPreparation(factory, {budget});
      let sourcePixels = await read(modelBase, model.source, Uint8Array);
      if (fromFile) {
        const {createD2prlSource} = await import('./source.js'), {createSpatial} = await import('./spatial.js'); spatial = createSpatial({budget, moduleUrl: absolute('/.build/d2prl-spatial/spatial.js')});
        const entry = caseName ? model.original : (await json('/.build/d2prl-source/reference.json')).records[0].original;
        const original = await read(caseName ? modelBase : '/.build/d2prl-source/', entry, Uint8Array); sourceResult = await createD2prlSource({budget}).run(original);
        if (await hash(sourceResult.original) !== entry.sha256 || sourceResult.descriptor.sha256 !== entry.sha256) throw Error('Original byte preservation');
        compare('source-decoded-rgb8', sourceResult.pixels.data, sourcePixels); sourcePixels = sourceResult.pixels.data;
      }
      let t = performance.now(); prepared = await preparation.run({rgb: sourcePixels, height: model.source.shape[0], width: model.source.shape[1]}); times.preparation = performance.now() - t; rgb = prepared.data; preparation.dispose(); compare('prepared-rgb448', rgb, await read(modelBase, model.input));
      const {createDescriptors} = await import('./descriptors.js'), conv = await json('/.build/d2prl-convolution/all-reference.json'), bn = await json('/.build/d2prl-batchnorm/reference.json'), featureLayouts = await json('/fixtures/d2prl/gemm-layout-all.json');
      const descriptors = createDescriptors({convolution: gpu, math: featureMath, budget,
        loadConvolution: async name => { const r = conv.records.find(r => r.name === name); return {weights: await read('/.build/d2prl-convolution/', r.weights), bias: await read('/.build/d2prl-convolution/', r.bias), channels: r.input.shape[1], height: r.input.shape[2], width: r.input.shape[3], outChannels: r.weights.shape[0], kernel: r.weights.shape[2], padding: r.padding, referenceLayout: featureLayouts.records.find(r => r.name === name)}; },
        loadBatchNorm: async name => { const r = bn.records.find(r => r.name === name); return {params: await read('/.build/d2prl-batchnorm/', r.params), epsilon: r.epsilon}; }});
      t = performance.now(); descriptorResult = await descriptors.run(rgb); times.descriptors = performance.now() - t; gpu.releaseIdleWorkers?.();
      compare('descriptors-zm-half', descriptorResult.zm, await read(modelBase, model.features[0], Uint16Array)); compare('descriptors-cnn-half', descriptorResult.cnn, await read(modelBase, model.features[1], Uint16Array));
      const {createPatchMatch} = await import('./patchmatch.js'), {createEvaluatorPool} = await import('./evaluator-pool.js'), random = await json('/fixtures/d2prl/random.json');
      pmEngine = await createPatchMatch(null, {budget, evaluatorFactory: async (_, {budget}) => pool = await createEvaluatorPool(absolute('/.build/d2prl-evaluator-tiled/evaluator-tiled.js'), {budget, maxWorkers: Math.min(32, navigator.hardwareConcurrency ?? 1)})});
      t = performance.now(); pm = await pmEngine.run({zmFeatures: descriptorResult.zm, cnnFeatures: descriptorResult.cnn, side: 448, iterations: 40, randomState: random.model.initial, referenceThreads: 8}, {onProgress: p => { if (p.completed % 20 === 0) console.log(JSON.stringify({phase: 'complete-patchmatch', completed: p.completed, total: p.total})); }}); times.patchmatch = performance.now() - t;
      const arrays = [pm.offsets.zm.x, pm.offsets.zm.y, pm.offsets.cnn.x, pm.offsets.cnn.y, pm.coordinates.zm.x, pm.coordinates.zm.y, pm.coordinates.cnn.x, pm.coordinates.cnn.y]; for (let i = 0; i < arrays.length; i++) compare('patchmatch-' + i, arrays[i], await read(modelBase, model.patchmatch[i]));
      descriptorResult.release(); descriptorResult = null; pmEngine.dispose();
    } else {
      nativeInputRelease = budget.reserve(model.input.bytes + 8 * 448 ** 2 * 4); rgb = await read(modelBase, model.input); const values = [];
      for (const r of model.patchmatch) values.push(await read(modelBase, r));
      pm = {offsets: {zm: {x: values[0], y: values[1]}, cnn: {x: values[2], y: values[3]}}, coordinates: {zm: {x: values[4], y: values[5]}, cnn: {x: values[6], y: values[7]}}, release() {}};
    }
    const convRef = trace ? await json('/.build/d2prl-unet-convolution/reference.json') : null, begin = performance.now();
    result = await heads.run({rgb, patchmatch: pm}, {onStage, onUnetNode: async ({index, total, node, result}) => {
      if (index % 100 === 0) console.log(JSON.stringify({phase: 'composed-unet', index, total}));
      if (trace && node.op === 'Conv') { const name = node.inputs[1].replace(/^unet\./, '').replace(/\.weight$/, ''); compare('unet-' + name, result.data, await read('/.build/d2prl-unet-convolution/', convRef.records.find(r => r.name === name).output)); }
    }}); times.heads = performance.now() - begin;
    const decisionExact = result.decision.overlap === unionRef.overlap && result.decision.threshold === unionRef.threshold && result.decision.combineMaximum === unionRef.combineMaximum;
    console.log(JSON.stringify({decision: result.decision, decisionExact}));
    rawRelease = budget.reserve(3 * 448 ** 2 * 4); const raw = new Float32Array(3 * 448 ** 2); raw.set(result.union); raw.set(result.target, 448 ** 2); raw.set(result.source, 2 * 448 ** 2);
    const t = performance.now();
    if (spatial) {
      const mapped = await spatial.run({input: result.union, outWidth: returnRef.width, outHeight: returnRef.height, nearest: false});
      try { compare('source-continuous-map', mapped.data, await read(modelBase, returnRef.map)); } finally { mapped.release(); }
    }
    for (const row of masksRef.records) {
      const out = await postprocess.run({raw, minimum: row.minimum});
      try {
        compare('masks-min-' + row.minimum, out.masks, await read(modelBase, row), .5);
        if (spatial) {
          const expected = await read(modelBase, returnRef.masks.find(r => r.minimum === row.minimum)), n = returnRef.width * returnRef.height;
          for (let channel = 0; channel < 3; channel++) {
            const mapped = await spatial.run({input: out.masks.subarray(channel * 448 ** 2, (channel + 1) * 448 ** 2), outWidth: returnRef.width, outHeight: returnRef.height, nearest: true});
            try { compare('source-masks-min-' + row.minimum + '-' + channel, mapped.data, expected.subarray(channel * n, (channel + 1) * n), .5); } finally { mapped.release(); }
          }
        }
      } finally { out.release(); }
    }
    times.postprocess = performance.now() - t; const decision = result.decision, roleRuntimeMeasured = result.roleRuntime;
    const saved = await fetch('/save-composed', {method: 'POST', body: raw}); if (!saved.ok) throw Error('Save composed result');
    rawRelease(); rawRelease = null; result.release(); result = null; pm.release(); pm = null; prepared?.release(); prepared = null; nativeInputRelease?.(); nativeInputRelease = null;
    const sourceDescriptor = sourceResult?.descriptor; sourceResult?.release(); sourceResult = null; spatial?.dispose();
    roles.dispose(); postprocess.dispose(); dlf.dispose(); math.dispose(); featureMath.dispose(); gpu.dispose(); generalGpu.dispose();
    if (budget.total() !== 0) throw Error('Reservations retained');
    const rejected = records.some(r => r.nonfinite || r.maxAbs > 1e-4 || r.thresholdChanged || (r.name.startsWith('masks-') && r.different));
    return {schema: 1, status: rejected || !decisionExact ? 'rejected' : 'passed-corpus-tolerance-experimental', scope: full ? (fromFile ? 'Generated encoded file through qualified original-byte decoder' : 'Generated RGB8 source') + ' -> native AA preparation -> all descriptors -> complete40-iteration pooled PatchMatch -> DLF -> dedicated union and complete UNet -> computed union decision -> actual ONNX role heads -> native postprocess at4component thresholds. No native activation injection. See fromFile for decoder and source-coordinate coverage; independent zones, more sources/devices and runtime registration remain open.' : 'Complete heads and masks from native prepared RGB and native PatchMatch boundary inputs. DLF/union/UNet/roles/postprocessing are computed. This mode is not a complete browser detector.', records, decision, decisionExact, fromFile, caseName, boundedOrt, cpu, roleRuntimeMeasured, sourceDescriptor, functionalMs: performance.now() - started, functionalStageMs: times, performanceQualification: 'Functional execution under ambient load; no isolated speed claim', peakAccountedBytes: budget.peak, budgetBytes: budget.limit, memoryScope: 'Engine reservations include entire pinned ORT' + (boundedOrt ? '512MiB' : '4GiB') + ' maximum heap and postprocess512MiB maximum, plus conservative staging. Not measured RSS. Native comparator excluded.', pool: pool?.stats ?? null, allReservationsReleased: true};
  } finally { sourceResult?.release(); spatial?.dispose(); rawRelease?.(); result?.release(); pm?.release(); descriptorResult?.release(); pmEngine?.dispose(); prepared?.release(); preparation?.dispose(); nativeInputRelease?.(); roles.dispose(); postprocess.dispose(); dlf.dispose(); math.dispose(); featureMath.dispose(); gpu.dispose(); generalGpu.dispose(); }
}
