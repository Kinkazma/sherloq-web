// Exact bulk variant of stereoFastFmaValue for nonnegative grayscale Gaussian
// operands. Their magnitudes are bounded [0,510], so no underflow/NaN branch
// is needed. Double-rounding midpoints still use the scalar reference FMA.
#include <wasm_simd128.h>
static inline v128_t stereoGaussianPair(v128_t source,v128_t previous,float weight){
 v128_t a=wasm_f64x2_promote_low_f32x4(source),b=wasm_f64x2_promote_low_f32x4(previous);
 v128_t sum=wasm_f64x2_add(wasm_f64x2_mul(a,wasm_f64x2_splat(weight)),b);
 v128_t midpoint=wasm_i64x2_eq(wasm_v128_and(sum,wasm_i64x2_splat(0x1fffffff)),wasm_i64x2_splat(0x10000000));
 v128_t result=wasm_f32x4_demote_f64x2_zero(sum);
 if(wasm_v128_any_true(midpoint)){
  if(wasm_i64x2_extract_lane(midpoint,0))result=wasm_f32x4_replace_lane(result,0,std::fma(wasm_f32x4_extract_lane(source,0),weight,wasm_f32x4_extract_lane(previous,0)));
  if(wasm_i64x2_extract_lane(midpoint,1))result=wasm_f32x4_replace_lane(result,1,std::fma(wasm_f32x4_extract_lane(source,1),weight,wasm_f32x4_extract_lane(previous,1)));
 }return result;
}
template<bool Pair>static void stereoGaussianAccumulate(float*dst,const float*a,const float*b,float weight,int count){
 int i=0;if(stereoFastArithmetic)for(;i<=count-4;i+=4){v128_t source=wasm_v128_load(a+i),previous=wasm_v128_load(dst+i);if(Pair)source=wasm_f32x4_add(source,wasm_v128_load(b+i));v128_t low=stereoGaussianPair(source,previous,weight),high=stereoGaussianPair(wasm_i32x4_shuffle(source,source,2,3,2,3),wasm_i32x4_shuffle(previous,previous,2,3,2,3),weight);wasm_v128_store(dst+i,wasm_i32x4_shuffle(low,high,0,1,4,5));}
 for(;i<count;i++)dst[i]=sherloq_stereo_fma(Pair?a[i]+b[i]:a[i],weight,dst[i]);
}
