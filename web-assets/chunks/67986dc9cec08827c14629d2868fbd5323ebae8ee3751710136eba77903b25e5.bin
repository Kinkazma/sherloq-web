// Actual fixed D2PRL pipeline. No reference tensor or comparator is accepted.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
import {createConvolutionCpu} from './convolution-cpu.js';
import {createConvolutionGeneralGpu} from './convolution-general-gpu.js';
import {createPreparation} from './prepare.js';
import {createFeatureMath} from './feature-math.js';
import {createNeuralMath} from './neural-math.js';
import {createDlf} from './dlf.js';
import {createDescriptors} from './descriptors.js';
import {createPatchMatch} from './patchmatch.js';
import {createEvaluatorPool} from './evaluator-pool.js';
import {createUnionHead} from './union-head.js';
import {createUnetGraph} from './unet-graph.js';
import {createHeads} from './heads.js';
import {createBoundedRoles} from './roles-bounded.js';

export async function readVerifiedModelAsset(url, spec, {signal} = {}) {
  requireValue(Number.isSafeInteger(spec.bytes) && spec.bytes > 0 && spec.bytes <= 256 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(spec.sha256), 'Pinned model asset identity');
  try {
  checkAbort(signal); const response = await fetch(url, {signal});
  if (!response.ok || !response.body) throw new EngineError('MODEL_UNAVAILABLE', 'Model asset unavailable');
  const reader = response.body.getReader(), bytes = new Uint8Array(spec.bytes); let at = 0;
  try {
    while (true) {const {done, value} = await reader.read(); checkAbort(signal); if (done) break; if (at + value.length > bytes.length) throw new EngineError('MODEL_IDENTITY', 'Model asset exceeds pinned size'); bytes.set(value, at); at += value.length;}
  } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); checkAbort(signal);
  if (at !== spec.bytes || digest !== spec.sha256) throw new EngineError('MODEL_IDENTITY', 'Model asset size or digest differs'); return bytes;
  } catch (error) {checkAbort(signal); throw error;}
}

export async function createD2prlModel({budget, model, assetBaseUrl, runtime, backend, maxWorkers}) {
  requireValue(model?.schema === 1 && model.side === 448 && model.iterations === 40 && model.seed === 22 && model.referenceThreads === 8 && model.checkpointSha256 === '2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36', 'Pinned native D2PRL model');
  requireValue(['cpu', 'gpu'].includes(backend) && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 32, 'Explicit backend and useful worker ceiling');
  const disposables = [], own = value => (disposables.push(value), value); let busy = false, disposed = false;
  const read = async (spec, {signal} = {}) => {
    requireValue(/^assets\/[0-9a-f]{64}\.bin$/.test(spec.file) && model.assets[spec.file]?.sha256 === spec.sha256 && model.assets[spec.file]?.bytes === spec.bytes, 'Manifest-listed parameter required');
    const bytes = await readVerifiedModelAsset(new URL(spec.file, assetBaseUrl).href, spec, {signal});
    requireValue(['float32', 'int64'].includes(spec.dtype), 'Parameter dtype');
    return spec.dtype === 'int64' ? new BigInt64Array(bytes.buffer) : new Float32Array(bytes.buffer);
  };
  const featureParameters = async (specs, signal) => {
    const bytes = specs.reduce((n, s) => n + s.bytes, 0), release = budget.reserve(bytes); let transient;
    try {transient = budget.reserve(bytes * 3); const values = []; for (const spec of specs) values.push(await read(spec, {signal})); return {values, release};}
    catch (error) {release(); throw error;} finally {transient?.();}
  };
  try {
    const convolution = own(backend === 'cpu' ? createConvolutionCpu({budget, moduleUrl: runtime.convolutionCpuUrl, maxWorkers}) : await createConvolutionGeneralGpu({budget}));
    const preparation = own(await createPreparation(runtime.preparationFactory, {budget})), featureMath = own(await createFeatureMath(runtime.featureMathFactory, {budget})), math = own(await createNeuralMath(runtime.neuralMathFactory, {budget})), dlf = own(await createDlf(runtime.dlfFactory, {budget}));
    const roles = own(createBoundedRoles({budget, model: model.roles, modelUrl: new URL(model.roles.modelFile, assetBaseUrl).href, ortUrl: runtime.ortUrl, wasmPath: runtime.ortWasmPath, runtime: runtime.rolesRuntime, runtimeFactoryUrl: runtime.rolesFactoryUrl}));
    const descriptors = createDescriptors({convolution, math: featureMath, budget,
      loadConvolution: async (name, {signal}) => {
        const row = model.features.find(r => r.name === name); requireValue(row, 'Feature layer'); const parameters = await featureParameters([row.weights, row.bias], signal);
        return {weights: parameters.values[0], bias: parameters.values[1], release: parameters.release, channels: row.inputShape[1], height: row.inputShape[2], width: row.inputShape[3], outChannels: row.weights.shape[0], kernel: row.weights.shape[2], padding: row.padding, referenceLayout: model.layouts.features.records.find(r => r.name === name)};
      },
      loadBatchNorm: async (name, {signal}) => {const row = model.batchnorm.find(r => r.name === name); requireValue(row, 'Feature BN'); const parameters = await featureParameters([row.params], signal); return {params: parameters.values[0], epsilon: row.epsilon, release: parameters.release};}
    });
    const unionHead = createUnionHead({dlf, convolution, featureMath, neuralMath: math, budget, layers: model.union, batchnorm: model.unionBatchnorm, dlfWeights: model.dlfWeights, layouts: model.layouts.union, loadParameter: (_kind, spec, options) => read(spec, options)});
    const unet = createUnetGraph({graph: model.graph, convolution, math, budget, layouts: model.layouts.unet, pointLayouts: model.layouts.point, tailProbe: true, tailMode: 'block1024', loadParameter: (_name, spec, options) => read(spec, options)});
    const heads = createHeads({unionHead, unet, math, roles, budget});
    return {
      modelId: model.modelId, backend,
      async run({rgb, readRows, width, height, backend: requestedBackend = backend}, {signal, onProgress} = {}) {
        if (busy) throw new EngineError('BUSY', 'D2PRL model busy'); requireValue(!disposed && requestedBackend === backend, 'Explicit initialized model backend'); checkAbort(signal); busy = true;
        let prepared, features, pm, pmEngine, result, rawRelease, complete = false;
        const progress = event => {checkAbort(signal); onProgress?.(event); checkAbort(signal);};
        try {
          progress({phase: 'preparation', completed: 0, total: 1}); prepared = readRows ? await preparation.runRows({readRows, width, height}, {signal, onProgress:progress}) : await preparation.run({rgb, width, height}, {signal}); progress({phase: 'preparation', completed: 1, total: 1});
          let stage = 0; features = await descriptors.run(prepared.data, {signal, onStage: name => progress({phase: 'descriptors', message: name, completed: ++stage, total: 45})}); convolution.releaseIdleWorkers?.();
          pmEngine = await createPatchMatch(null, {budget, evaluatorFactory: async (_, {budget}) => createEvaluatorPool(runtime.evaluatorUrl, {budget, maxWorkers})});
          pm = await pmEngine.run({zmFeatures: features.zm, cnnFeatures: features.cnn, side: 448, iterations: 40, randomState: model.randomState, referenceThreads: 8}, {signal, onProgress: event => progress({...event, phase: 'patchmatch'})}); features.release(); features = null; pmEngine.dispose(); pmEngine = null;
          result = await heads.run({rgb: prepared.data, patchmatch: pm}, {signal, onStage: name => progress({phase: 'heads', message: name}), onUnetNode: ({index, total}) => progress({phase: 'unet', completed: index + 1, total})});
          rawRelease = budget.reserve(3 * 448 ** 2 * 4); const raw = new Float32Array(3 * 448 ** 2); raw.set(result.union); raw.set(result.target, 448 ** 2); raw.set(result.source, 2 * 448 ** 2); checkAbort(signal); complete = true;
          return {raw, decision: {...result.decision}, execution: {convolution: backend === 'gpu' ? 'webgpu' : 'wasm-simd-workers', patchmatch: 'wasm-workers', roles: 'onnxruntime-wasm', workerCeiling: maxWorkers, referenceThreads: 8, roleRuntime: result.roleRuntime}, modelId: model.modelId, backend, release: rawRelease};
        } finally {result?.release(); pm?.release(); pmEngine?.dispose(); features?.release(); prepared?.release(); convolution.releaseIdleWorkers?.(); if (!complete) rawRelease?.(); busy = false;}
      },
      dispose() {requireValue(!busy, 'D2PRL model busy'); if (disposed) return; disposed = true; for (const value of disposables.reverse()) value.dispose();}
    };
  } catch (error) {for (const value of disposables.reverse()) value.dispose(); throw error;}
}
