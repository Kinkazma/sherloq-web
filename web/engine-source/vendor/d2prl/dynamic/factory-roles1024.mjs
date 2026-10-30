import factory from './ort-wasm-simd-threaded-roles1024.mjs';
export const runtimeId='ort130-wasm-1024mib-d2prl-spatial';
export const memoryMaximumBytes=1073741824;
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await factory(config);return instance;}
