import "../../runtime-context.js?v=0.30.0";
import {d2prlInputSide} from '../experiments/d2prl/input-side.js';
// Lazy initialization of the runtime used by an actual requested model job.
// Loading this module executes no synthetic inference, warm-up or calibration.
import {D2PRL_ROLE_RUNTIME_256} from '../experiments/d2prl/role-runtime.js';
export async function d2prlRuntime({evaluator = 'exact-simd', rolesMemoryMiB = 256,inputSide=448,arithmetic='cpu'} = {}) {
  if (!['exact-simd', 'pixel-major', 'reference'].includes(evaluator)) throw new TypeError('Explicit qualified D2PRL evaluator required');
  if (![256, 512].includes(rolesMemoryMiB)) throw new TypeError('Explicit qualified D2PRL role memory ceiling required');
  inputSide=d2prlInputSide(inputSide);if(!['cpu','mps'].includes(arithmetic))throw new TypeError('Explicit feature arithmetic required');
  const [{default:preparationFactory},{default:cpuFeatureMathFactory},{default:cpuNeuralMathFactory},{default:dlfFactory}]=inputSide===448?await Promise.all([import('../vendor/d2prl/prepare.js'),import('../vendor/d2prl/feature-math.js'),import('../vendor/d2prl/neural-math.js'),import('../vendor/d2prl/dlf.js')]):await Promise.all([import('../vendor/d2prl/dynamic/prepare.js'),import('../vendor/d2prl/dynamic/feature-math.js'),import('../vendor/d2prl/dynamic/neural-math.js'),import('../vendor/d2prl/dynamic/dlf.js')]);
  const featureMathFactory=arithmetic==='mps'?(await import('../vendor/d2prl/mps/feature-math.js')).default:cpuFeatureMathFactory;
  const neuralMathFactory=arithmetic==='mps'?(await import('../vendor/d2prl/mps/neural-math.js')).default:cpuNeuralMathFactory;
  const url = file => new URL('../vendor/d2prl/' + file, import.meta.url).href;
  const evaluatorFiles = {'exact-simd': 'table-simd4-exact-subnormal.js', 'pixel-major': 'pixel-major-combined.js', reference: 'evaluator-tiled.js'};
  return {roles1344LowMemory:inputSide===1344?{rolesRuntime:{runtimeId:'ort130-wasm-1024mib-d2prl-spatial',memoryMaximumBytes:1024**3},rolesFactoryUrl:url('dynamic/factory-roles1024.mjs')}:undefined,preparationFactory, featureMathFactory,featureArithmetic:arithmetic, neuralMathFactory, dlfFactory, rolesRuntime: inputSide===896?{runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*1024**2}:inputSide!==448?{runtimeId:'ort130-wasm-2048mib-d2prl-spatial',memoryMaximumBytes:2*1024**3}:rolesMemoryMiB === 256 ? D2PRL_ROLE_RUNTIME_256 : {runtimeId: 'ort130-wasm-512mib', memoryMaximumBytes: 512 * 1024 ** 2}, convolutionCpuUrl: url('convolution.js'), evaluatorUrl: url(evaluatorFiles[evaluator]), evaluatorDescriptorLayout: evaluator === 'reference' ? 'CHW-uint16' : 'HWC-uint16', ortUrl: url('ort.wasm.min.mjs'), ortWasmPath: url(''), rolesFactoryUrl: inputSide===896?url('factory.mjs'):inputSide!==448?url('dynamic/factory-roles2048.mjs'):url(rolesMemoryMiB === 256 ? 'factory-roles256.mjs' : 'factory.mjs'), postprocessUrl: url(inputSide===448?'postprocess.js':'dynamic/postprocess.js'), spatialUrl: url(inputSide===448?'spatial.js':'dynamic/spatial.js')};
}
