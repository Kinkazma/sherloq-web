#pragma once
#include <wasm_simd128.h>
#include <math.h>
#include <stdint.h>

// A binary32 product has at most 48 significant bits, so binary64 computes
// that product exactly. Double rounding of product+addend can affect a final
// normal binary32 result only when the binary64 sum is exactly a binary32
// midpoint. Replay those cases, subnormal-result ranges and nonfinite ranges
// with the unchanged software fmaf. Values above MAX_FLOAT are replayed too,
// so a kept-f64 accumulator holds true float32 Infinity after overflow.
// No relaxed SIMD instruction is used.
static inline int dense_fma32_needs_replay(v128_t sum){
 const v128_t bits=wasm_v128_and(sum,wasm_i64x2_splat(INT64_C(0x7fffffffffffffff)));
 const v128_t midpoint=wasm_i64x2_eq(wasm_v128_and(bits,wasm_i64x2_splat(INT64_C(0x1fffffff))),wasm_i64x2_splat(INT64_C(0x10000000)));
 const v128_t small=wasm_v128_and(wasm_i64x2_gt(bits,wasm_i64x2_splat(0)),wasm_i64x2_gt(wasm_i64x2_splat(INT64_C(0x3810000000000000)),bits));
 const v128_t big=wasm_i64x2_gt(bits,wasm_i64x2_splat(INT64_C(0x47efffffe0000000)));
 return wasm_v128_any_true(wasm_v128_or(midpoint,wasm_v128_or(small,big)));
}
static inline v128_t dense_exact_fma32x4(v128_t a,v128_t b,v128_t c){
 const v128_t ah=wasm_i32x4_shuffle(a,a,2,3,2,3),bh=wasm_i32x4_shuffle(b,b,2,3,2,3),ch=wasm_i32x4_shuffle(c,c,2,3,2,3);
 const v128_t lo=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(a),wasm_f64x2_promote_low_f32x4(b)),wasm_f64x2_promote_low_f32x4(c));
 const v128_t hi=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(ah),wasm_f64x2_promote_low_f32x4(bh)),wasm_f64x2_promote_low_f32x4(ch));
 if(dense_fma32_needs_replay(lo)||dense_fma32_needs_replay(hi)){
  return wasm_f32x4_make(fmaf(wasm_f32x4_extract_lane(a,0),wasm_f32x4_extract_lane(b,0),wasm_f32x4_extract_lane(c,0)),
                        fmaf(wasm_f32x4_extract_lane(a,1),wasm_f32x4_extract_lane(b,1),wasm_f32x4_extract_lane(c,1)),
                        fmaf(wasm_f32x4_extract_lane(a,2),wasm_f32x4_extract_lane(b,2),wasm_f32x4_extract_lane(c,2)),
                        fmaf(wasm_f32x4_extract_lane(a,3),wasm_f32x4_extract_lane(b,3),wasm_f32x4_extract_lane(c,3)));
 }
 const v128_t l=wasm_f32x4_demote_f64x2_zero(lo),h=wasm_f32x4_demote_f64x2_zero(hi);
 return wasm_i32x4_shuffle(l,h,0,1,4,5);
}
typedef struct {v128_t lo,hi;} DenseFma32Accumulator;
static inline DenseFma32Accumulator dense_exact_fma32_accumulate4(v128_t a,v128_t b,DenseFma32Accumulator c){
 const v128_t ah=wasm_i32x4_shuffle(a,a,2,3,2,3),bh=wasm_i32x4_shuffle(b,b,2,3,2,3);
 const v128_t lo=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(a),wasm_f64x2_promote_low_f32x4(b)),c.lo);
 const v128_t hi=wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(ah),wasm_f64x2_promote_low_f32x4(bh)),c.hi);
 DenseFma32Accumulator out;
 if(dense_fma32_needs_replay(lo)||dense_fma32_needs_replay(hi)){
  out.lo=wasm_f64x2_make((double)fmaf(wasm_f32x4_extract_lane(a,0),wasm_f32x4_extract_lane(b,0),(float)wasm_f64x2_extract_lane(c.lo,0)),(double)fmaf(wasm_f32x4_extract_lane(a,1),wasm_f32x4_extract_lane(b,1),(float)wasm_f64x2_extract_lane(c.lo,1)));
  out.hi=wasm_f64x2_make((double)fmaf(wasm_f32x4_extract_lane(a,2),wasm_f32x4_extract_lane(b,2),(float)wasm_f64x2_extract_lane(c.hi,0)),(double)fmaf(wasm_f32x4_extract_lane(a,3),wasm_f32x4_extract_lane(b,3),(float)wasm_f64x2_extract_lane(c.hi,1)));
 }else{
  // Midpoints were replayed above. Round to 24 significant bits while keeping
  // the binary64 representation, avoiding demote/promote in each K step.
  const v128_t half=wasm_i64x2_splat(INT64_C(0x10000000)),mask=wasm_i64x2_splat(INT64_C(-0x20000000));
  out.lo=wasm_v128_and(wasm_i64x2_add(lo,half),mask);out.hi=wasm_v128_and(wasm_i64x2_add(hi,half),mask);
 }
 return out;
}
