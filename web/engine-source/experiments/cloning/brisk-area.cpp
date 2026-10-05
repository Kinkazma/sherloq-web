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
// Copyright (C) 2000-2008, 2017, Intel Corporation, all rights reserved.
// Copyright (C) 2009, Willow Garage Inc., all rights reserved.
// Copyright (C) 2014-2015, Itseez Inc., all rights reserved.
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

// Offline scalar adaptation, 2026-09-30. Not a product entry point.
// Offline adaptation of OpenCV4.11.0 grayscale INTER_AREA; pinned resize.cpp is
// the arithmetic/source reference. Horizontal float32 accumulation uses FMA.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <cfloat>
namespace cv {
struct CloningAreaCoef{int source,dest;float weight;};
static std::vector<CloningAreaCoef> cloningAreaCoefficients(int source,int dest,double scale){
 std::vector<CloningAreaCoef> out;
 for(int dx=0;dx<dest;dx++){
  const double left=dx*scale,right=left+scale,cell=std::min(scale,source-left);
  int first=cvCeil(left),last=cvFloor(right);last=std::min(last,source-1);first=std::min(first,last);
  if(first-left>1e-3)out.push_back({first-1,dx,float((first-left)/cell)});
  for(int x=first;x<last;x++)out.push_back({x,dx,float(1./cell)});
  if(right-last>1e-3)out.push_back({last,dx,float(std::min(std::min(right-last,1.),cell)/cell)});
 }return out;
}
void cloningBriskArea(const Mat& source,Mat& output){
 const int width=output.cols,height=output.rows;const double sx=1./(double(width)/source.cols),sy=1./(double(height)/source.rows);
 CV_Assert(source.type()==CV_8UC1);
 if(std::abs(sx-cvRound(sx))<DBL_EPSILON&&std::abs(sy-cvRound(sy))<DBL_EPSILON){resize(source,output,output.size(),0,0,INTER_AREA);return;}
 const auto xt=cloningAreaCoefficients(source.cols,width,sx),yt=cloningAreaCoefficients(source.rows,height,sy);
 std::vector<float> row(width),sum(width,0);int previous=0;
 auto finish=[&](){for(int x=0;x<width;x++)output.at<uchar>(previous,x)=saturate_cast<uchar>(sum[x]);};
 for(const auto& y:yt){
  std::fill(row.begin(),row.end(),0);const auto* input=source.ptr<uchar>(y.source);
  for(const auto& x:xt)row[x.dest]=std::fma(float(input[x.source]),x.weight,row[x.dest]);
  if(y.dest!=previous){finish();for(int x=0;x<width;x++)sum[x]=y.weight*row[x];previous=y.dest;}
  else for(int x=0;x<width;x++)sum[x]=x>=(width-1)/4*4?std::fma(y.weight,row[x],sum[x]):sum[x]+y.weight*row[x];
 }finish();
}
}
