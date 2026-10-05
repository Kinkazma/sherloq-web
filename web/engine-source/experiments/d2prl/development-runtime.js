// Local study wiring only. No .build URL is part of a released engine contract.
export async function developmentRuntime() {
  const absolute = path => new URL(path, location.href).href;
  const {default: preparationFactory} = await import('/.build/d2prl-prepare/prepare.js'), {default: featureMathFactory} = await import('/.build/d2prl-feature-math/feature-math.js'), {default: neuralMathFactory} = await import('/.build/d2prl-neural-math/neural-math.js'), {default: dlfFactory} = await import('/.build/d2prl-dlf/dlf.js');
  const rolesRuntime = await (await fetch('/.build/d2prl-roles-runtime/runtime.json')).json();
  return {preparationFactory, featureMathFactory, neuralMathFactory, dlfFactory, rolesRuntime, convolutionCpuUrl: absolute('/.build/d2prl-convolution-cpu/convolution.js'), evaluatorUrl: absolute('/.build/d2prl-evaluator-tiled/evaluator-tiled.js'), ortUrl: absolute('/.build/ort130/package/dist/ort.wasm.min.mjs'), ortWasmPath: absolute('/.build/ort130/package/dist/'), rolesFactoryUrl: absolute('/.build/d2prl-roles-runtime/factory.mjs')};
}
