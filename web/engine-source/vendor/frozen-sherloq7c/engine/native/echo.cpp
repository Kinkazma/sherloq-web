// Portable staged Echo filter. Integer small kernels and the native float32
// separable/FMA order for large kernels precede global float64 normalization.
#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdint>
#include <vector>
#ifndef ECHO_OPTIMIZATIONS
#define ECHO_OPTIMIZATIONS 0
#endif
static int reflect(int x,int n){
#if ECHO_OPTIMIZATIONS & 1
 if(x>=0&&x<n)return x;
#endif
 if(n==1)return 0;int period=2*n-2;x%=period;if(x<0)x+=period;return x<n?x:period-x;}
// Coefficients and RGB samples are integers. For radii <=15, every
// horizontal product and partial sum has magnitude below 2^43. Therefore the
// double product+sum is exact, and the final float cast is the native FMA's
// single rounding. This bound does NOT apply to the vertical pass.
static float horizontalFma(float a,float b,float c){
#if ECHO_OPTIMIZATIONS & 4
 return float(double(a)*double(b)+double(c));
#else
 return std::fma(a,b,c);
#endif
}
static int64_t binomial(int n,int k){if(k<0||k>n)return 0;int64_t v=1;for(int i=1;i<=k;i++)v=v*(n-i+1)/i;return v;}
static uint8_t trunc8(double v){return uint8_t(int64_t(std::trunc(v))&255);}
extern "C" {
int echo_derivatives(const uint8_t* rgb,int w,int h,int start,int rows,int radius,float* out,double* limits){
 if(w<1||h<1||start<0||rows<1||start+rows>h||radius<1||radius>15)return 0;
 int size=2*radius+1;float dx[31],smooth[31];
 for(int i=0;i<size;i++){smooth[i]=float(binomial(size-1,i));dx[i]=float(binomial(size-3,i)-2*binomial(size-3,i-1)+binomial(size-3,i-2));}
 std::vector<float> horizontalX(size_t(w)*h),horizontalY(size_t(w)*h);
 for(int c=0;c<3;c++){
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   float first=rgb[(size_t(y)*w+reflect(x-radius,w))*3+c],a=dx[0]*first,b=smooth[0]*first;
   for(int k=1;k<size;k++){float v=rgb[(size_t(y)*w+reflect(x-radius+k,w))*3+c];if(radius>=5){a=horizontalFma(dx[k],v,a);b=horizontalFma(smooth[k],v,b);}else{a+=dx[k]*v;b+=smooth[k]*v;}}
   horizontalX[size_t(y)*w+x]=a;horizontalY[size_t(y)*w+x]=b;
  }
  double lo=DBL_MAX,hi=0;
  for(int y=start;y<start+rows;y++){
#if ECHO_OPTIMIZATIONS & 2
   int reflectedAbove[16],reflectedBelow[16];
   for(int k=1;k<=radius;k++){reflectedAbove[k]=reflect(y-k,h);reflectedBelow[k]=reflect(y+k,h);}
#endif
   for(int x=0;x<w;x++){
   float a=smooth[radius]*horizontalX[size_t(y)*w+x],b=dx[radius]*horizontalY[size_t(y)*w+x];
   for(int k=1;k<=radius;k++){
    #if ECHO_OPTIMIZATIONS & 2
    int above=reflectedAbove[k],below=reflectedBelow[k];
#else
    int above=reflect(y-k,h),below=reflect(y+k,h);
#endif
    float p=horizontalX[size_t(above)*w+x]+horizontalX[size_t(below)*w+x],q=horizontalY[size_t(above)*w+x]+horizontalY[size_t(below)*w+x];
    if(radius>=5){a=std::fma(smooth[radius+k],p,a);b=std::fma(dx[radius+k],q,b);}else{a+=smooth[radius+k]*p;b+=dx[radius+k]*q;}
   }
   float value=std::abs(a+b);out[(size_t(y-start)*w+x)*3+c]=value;lo=std::min(lo,double(value));hi=std::max(hi,double(value));
  }}limits[c*2]=lo;limits[c*2+1]=hi;
 }return 1;
}
void echo_render(const float* values,int n,const double* limits,double total,int contrast,int grayscale,uint8_t* out){
 float a[3],b[3];for(int c=0;c<3;c++){double lo=limits[c*2],hi=limits[c*2+1],scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.;a[c]=float(scale);b[c]=float(-lo*scale);}
 uint8_t lut[256];int high=int(contrast/100.*255);for(int i=0;i<256;i++)lut[i]=high==255?255:trunc8(std::clamp((i*-255.)/(-255+high),0.,255.));
 for(int i=0;i<n;i++){
  for(int c=0;c<3;c++){double v=total>=8?double(std::fma(values[i*3+c],a[c],b[c])):std::fma(double(values[i*3+c]),double(a[c]),double(b[c]));int rounded=int(std::nearbyint(v));out[i*3+c]=lut[std::clamp(rounded,0,255)];}
  if(grayscale){int v=(out[i*3]*9798+out[i*3+1]*19235+out[i*3+2]*3735+16384)>>15;out[i*3]=out[i*3+1]=out[i*3+2]=v;}
 }
}
}
