// Pinned SciPy pocketfft real convolution, with one internal thread.
#define POCKETFFT_NO_MULTITHREADING
#define POCKETFFT_CACHE_SIZE 0
#ifdef __wasm__
#include "prnu-twiddles.h"
#endif
#include "../.build/prnu-pocketfft.h"
extern "C" int sherloq_prnu_correlate_fft(const double* input,double* output,int width,int height){
 try{
  const size_t w=pocketfft::detail::util::good_size_real(width+2),h=pocketfft::detail::util::good_size_real(height+2),cw=w/2+1;
  const pocketfft::shape_t shape={h,w},axes={0,1};
  const pocketfft::stride_t realStride={ptrdiff_t(w*8),8},complexStride={ptrdiff_t(cw*16),16};
  std::vector<double> data(h*w,0),kernel(h*w,0),inverse(h*w);
  std::vector<std::complex<double>> a(h*cw),b(h*cw);
  for(int y=0;y<height;y++)std::copy_n(input+size_t(y)*width,width,data.data()+size_t(y)*w);
  for(int y=0;y<3;y++)for(int x=0;x<3;x++)kernel[size_t(y)*w+x]=1;
  pocketfft::r2c(shape,realStride,complexStride,axes,true,data.data(),a.data(),1.);
  pocketfft::r2c(shape,realStride,complexStride,axes,true,kernel.data(),b.data(),1.);
  {
   // NumPy's native SIMD complex multiply contracts the first product.
   for(size_t i=0;i<a.size();i++){const auto x=a[i],y=b[i];a[i]={x.real()*y.real()-x.imag()*y.imag(),x.real()*y.imag()+x.imag()*y.real()};}
  }
  pocketfft::c2r(shape,complexStride,realStride,axes,false,a.data(),inverse.data(),1./double(w*h));
  for(int y=0;y<height;y++)std::copy_n(inverse.data()+size_t(y+1)*w+1,width,output+size_t(y)*width);
  return 1;
 }catch(...){return 0;}
}
