#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/video/tracking.hpp>
#include <cmath>
#include <cfloat>
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>
static unsigned char trunc8(double x){return std::isfinite(x)?static_cast<unsigned char>(static_cast<int64_t>(std::trunc(x))&255):0;}
static cv::Mat np8(const cv::Mat& x){cv::Mat out(x.rows,x.cols,CV_MAKETYPE(CV_8U,x.channels()));for(int y=0;y<x.rows;y++)for(int i=0;i<x.cols*x.channels();i++)out.ptr<unsigned char>(y)[i]=trunc8(x.ptr<float>(y)[i]);return out;}
static cv::Mat norm(const cv::Mat& x){cv::Mat out;cv::normalize(x,out,0,255,cv::NORM_MINMAX);return out;}
#include "stereo.h"
static cv::Mat leftGray,rightGray,flow;
static std::vector<double> sums;
static std::vector<float> floating;
extern "C" {
int stereo_stream_search(const unsigned char* rgb,int width,int height,int outputRows){
 try{if(width<1||height<1||outputRows<1||height>outputRows*2||height<outputRows*2-1)return 0;
  cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),gray,small;cv::cvtColor(input,gray,cv::COLOR_RGB2GRAY);
  if(height<outputRows*2)cv::copyMakeBorder(gray,gray,0,1,0,0,cv::BORDER_REPLICATE);
  cv::resize(gray,small,{},1,.5);sums.assign(std::max(0,width/3-10),0);
  for(int i=0;i<int(sums.size());i++){const int offset=i+10;uint64_t sum=0;for(int y=0;y<small.rows;y++){const auto* row=small.ptr<unsigned char>(y);for(int x=0;x<width-offset;x++)sum+=std::abs(int(row[x+offset])-int(row[x]));}sums[i]=double(sum);}return 1;
 }catch(...){return 0;}
}
const double* stereo_stream_sums(){return sums.data();}
int stereo_stream_create(int width,int height){try{if(width<1||height<1)return 0;leftGray.create(height,width,CV_8U);rightGray.create(height,width,CV_8U);return 1;}catch(...){return 0;}}
int stereo_stream_input(const unsigned char* rgb,int sourceWidth,int top,int rows,int offset){
 try{if(offset<1||sourceWidth-offset!=leftGray.cols||top<0||rows<1||top+rows>leftGray.rows)return 0;cv::Mat input(rows,sourceWidth,CV_8UC3,const_cast<unsigned char*>(rgb)),gray;cv::cvtColor(input,gray,cv::COLOR_RGB2GRAY);gray.colRange(offset,sourceWidth).copyTo(leftGray.rowRange(top,top+rows));gray.colRange(0,sourceWidth-offset).copyTo(rightGray.rowRange(top,top+rows));return 1;}catch(...){return 0;}
}
int stereo_stream_flow(int original){try{stereoFastArithmetic=!original;std::fill(stereoTimings,stereoTimings+5,0.);cv::calcOpticalFlowFarneback(leftGray,rightGray,flow,.5,5,15,5,5,1.2,cv::OPTFLOW_FARNEBACK_GAUSSIAN);cv::extractChannel(flow,flow,0);leftGray.release();rightGray.release();return 1;}catch(...){return 0;}}
const float* stereo_stream_output(){return flow.ptr<float>();}
int stereo_stream_normalize(const float* input,int count,double lo,double hi,double maximum){
 try{float a=maximum*(hi-lo>DBL_EPSILON?1./(hi-lo):0.),b=-float(lo*double(a));floating.resize(count);for(int i=0;i<count;i++)floating[i]=std::fma(input[i],a,b);return 1;}catch(...){return 0;}
}
const float* stereo_stream_floating(){return floating.data();}
void stereo_stream_release(){leftGray.release();rightGray.release();flow.release();std::vector<double>().swap(sums);std::vector<float>().swap(floating);}
}
