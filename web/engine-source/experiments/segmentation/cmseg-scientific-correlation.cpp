// Additive scientific-scope ABI. Existing unscoped kernels remain untouched.
// Invalid sources/targets never enter dot products, either softmax or TopK.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <wasm_simd128.h>
#include "../d2prl/fma-simd.h"
#include "../d2prl/reference-exp.h"
static bool geometry(int c,int h,int w,int k){return c>0&&c<=96&&h>0&&w>0&&h<=128&&w<=128&&h*w%4==0&&k>0&&k<=96&&k<=h*w;}
extern "C" int cmseg_scoped_normalize(const float*x,int c,int h,int w,const uint8_t*mask,float*xn,float*gy,float*gx,int fma){
 if(!geometry(c,h,w,1))return 0;const int n=h*w;
 for(int j=0;j<n;j++){if(!mask[j]){for(int a=0;a<c;a++)xn[a*n+j]=0;continue;}float sum=0;
  for(int a=0;a<c;a++){const float v=x[a*n+j];sum=fma?std::fma(v,v,sum):sum+v*v;}const float norm=std::max(std::sqrt(sum),1e-12f);for(int a=0;a<c;a++)xn[a*n+j]=x[a*n+j]/norm;}
 const float sy=float(2*(h*.05)*(h*.05)),sx=float(2*(w*.05)*(w*.05));for(int y=0;y<h;y++)gy[y]=reference_exp(-float(y*y)/sy);for(int x=0;x<w;x++)gx[x]=reference_exp(-float(x*x)/sx);return 1;
}
static void row(const float*xn,int c,int h,int w,int i,float alpha,const float*gy,const float*gx,const uint8_t*mask,float*logits,int fma,const float*dots=nullptr){
 const int n=h*w;const int iy=i/w,ix=i%w;
 for(int j=0;j<n;j+=4){
  if(!mask[j]&&!mask[j+1]&&!mask[j+2]&&!mask[j+3]){for(int a=0;a<4;a++)logits[j+a]=-INFINITY;continue;}
  if(dots){for(int a=0;a<4;a++)logits[j+a]=mask[j+a]?dots[j+a]:-INFINITY;}
  else if(mask[j]&&mask[j+1]&&mask[j+2]&&mask[j+3]){v128_t sum=wasm_f32x4_splat(0);for(int a=0;a<c;a++){const v128_t u=wasm_f32x4_splat(xn[a*n+i]),v=wasm_v128_load(xn+a*n+j);sum=fma?d2prl_fma4(u,v,sum):wasm_f32x4_add(sum,wasm_f32x4_mul(u,v));}wasm_v128_store(logits+j,sum);}
  else for(int a=0;a<4;a++){if(!mask[j+a]){logits[j+a]=-INFINITY;continue;}float sum=0;for(int channel=0;channel<c;channel++){const float u=xn[channel*n+i],v=xn[channel*n+j+a];sum=fma?std::fma(u,v,sum):sum+u*v;}logits[j+a]=sum;}
 }
 for(int j=0;j<n;j++)if(mask[j])logits[j]=(logits[j]*(1.f-gy[std::abs(iy-j/w)]*gx[std::abs(ix-j%w)]))*alpha;
}
static int statistics(const float*xn,int c,int h,int w,float alpha,const float*gy,const float*gx,const uint8_t*mask,int first,int count,float*maxima,float*inverse,float*scratch,int fma,const float*dots){
 if(!geometry(c,h,w,1)||first<0||count<1||first+count>h*w||!std::isfinite(alpha))return 0;const int n=h*w;
 for(int i=first;i<first+count;i++){if(!mask[i]){maxima[i]=0;inverse[i]=0;inverse[n+i]=1;continue;}row(xn,c,h,w,i,alpha,gy,gx,mask,scratch,fma,dots?dots+(i-first)*n:nullptr);
  float maximum=-INFINITY;for(int j=0;j<n;j++)if(mask[j])maximum=std::max(maximum,scratch[j]);float sums[4]={0,0,0,0},columnSum=0;
  for(int j=0;j<n;j++)if(mask[j]){const float v=reference_exp(scratch[j]-maximum);sums[j%4]+=v;columnSum+=v;}
  maxima[i]=maximum;inverse[i]=1.f/((sums[0]+sums[2])+(sums[1]+sums[3]));inverse[n+i]=columnSum;
 }return 1;
}
static int topk(const float*xn,int c,int h,int w,int k,float alpha,const float*gy,const float*gx,const uint8_t*mask,const float*maxima,const float*inverse,int first,int count,float*output,float*scratch,int fma,const float*dots){
 if(!geometry(c,h,w,k)||first<0||count<1||first+count>h*w||!std::isfinite(alpha))return 0;const int n=h*w;
 for(int j=first;j<first+count;j++){if(!mask[j]){for(int a=0;a<k;a++)output[a*n+j]=0;continue;}row(xn,c,h,w,j,alpha,gy,gx,mask,scratch,fma,dots?dots+(j-first)*n:nullptr);float heap[96];int size=0;
  for(int i=0;i<n;i++)if(mask[i]){const float value=(reference_exp(scratch[i]-maxima[i])*inverse[i])*(reference_exp(scratch[i]-maxima[j])/inverse[n+j]);
   if(size<k){heap[size++]=value;std::push_heap(heap,heap+size,std::greater<float>());}else if(value>heap[0]){std::pop_heap(heap,heap+k,std::greater<float>());heap[k-1]=value;std::push_heap(heap,heap+k,std::greater<float>());}}
  std::sort(heap,heap+size,std::greater<float>());for(int a=0;a<k;a++)output[a*n+j]=a<size?heap[a]:0;
 }return 1;
}
extern "C" int cmseg_scoped_statistics(const float*x,int c,int h,int w,float a,const float*gy,const float*gx,const uint8_t*m,int f,int n,float*mx,float*iv,float*s,int fma){return statistics(x,c,h,w,a,gy,gx,m,f,n,mx,iv,s,fma,nullptr);}
extern "C" int cmseg_scoped_topk(const float*x,int c,int h,int w,int k,float a,const float*gy,const float*gx,const uint8_t*m,const float*mx,const float*iv,int f,int n,float*out,float*s,int fma){return topk(x,c,h,w,k,a,gy,gx,m,mx,iv,f,n,out,s,fma,nullptr);}
extern "C" int cmseg_scoped_statistics_dots(const float*d,int c,int h,int w,float a,const float*gy,const float*gx,const uint8_t*m,int f,int n,float*mx,float*iv,float*s){return statistics(nullptr,c,h,w,a,gy,gx,m,f,n,mx,iv,s,1,d);}
extern "C" int cmseg_scoped_topk_dots(const float*d,int c,int h,int w,int k,float a,const float*gy,const float*gx,const uint8_t*m,const float*mx,const float*iv,int f,int n,float*out,float*s){return topk(nullptr,c,h,w,k,a,gy,gx,m,mx,iv,f,n,out,s,1,d);}
