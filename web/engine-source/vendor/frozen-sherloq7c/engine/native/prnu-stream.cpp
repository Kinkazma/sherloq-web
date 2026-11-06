// Complete axes use the same pinned pocketfft seeds, SIMD lanes and FMA as
// the established whole-image PRNU convolution. No local tile convolution.
#include "prnu-fft.cpp"
static std::vector<double> prnuStreamResult;
extern "C" {
const double* prnu_stream_data(){return prnuStreamResult.data();}
size_t prnu_stream_size(){return prnuStreamResult.size();}
void prnu_stream_release(){std::vector<double>().swap(prnuStreamResult);}
int prnu_stream_axis(const double* input,int length,int lines,int mode,double factor){
 try {
  if(length<1||lines<1||mode<0||mode>3)return 0;
  const size_t n=length,b=lines,c=n/2+1;const pocketfft::shape_t shape={b,n};
  const pocketfft::stride_t real={ptrdiff_t(n*8),8},complex={ptrdiff_t(n*16),16},packed={ptrdiff_t(c*16),16};
  prnuStreamResult.resize(b*(mode==0?c*2:mode==3?n:n*2));
  if(mode==0)pocketfft::r2c(shape,real,packed,size_t(1),true,input,reinterpret_cast<std::complex<double>*>(prnuStreamResult.data()),factor);
  else if(mode==3)pocketfft::c2r(shape,packed,real,size_t(1),false,reinterpret_cast<const std::complex<double>*>(input),prnuStreamResult.data(),factor);
  else pocketfft::c2c(shape,complex,complex,{1},mode==1,reinterpret_cast<const std::complex<double>*>(input),reinterpret_cast<std::complex<double>*>(prnuStreamResult.data()),factor);
  return 1;
 }catch(...){return 0;}
}
int prnu_stream_multiply(const double* a,const double* b,int count){
 try {prnuStreamResult.resize(size_t(count)*2);for(int i=0;i<count;i++){const int j=i*2;prnuStreamResult[j]=a[j]*b[j]-a[j+1]*b[j+1];prnuStreamResult[j+1]=a[j]*b[j+1]+a[j+1]*b[j];}return 1;}catch(...){return 0;}
}
int prnu_stream_full(const double* input,int width,int height){
 try {prnuStreamResult.resize(size_t(width)*height);return sherloq_prnu_correlate_fft(input,prnuStreamResult.data(),width,height);}catch(...){return 0;}
}
}
