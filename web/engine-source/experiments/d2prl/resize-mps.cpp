// Named MPS arithmetic mode; the existing native CPU resize stays unchanged.
// PyTorch2.8 MPS UpSample.metal, linear_interp and upsample_bilinear2d:
// x*v1 + (1-x)*v0, horizontal followed by vertical interpolation.
// The right product is fused; the left product rounds separately to float32.
// PyTorch BSD notice is retained in PYTORCH-LICENSE.txt.
#include <cmath>
#include <algorithm>
extern "C" int d2prl_mps_resize(const float* input,int channels,int ih,int iw,int oh,int ow,float* output){
 if(!input||!output||channels<1||channels>512||ih<2||iw<2||oh<2||ow<2||ih>2404||iw>2404||oh>2404||ow>2404)return 0;
 const float sx=float(iw-1)/float(ow-1),sy=float(ih-1)/float(oh-1);const int in_n=ih*iw,out_n=oh*ow;
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++){
  const float fy=sy*y;const int y0=std::min(int(std::floor(fy)),ih-1),y1=std::min(y0+1,ih-1);const float ly=std::clamp(fy-y0,0.f,1.f),hy=1.f-ly;
  for(int x=0;x<ow;x++){
   const float fx=sx*x;const int x0=std::min(int(std::floor(fx)),iw-1),x1=std::min(x0+1,iw-1);const float lx=std::clamp(fx-x0,0.f,1.f),hx=1.f-lx;const float* a=input+c*in_n;
   const float top=std::fma(a[y0*iw+x1],lx,a[y0*iw+x0]*hx),bottom=std::fma(a[y1*iw+x1],lx,a[y1*iw+x0]*hx);output[c*out_n+y*ow+x]=std::fma(bottom,ly,top*hy);
  }
 }
 return 1;
}
