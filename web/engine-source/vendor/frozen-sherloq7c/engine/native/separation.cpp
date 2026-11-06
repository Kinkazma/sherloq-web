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
// This row-only adapter instantiates the pinned OpenCV 4.11 invoker. Its
// original template/search windows, fixed-point distances and weights remain
// intact; it avoids denoising unused rows of an observed boundary patch.
#ifndef __OPENCV_BUILD
#define __OPENCV_BUILD
#endif
#include "fast_nlmeans_denoising_invoker.hpp"
static cv::Mat nlmSelectedRows(const cv::Mat& src,int start,int rows,float strength){
 cv::Mat target(src.size(),src.type());
 if(src.channels()==1)FastNlMeansDenoisingInvoker<uchar,int,unsigned,DistSquared,int>(src,target,7,21,&strength)(cv::Range(start,start+rows));
 else FastNlMeansDenoisingInvoker<cv::Vec2b,int,unsigned,DistSquared,int>(src,target,7,21,&strength)(cv::Range(start,start+rows));
 return target;
}

// Pinned NLM point arithmetic, with no discarded output centres. Distances are
// the same exact integer sums as the rolling invoker; native quantization,
// weights, accumulation order and rounded division are reused verbatim.
template<class T> static cv::Mat nlmSelectedPoints(const cv::Mat& source,float strength){
 constexpr int templateRadius=3,searchRadius=10,side=27,shift=6;
 const int multiplier=std::min<int>(std::numeric_limits<int>::max()/(21*21*pixelInfo<T>::sampleMax()),pixelInfo<int>::sampleMax());
 const double scale=double(1<<shift)/49;const int size=int(DistSquared::maxDist<T>()/scale+1);std::vector<int> weight(size);for(int i=0;i<size;i++)weight[i]=DistSquared::calcWeight<T,int>(i*scale,&strength,multiplier);
 cv::Mat result(1,source.cols,source.type(),cv::Scalar::all(0));for(int centre=13;centre<source.cols;centre+=side){int estimate[pixelInfo<T>::channels]={0},mass[1]={0};
  for(int dy=-searchRadius;dy<=searchRadius;dy++)for(int dx=-searchRadius;dx<=searchRadius;dx++){int distance=0;for(int ty=-templateRadius;ty<=templateRadius;ty++)for(int tx=-templateRadius;tx<=templateRadius;tx++)distance+=DistSquared::calcDist<T>(source.at<T>(13+ty,centre+tx),source.at<T>(13+dy+ty,centre+dx+tx));const int w=weight[distance>>shift];incWithWeight<T,int,int>(estimate,mass,w,source.at<T>(13+dy,centre+dx));}
  divByWeightsSum<int,unsigned,pixelInfo<T>::channels,1>(estimate,mass);result.at<T>(0,centre)=saturateCastFromArray<T,int>(estimate);
 }return result;
}
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
int separation_nlm_rows(const uint8_t* rgb,int width,int height,int start,int rows,int radius,int grayscale,uint8_t* output){
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),original;cv::cvtColor(input,original,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);const float strength=float(radius*2+1);
  cv::Mat target(rows,width,CV_8UC3,output);
  if(grayscale){cv::Mat denoised=nlmSelectedRows(original,start,rows,strength);cv::cvtColor(denoised.rowRange(start,start+rows),target,cv::COLOR_GRAY2RGB);}
  else{
   cv::Mat lab;cv::cvtColor(original,lab,cv::COLOR_LBGR2Lab);cv::Mat luminance(original.size(),CV_8UC1),chroma(original.size(),CV_8UC2),parts[]={luminance,chroma};const int channels[]={0,0,1,1,2,2};cv::mixChannels(&lab,1,parts,2,channels,3);
   cv::Mat l=nlmSelectedRows(luminance,start,rows,strength),ab=nlmSelectedRows(chroma,start,rows,strength),selected[]={l.rowRange(start,start+rows),ab.rowRange(start,start+rows)},result(rows,width,CV_8UC3),bgr;
   cv::mixChannels(selected,2,&result,1,channels,3);cv::cvtColor(result,bgr,cv::COLOR_Lab2LBGR);cv::cvtColor(bgr,target,cv::COLOR_BGR2RGB);
  }
  return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}

// Observed ROI edges retain the same kernel footprint and grayscale transform.
// Missing observations contribute neither values nor normalization mass.
int separation_observed_rows(const uint8_t* rgb,const uint8_t* mask,int width,int height,int start,int rows,int mode,int radius,int sigma,int grayscale,int originX,int nativeWidth,uint8_t* output){
 try{
  if(mode<0||mode>3||radius<1||radius>10||sigma<1||sigma>200)return -2;
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),source;cv::cvtColor(input,source,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);const int cn=source.channels(),lanes=cn==1?4:16;
  const int border=mode==0?cv::BORDER_REPLICATE:cv::BORDER_REFLECT_101;cv::Mat gaussian=mode==1?cv::getGaussianKernel(2*radius+1,0,CV_64F):cv::Mat();
  std::vector<float> colorWeight(cn*256),spaceWeight;std::vector<cv::Point> taps;
  if(mode==3){const double coeff=-.5/(double(sigma)*sigma);for(int i=0;i<cn*256;i++)colorWeight[i]=float(std::exp(i*i*coeff));for(int dy=-radius;dy<=radius;dy++)for(int dx=-radius;dx<=radius;dx++){const double r=std::sqrt(double(dx*dx+dy*dy));if(r>radius)continue;taps.push_back({dx,dy});spaceWeight.push_back(float(std::exp(r*r*coeff)));}}
  for(int yy=0;yy<rows;yy++)for(int x=0;x<width;x++){
   const int y=start+yy;uchar* target=output+(yy*width+x)*3;if(mask[y*width+x]!=1){target[0]=target[1]=target[2]=0;continue;}const uchar* centre=source.ptr<uchar>(y)+x*cn;uchar value[3]={0,0,0};
   if(mode==3){float sum[3]={0,0,0},mass=0;size_t k=0;
    auto weighted=[&](size_t i,float& weight,float* products){const int sx=cv::borderInterpolate(x+taps[i].x,width,border),sy=cv::borderInterpolate(y+taps[i].y,height,border);weight=0;for(int c=0;c<cn;c++)products[c]=0;if(mask[sy*width+sx]!=1)return;const uchar* pixel=source.ptr<uchar>(sy)+sx*cn;int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(pixel[c])-centre[c]);weight=spaceWeight[i]*colorWeight[distance];for(int c=0;c<cn;c++)products[c]=pixel[c]*weight;};
    if(x+originX>=nativeWidth/lanes*lanes)for(;k+3<taps.size();k+=4){float w[4],v[4][3];for(int t=0;t<4;t++)weighted(k+t,w[t],v[t]);mass+=(w[0]+w[1])+(w[2]+w[3]);for(int c=0;c<cn;c++)sum[c]+=(v[0][c]+v[1][c])+(v[2][c]+v[3][c]);}
    for(;k<taps.size();k++){const int sx=cv::borderInterpolate(x+taps[k].x,width,border),sy=cv::borderInterpolate(y+taps[k].y,height,border);if(mask[sy*width+sx]!=1)continue;const uchar* pixel=source.ptr<uchar>(sy)+sx*cn;int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(pixel[c])-centre[c]);float w=spaceWeight[k]*colorWeight[distance];mass+=w;for(int c=0;c<cn;c++)sum[c]=std::fma(float(pixel[c]),w,sum[c]);}
    const float inverse=1.f/mass;for(int c=0;c<cn;c++)value[c]=cv::saturate_cast<uchar>(cn==1?sum[c]/mass:sum[c]*inverse);
   }else{std::vector<uchar> values[3];double sum[3]={0,0,0},mass=0;for(int dy=-radius;dy<=radius;dy++)for(int dx=-radius;dx<=radius;dx++){
     const int sx=cv::borderInterpolate(x+dx,width,border),sy=cv::borderInterpolate(y+dy,height,border);if(mask[sy*width+sx]!=1)continue;const uchar* pixel=source.ptr<uchar>(sy)+sx*cn;if(mode==0){for(int c=0;c<cn;c++)values[c].push_back(pixel[c]);}else{double w=mode==1?gaussian.at<double>(dy+radius)*gaussian.at<double>(dx+radius):1.;mass+=w;for(int c=0;c<cn;c++)sum[c]+=pixel[c]*w;}}
    for(int c=0;c<cn;c++)if(mode==0){auto& v=values[c];const size_t mid=v.size()/2;std::nth_element(v.begin(),v.begin()+mid,v.end());value[c]=v[mid];}else value[c]=cv::saturate_cast<uchar>(sum[c]/mass);
   }
   if(grayscale)target[0]=target[1]=target[2]=value[0];else{target[0]=value[2];target[1]=value[1];target[2]=value[0];}
  }return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}

int separation_nlm_points(const uint8_t* rgb,int width,int radius,int grayscale,uint8_t* output){
 try{if(width<=0||width%27||radius<1||radius>10)return -2;cv::Mat input(27,width,CV_8UC3,const_cast<uint8_t*>(rgb)),original;cv::cvtColor(input,original,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);const float strength=float(radius*2+1);cv::Mat target(1,width,CV_8UC3,output);
  if(grayscale){cv::Mat denoised=nlmSelectedPoints<uchar>(original,strength);cv::cvtColor(denoised,target,cv::COLOR_GRAY2RGB);}
  else{cv::Mat lab;cv::cvtColor(original,lab,cv::COLOR_LBGR2Lab);cv::Mat luminance(original.size(),CV_8UC1),chroma(original.size(),CV_8UC2),parts[]={luminance,chroma};const int channels[]={0,0,1,1,2,2};cv::mixChannels(&lab,1,parts,2,channels,3);cv::Mat l=nlmSelectedPoints<uchar>(luminance,strength),ab=nlmSelectedPoints<cv::Vec2b>(chroma,strength),selected[]={l,ab},result(1,width,CV_8UC3),bgr;cv::mixChannels(selected,2,&result,1,channels,3);cv::cvtColor(result,bgr,cv::COLOR_Lab2LBGR);cv::cvtColor(bgr,target,cv::COLOR_BGR2RGB);}return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
}
