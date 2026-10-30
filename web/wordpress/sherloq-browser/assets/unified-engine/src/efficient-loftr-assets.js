import "../../runtime-context.js?v=0.30.0";
// Apache-2.0 upstream ffd4a464; full outdoor weights, actual FP32 model.
// RoPE coefficients are stored separately by axis, without changing values.
export const EFFICIENT_LOFTR_ASSET=Object.freeze({
 bytes:61657027,sha256:'b52b3838bb961767a7f8b8789b8f03af355aa41a2195e501418606304e6dcb42',
 wasmMaximumBytes:2*1024**3,inputNames:['image0','image1','threshold'],
 outputNames:['keypoints0','keypoints1','confidence'],graphOptimizationLevel:'all',
 sourceCommit:'ffd4a4644064354468eb1f0c7a3e732233cb732f',
 checkpointSha256:'0af6291141c736e75e94b7f8aae4399b77c7731b3f08758212b2cfe370188878',license:'Apache-2.0'
});

export function efficientLoFtrRuntimes(){return {
 wasm:{factoryUrl:new URL('./efficient-loftr-runtime-factory.mjs',import.meta.url).href,
  ortUrl:new URL('../vendor/m3-ort/ort.wasm.min.mjs',import.meta.url).href,
  wasmUrl:new URL('../vendor/d2prl/ort-wasm-simd-threaded.wasm',import.meta.url).href},
 webgpu:{factoryUrl:new URL('./efficient-loftr-runtime-gpu-factory.mjs',import.meta.url).href,
  ortUrl:new URL('../vendor/m3-ort/ort.webgpu.min.mjs',import.meta.url).href,
  wasmUrl:new URL('../vendor/m3-ort/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href}
};}
