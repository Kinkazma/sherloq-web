#include <wasm_simd128.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cfloat>
#include <initializer_list>
__attribute__((target("simd128"))) static inline v128_t stereoMatrixPair(v128_t source,v128_t previous,float weight){
#pragma clang fp contract(off)
 const v128_t a=wasm_f64x2_promote_low_f32x4(source),b=wasm_f64x2_promote_low_f32x4(previous),sum=wasm_f64x2_add(wasm_f64x2_mul(a,wasm_f64x2_splat(weight)),b),absolute=wasm_f64x2_abs(sum);
 const v128_t midpoint=wasm_i64x2_eq(wasm_v128_and(sum,wasm_i64x2_splat(0x1fffffff)),wasm_i64x2_splat(0x10000000)),underflow=wasm_v128_and(wasm_f64x2_lt(absolute,wasm_f64x2_splat(FLT_MIN)),wasm_f64x2_ne(sum,wasm_f64x2_splat(0))),nonfinite=wasm_v128_not(wasm_f64x2_lt(absolute,wasm_f64x2_splat(INFINITY))),guard=wasm_v128_or(midpoint,wasm_v128_or(underflow,nonfinite));
 v128_t result=wasm_f32x4_demote_f64x2_zero(sum);if(wasm_v128_any_true(guard)){if(wasm_i64x2_extract_lane(guard,0))result=wasm_f32x4_replace_lane(result,0,std::fma(wasm_f32x4_extract_lane(source,0),weight,wasm_f32x4_extract_lane(previous,0)));if(wasm_i64x2_extract_lane(guard,1))result=wasm_f32x4_replace_lane(result,1,std::fma(wasm_f32x4_extract_lane(source,1),weight,wasm_f32x4_extract_lane(previous,1)));}return result;
}
__attribute__((target("simd128"))) static inline v128_t stereoMatrixFour(v128_t source,v128_t previous,float weight){const v128_t low=stereoMatrixPair(source,previous,weight),high=stereoMatrixPair(wasm_i32x4_shuffle(source,source,2,3,2,3),wasm_i32x4_shuffle(previous,previous,2,3,2,3),weight);return wasm_i32x4_shuffle(low,high,0,1,4,5);}

__attribute__((target("simd128"),noinline)) static void stereoMatrixVertical(float*dst,const float* const*rows,const float*kernel,int count,int radius){
 int x=0;for(;x<=count-4;x+=4){v128_t sum=wasm_f32x4_mul(wasm_v128_load(rows[radius]+x),wasm_f32x4_splat(kernel[0]));for(int i=1;i<=radius;i++){const v128_t pair=wasm_f32x4_add(wasm_v128_load(rows[radius+i]+x),wasm_v128_load(rows[radius-i]+x));sum=stereoMatrixFour(pair,sum,kernel[i]);}wasm_v128_store(dst+x,sum);}for(;x<count;x++){float sum=rows[radius][x]*kernel[0];for(int i=1;i<=radius;i++)sum=std::fma(rows[radius+i][x]+rows[radius-i][x],kernel[i],sum);dst[x]=sum;}
}
__attribute__((target("simd128"),noinline)) static void stereoMatrixHorizontal(const float*src,float*dst,const float*kernel,int count,int radius){
 int x=0;for(;x<=count-4;x+=4){v128_t sum=wasm_f32x4_mul(wasm_v128_load(src+x),wasm_f32x4_splat(kernel[0]));for(int i=1;i<=radius;i++){const v128_t pair=wasm_f32x4_add(wasm_v128_load(src+x-i*5),wasm_v128_load(src+x+i*5));sum=stereoMatrixFour(pair,sum,kernel[i]);}wasm_v128_store(dst+x,sum);}for(;x<count;x++){float sum=src[x]*kernel[0];for(int i=1;i<=radius;i++)sum=std::fma(src[x-i*5]+src[x+i*5],kernel[i],sum);dst[x]=sum;}
}
