#pragma once
#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#include <algorithm>
#include <complex>
#include <vector>

// Four independent pixel convolutions share the same filter coefficients.
// Every lane retains the scalar x-major/y-minor accumulation order. There is
// no horizontal reduction, contraction, approximate sqrt or relaxed SIMD.
static inline void dense_zernike_convolve_simd(
 const std::vector<float>& image, int width, int height, int radius,
 const std::vector<std::complex<float>>& filter, float weight,
 std::vector<std::vector<float>>& features, int component) {
 const int diameter=2*radius;
 for(int py=0;py<height;++py){
  const int first_y=std::max(py-radius,0),last_y=std::min(py+radius,height);
  for(int px=0;px<width;){
   if(px>=radius&&px+3+radius<=width){
    v128_t real=wasm_f32x4_splat(0.f),imag=wasm_f32x4_splat(0.f);
    for(int dx=0;dx<diameter;++dx){
     const int x=px-radius+dx;
     for(int y=first_y,dy=y-py+radius;y<last_y;++y,++dy){
      const v128_t pixels=wasm_v128_load(image.data()+size_t(y)*width+x);
      const auto coefficient=filter[dx+dy*diameter];
      real=wasm_f32x4_add(real,wasm_f32x4_mul(pixels,wasm_f32x4_splat(coefficient.real())));
      imag=wasm_f32x4_add(imag,wasm_f32x4_mul(pixels,wasm_f32x4_splat(coefficient.imag())));
     }
    }
    float re[4],im[4];wasm_v128_store(re,real);wasm_v128_store(im,imag);
    for(int lane=0;lane<4;++lane)features[size_t(py)*width+px+lane][component]=std::abs(weight*std::complex<float>(re[lane],im[lane]));
    px+=4;
   }else{
    std::complex<float> sum(0.f,0.f);
    for(int x=std::max(px-radius,0),dx=x-px+radius;x<std::min(px+radius,width);++x,++dx)
     for(int y=first_y,dy=y-py+radius;y<last_y;++y,++dy)
      sum+=image[size_t(y)*width+x]*filter[dx+dy*diameter];
    features[size_t(py)*width+px][component]=std::abs(weight*sum);++px;
   }
  }
 }
}
#endif
