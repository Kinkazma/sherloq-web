// Additive CMSeg single-window context-bank ABI. Derived from the existing
// cmseg-correlation.cpp and cmseg-scientific-correlation.cpp operators.
// Keep normalization, ordered native FMA, reference exp, the two distinct
// softmax reductions and sorted TopK. Positions refer to Original, never a
// fictitious concatenated image. Original unscoped binaries remain untouched.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <wasm_simd128.h>
#include "../d2prl/fma-simd.h"
#include "../d2prl/reference-exp.h"

static bool geometry(int c,int n,int side,int k){
 return c>0&&c<=96&&n>0&&n<=0x3ffffff&&n%4==0&&side>0&&side<=128&&n%(side*side)==0&&k>0&&k<=96&&k<=n;
}
extern "C" int cmseg_bank_normalize(const float*x,int c,int n,int side,const uint8_t*mask,float*xn,int fma){
 if(!geometry(c,n,side,1))return 0;
 for(int j=0;j<n;j++){
  if(!mask[j]){for(int a=0;a<c;a++)xn[a*n+j]=0;continue;}
  float sum=0;for(int a=0;a<c;a++){const float v=x[a*n+j];sum=fma?std::fma(v,v,sum):sum+v*v;}
  const float norm=std::max(std::sqrt(sum),1e-12f);for(int a=0;a<c;a++)xn[a*n+j]=x[a*n+j]/norm;
 }
 return 1;
}

static void row(const float*xn,int c,int n,int side,int i,float alpha,const float*positions,const uint8_t*mask,float*logits,float*gy,float*gx,int fma,const float*dots){
 const int cells=side*side,contexts=n/cells;
 // One Gaussian per unique context row/column, not an exp per pair. Sigma
 // keeps the original native grid. Scratch is O(contexts*side), never N*N.
 const float sigma=float(2*(side*.05)*(side*.05)),ix=positions[i],iy=positions[n+i];
 for(int context=0;context<contexts;context++)for(int p=0;p<side;p++){
  const int first=context*cells;const float dx=ix-positions[first+p],dy=iy-positions[n+first+p*side];
  gx[context*side+p]=reference_exp(-(dx*dx)/sigma);gy[context*side+p]=reference_exp(-(dy*dy)/sigma);
 }
 for(int j=0;j<n;j+=4){
  if(!mask[j]&&!mask[j+1]&&!mask[j+2]&&!mask[j+3]){for(int a=0;a<4;a++)logits[j+a]=-INFINITY;continue;}
  if(dots){for(int a=0;a<4;a++)logits[j+a]=mask[j+a]?dots[j+a]:-INFINITY;}
  else if(mask[j]&&mask[j+1]&&mask[j+2]&&mask[j+3]){
   v128_t sum=wasm_f32x4_splat(0);for(int a=0;a<c;a++){const v128_t u=wasm_f32x4_splat(xn[a*n+i]),v=wasm_v128_load(xn+a*n+j);sum=fma?d2prl_fma4(u,v,sum):wasm_f32x4_add(sum,wasm_f32x4_mul(u,v));}wasm_v128_store(logits+j,sum);
  }else for(int a=0;a<4;a++){
   if(!mask[j+a]){logits[j+a]=-INFINITY;continue;}float sum=0;for(int channel=0;channel<c;channel++){const float u=xn[channel*n+i],v=xn[channel*n+j+a];sum=fma?std::fma(u,v,sum):sum+u*v;}logits[j+a]=sum;
  }
 }
 for(int j=0;j<n;j++)if(mask[j]){const int context=j/cells,local=j%cells;logits[j]=(logits[j]*(1.f-gy[context*side+local/side]*gx[context*side+local%side]))*alpha;}
}

static int statistics(const float*xn,int c,int n,int side,float alpha,const float*positions,const uint8_t*mask,int first,int count,float*maxima,float*inverse,float*scratch,float*gy,float*gx,int fma,const float*dots){
 if(!geometry(c,n,side,1)||first<0||count<1||first+count>n||!std::isfinite(alpha))return 0;
 for(int i=first;i<first+count;i++){
  if(!mask[i]){maxima[i]=0;inverse[i]=0;inverse[n+i]=1;continue;}
  row(xn,c,n,side,i,alpha,positions,mask,scratch,gy,gx,fma,dots?dots+(i-first)*n:nullptr);
  float maximum=-INFINITY;for(int j=0;j<n;j++)if(mask[j])maximum=std::max(maximum,scratch[j]);
  float sums[4]={0,0,0,0},columnSum=0;
  for(int j=0;j<n;j++)if(mask[j]){const float v=reference_exp(scratch[j]-maximum);sums[j%4]+=v;columnSum+=v;}
  maxima[i]=maximum;inverse[i]=1.f/((sums[0]+sums[2])+(sums[1]+sums[3]));inverse[n+i]=columnSum;
 }
 return 1;
}
static int topk(const float*xn,int c,int n,int side,int k,float alpha,const float*positions,const uint8_t*mask,const float*maxima,const float*inverse,int first,int count,float*output,float*scratch,float*gy,float*gx,int fma,const float*dots){
 if(!geometry(c,n,side,k)||first<0||count<1||first+count>n||!std::isfinite(alpha))return 0;
 for(int j=first;j<first+count;j++){
  if(!mask[j]){for(int a=0;a<k;a++)output[a*count+j-first]=0;continue;}
  row(xn,c,n,side,j,alpha,positions,mask,scratch,gy,gx,fma,dots?dots+(j-first)*n:nullptr);
  float heap[96];int size=0;
  for(int i=0;i<n;i++)if(mask[i]){
   const float value=(reference_exp(scratch[i]-maxima[i])*inverse[i])*(reference_exp(scratch[i]-maxima[j])/inverse[n+j]);
   if(size<k){heap[size++]=value;std::push_heap(heap,heap+size,std::greater<float>());}else if(value>heap[0]){std::pop_heap(heap,heap+k,std::greater<float>());heap[k-1]=value;std::push_heap(heap,heap+k,std::greater<float>());}
  }
  std::sort(heap,heap+size,std::greater<float>());for(int a=0;a<k;a++)output[a*count+j-first]=a<size?heap[a]:0;
 }
 return 1;
}
extern "C" int cmseg_bank_statistics(const float*x,int c,int n,int side,float a,const float*pos,const uint8_t*m,int f,int count,float*mx,float*iv,float*s,float*gy,float*gx,int fma){return statistics(x,c,n,side,a,pos,m,f,count,mx,iv,s,gy,gx,fma,nullptr);}
extern "C" int cmseg_bank_topk(const float*x,int c,int n,int side,int k,float a,const float*pos,const uint8_t*m,const float*mx,const float*iv,int f,int count,float*out,float*s,float*gy,float*gx,int fma){return topk(x,c,n,side,k,a,pos,m,mx,iv,f,count,out,s,gy,gx,fma,nullptr);}
extern "C" int cmseg_bank_statistics_dots(const float*d,int c,int n,int side,float a,const float*pos,const uint8_t*m,int f,int count,float*mx,float*iv,float*s,float*gy,float*gx){return statistics(nullptr,c,n,side,a,pos,m,f,count,mx,iv,s,gy,gx,1,d);}
extern "C" int cmseg_bank_topk_dots(const float*d,int c,int n,int side,int k,float a,const float*pos,const uint8_t*m,const float*mx,const float*iv,int f,int count,float*out,float*s,float*gy,float*gx){return topk(nullptr,c,n,side,k,a,pos,m,mx,iv,f,count,out,s,gy,gx,1,d);}
