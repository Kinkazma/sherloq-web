// D2PRL float32 contiguous NCHW bilinear interpolation, align_corners=True.
// Reference: PyTorch2.8 UpSample.h / UpSampleKernel.cpp; BSD notice retained.
// This first candidate deliberately covers the generic large-output path only.
#include <cmath>
#include <algorithm>
extern "C" int d2prl_resize_large(const float* input,int channels,int ih,int iw,int oh,int ow,float* output){
 if(!input||!output||channels<1||channels>512||ih<2||iw<2||oh<2||ow<2||ih>1024||iw>1024||oh>1024||ow>1024||oh+ow<=128)return 0;
 const float sx=float(iw-1)/float(ow-1),sy=float(ih-1)/float(oh-1);const int in_n=ih*iw,out_n=oh*ow;
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++){
  const float fy=sy*y;const int y0=std::min(int(std::floor(fy)),ih-1),y1=std::min(y0+1,ih-1);const float ly=std::clamp(fy-y0,0.f,1.f),hy=1.f-ly;
  for(int x=0;x<ow;x++){
   const float fx=sx*x;const int x0=std::min(int(std::floor(fx)),iw-1),x1=std::min(x0+1,iw-1);const float lx=std::clamp(fx-x0,0.f,1.f),hx=1.f-lx;const float* a=input+c*in_n;
   const float top=std::fma(a[y0*iw+x0],hx,a[y0*iw+x1]*lx),bottom=std::fma(a[y1*iw+x0],hx,a[y1*iw+x1]*lx);output[c*out_n+y*ow+x]=std::fma(top,hy,bottom*ly);
  }
 }
 return 1;
}
// Static inference BatchNorm parameters and its deliberately unfused affine
// evaluation. Both square root and each intermediate round to float32.
extern "C" int d2prl_batchnorm_parameters(const float* mean,const float* variance,const float* weight,const float* bias,int channels,float epsilon,float* alpha,float* beta){
 if(channels<1||channels>2048||!std::isfinite(epsilon)||epsilon<=0)return 0;
 for(int c=0;c<channels;c++){
  if(!std::isfinite(mean[c])||!std::isfinite(variance[c])||variance[c]<0||!std::isfinite(weight[c])||!std::isfinite(bias[c]))return 0;
  const float inv=1.f/std::sqrt(variance[c]+epsilon);alpha[c]=weight[c]*inv;beta[c]=std::fma(-mean[c],alpha[c],bias[c]);
 }return 1;
}
extern "C" int d2prl_affine(const float* input,const float* alpha,const float* beta,int channels,int plane,int relu,float* output){
 if(channels<1||channels>2048||plane<1||plane>1024*1024)return 0;
 for(int c=0;c<channels;c++)for(int i=0;i<plane;i++){const float product=input[c*plane+i]*alpha[c],value=product+beta[c];output[c*plane+i]=relu?std::max(value,0.f):value;}return 1;
}
