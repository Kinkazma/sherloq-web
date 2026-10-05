import factory from './ort-wasm-simd-threaded.asyncify.mjs';
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){const n=globalThis.__sherloqNeuralMemoryPages;if(!Number.isSafeInteger(n)||n<256||n>65536)throw Error('Invalid admitted memory cap');instance=await factory(config);return instance;}
