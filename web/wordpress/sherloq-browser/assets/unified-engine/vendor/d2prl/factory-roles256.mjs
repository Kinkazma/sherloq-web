import factory from './ort-wasm-simd-threaded-roles256.mjs';
export const runtimeId='ort130-wasm-256mib-d2prl';
export const memoryMaximumBytes=268435456;
export const modelIdentity=Object.freeze({bytes:19943135,sha256:'33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b',inputs:Object.freeze(["rgb","x_cor","y_cor","x_cor2","y_cor2","union"]),outputs:Object.freeze(["target","source"])});
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await factory(config);return instance;}
