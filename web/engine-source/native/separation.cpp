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
#include <cfloat>
#include <cstring>
#include "stereo-fma.h"
#include "separation-native16.h"
#include "separation-nlm16.h"
extern "C" int separation_nlm_rows16(const uint16_t* rgb,int width,int height,int start,int rows,int radius,int gray,uint16_t* output){
 try{
  if(!rgb||!output||width<=0||height<=0||start<0||rows<=0||start>height-rows||radius<1||radius>10||(gray!=0&&gray!=1))return -2;
  separation_nlm16::rows(rgb,width,height,start,rows,radius,gray,output);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
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
// The same OpenCV operators consume exact uint16 codes. This entry does not
// change the historical uint8 functions or introduce a size-specific engine.
int separation_rows16(const uint16_t* rgb,int width,int height,int start,int rows,int mode,int radius,int grayscale,uint16_t* output){
 try{
  if(width<=0||height<=0||start<0||rows<=0||start>height-rows||(mode!=1&&mode!=2)||radius<1||radius>10)return -2;
  cv::Mat input(height,width,CV_16UC3,const_cast<uint16_t*>(rgb)),original,filtered;
  cv::cvtColor(input,original,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);
  const int kernel=radius*2+1;
  if(mode==1)cv::GaussianBlur(original,filtered,{kernel,kernel},0);
  else cv::blur(original,filtered,{kernel,kernel});
  cv::Mat target(rows,width,CV_16UC3,output);
  cv::cvtColor(filtered.rowRange(start,start+rows),target,grayscale?cv::COLOR_GRAY2RGB:cv::COLOR_BGR2RGB);
  return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
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

// Native16 adjustment prefix, sharing the existing Gaussian actor and its
// OpenCV fixed-point kernel. Public separation_rows[16] remain unchanged.
// The optional blurred argument contains only the selected output rows.
static uint16_t adjustCode16(float value){
 const float v=std::max(0.f,std::min(65535.f,value));const uint32_t q=uint32_t(v);const float d=v-float(q);
 return uint16_t(q+uint32_t(d>.5f||(d==.5f&&(q&1u))));
}
static uint16_t adjustSharp16(uint16_t source,uint16_t blur){
 const int v=3*int(source)-int(blur);if(v<=0)return 0;if(v>=131070)return 65535;
 const int q=v/2;return uint16_t(q+((v&1)&&(q&1)));
}
extern "C" int adjust_prefix16_rows(const uint16_t* rgb,int width,int height,int start,int rows,int brightness,int saturation,int hue,int sharpen,int originX,int nativeWidth,const uint16_t* blurred,uint16_t* output){
 try{
  if(!rgb||!output||width<=0||height<=0||start<0||rows<=0||start>height-rows||brightness< -255||brightness>255||saturation< -255||saturation>255||hue<0||hue>180||sharpen<0||sharpen>100||originX<0||nativeWidth<width||originX>nativeWidth-width)return -2;
  const int radius=sharpen/4;const bool hsv=brightness||saturation||hue;cv::Mat filtered;
  if(radius&&!blurred){cv::Mat input(height,width,CV_16UC3,const_cast<uint16_t*>(rgb));cv::GaussianBlur(input,filtered,{2*radius+1,2*radius+1},0);}
  stereoFastArithmetic=true;const float ds=float(saturation)/255.f,dv=float(brightness)/255.f,dh=float(hue*2);
  for(int y=0;y<rows;y++)for(int x=0;x<width;x++){
   const size_t at=(size_t(start+y)*width+x)*3,ot=(size_t(y)*width+x)*3;uint16_t codes[3];
   for(int c=0;c<3;c++)codes[c]=radius?adjustSharp16(rgb[at+c],blurred?blurred[ot+c]:filtered.ptr<uint16_t>(start+y)[x*3+c]):rgb[at+c];
   if(!hsv){for(int c=0;c<3;c++)output[ot+c]=codes[c];continue;}
   // Same float32 forward arithmetic as plots_values16, on the native x grid.
   const float r=codes[0]/65535.f,g=codes[1]/65535.f,b=codes[2]/65535.f,hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;
   const bool prefix=x+originX<nativeWidth/4*4;const float part=hi==r?(g<b?360.f:0.f):(hi==g?120.f:240.f),base=hi==r?g-b:(hi==g?b-r:r-g),inv=float(60./(d+FLT_EPSILON));
   float h=sherloq_stereo_fma(base,inv,prefix?part:(hi==r?0.f:part));if(h<0)h+=360.f;
   h+=dh;if(h>=360.f)h-=360.f;if(h>=360.f)h-=360.f;
   const float s=std::max(0.f,std::min(1.f,d/(std::abs(hi)+FLT_EPSILON)+ds)),v=std::max(0.f,std::min(1.f,hi+dv));
   const float sector=h/60.f;const int k=int(sector);const float f=sector-float(k),p=v*(1.f-s),q=v*(1.f-s*f),t=v*(1.f-s*(1.f-f));
   float rr,gg,bb;switch(k%6){case 0:rr=v;gg=t;bb=p;break;case 1:rr=q;gg=v;bb=p;break;case 2:rr=p;gg=v;bb=t;break;case 3:rr=p;gg=q;bb=v;break;case 4:rr=t;gg=p;bb=v;break;default:rr=v;gg=p;bb=q;break;}
   output[ot]=adjustCode16(rr*65535.f);output[ot+1]=adjustCode16(gg*65535.f);output[ot+2]=adjustCode16(bb*65535.f);
  }return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}

// Extended typed ABI. The old uint16 and all uint8 exports above are intact.
extern "C" int separation_rows16_ex(const uint16_t* rgb,int width,int height,int start,int rows,int mode,int radius,int sigmaUI,int grayscale,int originX,int nativeWidth,uint16_t* output){
 try{
  if(!rgb||!output||width<=0||height<=0||start<0||rows<=0||start>height-rows||mode<0||mode>3||radius<1||radius>10||sigmaUI<1||sigmaUI>200||(grayscale!=0&&grayscale!=1)||originX<0||nativeWidth<int64_t(originX)+width)return -2;
  if(mode==1||mode==2)return separation_rows16(rgb,width,height,start,rows,mode,radius,grayscale,output);
  cv::Mat input(height,width,CV_16UC3,const_cast<uint16_t*>(rgb)),original,filtered;
  cv::cvtColor(input,original,grayscale?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);
  const int cn=original.channels(),kernel=2*radius+1;
  if(mode==0&&radius<=2)cv::medianBlur(original,filtered,kernel);
  else{
   filtered.create(rows,width,original.type());
   if(mode==0){
    std::vector<uint16_t> values(kernel*kernel);
    for(int yy=0;yy<rows;yy++)for(int x=0;x<width;x++)for(int c=0;c<cn;c++){
     int i=0;for(int dy=-radius;dy<=radius;dy++){const uint16_t* row=original.ptr<uint16_t>(std::clamp(start+yy+dy,0,height-1));for(int dx=-radius;dx<=radius;dx++)values[i++]=row[std::clamp(x+dx,0,width-1)*cn+c];}
     auto middle=values.begin()+values.size()/2;std::nth_element(values.begin(),middle,values.end());filtered.ptr<uint16_t>(yy)[x*cn+c]=*middle;
    }
   }else{
    const SeparationBilateral16Table table(radius,sigmaUI,grayscale);std::vector<const uint16_t*> samples(table.dx.size());
    for(int yy=0;yy<rows;yy++)for(int x=0;x<width;x++){
     const uint16_t* centre=original.ptr<uint16_t>(start+yy)+x*cn;
     for(size_t k=0;k<samples.size();k++)samples[k]=original.ptr<uint16_t>(cv::borderInterpolate(start+yy+table.dy[k],height,cv::BORDER_REFLECT_101))+cv::borderInterpolate(x+table.dx[k],width,cv::BORDER_REFLECT_101)*cn;
     separationBilateral16Pixel(table,centre,[&](int k,int c){return samples[k][c];},grayscale,x+originX,nativeWidth,filtered.ptr<uint16_t>(yy)+x*cn);
    }
   }
  }
  cv::Mat target(rows,width,CV_16UC3,output);
  const cv::Mat selected=mode==0&&radius<=2?filtered.rowRange(start,start+rows):filtered;
  cv::cvtColor(selected,target,grayscale?cv::COLOR_GRAY2RGB:cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
