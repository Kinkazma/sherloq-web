/* Derived from VLFeat dense SIFT / triangular filtering.
Copyright (C) 2007-11, Andrea Vedaldi and Brian Fulkerson
Copyright (C) 2012-13, The VLFeat Team
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the
   distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
#pragma once
#include "dense-norm-fma-simd.h"

// Four independent native descriptors. Their K order, clipping, fast sqrt
// and normalization factors are unchanged. Callers use distinct factor/output
// storage, as in the pinned compact SIFT owner.
static void dense_norm4_range(float* descriptors,int count,float* factors){
 #pragma clang fp contract(off)
 int i=0;
 for(;i+3<count;i+=4){float* d0=descriptors+(size_t)i*128;float* d1=d0+128;float* d2=d1+128;float* d3=d2+128;
  for(int repeat=0;repeat<2;repeat++){
   DenseFma32Accumulator sum={wasm_f64x2_splat(0),wasm_f64x2_splat(0)};
   for(int k=0;k<128;k++){v128_t d=wasm_f32x4_make(d0[k],d1[k],d2[k],d3[k]);sum=dense_exact_fma32_accumulate4(d,d,sum);}
   float n0=vl_fast_sqrt_f((float)wasm_f64x2_extract_lane(sum.lo,0))+VL_EPSILON_F;
   float n1=vl_fast_sqrt_f((float)wasm_f64x2_extract_lane(sum.lo,1))+VL_EPSILON_F;
   float n2=vl_fast_sqrt_f((float)wasm_f64x2_extract_lane(sum.hi,0))+VL_EPSILON_F;
   float n3=vl_fast_sqrt_f((float)wasm_f64x2_extract_lane(sum.hi,1))+VL_EPSILON_F;
   if(factors){factors[(size_t)i*3+repeat]=n0;factors[(size_t)(i+1)*3+repeat]=n1;factors[(size_t)(i+2)*3+repeat]=n2;factors[(size_t)(i+3)*3+repeat]=n3;}
   for(int k=0;k<128;k++){d0[k]/=n0;d1[k]/=n1;d2[k]/=n2;d3[k]/=n3;}
   if(repeat==0)for(int k=0;k<128;k++){if(d0[k]>.2f)d0[k]=.2f;if(d1[k]>.2f)d1[k]=.2f;if(d2[k]>.2f)d2[k]=.2f;if(d3[k]>.2f)d3[k]=.2f;}
  }
 }
 for(;i<count;i++){float* d=descriptors+(size_t)i*128;
  for(int repeat=0;repeat<2;repeat++){float norm=0;for(int k=0;k<128;k++)norm=fmaf(d[k],d[k],norm);norm=vl_fast_sqrt_f(norm)+VL_EPSILON_F;if(factors)factors[(size_t)i*3+repeat]=norm;for(int k=0;k<128;k++)d[k]/=norm;if(repeat==0)for(int k=0;k<128;k++)if(d[k]>.2f)d[k]=.2f;}
 }
}
