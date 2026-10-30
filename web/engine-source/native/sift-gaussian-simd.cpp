// Same native OpenCV SIFT Gaussian: REFLECT_101, coefficients and accumulation
// order unchanged. Independent x lanes only; scalar native FMA fallback remains.
// Like the existing scalar helper, reflection uses the input Mat extent; ROI
// strides are respected and no parent-image pixels are consulted.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <wasm_simd128.h>
#include <vector>
#include <cmath>
extern "C" int sparse_fma_enabled();
static v128_t samples(const float* row,const int* index,int x,int k,int radius,int width){
 const int base=x+k-radius;
 if(base>=0&&base+3<width)return wasm_v128_load(row+base);
 return wasm_f32x4_make(row[index[x+k]],row[index[x+k+1]],row[index[x+k+2]],row[index[x+k+3]]);
}
void siftNativeGaussian(cv::InputArray source,cv::OutputArray destination,cv::Size size,double sigmaX,double sigmaY){
 const cv::Mat input=source.getMat();CV_Assert(input.type()==CV_32F&&size.empty()&&sigmaX==sigmaY);
 const int width=input.cols,height=input.rows,kernelSize=cvRound(std::fma(sigmaX,8.,1.))|1,radius=kernelSize/2;CV_Assert(kernelSize>=7);
 const cv::Mat kernel=cv::getGaussianKernel(kernelSize,sigmaX,CV_32F);const float* weights=kernel.ptr<float>();
 cv::Mat rows(input.size(),CV_32F),output(input.size(),CV_32F);
 std::vector<int> bx(width+2*radius),by(height+2*radius);
 for(int x=0;x<int(bx.size());x++)bx[x]=cv::borderInterpolate(x-radius,width,cv::BORDER_REFLECT_101);
 for(int y=0;y<int(by.size());y++)by[y]=cv::borderInterpolate(y-radius,height,cv::BORDER_REFLECT_101);
 const bool fused=sparse_fma_enabled()==1;
 for(int y=0;y<height;y++){
  const float* src=input.ptr<float>(y);float* dst=rows.ptr<float>(y);int x=0;
  if(fused)for(;x+3<width;x+=4){
   v128_t value=wasm_f32x4_mul(samples(src,bx.data(),x,0,radius,width),wasm_f32x4_splat(weights[0]));
   for(int k=1;k<kernelSize;k++)value=wasm_f32x4_relaxed_madd(samples(src,bx.data(),x,k,radius,width),wasm_f32x4_splat(weights[k]),value);
   wasm_v128_store(dst+x,value);
  }
  for(;x<width;x++){float value=src[bx[x]]*weights[0];for(int k=1;k<kernelSize;k++)value=std::fma(src[bx[x+k]],weights[k],value);dst[x]=value;}
 }
 for(int y=0;y<height;y++){
  float* dst=output.ptr<float>(y);const float* centre=rows.ptr<float>(y);int x=0;
  if(fused)for(;x+3<width;x+=4){
   v128_t value=wasm_f32x4_mul(wasm_v128_load(centre+x),wasm_f32x4_splat(weights[radius]));
   for(int k=1;k<=radius;k++){
    const v128_t a=wasm_v128_load(rows.ptr<float>(by[y+radius-k])+x),b=wasm_v128_load(rows.ptr<float>(by[y+radius+k])+x);
    value=wasm_f32x4_relaxed_madd(wasm_f32x4_add(a,b),wasm_f32x4_splat(weights[radius+k]),value);
   }
   wasm_v128_store(dst+x,value);
  }
  for(;x<width;x++){float value=centre[x]*weights[radius];for(int k=1;k<=radius;k++)value=std::fma(rows.ptr<float>(by[y+radius-k])[x]+rows.ptr<float>(by[y+radius+k])[x],weights[radius+k],value);dst[x]=value;}
 }
 output.copyTo(destination);
}
