// Diagnostic only: compare plausible native accumulation orders against captured
// Torch normalization and full-matrix GEMM samples. Never a detector substitute.
#include <cmath>
#include <algorithm>
extern "C" int probe_norm(const float* input,int c,int n,int mode,float* output){
 if(c<1||c>96||n<1||n>16384||mode<0||mode>4)return 0;
 for(int i=0;i<n;i++){
  float sums[4]={},sum=0;double precise=0;
  for(int k=0;k<c;k++){float v=input[k*n+i];if(mode==2)precise+=double(v)*v;else if(mode>=3)sums[k%4]=mode==4?std::fma(v,v,sums[k%4]):sums[k%4]+v*v;else sum=mode==1?std::fma(v,v,sum):sum+v*v;}
  if(mode==2)sum=float(precise);else if(mode>=3)sum=(sums[0]+sums[2])+(sums[1]+sums[3]);
  float norm=std::max(std::sqrt(sum),1e-12f);for(int k=0;k<c;k++)output[k*n+i]=input[k*n+i]/norm;
 }return 1;
}
extern "C" int probe_dot(const float* normalized,int c,int n,const int* rows,int count,int mode,float* output){
 if(c<1||c>96||n<1||n>16384||count<1||count>32||mode<0||mode>4)return 0;
 for(int r=0;r<count;r++){if(rows[r]<0||rows[r]>=n)return 0;for(int j=0;j<n;j++){
  float sums[4]={},sum=0;double precise=0;
  for(int k=0;k<c;k++){float a=normalized[k*n+rows[r]],b=normalized[k*n+j];if(mode==2)precise+=double(a)*b;else if(mode>=3)sums[k%4]=mode==4?std::fma(a,b,sums[k%4]):sums[k%4]+a*b;else sum=mode==1?std::fma(a,b,sum):sum+a*b;}
  if(mode==2)sum=float(precise);else if(mode>=3)sum=(sums[0]+sums[2])+(sums[1]+sums[3]);output[r*n+j]=sum;
 }}return 1;
}
