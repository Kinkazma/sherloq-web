import create from './ort-wasm-simd-threaded.mjs';
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){const pages=globalThis.__m3MaximumWasmPages;if(!Number.isInteger(pages)||pages<256||pages>32768)throw Error('Unadmitted ORT heap');instance=await create(config);return instance;}
