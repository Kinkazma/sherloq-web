// Global OpenCV DFT stages, exposed as independent complete-axis strips.
#include <opencv2/core.hpp>
#include <opencv2/core/hal/hal.hpp>
#include <opencv2/core/hal/interface.h>
#include <vector>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <cfloat>
#include <cstring>
#include <climits>
static unsigned char trunc8(double x){return std::isfinite(x)?static_cast<unsigned char>(static_cast<int64_t>(std::trunc(x))&255):0;}
static cv::Mat np8(const cv::Mat& x){cv::Mat out(x.size(),CV_8U);for(int y=0;y<x.rows;y++)for(int i=0;i<x.cols;i++)out.at<unsigned char>(y,i)=trunc8(x.at<float>(y,i));return out;}
#include "frequency.h"
static std::vector<float> output;
extern "C" {
int frequency_stream_axis(const float* input,int length,int lines,int globalCount,int mode){
 if(!input||length<1||lines<1||globalCount<1||mode<0||mode>3)return 0;
 try{
  int flags=mode==0?CV_HAL_DFT_REAL_OUTPUT|CV_HAL_DFT_COMPLEX_OUTPUT|CV_HAL_DFT_TWO_STAGE:mode==1?CV_HAL_DFT_STAGE_COLS:mode==2?CV_HAL_DFT_INVERSE|CV_HAL_DFT_SCALE|CV_HAL_DFT_TWO_STAGE:CV_HAL_DFT_INVERSE|CV_HAL_DFT_SCALE|CV_HAL_DFT_STAGE_COLS;
  bool buffer=false;auto dft=cv::hal::DFT1D::create(length,globalCount,CV_32F,flags,&buffer);output.assign(size_t(length)*lines*2,0);
  for(int i=0;i<lines;i++)dft->apply(reinterpret_cast<const unsigned char*>(input+size_t(i)*length*(mode==0?1:2)),reinterpret_cast<unsigned char*>(output.data()+size_t(i)*length*2));return 1;
 }catch(...){output.clear();return 0;}
}
int frequency_stream_full(const float* input,int width,int height,int inverse){
 try{cv::Mat src(height,width,inverse?CV_32FC2:CV_32F,const_cast<float*>(input)),dst;cv::dft(src,dst,inverse?cv::DFT_INVERSE|cv::DFT_SCALE:cv::DFT_COMPLEX_OUTPUT);output.assign(dst.ptr<float>(),dst.ptr<float>()+dst.total()*2);return 1;}catch(...){return 0;}
}
int frequency_stream_axis_magnitude(const float* input,int length,int lines,int globalCount,int offset){
 if(length<1||lines<1||globalCount<1||offset<0||int64_t(offset)+lines>globalCount||int64_t(length)*globalCount>INT_MAX)return 0;
 if(!frequency_stream_axis(input,length,lines,globalCount,3))return 0;
 // Keep the native complete-axis transform and both original square-root
 // paths. Their selection belongs to global row-major OpenCV stripes even
 // though the transport here is a strip of full columns.
 const int total=length*globalCount,stripes=globalCount==1?total:std::max(1,cvRound(total/65536.));
 for(int column=0;column<lines;column++){
  int stripe=std::min(stripes-1,int((uint64_t(offset+column)*stripes)/total));
  size_t begin=(uint64_t(stripe)*total+stripes/2)/stripes,end=(uint64_t(stripe+1)*total+stripes/2)/stripes;
  size_t vectorEnd=begin+(end-begin)/2*2;
  for(int row=0;row<length;row++){
   const size_t i=size_t(column)*length+row,position=size_t(row)*globalCount+offset+column;
   while(position>=end&&stripe+1<stripes){stripe++;begin=end;end=(uint64_t(stripe+1)*total+stripes/2)/stripes;vectorEnd=begin+(end-begin)/2*2;}
   const float x=output[i*2],y=output[i*2+1];
   output[i]=position<vectorEnd?sqrtCarotene(x*x+y*y):std::sqrt(std::fma(x,x,y*y));
  }
 }
 output.resize(size_t(length)*lines);return 1;
}
const float* frequency_stream_data(){return output.data();}
int frequency_stream_size(){return output.size();}
void frequency_stream_release(){std::vector<float>().swap(output);}
}

extern "C" {
int frequency_stream_optimal(int n){return cv::getOptimalDFTSize(n);}
int frequency_stream_polar(const float* values,int count,int reconstruction,int offset,int total,int columns){
 try{output.resize(size_t(count)*(reconstruction?1:2));int stripes=columns==1?total:std::max(1,cvRound(total/65536.));int stripe=std::min(stripes-1,int((int64_t(offset)*stripes)/total));
  for(int i=0;i<count;i++){float x=values[i*2],y=values[i*2+1];if(!reconstruction){output[i*2]=frequencyLog(std::sqrt(std::fma(y,y,x*x)));output[i*2+1]=frequencyAngle(y,x);}else{
   size_t begin=(uint64_t(stripe)*total+stripes/2)/stripes,end=(uint64_t(stripe+1)*total+stripes/2)/stripes;while(size_t(offset+i)>=end&&stripe+1<stripes){stripe++;begin=end;end=(uint64_t(stripe+1)*total+stripes/2)/stripes;}size_t vectorEnd=begin+(end-begin)/2*2;output[i]=size_t(offset+i)<vectorEnd?sqrtCarotene(x*x+y*y):std::sqrt(std::fma(x,x,y*y));
  }}return 1;
 }catch(...){return 0;}
}
int frequency_stream_normalize(const float* values,int count,double lo,double hi){
 try{double scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.;float a=scale,b=-lo*double(a);output.resize(count);for(int i=0;i<count;i++)output[i]=std::fma(values[i],a,b);return 1;}catch(...){return 0;}
}
int frequency_stream_normalize_polar(const float* values,int count,double lo0,double hi0,double lo1,double hi1){
 try{
  const double scale0=hi0-lo0>DBL_EPSILON?255.*(1./(hi0-lo0)):0.,scale1=hi1-lo1>DBL_EPSILON?255.*(1./(hi1-lo1)):0.;
  const float a0=scale0,b0=-lo0*double(a0),a1=scale1,b1=-lo1*double(a1);output.resize(size_t(count)*2);
  for(int i=0;i<count;i++){output[i*2]=std::fma(values[i*2],a0,b0);output[i*2+1]=std::fma(values[i*2+1],a1,b1);}return 1;
 }catch(...){return 0;}
}
int frequency_stream_mask_horizontal(int width,int height,int top,int rows,double split,double smooth){
 try{double half=std::sqrt(double(height)*height+double(width)*width)/2.;int radius=int(half*split/100),kernel=2*int(half*smooth/100)+1,r=kernel/2;auto weights=cv::getGaussianKernel(kernel,0,CV_32F);cv::Mat input(rows,width,CV_32F,cv::Scalar(0));cv::circle(input,{width/2,height/2-top},radius,1,cv::FILLED);output.resize(size_t(rows)*width);std::vector<int> representatives(width+1,-1);
  for(int y=0;y<rows;y++){int length=cv::countNonZero(input.row(y)),previous=representatives[length];if(previous>=0){std::copy_n(output.data()+size_t(previous)*width,width,output.data()+size_t(y)*width);continue;}representatives[length]=y;
   if(!length){std::fill_n(output.data()+size_t(y)*width,width,0.f);continue;}
   int left=0,right=width-1;while(!input.at<float>(y,left))left++;while(!input.at<float>(y,right))right--;
   for(int x=0;x<width;x++){
   if(width==1||kernel==1){output[y*width+x]=input.at<float>(y,x);continue;}auto sample=[&](int dx){return input.at<float>(y,cv::borderInterpolate(x+dx,width,cv::BORDER_REFLECT_101));};float sum;
   if(kernel<=5){sum=std::fma(sample(0),weights.at<float>(r),(sample(-1)+sample(1))*weights.at<float>(r+1));if(kernel==5)sum=std::fma(sample(-2)+sample(2),weights.at<float>(r+2),sum);}
   else{
    if(x<left-r||x>right+r){output[y*width+x]=0.f;continue;}
    sum=sample(-r)*weights.at<float>(0);
    if(r<width){
     // A binary row is a single interval. Reflection produces at most these
     // three ordered intervals within x-radius..x+radius. Adding only its
     // ones keeps every binary32 addition in the original order.
     const int period=2*(width-1),starts[3]={-right,left,period-right},ends[3]={-left,right,period-left};int previous=0;
     for(int j=0;j<3;j++){const int first=std::max({1,starts[j]+r-x,previous+1}),last=std::min(kernel-1,ends[j]+r-x);for(int k=first;k<=last;k++)sum+=weights.at<float>(k);previous=std::max(previous,last);}
    }else for(int k=1;k<kernel;k++)sum+=sample(k-r)*weights.at<float>(k);
   }output[y*width+x]=sum;
  }}return 1;
 }catch(...){return 0;}
}
int frequency_stream_mask_vertical(const float* values,int width,int height,int columns,double smooth){
 try{double half=std::sqrt(double(height)*height+double(width)*width)/2.;int kernel=2*int(half*smooth/100)+1,r=kernel/2;auto weights=cv::getGaussianKernel(kernel,0,CV_32F);output.resize(size_t(height)*columns);
  for(int x=0;x<columns;x++){
   const float* src=values+x*height;if(std::all_of(src,src+height,[](float v){return v==0;})){std::fill_n(output.data()+size_t(x)*height,height,0.f);continue;}
   const bool bounded=std::all_of(src,src+height,[](float v){return std::isfinite(v)&&!std::signbit(v);});int top=0,bottom=height-1;
   if(bounded){while(src[top]==0)top++;while(src[bottom]==0)bottom--;}
   for(int y=0;y<height;y++){
    if(height==1||kernel==1){output[x*height+y]=src[y];continue;}
    if(bounded&&(y<top-r||y>bottom+r)){output[x*height+y]=0.f;continue;}
    float sum=src[y]*weights.at<float>(r);int first=1,last=r;
    if(bounded&&r<height){
     first=r+1;last=0;const int period=2*(height-1),starts[4]={top-y,y-bottom,top+y,period-y-bottom},ends[4]={bottom-y,y-top,bottom+y,period-y-top};
     for(int j=0;j<4;j++){const int lo=std::max(1,starts[j]),hi=std::min(r,ends[j]);if(lo<=hi){first=std::min(first,lo);last=std::max(last,hi);}}
    }
    for(int k=first;k<=last;k++){float plus=src[cv::borderInterpolate(y+k,height,cv::BORDER_REFLECT_101)],minus=src[cv::borderInterpolate(y-k,height,cv::BORDER_REFLECT_101)];sum=frequencyMaskFma(plus+minus,weights.at<float>(r+k),sum);}output[x*height+y]=sum;
   }
  }return 1;
 }catch(...){return 0;}
}
}
extern "C" int frequency_stream_gaussian8(const float* input,int width,int height,int radius){
 try{cv::Mat bytes(height,width,CV_8U),blurred;for(int i=0;i<width*height;i++)bytes.ptr<unsigned char>()[i]=trunc8(input[i]);cv::GaussianBlur(bytes,blurred,{radius*2+1,radius*2+1},0);output.resize(size_t(width)*height);for(int i=0;i<width*height;i++)output[i]=blurred.ptr<unsigned char>()[i];return 1;}catch(...){return 0;}
}
extern "C" int frequency_stream_mask_weights(int width,int height,double smooth){
 try{double half=std::sqrt(double(height)*height+double(width)*width)/2.;int kernel=2*int(half*smooth/100)+1;auto weights=cv::getGaussianKernel(kernel,0,CV_32F);output.assign(weights.ptr<float>(),weights.ptr<float>()+kernel);return 1;}catch(...){return 0;}
}
