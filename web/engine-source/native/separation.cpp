// Full-width row windows preserve OpenCV vector/scalar tails. The owner supplies
// real neighboring rows and crops only after the original filter has completed.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/photo.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
#include "separation-bilateral.h"
extern "C" {
int separation_rows(const uint8_t* rgb,int width,int height,int start,int rows,int mode,int radius,int sigma,int grayscale,uint8_t* output){
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),original,filtered,result;
  cv::cvtColor(input,original,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);
  const int kernel=radius*2+1;
  switch(mode){
   case 0:cv::medianBlur(original,filtered,kernel);break;
   case 1:cv::GaussianBlur(original,filtered,{kernel,kernel},0);break;
   case 2:cv::blur(original,filtered,{kernel,kernel});break;
   case 3:filtered=bilateralReference(original,radius,sigma);break;
   case 4:if(grayscale)cv::fastNlMeansDenoising(original,filtered,kernel);else cv::fastNlMeansDenoisingColored(original,filtered,kernel,kernel);break;
   default:return -2;
  }
  cv::Mat target(rows,width,CV_8UC3,output);
  cv::cvtColor(filtered.rowRange(start,start+rows),target,grayscale?cv::COLOR_GRAY2RGB:cv::COLOR_BGR2RGB);
  return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
}
