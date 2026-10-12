// Lazy initialization of the runtime used by an actual requested model job.
// Loading this module executes no synthetic inference, warm-up or calibration.
import {D2PRL_ROLE_RUNTIME_256} from '../experiments/d2prl/role-runtime.js';
export async function d2prlRuntime({evaluator = 'exact-simd', rolesMemoryMiB = 256} = {}) {
  if (!['exact-simd', 'pixel-major', 'reference'].includes(evaluator)) throw new TypeError('Explicit qualified D2PRL evaluator required');
  if (![256, 512].includes(rolesMemoryMiB)) throw new TypeError('Explicit qualified D2PRL role memory ceiling required');
  const {default: preparationFactory} = await import('../vendor/d2prl/prepare.js'), {default: featureMathFactory} = await import('../vendor/d2prl/feature-math.js'), {default: neuralMathFactory} = await import('../vendor/d2prl/neural-math.js'), {default: dlfFactory} = await import('../vendor/d2prl/dlf.js');
  const url = file => new URL('../vendor/d2prl/' + file, import.meta.url).href;
  const evaluatorFiles = {'exact-simd': 'table-simd4-exact-subnormal.js', 'pixel-major': 'pixel-major-combined.js', reference: 'evaluator-tiled.js'};
  return {preparationFactory, featureMathFactory, neuralMathFactory, dlfFactory, rolesRuntime: rolesMemoryMiB === 256 ? D2PRL_ROLE_RUNTIME_256 : {runtimeId: 'ort130-wasm-512mib', memoryMaximumBytes: 512 * 1024 ** 2}, convolutionCpuUrl: url('convolution.js'), evaluatorUrl: url(evaluatorFiles[evaluator]), evaluatorDescriptorLayout: evaluator === 'reference' ? 'CHW-uint16' : 'HWC-uint16', ortUrl: url('ort.wasm.min.mjs'), ortWasmPath: url(''), rolesFactoryUrl: url(rolesMemoryMiB === 256 ? 'factory-roles256.mjs' : 'factory.mjs'), postprocessUrl: url('postprocess.js'), spatialUrl: url('spatial.js')};
}
