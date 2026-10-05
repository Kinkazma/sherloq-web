// Offline reproduction of OpenCV 4.11 float Gaussian row/column accumulation.
// See modules/imgproc/src/filter.simd.hpp RowVec_32f / SymmColumnVec_32f.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
static void siftNativeGaussian(cv::InputArray source,cv::OutputArray destination,cv::Size size,double sigmaX,double sigmaY){
 const cv::Mat input=source.getMat();CV_Assert(input.type()==CV_32F&&size.empty()&&sigmaX==sigmaY);
 const int width=input.cols,height=input.rows,kernelSize=cvRound(sigmaX*8+1)|1,radius=kernelSize/2;CV_Assert(kernelSize>=7);
 const cv::Mat kernel=cv::getGaussianKernel(kernelSize,sigmaX,CV_32F);const float* weights=kernel.ptr<float>();
 cv::Mat rows(input.size(),CV_32F),output(input.size(),CV_32F);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){
  float value=input.at<float>(y,cv::borderInterpolate(x-radius,width,cv::BORDER_REFLECT_101))*weights[0];
  for(int k=1;k<kernelSize;k++)value=std::fma(input.at<float>(y,cv::borderInterpolate(x+k-radius,width,cv::BORDER_REFLECT_101)),weights[k],value);
  rows.at<float>(y,x)=value;
 }
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){
  float value=rows.at<float>(y,x)*weights[radius];
  for(int k=1;k<=radius;k++)value=std::fma(rows.at<float>(cv::borderInterpolate(y-k,height,cv::BORDER_REFLECT_101),x)+rows.at<float>(cv::borderInterpolate(y+k,height,cv::BORDER_REFLECT_101),x),weights[radius+k],value);
  output.at<float>(y,x)=value;
 }
 output.copyTo(destination);
}
