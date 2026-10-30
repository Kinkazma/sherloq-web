import factory from './ort-wasm-simd-threaded-roles2048.mjs';
export const runtimeId='ort130-wasm-2048mib-d2prl-spatial';
export const memoryMaximumBytes=2147483648;
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await factory(config);return instance;}
