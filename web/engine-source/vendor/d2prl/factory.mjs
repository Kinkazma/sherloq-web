import factory from './ort-wasm-simd-threaded.mjs';
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await factory(config);return instance;}
