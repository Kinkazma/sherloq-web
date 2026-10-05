#define POCKETFFT_NO_MULTITHREADING
#define POCKETFFT_CACHE_SIZE 0
#include <cstddef>
#include "noisesniffer-twiddles.h"
#include "../.build/noisesniffer-pocketfft.h"
extern "C" int sherloq_noisesniffer_dct(double* data,size_t count,size_t w){
 try{
  const noisesniffer_fft::shape_t shape={count,w,w};
  const noisesniffer_fft::stride_t stride={ptrdiff_t(w*w*8),ptrdiff_t(w*8),8};
  const double factor=1./std::sqrt(double(2*w));
  noisesniffer_fft::dct(shape,stride,stride,{1},2,data,data,factor,true);
  noisesniffer_fft::dct(shape,stride,stride,{2},2,data,data,factor,true);
  return 1;
 }catch(...){return 0;}
}
