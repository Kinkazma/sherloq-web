#include <algorithm>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <cfloat>
#include "stereo-fma.h"
static int reflect(int x,int length){if(length==1)return 0;while(x<0||x>=length)x=x<0?-x:2*length-x-2;return x;}
extern "C" void plots_pyrdown(const unsigned char*rgb,int width,int height,int top,int first,int rows,unsigned char*out){
 const int weights[]={1,4,6,4,1},ow=(width+1)/2;
 for(int y=0;y<rows;y++)for(int x=0;x<ow;x++)for(int c=0;c<3;c++){
  int sum=0;for(int j=0;j<5;j++){const unsigned char*p=rgb+size_t(reflect(2*(first+y)+j-2,height)-top)*width*3;int row=0;for(int i=0;i<5;i++)row+=weights[i]*p[reflect(2*x+i-2,width)*3+c];sum+=weights[j]*row;}
  out[(size_t(y)*ow+x)*3+c]=(sum+128)>>8;
 }
}
extern "C" void plots_values(const unsigned char*rgb,int width,int rows,int original,float*out){
 stereoFastArithmetic=!original;
 for(int y=0;y<rows;y++)for(int x=0;x<width;x++){
  const auto*p=rgb+(size_t(y)*width+x)*3;auto*q=out+(size_t(y)*width+x)*6;
  const float r=p[0]/255.f,g=p[1]/255.f,b=p[2]/255.f,hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;
  const bool prefix=x<width/4*4;const float part=hi==r?(g<b?360.f:0.f):(hi==g?120.f:240.f),base=hi==r?g-b:(hi==g?b-r:r-g),inv=float(60./(d+FLT_EPSILON));
  float h=sherloq_stereo_fma(base,inv,prefix?part:(hi==r?0.f:part));if(h<0)h+=360.f;
  q[0]=r;q[1]=g;q[2]=b;q[3]=h/360.f;q[4]=d/(std::abs(hi)+FLT_EPSILON);q[5]=hi;
 }
}
