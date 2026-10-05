// Bounded statistics with GLOBAL extrema and the original OpenCV correlation grid.
#include <opencv2/core.hpp>
#include <opencv2/core/hal/hal.hpp>
#include <opencv2/core/hal/interface.h>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include "../.build/noisesniffer-sum.h"
#include "noisesniffer.h"
static std::vector<unsigned char> valid;
static std::vector<double> means;
static std::vector<float> variance;
extern "C" {
int noisesniffer_stream_blocks(const unsigned char* rgb,int width,int height,int w,const int* extrema){
 try{
  if(!rgb||!extrema||width<w||height<w||(w!=3&&w!=5&&w!=7&&w!=8))return 0;
  const int rows=height-w+1,cols=width-w+1;const size_t n=size_t(rows)*cols;
  valid.resize(n);means.assign(w==8?0:3*n,0);variance.resize(3*n);
  // A sliding integer sum avoids a full-band integral allocation. Strict bounds
  // come from the complete source, never this strip's minimum and maximum.
  std::vector<int> vertical(width,0);
  auto row=[&](int y,int sign){for(int x=0;x<width;x++){bool ok=true;for(int c=0;c<3;c++){int v=rgb[(size_t(y)*width+x)*3+c];ok&=v>extrema[c]&&v<extrema[c+3];}vertical[x]+=sign*int(ok);}};
  for(int y=0;y<w;y++)row(y,1);
  cv_prnu_fma_mode(1);const double coefficient=1./double(w*w);
  for(int y=0;y<rows;y++){
   if(y){row(y-1,-1);row(y+w-1,1);}int sum=0;for(int x=0;x<w;x++)sum+=vertical[x];
   for(int x=0;x<cols;x++){
    if(x)sum+=vertical[x+w-1]-vertical[x-1];valid[size_t(y)*cols+x]=sum==w*w;
    if(w!=8)for(int c=0;c<3;c++){double v=0;for(int dy=0;dy<w;dy++)for(int dx=0;dx<w;dx++)v=sherloq_prnu_fma64(coefficient,rgb[(size_t(y+dy)*width+x+dx)*3+c],v);means[(size_t(y)*cols+x)*3+c]=v;}
   }
  }
  return cv_noisesniffer_statistics(rgb,width,height,w,nullptr,nullptr,variance.data(),2,1);
 }catch(...){return 0;}
}
// rgb includes the seven-pixel footprint, reflected using the GLOBAL source.
// outWidth/outHeight refer to the original full-image filter block, before crop.
int noisesniffer_stream_mean8(const unsigned char* rgb,int outWidth,int outHeight,int dftWidth,int dftHeight,int blockHeight){
 try{
  if(!rgb||outWidth<1||outHeight<1||outWidth+7>dftWidth||outHeight+7>dftHeight||blockHeight<outHeight)return 0;
  cv::Mat kernel(dftHeight,dftWidth,CV_64F,cv::Scalar(0)),data(dftHeight,dftWidth,CV_64F);
  for(int y=0;y<8;y++)for(int x=0;x<8;x++)kernel.at<double>(y,x)=1./64.;
  auto k=cv::hal::DFT2D::create(dftWidth,dftHeight,CV_64F,1,1,CV_HAL_DFT_IS_INPLACE,8);k->apply(kernel.data,int(kernel.step),kernel.data,int(kernel.step));
  auto forward=cv::hal::DFT2D::create(dftWidth,dftHeight,CV_64F,1,1,CV_HAL_DFT_IS_INPLACE,blockHeight+7);
  auto inverse=cv::hal::DFT2D::create(dftWidth,dftHeight,CV_64F,1,1,CV_HAL_DFT_IS_INPLACE|CV_HAL_DFT_INVERSE|CV_HAL_DFT_SCALE,blockHeight);
  means.resize(size_t(outWidth)*outHeight*3);
  for(int c=0;c<3;c++){
   data=cv::Scalar(0);for(int y=0;y<outHeight+7;y++)for(int x=0;x<outWidth+7;x++)data.at<double>(y,x)=rgb[(size_t(y)*(outWidth+7)+x)*3+c];
   if(outHeight==blockHeight)forward->apply(data.data,int(data.step),data.data,int(data.step));else cv::dft(data,data,0,outHeight+7);
   cv::mulSpectrums(data,kernel,data,0,true);
   if(outHeight==blockHeight)inverse->apply(data.data,int(data.step),data.data,int(data.step));else cv::dft(data,data,cv::DFT_INVERSE|cv::DFT_SCALE,outHeight);
   for(int y=0;y<outHeight;y++)for(int x=0;x<outWidth;x++)means[(size_t(y)*outWidth+x)*3+c]=data.at<double>(y,x);
  }return 1;
 }catch(...){return 0;}
}
int noisesniffer_stream_optimal(int n){return cv::getOptimalDFTSize(n);}
const unsigned char* noisesniffer_stream_valid(){return valid.data();}
const double* noisesniffer_stream_means(){return means.data();}
const float* noisesniffer_stream_variance(){return variance.data();}
void noisesniffer_stream_release(){std::vector<unsigned char>().swap(valid);std::vector<double>().swap(means);std::vector<float>().swap(variance);}
}
