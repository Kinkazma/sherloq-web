// Controlled Worker runtime, no WASM allocation or inference runtime import.
if(globalThis.__sherloqNeuralMemoryPages!==32768)throw Error('Native14 full2GiB heap contract was lost');
export const heapBytes=()=>16*1024**2;
