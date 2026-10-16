import create from '../../unified-engine/vendor/m3-ort/ort-wasm-simd-threaded.mjs';
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){globalThis.__m3MaximumWasmPages=globalThis.__sherloqNeuralMemoryPages;instance=await create(config);return instance;}
