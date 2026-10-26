// Coordinate-aware dispatch of the existing qualified OpenCV adjustment.
// The unchanged adjust-bands.cpp supplies local arithmetic, tables and Otsu.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
#include <cfloat>
#include "gamma-lut.h"
#include "hsv-tables.h"
#include "adjust-reference.h"
extern "C" int adjust_local_rows(const uint8_t*,int,int,int,int,const double*,uint8_t*);
static void mapIndexed(cv::Mat& hsv,int count,const int* positions,const int* xs,const int* ys,int outputWidth,int pw,int ph,int kind,const uint8_t* tables){
 const int tw=pw/8,th=ph/8;const float ix=1.f/tw,iy=1.f/th;
 for(int j=0;j<count;j++){
  auto& pixel=hsv.at<cv::Vec3b>(j/hsv.cols,j%hsv.cols);const int v=pixel[2];
  if(kind==1){pixel[2]=tables[v];continue;}
  const int position=positions[std::min(j,count-1)],x=xs[position%outputWidth],y=ys[position/outputWidth];
  float fx=std::fma(float(x),ix,-.5f),fy=std::fma(float(y),iy,-.5f);int x1=cvFloor(fx),y1=cvFloor(fy),x2=std::min(x1+1,7),y2=std::min(y1+1,7);float a=fx-x1,b=fy-y1;a=std::clamp(a,0.f,1.f);b=std::clamp(b,0.f,1.f);x1=std::max(x1,0);y1=std::max(y1,0);
  float upper=std::fma(float(tables[(y1*8+x1)*256+v]),1.f-a,tables[(y1*8+x2)*256+v]*a),lower=std::fma(float(tables[(y2*8+x1)*256+v]),1.f-a,tables[(y2*8+x2)*256+v]*a);
  pixel[2]=cv::saturate_cast<uchar>(std::fma(upper,1.f-b,lower*b));
 }
}
extern "C" {
int pdf_adjust_blur_rows(const uint8_t* rgb,int width,int height,int start,int rows,int radius,uint8_t* out){
 if(!rgb||!out||width<1||height<1||start<0||rows<1||start+rows>height||radius<1||radius>25)return -2;
 try{cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),blurred;cv::GaussianBlur(input,blurred,{2*radius+1,2*radius+1},0);cv::Mat target(rows,width,CV_8UC3,out);blurred.rowRange(start,start+rows).copyTo(target);return 1;}
 catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int pdf_adjust_fine_prefix(const uint8_t* rgb,const uint8_t* blur,int width,int height,const int32_t* xs,const int32_t* ys,int referenceWidth,int referenceHeight,int pw,int ph,const double* params,const uint8_t* tables,uint8_t* out){
 if(!rgb||!out||!xs||!ys||!params||width<1||height<1||referenceWidth<1||referenceHeight<1||int64_t(width)*height>INT32_MAX||pw<referenceWidth||pw>referenceWidth+8||pw%8||ph<referenceHeight||ph>referenceHeight+8||ph%8)return -2;
 const int kind=int(params[10]),radius=int(params[8])/4;if(kind<0||kind>5||(kind&&!tables)||(radius&&!blur))return -2;
 for(int x=0;x<width;x++)if(xs[x]<0||xs[x]>=referenceWidth)return -2;for(int y=0;y<height;y++)if(ys[y]<0||ys[y]>=referenceHeight)return -2;
 try{
  constexpr int capacity=8192;const int n=width*height,vector16=referenceWidth/16*16,vector8=referenceWidth/8*8;
  std::vector<uint8_t> packed(capacity*3),neighborhood(radius?capacity*3:0),prefix(capacity*3);std::vector<int> positions(capacity);double local[12];std::copy(params,params+12,local);local[8]=0;
  int written=0;
  for(int cls=0;cls<3;cls++){
   const int columns=cls==0?16:cls==1?8:1;int count=0;
   const auto process=[&](){if(!count)return;const int rows=(count+columns-1)/columns,total=rows*columns;
    for(int j=count;j<total;j++){positions[j]=positions[count-1];for(int c=0;c<3;c++){packed[j*3+c]=packed[(count-1)*3+c];if(radius)neighborhood[j*3+c]=neighborhood[(count-1)*3+c];}}
    if(radius){cv::Mat input(rows,columns,CV_8UC3,packed.data()),blurred(rows,columns,CV_8UC3,neighborhood.data());cv::addWeighted(input,1.5,blurred,-.5,0,input);}
    const int status=adjust_local_rows(packed.data(),columns,rows,0,rows,local,prefix.data());if(status!=1)throw status;
    if(kind){cv::Mat hsv(rows,columns,CV_8UC3,prefix.data());mapIndexed(hsv,total,positions.data(),xs,ys,width,pw,ph,kind,tables);cv::Mat bgr;hsvToBgr(hsv,bgr);cv::Mat result(rows,columns,CV_8UC3,prefix.data());cv::cvtColor(bgr,result,cv::COLOR_BGR2RGB);}
    for(int j=0;j<count;j++)for(int c=0;c<3;c++)out[positions[j]*3+c]=prefix[j*3+c];written+=count;count=0;
   };
   for(int i=0;i<n;i++){const int x=xs[i%width],category=x<vector16?0:x<vector8?1:2;if(category!=cls)continue;positions[count]=i;for(int c=0;c<3;c++){packed[count*3+c]=rgb[i*3+c];if(radius)neighborhood[count*3+c]=blur[i*3+c];}if(++count==capacity)process();}
   process();
  }
  return written==n?1:-2;
 }catch(int status){return status;}catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
}
