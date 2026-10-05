/*M///////////////////////////////////////////////////////////////////////////////////////
//
//  IMPORTANT: READ BEFORE DOWNLOADING, COPYING, INSTALLING OR USING.
//
//  By downloading, copying, installing or using the software you agree to this license.
//  If you do not agree to this license, do not download, install,
//  copy or use the software.
//
//
//                           License Agreement
//                For Open Source Computer Vision Library
//
// Copyright (C) 2000-2008, Intel Corporation, all rights reserved.
// Copyright (C) 2009, Willow Garage Inc., all rights reserved.
// Third party copyrights are property of their respective owners.
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
//   * The name of the copyright holders may not be used to endorse or promote products
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


// Offline adaptation of the pinned OpenCV4.11.0 arithmetic, 2026-09-30.
// Not a product entry point or an availability declaration.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>

void gaussianCandidate(const cv::Mat& input,cv::Mat& result,int size,float sigma){
 const auto kernel=cv::getGaussianKernel(size,sigma,CV_32F);const float* k=kernel.ptr<float>();const int r=size/2,w=input.cols,h=input.rows;
 cv::Mat row(input.size(),CV_32F);result.create(input.size(),CV_32F);
 auto at=[&](int y,int x){return input.at<float>(y,cv::borderInterpolate(x,w,cv::BORDER_REPLICATE));};
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float a;
  if(size==5){
   float near=at(y,x-1)+at(y,x+1),far=at(y,x-2)+at(y,x+2);
   a=x<w/2*2?std::fma(at(y,x),k[2],near*k[3]):std::fma(near,k[3],at(y,x)*k[2]);
   a=std::fma(far,k[4],a);
  }else{a=at(y,x-r)*k[0];for(int j=1;j<size;j++)a=std::fma(at(y,x+j-r),k[j],a);}
  row.at<float>(y,x)=a;
 }
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float a=row.at<float>(y,x)*k[r];for(int j=1;j<=r;j++)a=std::fma(row.at<float>(cv::borderInterpolate(y-j,h,cv::BORDER_REPLICATE),x)+row.at<float>(cv::borderInterpolate(y+j,h,cv::BORDER_REPLICATE),x),k[r+j],a);result.at<float>(y,x)=a;
 }
}
void scharrCandidate(const cv::Mat& input,cv::Mat& result,int dx){
 const int w=input.cols,h=input.rows;cv::Mat row(input.size(),CV_32F);result.create(input.size(),CV_32F);
 auto at=[&](int y,int x){return input.at<float>(y,cv::borderInterpolate(x,w,cv::BORDER_REFLECT_101));};
 for(int y=0;y<h;y++)for(int x=0;x<w;x++)row.at<float>(y,x)=dx?at(y,x+1)-at(y,x-1):x<w/2*2?std::fma(at(y,x),10.f,(at(y,x-1)+at(y,x+1))*3.f):std::fma(at(y,x-1)+at(y,x+1),3.f,at(y,x)*10.f);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float a=row.at<float>(cv::borderInterpolate(y-1,h,cv::BORDER_REFLECT_101),x),b=row.at<float>(cv::borderInterpolate(y+1,h,cv::BORDER_REFLECT_101),x),center=row.at<float>(y,x);
  result.at<float>(y,x)=dx?std::fma(a+b,3.f,center*10.f):b-a;
 }
}

void cloningAKAZEGaussian(cv::InputArray source,cv::OutputArray dest,cv::Size size,double sx,double sy,int border){
 CV_Assert(size.width==size.height&&(size.width==5||size.width==9)&&sx==sy&&border==cv::BORDER_REPLICATE&&source.type()==CV_32F);
 cv::Mat input=source.getMat(),output;gaussianCandidate(input,output,size.width,float(sx));output.copyTo(dest);
}
void cloningAKAZEScharr(cv::InputArray source,cv::OutputArray dest,int depth,int dx,int dy,double scale,double delta,int border){
 CV_Assert(source.type()==CV_32F&&depth==CV_32F&&dx+dy==1&&scale==1&&delta==0&&border==cv::BORDER_DEFAULT);
 cv::Mat input=source.getMat(),output;scharrCandidate(input,output,dx);output.copyTo(dest);
}
