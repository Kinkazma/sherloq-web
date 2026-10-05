// Ordered convolution with standard WASM SIMD. K order and bias/tail domains
// match the explicitly qualified native layout, independently of worker count.
#include "fma-simd.h"
#include <cstdint>

struct Shape { int ci,ih,iw,co,oh,ow,k,pad,stride,groups,hasBias,tailStart,tailMode,ranges; };
static bool after(int p,const int* ranges,int count){for(int r=0;r<count;r++)if(p>=ranges[2*r]&&p<ranges[2*r+1])return true;return false;}
static float scalar(const float* input,const float* weights,const float* bias,const Shape&s,const int* ranges,int index){
 const int plane=s.oh*s.ow,c=index/plane,p=index%plane,ci=s.ci/s.groups,group=c/(s.co/s.groups),yy=(p/s.ow)*s.stride-s.pad,xx=(p%s.ow)*s.stride-s.pad,total=ci*s.k*s.k;
 const bool biasAfter=after(p,ranges,s.ranges),tail=p>=s.tailStart;float sum=biasAfter?0:bias[c],block=0,partials[16]={};int k=0;
 for(int ic=0;ic<ci;ic++)for(int ky=0;ky<s.k;ky++)for(int kx=0;kx<s.k;kx++,k++){
  const int y=yy+ky,x=xx+kx;const float v=y>=0&&x>=0&&y<s.ih&&x<s.iw?input[((ic+group*ci)*s.ih+y)*s.iw+x]:0,w=weights[c*total+k];
  if(tail&&s.tailMode==2){block=k%1024==0?v*w:std::fma(v,w,block);if(k%1024==1023||k+1==total)sum=k<1024&&!s.hasBias?block:sum+block;}
  else if(tail)partials[k%16]=std::fma(v,w,partials[k%16]);
  else sum=k==0&&!s.hasBias?v*w:std::fma(v,w,sum);
 }
 if(tail&&s.tailMode!=2){partials[0]+=bias[c];for(int step=8;step;step/=2)for(int i=0;i<step;i++)partials[i]+=partials[i+step];sum=partials[0];}
 else if(!tail&&biasAfter)sum+=bias[c];return sum;
}
extern "C" int d2prl_convolution_range(const float* input,const float* weights,const float* bias,const Shape* shape,const int* ranges,int start,int count,float* out){
 const Shape&s=*shape;const int plane=s.oh*s.ow,ci=s.ci/s.groups,total=ci*s.k*s.k;
 if(start<0||count<1||start+count>s.co*plane)return -1;
 int at=0;
 while(at<count){
  const int index=start+at,c=index/plane,p=index%plane;
  if(at+4>count||p+4>plane||(p<s.tailStart&&p+4>s.tailStart)) {out[at++]=scalar(input,weights,bias,s,ranges,index);continue;}
  const int group=c/(s.co/s.groups),y=(p/s.ow)*s.stride-s.pad,x=(p%s.ow)*s.stride-s.pad;const bool sameRow=p/s.ow==(p+3)/s.ow,tail=p>=s.tailStart;
  const v128_t biasAfter=wasm_i32x4_make(-int(after(p,ranges,s.ranges)),-int(after(p+1,ranges,s.ranges)),-int(after(p+2,ranges,s.ranges)),-int(after(p+3,ranges,s.ranges)));
  const v128_t b=wasm_f32x4_splat(bias[c]),zero=wasm_f32x4_splat(0);
  v128_t sum=wasm_v128_bitselect(zero,b,biasAfter),block=zero,partials[16];for(auto&v:partials)v=zero;
  int k=0;
  for(int ic=0;ic<ci;ic++)for(int ky=0;ky<s.k;ky++)for(int kx=0;kx<s.k;kx++,k++){
   const int yy=y+ky,xx=x+kx;v128_t v;
   if(s.stride==1&&sameRow&&yy>=0&&yy<s.ih&&xx>=0&&xx+3<s.iw)v=wasm_v128_load(input+((ic+group*ci)*s.ih+yy)*s.iw+xx);
   else {float values[4];for(int lane=0;lane<4;lane++){const int yy=((p+lane)/s.ow)*s.stride-s.pad+ky,xx=((p+lane)%s.ow)*s.stride-s.pad+kx;values[lane]=yy>=0&&yy<s.ih&&xx>=0&&xx<s.iw?input[((ic+group*ci)*s.ih+yy)*s.iw+xx]:0;}v=wasm_v128_load(values);}
   const v128_t w=wasm_f32x4_splat(weights[c*total+k]);
   if(tail&&s.tailMode==2){block=k%1024==0?wasm_f32x4_mul(v,w):d2prl_fma4(v,w,block);if(k%1024==1023||k+1==total)sum=k<1024&&!s.hasBias?block:wasm_f32x4_add(sum,block);}
   else if(tail)partials[k%16]=d2prl_fma4(v,w,partials[k%16]);
   else sum=k==0&&!s.hasBias?wasm_f32x4_mul(v,w):d2prl_fma4(v,w,sum);
  }
  if(tail&&s.tailMode!=2){partials[0]=wasm_f32x4_add(partials[0],b);for(int step=8;step;step/=2)for(int i=0;i<step;i++)partials[i]=wasm_f32x4_add(partials[i],partials[i+step]);sum=partials[0];}
  else if(!tail)sum=wasm_v128_bitselect(wasm_f32x4_add(sum,b),sum,biasAfter);
  wasm_v128_store(out+at,sum);at+=4;
 }
 return 1;
}
