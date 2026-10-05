// Full oriented rows preserve the qualified vector/scalar HSV tails.
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
extern "C" {
int adjust_local_rows(const uint8_t* rgb,int width,int height,int start,int rows,const double* params,uint8_t* out){
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);
  double local[12];std::copy(params,params+12,local);local[9]=255;local[10]=0;local[11]=0;
  cv::Mat processed=adjust(bgr,local),core=processed.rowRange(start,start+rows),target(rows,width,CV_8UC3,out);
  if(params[10])hsv8Reference(core).copyTo(target);else cv::cvtColor(core,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int adjust_tile_histogram(const uint8_t* hsv,int width,int rows,int y0,int paddedWidth,int paddedHeight,int32_t* hist){
 std::fill(hist,hist+64*256,0);int tw=paddedWidth/8,th=paddedHeight/8;
 for(int y=0;y<rows;y++)for(int x=0;x<paddedWidth;x++){int sx=x<width?x:cv::borderInterpolate(x,width,cv::BORDER_REFLECT_101);hist[(((y0+y)/th)*8+x/tw)*256+hsv[(y*width+sx)*3+2]]++;}return 1;
}
int adjust_tables(const int32_t* hist,int area,int level,uint8_t* tables){
 const double clips[]={2,5,10,20};const int limit=std::max(int(clips[level-2]*area/256),1);float scale=255.f/area;
 for(int tile=0;tile<64;tile++){int bins[256],clipped=0;for(int i=0;i<256;i++){bins[i]=hist[tile*256+i];if(bins[i]>limit){clipped+=bins[i]-limit;bins[i]=limit;}}
  int batch=clipped/256,residual=clipped-batch*256;for(int& v:bins)v+=batch;
  if(residual){int step=std::max(256/residual,1);for(int i=0;i<256&&residual;i+=step,residual--)bins[i]++;}
  int sum=0;for(int i=0;i<256;i++){sum+=bins[i];tables[tile*256+i]=cv::saturate_cast<uchar>(sum*scale);}
 }return 1;
}
int adjust_map_rows(const uint8_t* hsv,int width,int rows,int y0,int paddedWidth,int paddedHeight,int kind,const uint8_t* tables,uint8_t* out){
 try{
  cv::Mat values(rows,width,CV_8UC3);std::copy(hsv,hsv+size_t(width)*rows*3,values.ptr<uchar>());const int tw=paddedWidth/8,th=paddedHeight/8;float ix=1.f/tw,iy=1.f/th;
  for(int y=0;y<rows;y++)for(int x=0;x<width;x++){
   auto& pixel=values.at<cv::Vec3b>(y,x);const int v=pixel[2];if(kind==1){pixel[2]=tables[v];continue;}
   float fx=std::fma(float(x),ix,-.5f),fy=std::fma(float(y+y0),iy,-.5f);int x1=cvFloor(fx),y1=cvFloor(fy),x2=std::min(x1+1,7),y2=std::min(y1+1,7);float a=fx-x1,b=fy-y1;a=std::clamp(a,0.f,1.f);b=std::clamp(b,0.f,1.f);x1=std::max(x1,0);y1=std::max(y1,0);
   float upper=std::fma(float(tables[(y1*8+x1)*256+v]),1.f-a,tables[(y1*8+x2)*256+v]*a),lower=std::fma(float(tables[(y2*8+x1)*256+v]),1.f-a,tables[(y2*8+x2)*256+v]*a);
   pixel[2]=cv::saturate_cast<uchar>(std::fma(upper,1.f-b,lower*b));
  }
  cv::Mat bgr;hsvToBgr(values,bgr);cv::Mat target(rows,width,CV_8UC3,out);cv::cvtColor(bgr,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
double adjust_otsu(const int32_t* hist,int count){
 // Original OpenCV histogram reduction/order; no tile thresholds or rebinning.
 double mu=0,scale=1./count;for(int i=0;i<256;i++)mu+=i*double(hist[i]);mu*=scale;double mu1=0,q1=0,max_sigma=0,max_val=0;
 for(int i=0;i<256;i++){double p_i=hist[i]*scale;mu1*=q1;q1+=p_i;double q2=1.-q1;if(std::min(q1,q2)<FLT_EPSILON||std::max(q1,q2)>1.-FLT_EPSILON)continue;mu1=(mu1+i*p_i)/q1;double mu2=(mu-q1*mu1)/q2,sigma=q1*q2*(mu1-mu2)*(mu1-mu2);if(sigma>max_sigma){max_sigma=sigma;max_val=i;}}
 return max_val;
}
}
