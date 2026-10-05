// Composition primitives for the experimental fixed448 UNet executor.
// Existing qualified arithmetic remains included verbatim; new paths require
// their own native corpus and whole-graph qualification.
#include "feature-math.cpp"
#include "mean.cpp"
#include "sigmoid.cpp"
#include "sum.cpp"
extern "C" int d2prl_pointwise(const float* a,const float* b,int channels,int plane,int bc,int bp,int operation,int global_offset,int vector_prefix,float* output){
 if(channels<1||channels>4096||plane<1||plane>448*448||operation<0||operation>3)return 0;
 if(operation&&((bc!=1&&bc!=channels)||(bp!=1&&bp!=plane)))return 0;
 for(int c=0;c<channels;c++)for(int i=0;i<plane;i++){
  const int at=c*plane+i;const float av=a[at],bv=operation?b[(bc==1?0:c)*bp+(bp==1?0:i)]:0.f;
  // Native contiguous vector prefixes use maximum-number semantics for
  // signed zero; scalar tails use std::max (first operand on equal values).
  float maximum=std::max(av,operation==0?0.f:bv);
  if(global_offset+at<vector_prefix&&av==0.f&&(operation==0||bv==0.f))maximum=operation==0||!std::signbit(av)||!std::signbit(bv)?0.f:-0.f;
  output[at]=operation==0?maximum:operation==1?av+bv:operation==2?av*bv:maximum;
 }return 1;
}
extern "C" int d2prl_nearest2(const float* input,int channels,int h,int w,float* output){
 if(channels<1||channels>4096||h<1||w<1||h>224||w>224)return 0;
 const int oh=h*2,ow=w*2;
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++)for(int x=0;x<ow;x++)output[(c*oh+y)*ow+x]=input[(c*h+y/2)*w+x/2];return 1;
}
extern "C" int d2prl_maxpool(const float* input,int channels,int h,int w,int kernel,int stride,int pad,int ceil_mode,float* output){
 if(channels<1||channels>4096||h<1||w<1||h>448||w>448||kernel<1||kernel>3||stride<1||stride>2||pad<0||pad>1)return 0;
 int oh=(h+2*pad-kernel+(ceil_mode?stride-1:0))/stride+1,ow=(w+2*pad-kernel+(ceil_mode?stride-1:0))/stride+1;
 if((oh-1)*stride>=h+pad)oh--;if((ow-1)*stride>=w+pad)ow--;if(oh<1||ow<1)return 0;
 for(int c=0;c<channels;c++)for(int y=0;y<oh;y++)for(int x=0;x<ow;x++){
  float value=-INFINITY;
  for(int ky=0;ky<kernel;ky++)for(int kx=0;kx<kernel;kx++){const int yy=y*stride-pad+ky,xx=x*stride-pad+kx;if(yy>=0&&xx>=0&&yy<h&&xx<w){const float v=input[(c*h+yy)*w+xx];if(v>value||std::isnan(v))value=v;}}
  output[(c*oh+y)*ow+x]=value;
 }return 1;
}
// Explicit exploratory candidate, not yet native-equivalent or user-selectable.
// It permits measuring the full graph while keeping unresolved reductions clear.
extern "C" int d2prl_pointconv4_probe(const float* input,const float* weights,const float* bias,int ci,int co,float* output){
 if(ci<4||ci>4096||ci%4||co<1||co>4096)return 0;
 for(int c=0;c<co;c++){float s[4]={};for(int i=0;i<ci;i++)s[i%4]=std::fma(input[i],weights[c*ci+i],s[i%4]);output[c]=((s[0]+s[1])+(s[2]+s[3]))+bias[c];}return 1;
}
// Two arithmetic families identified on independent generated inputs and then
// qualified on the108 native point-convolution boundaries. The whole model is
// still experimental. Mode2 swaps adjacent K16 blocks for output channels 0mod8;
// channel_start preserves this reference order across cooperative work chunks.
extern "C" int d2prl_pointconv_probe(const float* input,const float* weights,const float* bias,int ci,int co,int mode,int channel_start,float* output){
 if(ci<16||ci>4096||ci%16||co<1||co>4096||mode<1||mode>2||channel_start<0||(mode==2&&ci%32))return 0;
 for(int c=0;c<co;c++){
  float a[16]={};const int lanes=mode==1?4:16;
  for(int i=0;i<ci;i++){const int lane=i%lanes,j=mode==2&&(c+channel_start)%8==0?(i^16):i;if(mode==1&&i>=ci-4){const float product=input[j]*weights[c*ci+j];a[lane]+=product;}else a[lane]=std::fma(input[j],weights[c*ci+j],a[lane]);}
  if(mode==1)output[c]=((a[0]+a[1])+(a[2]+a[3]))+bias[c];
  else{a[0]+=bias[c];for(int count=8;count;count/=2)for(int i=0;i<count;i++)a[i]+=a[i+count];output[c]=a[0];}
 }return 1;
}
