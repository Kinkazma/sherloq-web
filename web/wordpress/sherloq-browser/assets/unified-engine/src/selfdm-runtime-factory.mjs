import "../../runtime-context.js?v=0.16.0";
import create, {heapBytes} from '../vendor/m3-ort/factory.mjs';
export {heapBytes};

// NeuralGraphPool and the existing M3 factory name the admitted cap differently.
// Adapt the explicit cap, not a guessed RAM limit; all numerical WASM is reused.
export default async function(config) {
  const pages = globalThis.__sherloqNeuralMemoryPages;
  if (!Number.isInteger(pages) || pages < 256 || pages > 32768) throw Error('Unadmitted SelfDM neural heap');
  globalThis.__m3MaximumWasmPages = pages;
  return create(config);
}
