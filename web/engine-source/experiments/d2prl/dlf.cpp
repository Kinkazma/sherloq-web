// Portable D2PRL deformation errors. Ordered IEEE float32 FMA reproduces the
// pinned native single-output convolution, without loading a native BLAS.
#include <cmath>
#include <cstdint>
#include <cstring>
#include "reference-exp.h"
// Positive counterpart of the same pinned SLEEF xexpf. Attribution/license in
// reference-exp.h and SLEEF-LICENSE.txt. Existing softmax domain is unchanged.
static float exp_signed(float d){
 if(d<=0)return reference_exp(d);if(d>88.72283935546875f)return INFINITY;if(!std::isfinite(d))return NAN;
 int q=int(std::nearbyint(d*1.442695040888963407359924681001892137426645954152985934135449406931f));float s=std::fma(float(q),-0.693145751953125f,d);s=std::fma(float(q),-1.428606765330187045e-06f,s);
 float u=0.000198527617612853646278381f;u=std::fma(u,s,0.00139304355252534151077271f);u=std::fma(u,s,0.00833336077630519866943359f);u=std::fma(u,s,0.0416664853692054748535156f);u=std::fma(u,s,0.166666671633720397949219f);u=std::fma(u,s,0.5f);u=1.f+std::fma(s*s,u,s);
 const int first=q>>1;uint32_t a=uint32_t(first+127)<<23,b=uint32_t(q-first+127)<<23;float fa,fb;std::memcpy(&fa,&a,4);std::memcpy(&fb,&b,4);return(u*fa)*fb;
}
static float score(float error){const float shifted=error+1e-10f,reciprocal=1.f/shifted,denominator=1.f+exp_signed(-reciprocal),sigmoid=1.f/denominator;return 2.f*sigmoid-1.f;}
extern "C" void d2prl_dlf_scores(const float* input,int n,float* output){for(int i=0;i<n;i++)output[i]=score(input[i]);}
extern "C" int d2prl_dlf_range(const float* x,const float* y,const float* weights,int side,int kernel,int begin,int end,float* errors,float* scores){
 if(!x||!y||!weights||!errors||!scores||side!=448||(kernel!=7&&kernel!=9&&kernel!=11)||begin<0||end<begin||end>side*side)return 0;
 const int count=kernel*kernel,radius=kernel/2;
 for(int i=begin;i<end;i++){
  const int px=i%side,py=i/side;float a[4]={},b[4]={};int k=0;
  for(int ky=0;ky<kernel;ky++)for(int kx=0;kx<kernel;kx++,k++){
   const int xx=px+kx-radius,yy=py+ky-radius;const bool inside=xx>=0&&xx<side&&yy>=0&&yy<side;const float vx=inside?x[yy*side+xx]:0.f,vy=inside?y[yy*side+xx]:0.f;
   a[0]=std::fma(vx*vx,weights[k],a[0]);b[0]=std::fma(vy*vy,weights[k],b[0]);
   for(int j=1;j<4;j++){a[j]=std::fma(vx,weights[j*count+k],a[j]);b[j]=std::fma(vy,weights[j*count+k],b[j]);}
  }
  const float xe=a[0]-((a[1]*a[1]+a[2]*a[2])+a[3]*a[3]),ye=b[0]-((b[1]*b[1]+b[2]*b[2])+b[3]*b[3]);errors[i]=xe+ye;scores[i]=score(errors[i]);
 }
 return 1;
}
