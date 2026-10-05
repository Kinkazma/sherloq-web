// Native-order TNT CPU arithmetic. PyTorch 2.8.0 LayerNorm/Welford,
// vec128 erf and softmax reduction; BSD-3-Clause, see
// vendor/d2prl/PYTORCH-LICENSE.txt. Non-positive exponential is the already
// qualified SLEEF helper with its Boost license. GELU's scalar exponential
// differs slightly from the native system libm: final model parity is required.
// No checkpoint activations, fitted corrections or platform-brand selection.
#include <cmath>
#include <cstdint>
#include <cstring>
#include "../d2prl/reference-exp.h"
// Pinned Torch2.8 vec128 float erf formula, distinct from SLEEF erf itself.
static float native_erf(float z){
 const float a=std::abs(z),t=1.f/std::fma(.3275911f,a,1.f);
 float r=std::fma(1.061405429f,t,-1.453152027f);r=std::fma(r,t,1.421413741f);r=std::fma(r,t,-.284496736f);r=std::fma(r,t,.254829592f);
 const float square=-(z*z),e=float(std::exp(double(square)));
 float value=std::fma(t*(-e),r,1.f);uint32_t vbits,zbits;std::memcpy(&vbits,&value,4);std::memcpy(&zbits,&z,4);vbits^=zbits&0x80000000u;std::memcpy(&value,&vbits,4);return value;
}
extern "C" void tnt_gelu(const float* input,int n,float* output){for(int i=0;i<n;i++){const float x=input[i],z=x*.7071067811865475244f;output[i]=(x*.5f)*(1.f+native_erf(z));}}

#include <cmath>

extern "C" void tnt_matmul(const float*a,const float*b,int batch,int m,int k,int n,int transposeB,int mode,float*out){
 for(int h=0;h<batch;h++)for(int i=0;i<m;i++)for(int j=0;j<n;j++){
  float s=0;
  for(int q=0;q<k;q++){float av=a[(h*m+i)*k+q],bv=b[h*k*n+(transposeB?j*k+q:q*n+j)];s=mode==0?std::fma(av,bv,s):s+av*bv;}
  out[(h*m+i)*n+j]=s;
 }
}
extern "C" void tnt_softmax(const float*x,int rows,int width,float*out){
 for(int i=0;i<rows;i++){
  const float*p=x+i*width;float*q=out+i*width,max=p[0],acc[4]={};
  for(int j=1;j<width;j++)max=std::fmax(max,p[j]);
  for(int j=0;j<width;j++){q[j]=reference_exp(p[j]-max);acc[j%4]+=q[j];}
  float sum=(acc[0]+acc[2])+(acc[1]+acc[3]),inverse=1.f/sum;
  for(int j=0;j<width;j++)q[j]*=inverse;
 }
}


#include "../d2prl/fma-simd.h"
#include <algorithm>
struct Moment {int count=0;float mean=0,variance=0;};
static Moment merge(Moment a,Moment b,bool fused){
 const int total=a.count+b.count;const float ratio=total?float(b.count)/float(total):0,delta=b.mean-a.mean,weighted=(delta*delta)*ratio;
 return {total,fused?std::fma(ratio,delta,a.mean):a.mean+ratio*delta,a.variance+(fused?std::fma(weighted,float(a.count),b.variance):b.variance+weighted*float(a.count))};
}
extern "C" void tnt_norm(const float*x,const float*gamma,const float*beta,int rows,int width,float epsilon,float*out){
 const int vectors=width/4,chunks=(vectors+15)/16,length=std::min(16,vectors);int depth=1;while((1<<depth)<chunks)depth++;
 for(int row=0;row<rows;row++){
  Moment stack[4][4]={};
  for(int i=0;i<chunks;i++){
   Moment part[4]={};
   for(int j=0;j<length;j++)for(int lane=0;lane<4;lane++){const float v=x[row*width+(i*length+j)*4+lane],delta=v-part[lane].mean;part[lane].mean+=delta*(1.f/float(j+1));part[lane].variance+=delta*(v-part[lane].mean);part[lane].count++;}
   for(int lane=0;lane<4;lane++)stack[0][lane]=merge(stack[0][lane],part[lane],false);
   int mask=i+1;
   for(int j=1;j<depth&&(mask&1)==0;j++,mask>>=1)for(int lane=0;lane<4;lane++){stack[j][lane]=merge(stack[j][lane],stack[j-1][lane],false);stack[j-1][lane]={};}
  }
  for(int j=1;j<depth;j++)for(int lane=0;lane<4;lane++)stack[0][lane]=merge(stack[0][lane],stack[j][lane],false);
  Moment total{};for(int lane=0;lane<4;lane++)total=merge(total,stack[0][lane],true);
  const float rstd=1.f/std::sqrt(total.variance/float(width)+epsilon);
  for(int j=0;j<width;j++)out[row*width+j]=((x[row*width+j]-total.mean)*rstd)*gamma[j]+beta[j];
 }
}
extern "C" void tnt_linear(const float*x,const float*w,const float*b,int rows,int ci,int co,int bias,int first,int count,float*out){
 for(int c=first;c<first+count;c++){
  const bool after=bias&&c>=co/32*32;const float initial=bias&&!after?b[c]:0;int r=0;
  for(;r+4<=rows;r+=4){v128_t sum=wasm_f32x4_splat(initial);for(int k=0;k<ci;k++)sum=d2prl_fma4(wasm_v128_load(x+k*rows+r),wasm_f32x4_splat(w[c*ci+k]),sum);if(after)sum=wasm_f32x4_add(sum,wasm_f32x4_splat(b[c]));wasm_v128_store(out+(c-first)*rows+r,sum);}
  for(;r<rows;r++){float sum=initial;for(int k=0;k<ci;k++)sum=std::fma(x[k*rows+r],w[c*ci+k],sum);if(after)sum+=b[c];out[(c-first)*rows+r]=sum;}
 }
}
extern "C" void tnt_patch(const float*x,const float*w,const float*b,float*out){
 for(int patch=0;patch<256;patch++)for(int word=0;word<16;word++)for(int c=0;c<40;c++){
  float sum=0;
  for(int ic=0;ic<3;ic++)for(int ky=0;ky<7;ky++)for(int kx=0;kx<7;kx++){
   const int y=word/4*4-3+ky,xx=word%4*4-3+kx;
   const float v=y>=0&&y<16&&xx>=0&&xx<16?x[(ic*256+patch/16*16+y)*256+patch%16*16+xx]:0;
   sum=std::fma(v,w[((c*3+ic)*7+ky)*7+kx],sum);
  }
  out[(patch*16+word)*40+c]=sum+b[c];
 }
}
