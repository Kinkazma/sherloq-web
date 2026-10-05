#include <wasm_simd128.h>
// Pinned browser path: the relaxed SIMD multiply-add is fused on the qualified
// Chromium/ARM64 runtime. The scalar reference binary remains available.
extern "C" float __wrap_fmaf(float a,float b,float c){return wasm_f32x4_extract_lane(wasm_f32x4_relaxed_madd(wasm_f32x4_splat(a),wasm_f32x4_splat(b),wasm_f32x4_splat(c)),0);}
