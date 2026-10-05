import "../../runtime-context.js?v=0.14.5";
// Lazy initialization of the runtime used by an actual requested model job.
// Loading this module executes no synthetic inference, warm-up or calibration.
export async function d2prlRuntime() {
  const {default: preparationFactory} = await import('../vendor/d2prl/prepare.js'), {default: featureMathFactory} = await import('../vendor/d2prl/feature-math.js'), {default: neuralMathFactory} = await import('../vendor/d2prl/neural-math.js'), {default: dlfFactory} = await import('../vendor/d2prl/dlf.js');
  const url = file => new URL('../vendor/d2prl/' + file, import.meta.url).href;
  return {preparationFactory, featureMathFactory, neuralMathFactory, dlfFactory, rolesRuntime: {runtimeId: 'ort130-wasm-512mib', memoryMaximumBytes: 512 * 1024 ** 2}, convolutionCpuUrl: url('convolution.js'), evaluatorUrl: url('evaluator-tiled.js'), ortUrl: url('ort.wasm.min.mjs'), ortWasmPath: url(''), rolesFactoryUrl: url('factory.mjs'), postprocessUrl: url('postprocess.js'), spatialUrl: url('spatial.js')};
}
