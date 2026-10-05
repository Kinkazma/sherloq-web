// Portable fixed-shape VIG arithmetic. TopK selection follows PyTorch2.8
// TopKImpl.h (BSD-3-Clause, vendor/d2prl/PYTORCH-LICENSE.txt).
#include "../d2prl/convolution-cpu.cpp"
#include "../d2prl/resize.cpp"
#include "vig-exp.h"
#include <vector>
#include <utility>
extern "C" void vig_exp_values(const float*x,int n,float*y){for(int i=0;i<n;i++)y[i]=vig_exp(x[i]);}
extern "C" void vig_gelu(const float*x,int n,float*y){
 for(int i=0;i<n;i++){
  const float z=x[i]*.7071067811865475244f,t=1.f/std::fma(.3275911f,std::abs(z),1.f);
  float r=std::fma(1.061405429f,t,-1.453152027f);r=std::fma(r,t,1.421413741f);r=std::fma(r,t,-.284496736f);r=std::fma(r,t,.254829592f);
  const float e=vig_exp(-(z*z));float v=std::fma(t*(-e),r,1.f);uint32_t vb,zb;std::memcpy(&vb,&v,4);std::memcpy(&zb,&z,4);vb^=zb&0x80000000u;std::memcpy(&v,&vb,4);y[i]=(x[i]*.5f)*(1.f+v);
 }
}
extern "C" int vig_conv(const float*x,const float*w,const float*b,const int*d,int first,int count,float*out){
 const int ci=d[0],h=d[1],iw=d[2],co=d[3],k=d[4],pad=d[5],stride=d[6],groups=d[7],oh=(h+2*pad-k)/stride+1,ow=(iw+2*pad-k)/stride+1,plane=oh*ow;
 if(first<0||count<1||first+count>co*plane)return 0;
 Shape s={ci,h,iw,co,oh,ow,k,pad,stride,groups,1,plane,1,0};
 // Native fixed RGB256 stem GEMM partitions: remainder output channels use
 // bias-after only in these boundary column blocks. Independently qualified.
 const bool stem=ci==3&&h==256&&iw==256&&co==80&&k==3&&pad==1&&stride==2&&groups==1;
 const int ranges[4]={0,16,16336,16384};
 for(int at=0;at<count;){const int pos=first+at,n=std::min(count-at,plane-pos%plane);s.ranges=stem&&pos/plane>=64?2:0;if(d2prl_convolution_range(x,w,b,&s,ranges,pos,n,out+at)!=1)return 0;at+=n;}
 return 1;
}
extern "C" void vig_normalize(const float*x,float*out,float*sums){
 for(int j=0;j<256;j++){
  float total=0;for(int c=0;c<640;c++){const float v=x[c*256+j];total=std::fma(v,v,total);}const float norm=std::fmax(std::sqrt(total),1e-12f);
  float buf[640],partials[4]={};for(int c=0;c<640;c++){const float v=x[c*256+j]/norm;out[c*256+j]=v;buf[c]=v*v;}
  int count=640;for(int level=0;level<4;level++){const int chunks=count/16;for(int t=chunks*16;t<count;t++)partials[level]+=buf[t];for(int t=0;t<chunks;t++){float s=0;for(int q=0;q<16;q++)s+=buf[t*16+q];buf[t]=s;}count=chunks;}
  float s=partials[0];for(int level=1;level<4;level++)s+=partials[level];sums[j]=s;
 }
}
extern "C" void vig_distance_rows(const float*x,const float*sums,int first,int count,float*out){
 for(int i=first;i<first+count;i++)for(int j=0;j<256;j+=4){v128_t sum=wasm_f32x4_splat(0);for(int c=0;c<640;c++)sum=d2prl_fma4(wasm_f32x4_splat(x[c*256+i]),wasm_v128_load(x+c*256+j),sum);
  sum=wasm_f32x4_mul(sum,wasm_f32x4_splat(-2));sum=wasm_f32x4_add(wasm_f32x4_splat(sums[i]),sum);sum=wasm_f32x4_add(sum,wasm_v128_load(sums+j));sum=wasm_f32x4_neg(sum);wasm_v128_store(out+i*256+j,sum);}
}
extern "C" void vig_topk_rows(const float*x,int first,int count,int k,int32_t*out){
 using P=std::pair<float,int64_t>;std::vector<P> q(256);auto less=[](const P&a,const P&b){return(std::isnan(a.first)&&!std::isnan(b.first))||a.first>b.first;};
 for(int i=first;i<first+count;i++){for(int j=0;j<256;j++)q[j]={x[i*256+j],j};std::nth_element(q.begin(),q.begin()+k-1,q.end(),less);std::sort(q.begin(),q.begin()+k-1,less);for(int j=0;j<k;j++)out[i*k+j]=q[j].second;}
}
extern "C" void vig_gather_rows(const float*x,int k,int dilation,const int32_t*idx,int first,int count,float*out){
 for(int c=0;c<640;c++)for(int i=first;i<first+count;i++){const float v=x[c*256+i];float max=-INFINITY;for(int j=0;j<k;j++)max=std::max(max,x[c*256+idx[i*k*dilation+j*dilation]]-v);out[c*512+i]=v;out[c*512+256+i]=max;}
}
