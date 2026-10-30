// Private exact row-transport experiment for Tesseract2a9c1c49.
// Same four-lane SSE dot reduction as src/arch_sse/dotproductsse.cpp,
// Apache-2.0, Google Inc./Ray Smith. Only independent output rows interleave.
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#if defined(__wasm_simd128__) && defined(FAST_FLOAT)
#include <wasm_simd128.h>
namespace tesseract {
static inline bool TessRowsDisjoint(const void *a,size_t an,const void *b,size_t bn){
 const uintptr_t x=reinterpret_cast<uintptr_t>(a),y=reinterpret_cast<uintptr_t>(b),maximum=std::numeric_limits<uintptr_t>::max();
 if(an>maximum-x||bn>maximum-y)return false;
 return x+an<=y||y+bn<=x;
}
static inline bool TessRows4CanUse(const float *weights,int weight_rows,int stride,const float *u,float *v,int rows,int extent){
 if(DotProduct!=DotProductSSE||rows<4||extent<4||stride<extent||weight_rows<rows)return false;
 const size_t maximum=std::numeric_limits<size_t>::max();
 if(static_cast<size_t>(stride)>maximum/sizeof(float)||static_cast<size_t>(rows)>maximum/sizeof(float)||static_cast<size_t>(extent)>maximum/sizeof(float))return false;
 const size_t row_bytes=static_cast<size_t>(stride)*sizeof(float);
 if(static_cast<size_t>(weight_rows)>maximum/row_bytes)return false;
 const size_t out_bytes=static_cast<size_t>(rows)*sizeof(float);
 return TessRowsDisjoint(v,out_bytes,u,static_cast<size_t>(extent)*sizeof(float))&&TessRowsDisjoint(v,out_bytes,weights,static_cast<size_t>(weight_rows)*row_bytes);
}
static inline float TessRowsHorizontal(v128_t x){
 const float left=wasm_f32x4_extract_lane(x,0)+wasm_f32x4_extract_lane(x,1);
 const float right=wasm_f32x4_extract_lane(x,2)+wasm_f32x4_extract_lane(x,3);
 return left+right;
}
static inline void TessRows4(const float *w0,const float *w1,const float *w2,const float *w3,const float *u,float *v,int n,bool bias){
 v128_t input=wasm_v128_load(u);
 v128_t s0=wasm_f32x4_mul(wasm_v128_load(w0),input),s1=wasm_f32x4_mul(wasm_v128_load(w1),input),s2=wasm_f32x4_mul(wasm_v128_load(w2),input),s3=wasm_f32x4_mul(wasm_v128_load(w3),input);
 int k=4;
 for(;k+3<n;k+=4){
  input=wasm_v128_load(u+k);
  s0=wasm_f32x4_add(s0,wasm_f32x4_mul(wasm_v128_load(w0+k),input));
  s1=wasm_f32x4_add(s1,wasm_f32x4_mul(wasm_v128_load(w1+k),input));
  s2=wasm_f32x4_add(s2,wasm_f32x4_mul(wasm_v128_load(w2+k),input));
  s3=wasm_f32x4_add(s3,wasm_f32x4_mul(wasm_v128_load(w3+k),input));
 }
 float t0=TessRowsHorizontal(s0),t1=TessRowsHorizontal(s1),t2=TessRowsHorizontal(s2),t3=TessRowsHorizontal(s3);
 for(;k<n;k++){const float x=u[k];t0+=w0[k]*x;t1+=w1[k]*x;t2+=w2[k]*x;t3+=w3[k]*x;}
 if(bias){t0+=w0[n];t1+=w1[n];t2+=w2[n];t3+=w3[n];}
 v[0]=t0;v[1]=t1;v[2]=t2;v[3]=t3;
}
}
#endif
