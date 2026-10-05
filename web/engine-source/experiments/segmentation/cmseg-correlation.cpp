// Bounded global CMSeg correlation candidate: all N*N comparisons remain.
// Native definition: normalize channels, suppress a Gaussian diagonal, two
// softmax axes, multiply, sorted top-k values per location. This computes rows
// twice and retains O(C*N + K*N + N), never the quadratic matrix.
// Float32 arithmetic is qualified against native results, not claimed bit exact.
#include <algorithm>
#include <cmath>
#include <wasm_simd128.h>
#include "../d2prl/reference-exp.h"

static bool geometry(int c, int h, int w, int k) {
  return c > 0 && c <= 96 && h > 0 && w > 0 && h <= 128 && w <= 128 &&
    h*w % 4 == 0 && k > 0 && k <= 96 && k <= h*w;
}
extern "C" int cmseg_normalize(const float* x, int c, int h, int w,
                                float* xn, float* gaussianY, float* gaussianX) {
  if (!geometry(c,h,w,1)) return 0;
  const int n=h*w;
  for(int j=0;j<n;j++) {
    float sum=0;
    for(int channel=0;channel<c;channel++) {const float v=x[channel*n+j]; sum += v*v;}
    const float norm=std::max(std::sqrt(sum),1e-12f);
    for(int channel=0;channel<c;channel++) xn[channel*n+j]=x[channel*n+j]/norm;
  }
  const float sy=float(2*(h*.05)*(h*.05)), sx=float(2*(w*.05)*(w*.05));
  for(int y=0;y<h;y++) gaussianY[y]=reference_exp(-float(y*y)/sy);
  for(int x=0;x<w;x++) gaussianX[x]=reference_exp(-float(x*x)/sx);
  return 1;
}
static void row(const float* xn, int c, int h, int w, int i, float alpha,
                const float* gy, const float* gx, float* logits) {
  const int n=h*w;
  for(int j=0;j<n;j+=4) {
    v128_t sum=wasm_f32x4_splat(0);
    for(int channel=0;channel<c;channel++)
      sum=wasm_f32x4_add(sum,wasm_f32x4_mul(wasm_f32x4_splat(xn[channel*n+i]),wasm_v128_load(xn+channel*n+j)));
    wasm_v128_store(logits+j,sum);
  }
  const int iy=i/w, ix=i%w;
  for(int j=0;j<n;j++) {const float suppress=1.f-gy[std::abs(iy-j/w)]*gx[std::abs(ix-j%w)]; logits[j]=(logits[j]*suppress)*alpha;}
}
extern "C" int cmseg_statistics(const float* xn, int c, int h, int w, float alpha,
                                 const float* gy, const float* gx, int first, int count,
                                 float* maxima, float* inverse, float* scratch) {
  if(!geometry(c,h,w,1)||first<0||count<1||first+count>h*w||!std::isfinite(alpha)) return 0;
  const int n=h*w;
  for(int i=first;i<first+count;i++) {
    row(xn,c,h,w,i,alpha,gy,gx,scratch);
    float maximum=-INFINITY; for(int j=0;j<n;j++) maximum=std::max(maximum,scratch[j]);
    float sums[4]={0,0,0,0}, columnSum=0;
    for(int j=0;j<n;j++) {
      const float value=reference_exp(scratch[j]-maximum);
      sums[j%4]+=value; columnSum+=value;
    }
    // Pinned Torch2.8: contiguous softmax reduces four lanes then multiplies
    // by the reciprocal; the other axis sums in index order then divides.
    // Symmetry of the matrix does not make these rounding paths identical.
    maxima[i]=maximum; inverse[i]=1.f/((sums[0]+sums[2])+(sums[1]+sums[3]));
    inverse[n+i]=columnSum;
  }
  return 1;
}
extern "C" int cmseg_topk(const float* xn, int c, int h, int w, int k, float alpha,
                           const float* gy, const float* gx, const float* maxima,
                           const float* inverse, int first, int count, float* output, float* scratch) {
  if(!geometry(c,h,w,k)||first<0||count<1||first+count>h*w||!std::isfinite(alpha)) return 0;
  const int n=h*w;
  // The dot/Gaussian matrix is symmetric, but each softmax axis preserves its
  // own sum and division order. No distant comparison/candidate is omitted.
  for(int j=first;j<first+count;j++) {
    row(xn,c,h,w,j,alpha,gy,gx,scratch);
    float heap[96]; int size=0;
    for(int i=0;i<n;i++) {
      const float left=reference_exp(scratch[i]-maxima[i])*inverse[i];
      const float right=reference_exp(scratch[i]-maxima[j])/inverse[n+j];
      const float value=left*right;
      if(size<k) {heap[size++]=value;std::push_heap(heap,heap+size,std::greater<float>());}
      else if(value>heap[0]) {std::pop_heap(heap,heap+k,std::greater<float>());heap[k-1]=value;std::push_heap(heap,heap+k,std::greater<float>());}
    }
    std::sort(heap,heap+k,std::greater<float>());
    for(int channel=0;channel<k;channel++) output[channel*n+j]=heap[channel];
  }
  return 1;
}
