// CPU preparation for exact GPU separation. Original OpenCV4.11 colour
// conversions and binary64 coefficient construction remain on the CPU.
// Integer NLM tables retain OpenCV's original7x7/21x21 fixed-point definition.
#include <opencv2/core.hpp>
#include <opencv2/core/softfloat.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <vector>
#include "fast_nlmeans_denoising_invoker_commons.hpp"
extern "C" {
int separation_gpu_pack(const uint8_t* rgb,int w,int h,int gray,int lab,uint32_t* out){try{cv::Mat input(h,w,CV_8UC3,const_cast<uint8_t*>(rgb)),source;cv::cvtColor(input,source,gray?cv::COLOR_RGB2GRAY:cv::COLOR_RGB2BGR);if(lab&&!gray){cv::Mat converted;cv::cvtColor(source,converted,cv::COLOR_LBGR2Lab);source=converted;}int cn=gray?1:3;for(int y=0;y<h;y++)for(int x=0;x<w;x++){auto p=source.ptr<uint8_t>(y)+x*cn;out[y*w+x]=uint32_t(p[0])|(gray?0:uint32_t(p[1])<<8|uint32_t(p[2])<<16);}return 1;}catch(...){return -1;}}
int separation_gpu_unpack(const uint32_t* packed,int w,int h,int gray,int lab,uint8_t* out){try{cv::Mat source(h,w,gray?CV_8UC1:CV_8UC3);int cn=gray?1:3;for(int y=0;y<h;y++)for(int x=0;x<w;x++){auto p=source.ptr<uint8_t>(y)+x*cn;uint32_t v=packed[y*w+x];p[0]=v&255;if(!gray){p[1]=(v>>8)&255;p[2]=(v>>16)&255;}}if(lab&&!gray){cv::Mat bgr;cv::cvtColor(source,bgr,cv::COLOR_Lab2LBGR);source=bgr;}cv::Mat rgb(h,w,CV_8UC3,out);cv::cvtColor(source,rgb,gray?cv::COLOR_GRAY2RGB:cv::COLOR_BGR2RGB);return 1;}catch(...){return -1;}}
int separation_gpu_gaussian(int radius,uint32_t* fixed,double* exact){try{int size=2*radius+1;cv::Mat k=cv::getGaussianKernel(size,0,CV_64F);cv::softdouble error=cv::softdouble::zero();int64_t sum=0;for(int i=0;i<size;i++)exact[i]=k.at<double>(i);for(int i=0;i<radius;i++){cv::softdouble adjusted=cv::softdouble(exact[i])*cv::softdouble(256)+error;int v=cvRound(adjusted);error=adjusted-cv::softdouble(v);fixed[i]=fixed[size-1-i]=v;sum+=v;}fixed[radius]=256-2*sum;return size;}catch(...){return -1;}}
int separation_gpu_bilateral(int radius,int sigma,int gray,int32_t* taps,float* spatial,float* color){try{double coeff=-.5/(double(sigma)*sigma);int cn=gray?1:3;for(int i=0;i<cn*256;i++)color[i]=float(std::exp(i*i*coeff));int n=0;for(int dy=-radius;dy<=radius;dy++)for(int dx=-radius;dx<=radius;dx++){double r=std::sqrt(double(dx*dx+dy*dy));if(r>radius)continue;taps[2*n]=dx;taps[2*n+1]=dy;spatial[n++]=float(std::exp(r*r*coeff));}return n;}catch(...){return -1;}}
int separation_gpu_nlm_weights(int radius,int channels,int32_t* out){try{float h=float(2*radius+1);int multiplier=std::min<int>(std::numeric_limits<int>::max()/(441*255),std::numeric_limits<int>::max());double scale=double(64)/49;int maximum=65025*channels,size=int(maximum/scale+1);for(int i=0;i<size;i++)out[i]=channels==1?DistSquared::calcWeight<uchar,int>(i*scale,&h,multiplier):DistSquared::calcWeight<cv::Vec2b,int>(i*scale,&h,multiplier);return size;}catch(...){return -1;}}
// Only arithmetic which a WebGPU implementation may flush is repaired here.
// Every affected output is recomputed with the unchanged native f32 order.
int separation_gpu_correct_bilateral(const uint32_t* src,int w,int h,int start,int rows,int radius,int sigma,int gray,const uint8_t* mask,int observed,int originX,int nativeWidth,uint32_t* out){
 try{
  int flagged=0;for(int i=0;i<w*rows;i++)flagged+=bool(out[i]&0x80000000u);if(!flagged)return 0;
  const int cn=gray?1:3,lanes=gray?4:16;std::vector<int32_t> taps(2*(2*radius+1)*(2*radius+1));std::vector<float> space((2*radius+1)*(2*radius+1)),color(cn*256);
  const int n=separation_gpu_bilateral(radius,sigma,gray,taps.data(),space.data(),color.data());
  cv::Mat packed(h,w,CV_32SC1,const_cast<uint32_t*>(src)),padded,maskImage,maskPadded;
  cv::copyMakeBorder(packed,padded,radius,radius,radius,radius,cv::BORDER_REFLECT_101);
  if(observed){maskImage=cv::Mat(h,w,CV_8UC1,const_cast<uint8_t*>(mask));cv::copyMakeBorder(maskImage,maskPadded,radius,radius,radius,radius,cv::BORDER_REFLECT_101);}
  std::vector<int> offsets(n);for(int k=0;k<n;k++)offsets[k]=taps[2*k+1]*padded.cols+taps[2*k];
  for(int yy=0;yy<rows;yy++)for(int x=0;x<w;x++){
   const int at=yy*w+x;if(!(out[at]&0x80000000u))continue;const int y=start+yy;
   const uint32_t* centre=padded.ptr<uint32_t>(y+radius)+x+radius;const uint8_t* admitted=observed?maskPadded.ptr<uint8_t>(y+radius)+x+radius:nullptr;
   float sum[3]={0,0,0},mass=0;int k=0;
   auto weighted=[&](int i,float& weight,float* products){weight=0;for(int c=0;c<cn;c++)products[c]=0;if(observed&&!admitted[offsets[i]])return;const uint32_t pixel=centre[offsets[i]];int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int((pixel>>(8*c))&255)-int((*centre>>(8*c))&255));weight=space[i]*color[distance];for(int c=0;c<cn;c++)products[c]=float((pixel>>(8*c))&255)*weight;};
   if(x+originX>=nativeWidth/lanes*lanes)for(;k+3<n;k+=4){float weights[4],products[4][3];for(int t=0;t<4;t++)weighted(k+t,weights[t],products[t]);mass+=(weights[0]+weights[1])+(weights[2]+weights[3]);for(int c=0;c<cn;c++)sum[c]+=(products[0][c]+products[1][c])+(products[2][c]+products[3][c]);}
   for(;k<n;k++){if(observed&&!admitted[offsets[k]])continue;const uint32_t pixel=centre[offsets[k]];int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int((pixel>>(8*c))&255)-int((*centre>>(8*c))&255));const float weight=space[k]*color[distance];mass+=weight;for(int c=0;c<cn;c++)sum[c]=std::fma(float((pixel>>(8*c))&255),weight,sum[c]);}
   const float inverse=1.f/mass;uint32_t result=0;for(int c=0;c<cn;c++)result|=uint32_t(cv::saturate_cast<uchar>(gray?sum[c]/mass:sum[c]*inverse))<<(8*c);out[at]=result;
  }
  return flagged;
 }catch(...){return -1;}
}
}
