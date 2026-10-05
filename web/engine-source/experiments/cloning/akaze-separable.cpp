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
// Offline OpenCV filter.simd.hpp arithmetic adaptation; not a runtime asset.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
void cloningAKAZESep(cv::InputArray source,cv::OutputArray dest,int depth,cv::InputArray kernelX,cv::InputArray kernelY){
 const cv::Mat input=source.getMat(),kx=kernelX.getMat(),ky=kernelY.getMat();
 CV_Assert(input.type()==CV_32F&&depth==CV_32F&&kx.type()==CV_32F&&ky.type()==CV_32F);
 const int w=input.cols,h=input.rows,nx=kx.total(),ny=ky.total(),rx=nx/2,ry=ny/2;
 const float* xk=kx.ptr<float>();const float* yk=ky.ptr<float>();
 const bool symmetricX=xk[0]==xk[nx-1],symmetricY=yk[0]==yk[ny-1];
 cv::Mat row(input.size(),CV_32F),output(input.size(),CV_32F);
 auto at=[&](int y,int x){return input.at<float>(y,cv::borderInterpolate(x,w,cv::BORDER_REFLECT_101));};
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float a;
  if(nx<=5){
   const float near=symmetricX?at(y,x-1)+at(y,x+1):at(y,x+1)-at(y,x-1);
   if(symmetricX)a=x<w/2*2?std::fma(at(y,x),xk[rx],near*xk[rx+1]):std::fma(near,xk[rx+1],at(y,x)*xk[rx]);
   else a=near*xk[rx+1];
   if(nx==5){const float far=symmetricX?at(y,x-2)+at(y,x+2):at(y,x+2)-at(y,x-2);a=std::fma(far,xk[4],a);}
  }else{a=at(y,x-rx)*xk[0];for(int j=1;j<nx;j++)a=std::fma(at(y,x+j-rx),xk[j],a);}
  row.at<float>(y,x)=a;
 }
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  float a=symmetricY?row.at<float>(y,x)*yk[ry]:0;
  for(int j=1;j<=ry;j++){
   float lo=row.at<float>(cv::borderInterpolate(y-j,h,cv::BORDER_REFLECT_101),x),hi=row.at<float>(cv::borderInterpolate(y+j,h,cv::BORDER_REFLECT_101),x);
   a=std::fma(symmetricY?hi+lo:hi-lo,yk[ry+j],a);
  }output.at<float>(y,x)=a;
 }output.copyTo(dest);
}
