// Numerical reproduction of the PyTorch2.8 native ARM depthwise F(2,3) order.
// Reference: aten/src/ATen/native/cpu/DepthwiseConvKernel.cpp, BSD-3-Clause.
// License: vendor/d2prl/PYTORCH-LICENSE.txt.
// Portable float32 arithmetic; not selected by browser device brand.
#include <cmath>
static void transpose(float a[4][4]) { for(int i=0;i<4;i++)for(int j=i+1;j<4;j++){float v=a[i][j];a[i][j]=a[j][i];a[j][i]=v;} }
static void kernelTransform(float a[4][4]) {for(int j=0;j<4;j++){float x=a[0][j],y=a[1][j],z=a[2][j],half=.5f*(x+z);a[0][j]=x;a[1][j]=std::fma(.5f,y,half);a[2][j]=std::fma(-.5f,y,half);a[3][j]=z;} }
static void inputTransform(float a[4][4]) {for(int j=0;j<4;j++){float w=a[0][j],x=a[1][j],y=a[2][j],z=a[3][j];a[0][j]=w-y;a[1][j]=x+y;a[2][j]=-x+y;a[3][j]=x-z;} }
static void outputTransform(float a[4][4]) {for(int j=0;j<4;j++){float w=a[0][j],x=a[1][j],y=a[2][j],z=a[3][j];a[0][j]=(w+x)+y;a[1][j]=(x-y)-z;} }
extern "C" int cmseg_winograd(const float*input,const float*weight,const float*bias,int channels,int h,int w,int pad,float*out){
 if(!input||!weight||!bias||!out||channels<1||channels>2048||h<3||w<3||h>1024||w>1024||pad<0||pad>1)return 0;const int oh=h+2*pad-2,ow=w+2*pad-2;
 for(int c=0;c<channels;c++){float k[4][4]={};for(int y=0;y<3;y++)for(int x=0;x<3;x++)k[y][x]=weight[c*9+y*3+x];kernelTransform(k);transpose(k);kernelTransform(k);
  for(int oy=0;oy<oh;oy+=2)for(int ox=0;ox<ow;ox+=2){float t[4][4];for(int y=0;y<4;y++)for(int x=0;x<4;x++){int iy=oy-pad+y,ix=ox-pad+x;t[y][x]=iy>=0&&iy<h&&ix>=0&&ix<w?input[(c*h+iy)*w+ix]:0.f;}
   inputTransform(t);transpose(t);inputTransform(t);for(int y=0;y<4;y++)for(int x=0;x<4;x++)t[y][x]=t[y][x]*k[y][x];t[1][1]=t[1][1]+bias[c];outputTransform(t);transpose(t);outputTransform(t);
   for(int y=0;y<2&&oy+y<oh;y++)for(int x=0;x<2&&ox+x<ow;x++)out[(c*oh+oy+y)*ow+ox+x]=t[y][x];
  }
 }return 1;
}
