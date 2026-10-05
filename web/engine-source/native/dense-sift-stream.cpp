// Exact bounded kernels for the stored complete-axis dense SIFT pipeline.
#include <cmath>
#include <algorithm>
extern "C" {
#include "../vendor/dense-source/src/vlfeat/vl/imopv.h"
int sherloq_sift_inputs(const float*,int,int,int,int,float*,float*);
void sherloq_sift_pack_range(const float*,const float*,int,int,int,size_t,int,float*);
void sherloq_sift_norm_factors(float*,int,float*);
}
static float pairwise(const float* a,int n,bool square=false){
 #pragma clang fp contract(off)
 float r[8];for(int j=0;j<8;j++)r[j]=square?a[j]*a[j]:a[j];for(int i=8;i<n;i+=8)for(int j=0;j<8;j++)r[j]+=square?a[i+j]*a[i+j]:a[i+j];return ((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));
}
static int frame(float* d,bool rotate){
 float hist[8]={};for(int c=0;c<16;c++)for(int b=0;b<8;b++)hist[b]+=d[c*8+b];int turn=0;float best=-INFINITY;for(int t=0;t<4;t++){float e=hist[2*t]+hist[2*t+1];if(e>best){best=e;turn=t;}}
 if(rotate){float copy[128];std::copy_n(d,128,copy);for(int y=0;y<4;y++)for(int x=0;x<4;x++){int sx=turn==1?3-y:turn==2?3-x:turn==3?y:x,sy=turn==1?x:turn==2?3-y:turn==3?3-x:y;for(int b=0;b<8;b++)d[(y*4+x)*8+b]=copy[(sy*4+sx)*8+(b+2*turn)%8];}}return turn;
}
static bool diversity(const float* d){
 float h[8]={},cosine[8],sine[8];const int cos[8]={1,0,-1,0,1,0,-1,0},sin[8]={0,1,0,-1,0,1,0,-1};for(int c=0;c<16;c++)for(int b=0;b<8;b++)h[b]+=d[c*8+b];for(int b=0;b<8;b++){cosine[b]=h[b]*cos[b];sine[b]=h[b]*sin[b];}float total=pairwise(h,8),c=pairwise(cosine,8),s=pairwise(sine,8),anisotropy=float(std::sqrt(double(c*c+s*s)));return total>0&&total-anisotropy>=.1f*(total+anisotropy);
}
extern "C" void sift_stream_columns(const float* input,int width,int height,int patch,float* output){
 vl_imconvcoltri_f(output,width,input,width,height,width,patch,1,VL_PAD_BY_CONTINUITY);
}
extern "C" void sift_stream_factors(float* raw,int count,int quarter,float* factors,unsigned char* turns,unsigned char* diverse){
 sherloq_sift_norm_factors(raw,count,factors);
 for(int i=0;i<count;i++){
  float* d=raw+size_t(i)*128;float norm=std::max(float(std::sqrt(double(pairwise(d,128,true)))),1e-12f);
  factors[size_t(i)*3+2]=norm;for(int k=0;k<128;k++)d[k]/=norm;
  turns[i]=frame(d,quarter);diverse[i]=diversity(d);
 }
}

// Canonical, unrotated intervals can be reused by every quarter-turn view.
extern "C" void sift_stream_bounds(const float* descriptors,int count,unsigned char* bounds,unsigned char* samples,int quarter,const unsigned char* turns){
 const int components[4]={0,26,124,102};
 for(int i=0;i<count;i++){
  const int turn=quarter?turns[i]:0;unsigned char out[128];
  for(int y=0;y<4;y++)for(int x=0;x<4;x++)for(int bin=0;bin<8;bin++){
   int xx=x,yy=y;if(turn==1){xx=3-y;yy=x;}else if(turn==2){xx=3-x;yy=3-y;}else if(turn==3){xx=y;yy=3-x;}
   float v=descriptors[size_t(i)*128+(y*4+x)*8+bin];out[(yy*4+xx)*8+(bin+2*turn)%8]=std::isfinite(v)&&v>=0.f&&v<255.f/256.f?unsigned(v*256.f):255;
  }
  if(bounds)std::copy_n(out,128,bounds+size_t(i)*128);
  for(int k=0;k<4;k++)samples[size_t(i)*4+k]=out[components[k]]/2;
  samples[size_t(i)*4]|=(turns[i]&1)<<7;samples[size_t(i)*4+1]|=(turns[i]&2)<<6;
 }
}
