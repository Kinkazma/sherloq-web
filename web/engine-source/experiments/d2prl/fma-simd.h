// IEEE float32 FMA from standard WASM SIMD f64 intermediates. Binary32 products
// are exact in binary64. Double rounding can affect the result only at a
// binary32 midpoint, or outside the normal binary32 range: those lanes use the
// already-qualified scalar fmaf. No relaxed SIMD or precision setting.
#pragma once
#include <wasm_simd128.h>
#include <cmath>
#include <cfloat>
static inline v128_t d2prl_fma4(v128_t a,v128_t b,v128_t c,unsigned* fallbacks=nullptr){
 const v128_t ah=wasm_i32x4_shuffle(a,a,2,3,2,3),bh=wasm_i32x4_shuffle(b,b,2,3,2,3),ch=wasm_i32x4_shuffle(c,c,2,3,2,3);
 const v128_t lo=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(a),wasm_f64x2_promote_low_f32x4(b)),wasm_f64x2_promote_low_f32x4(c));
 const v128_t hi=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(ah),wasm_f64x2_promote_low_f32x4(bh)),wasm_f64x2_promote_low_f32x4(ch));
 const auto exceptional=[](v128_t d){const v128_t abs=wasm_f64x2_abs(d),bits=wasm_v128_and(d,wasm_i64x2_splat((1ll<<29)-1));return wasm_i64x2_bitmask(wasm_v128_or(wasm_i64x2_eq(bits,wasm_i64x2_splat(1ll<<28)),wasm_v128_or(wasm_f64x2_lt(abs,wasm_f64x2_splat(FLT_MIN)),wasm_f64x2_gt(abs,wasm_f64x2_splat(FLT_MAX)))));};
 const unsigned mask=exceptional(lo)|(exceptional(hi)<<2);v128_t out=wasm_i32x4_shuffle(wasm_f32x4_demote_f64x2_zero(lo),wasm_f32x4_demote_f64x2_zero(hi),0,1,4,5);
 if(mask){
  if(fallbacks)*fallbacks+=__builtin_popcount(mask);
  if(mask&1)out=wasm_f32x4_replace_lane(out,0,std::fma(wasm_f32x4_extract_lane(a,0),wasm_f32x4_extract_lane(b,0),wasm_f32x4_extract_lane(c,0)));
  if(mask&2)out=wasm_f32x4_replace_lane(out,1,std::fma(wasm_f32x4_extract_lane(a,1),wasm_f32x4_extract_lane(b,1),wasm_f32x4_extract_lane(c,1)));
  if(mask&4)out=wasm_f32x4_replace_lane(out,2,std::fma(wasm_f32x4_extract_lane(a,2),wasm_f32x4_extract_lane(b,2),wasm_f32x4_extract_lane(c,2)));
  if(mask&8)out=wasm_f32x4_replace_lane(out,3,std::fma(wasm_f32x4_extract_lane(a,3),wasm_f32x4_extract_lane(b,3),wasm_f32x4_extract_lane(c,3)));
 }
 return out;
}
