import create from './ort-wasm-simd-threaded.jsep.mjs';
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await create(config);return instance;}
