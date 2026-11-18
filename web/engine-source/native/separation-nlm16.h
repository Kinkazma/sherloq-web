// Rolling recurrences adapted from OpenCV4.11 fast_nlmeans_denoising_invoker.hpp.
/*M///////////////////////////////////////////////////////////////////////////////////////
//
//  IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.
//
//  By downloading, copying, installing or using the software you agree to this license.
//  If you do not agree to this license, do not download, install,
//  copy or use the software.
//
//
//                        Intel License Agreement
//                For Open Source Computer Vision Library
//
// Copyright (C) 2000, Intel Corporation, all rights reserved.
// Third party copyrights are property of their respective icvers.
//
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
//
//   * Redistribution's of source code must retain the above copyright notice,
//     this list of conditions and the following disclaimer.
//
//   * Redistribution's in binary form must reproduce the above copyright notice,
//     this list of conditions and the following disclaimer in the documentation
//     and/or other materials provided with the distribution.
//
//   * The name of Intel Corporation may not be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// This software is provided by the copyright holders and contributors "as is" and
// any express or implied warranties, including, but not limited to, the implied
// warranties of merchantability and fitness for a particular purpose are disclaimed.
// In no event shall the Intel Corporation or contributors be liable for any direct,
// indirect, incidental, special, exemplary, or consequential damages
// (including, but not limited to, procurement of substitute goods or services;
// loss of use, data, or profits; or business interruption) however caused
// and on any theory of liability, whether in contract, strict liability,
// or tort (including negligence or otherwise) arising in any way out of
// the use of this software, even if advised of the possibility of such damage.
//
//M*/

#ifndef SHERLOQ_SEPARATION_NLM16_H
#define SHERLOQ_SEPARATION_NLM16_H
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <type_traits>
#include <vector>

// The historical 7x7 patch, 21x21 search, distance bins and integer weights.
// Only the sample/accumulator types and nominal floating Lab representation
// differ. The original byte invoker remains in separation.cpp unchanged.
namespace separation_nlm16 {
constexpr int patch=7,search=21,halo=13,searchPixels=441;
constexpr int multiplier=std::numeric_limits<int>::max()/(searchPixels*255);
constexpr int64_t grayBin=INT64_C(257)*257*64;
inline int tableCount(int channels){return int(65025*channels/(64./49.)+1);}
inline std::vector<int32_t> weights(int radius,int channels){
 const float h=float(2*radius+1);std::vector<int32_t> out(tableCount(channels));
 for(size_t i=0;i<out.size();i++){const double d=double(i)*(64./49.);int value=cvRound(multiplier*std::exp(-d/(h*h*channels)));if(value<.001*multiplier)value=0;out[i]=value;}return out;
}
template<class S> inline int weight(S sum,const std::vector<int32_t>& table){
 const double bin=std::is_integral<S>::value?double(sum/grayBin):std::floor(std::max(0.,double(sum))/64.);
 return bin>=0&&bin<double(table.size())?table[size_t(bin)]:0;
}
inline cv::Mat codedLab(const uint16_t* rgb,int w,int h){
 cv::Mat input(h,w,CV_16UC3,const_cast<uint16_t*>(rgb)),normalized,lab;
 input.convertTo(normalized,CV_32FC3,1./65535.);cv::cvtColor(normalized,lab,cv::COLOR_LRGB2Lab);
 for(int y=0;y<h;y++){float* p=lab.ptr<float>(y);for(int x=0;x<w;x++){p[3*x]*=2.55f;p[3*x+1]+=128.f;p[3*x+2]+=128.f;}}return lab;
}
inline void labToCodes(const float* q,int w,int h,int stride,uint16_t* output){
 cv::Mat lab(h,w,CV_32FC3);for(int y=0;y<h;y++){float* p=lab.ptr<float>(y);for(int x=0;x<w;x++){const float* v=q+(size_t(y)*w+x)*stride;p[3*x]=v[0]/2.55f;p[3*x+1]=v[1]-128.f;p[3*x+2]=v[2]-128.f;}}
 cv::Mat normalized,target(h,w,CV_16UC3,output);cv::cvtColor(lab,normalized,cv::COLOR_Lab2LRGB);
 // OpenCV's typed converter: final storage saturation and cvRound/RNE. There
 // is no Lab8 intermediate, profile conversion, tone map or local min/max.
 normalized.convertTo(target,CV_16UC3,65535.);
}
template<class T,class S,int CN,int STRIDE> inline S distance(const T* a,const T* b){
 S total=0;for(int c=0;c<CN;c++){const S d=S(a[c])-S(b[c]);total+=d*d;}return total;
}

// Same three column recurrences as OpenCV4.11's pinned invoker. First-row
// initialization uses patch columns; subsequent centres update one column.
// No patch^2 traversal per ordinary output centre/candidate is introduced.
template<class T,class S,int CN,int STRIDE> void rolling(const cv::Mat& padded,int w,int h,int start,int rows,int offset,int radius,cv::Mat& target){
 const auto table=weights(radius,CN);std::vector<S> sums(searchPixels),columns(patch*searchPixels),up(size_t(w)*searchPixels);
 auto sample=[&](int y,int x){return padded.ptr<T>(y)+size_t(x)*STRIDE+offset;};
 auto dist=[&](int ay,int ax,int by,int bx){return distance<T,S,CN,STRIDE>(sample(ay,ax),sample(by,bx));};
 // Conservative absolute forward-error bound for the addition/subtraction
 // paths (length O(w+h)) of bounded float32 code-Lab squared differences.
 // Only a bin-boundary ambiguity is recomposed in the canonical patch order.
 const double operations=128.*(double(w)+h+49),eps=std::numeric_limits<double>::epsilon();
 const double roundingBound=(operations*eps/(1.-operations*eps))*(49.*CN*65536.)*4.;
 for(int y=start;y<start+rows;y++){
  int first=0;
  for(int x=0;x<w;x++){
   if(x==0){
    std::fill(sums.begin(),sums.end(),S(0));std::fill(columns.begin(),columns.end(),S(0));
    for(int sy=0;sy<search;sy++)for(int sx=0;sx<search;sx++){
     const int at=sy*search+sx;
     for(int ty=-3;ty<=3;ty++)for(int tx=-3;tx<=3;tx++){const S d=dist(halo+y+ty,halo+tx,halo+y+sy-10+ty,halo+sx-10+tx);sums[at]+=d;columns[(tx+3)*searchPixels+at]+=d;}
     up[at]=columns[6*searchPixels+at];
    }
   }else{
    const int ax=halo+x+3,ay=halo+y;
    for(int sy=0;sy<search;sy++)for(int sx=0;sx<search;sx++){
     const int at=sy*search+sx,ci=first*searchPixels+at,by=halo+y+sy-10,bx=halo+x+sx-10+3;sums[at]-=columns[ci];
     if(y==start){S column=0;for(int ty=-3;ty<=3;ty++)column+=dist(ay+ty,ax,by+ty,bx);columns[ci]=column;}
     else columns[ci]=up[size_t(x)*searchPixels+at]+(dist(ay+3,ax,by+3,bx)-dist(ay-4,ax,by-4,bx));
     sums[at]+=columns[ci];up[size_t(x)*searchPixels+at]=columns[ci];
    }first=(first+1)%patch;
   }
   using A=typename std::conditional<std::is_integral<T>::value,uint64_t,double>::type;A estimate[CN]={};uint64_t mass=0;
   for(int sy=0;sy<search;sy++)for(int sx=0;sx<search;sx++){
    S sum=sums[sy*search+sx];
    if constexpr(!std::is_integral<S>::value){
     const double boundary=std::round(double(sum)/64.)*64.;
     if(boundary>=64.&&std::abs(double(sum)-boundary)<=roundingBound){sum=0;for(int ty=-3;ty<=3;ty++)for(int tx=-3;tx<=3;tx++)sum+=dist(halo+y+ty,halo+x+tx,halo+y+sy-10+ty,halo+x+sx-10+tx);}
    }
    const int value=weight(sum,table);mass+=value;const T* p=sample(halo+y+sy-10,halo+x+sx-10);for(int c=0;c<CN;c++)estimate[c]+=A(value)*A(p[c]);
   }
   T* dst=target.ptr<T>(y-start)+size_t(x)*STRIDE+offset;
   for(int c=0;c<CN;c++)if constexpr(std::is_integral<T>::value)dst[c]=uint16_t((estimate[c]+mass/2)/mass);else dst[c]=float(estimate[c]/double(mass));
  }
 }
}
inline void rows(const uint16_t* rgb,int w,int h,int start,int count,int radius,bool gray,uint16_t* output){
 if(gray){
  cv::Mat input(h,w,CV_16UC3,const_cast<uint16_t*>(rgb)),source,padded,target(count,w,CV_16UC1);
  cv::cvtColor(input,source,cv::COLOR_RGB2GRAY);cv::copyMakeBorder(source,padded,halo,halo,halo,halo,cv::BORDER_REFLECT_101);
  rolling<uint16_t,int64_t,1,1>(padded,w,h,start,count,0,radius,target);cv::Mat out(count,w,CV_16UC3,output);cv::cvtColor(target,out,cv::COLOR_GRAY2RGB);
 }else{
  cv::Mat source=codedLab(rgb,w,h),padded,target(count,w,CV_32FC3);cv::copyMakeBorder(source,padded,halo,halo,halo,halo,cv::BORDER_REFLECT_101);
  rolling<float,double,1,3>(padded,w,h,start,count,0,radius,target);rolling<float,double,2,3>(padded,w,h,start,count,1,radius,target);
  source.release();padded.release();labToCodes(target.ptr<float>(),w,count,3,output);
 }
}
// Marked GPU centres only. This direct patch order is also the reference order
// used for the rare rolling double bin-boundary ambiguity above.
inline void pointLab(const float* q,int w,int h,int stride,int y,int x,const std::vector<int32_t>& l,const std::vector<int32_t>& ab,float* out){
 auto pixel=[&](int yy,int xx){return q+(size_t(cv::borderInterpolate(yy,h,cv::BORDER_REFLECT_101))*w+cv::borderInterpolate(xx,w,cv::BORDER_REFLECT_101))*stride;};
 double estimate[3]={};uint64_t massL=0,massAB=0;
 for(int dy=-10;dy<=10;dy++)for(int dx=-10;dx<=10;dx++){
  double sL=0,sAB=0;for(int ty=-3;ty<=3;ty++)for(int tx=-3;tx<=3;tx++){const float* a=pixel(y+ty,x+tx),*b=pixel(y+dy+ty,x+dx+tx);const double dl=double(a[0])-b[0],da=double(a[1])-b[1],db=double(a[2])-b[2];sL+=dl*dl;sAB+=da*da+db*db;}
  const int wl=weight(sL,l),wa=weight(sAB,ab);const float* p=pixel(y+dy,x+dx);massL+=wl;massAB+=wa;estimate[0]+=double(wl)*p[0];estimate[1]+=double(wa)*p[1];estimate[2]+=double(wa)*p[2];
 }out[0]=float(estimate[0]/massL);out[1]=float(estimate[1]/massAB);out[2]=float(estimate[2]/massAB);
}
}
#endif
