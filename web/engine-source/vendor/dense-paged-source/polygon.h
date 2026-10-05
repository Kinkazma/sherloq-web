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

// Adapted from OpenCV 4.11.0 drawing.cpp: clipLine, LINE_8 iterator and
// CollectPolyEdges fixed-point rules. Original Intel notice retained below.
#pragma once
struct DensePoint {int64_t x,y;};
static bool dense_clip(int width,int height,DensePoint& pt1,DensePoint& pt2)
{


    int c1, c2;
    int64_t right = width-1, bottom = height-1;

    if( width <= 0 || height <= 0 )
        return false;

    int64_t &x1 = pt1.x, &y1 = pt1.y, &x2 = pt2.x, &y2 = pt2.y;
    c1 = (x1 < 0) + (x1 > right) * 2 + (y1 < 0) * 4 + (y1 > bottom) * 8;
    c2 = (x2 < 0) + (x2 > right) * 2 + (y2 < 0) * 4 + (y2 > bottom) * 8;

    if( (c1 & c2) == 0 && (c1 | c2) != 0 )
    {
        int64_t a;
        if( c1 & 12 )
        {
            a = c1 < 8 ? 0 : bottom;
            x1 += (int64_t)((double)(a - y1) * (x2 - x1) / (y2 - y1));
            y1 = a;
            c1 = (x1 < 0) + (x1 > right) * 2;
        }
        if( c2 & 12 )
        {
            a = c2 < 8 ? 0 : bottom;
            x2 += (int64_t)((double)(a - y2) * (x2 - x1) / (y2 - y1));
            y2 = a;
            c2 = (x2 < 0) + (x2 > right) * 2;
        }
        if( (c1 & c2) == 0 && (c1 | c2) != 0 )
        {
            if( c1 )
            {
                a = c1 == 1 ? 0 : right;
                y1 += (int64_t)((double)(a - x1) * (y2 - y1) / (x2 - x1));
                x1 = a;
                c1 = 0;
            }
            if( c2 )
            {
                a = c2 == 1 ? 0 : right;
                y2 += (int64_t)((double)(a - x2) * (y2 - y1) / (x2 - x1));
                x2 = a;
                c2 = 0;
            }
        }


    }

    return (c1 | c2) == 0;
}
template<class Write> static void dense_line(int width,int height,DensePoint a,DensePoint b,Write write){
 if(!dense_clip(width,height,a,b))return;
 int delta_x=1,delta_y=1,dx=int(b.x-a.x),dy=int(b.y-a.y);
 if(dx<0){dx=-dx;dy=-dy;a=b;}if(dy<0){dy=-dy;delta_y=-1;}
 bool vert=dy>dx;if(vert){std::swap(dx,dy);std::swap(delta_x,delta_y);}
 int err=dx-2*dy,plusDelta=2*dx,minusDelta=-2*dy,minusShift=delta_x,plusShift=0,minusStep=0,plusStep=delta_y;
 if(vert){std::swap(plusStep,plusShift);std::swap(minusStep,minusShift);}
 for(int i=0;i<=dx;i++){
  if((i&4095)==0)check();write(int(a.y),int(a.x),int(a.x));
  int mask=err<0?-1:0;err+=minusDelta+(plusDelta&mask);a.x+=minusShift+(plusShift&mask);a.y+=minusStep+(plusStep&mask);
 }
}
template<class Write> static void dense_polygon(int width,int height,const double* points,int count,Write write){
 struct Edge{int y0,y1;int64_t x,dx;};std::vector<Edge> edges;
 if(count<1)return;
 DensePoint a{int64_t(std::nearbyint(points[2*(count-1)])),int64_t(std::nearbyint(points[2*(count-1)+1]))};
 for(int i=0;i<count;i++){
  DensePoint b{int64_t(std::nearbyint(points[2*i])),int64_t(std::nearbyint(points[2*i+1]))},t0=a,t1=b;
  dense_line(width,height,a,b,write);
  DensePoint ac{a.x*65536,a.y},bc{b.x*65536,b.y};
  if(t0.x<0||t0.x>=width||t1.x<0||t1.x>=width||t0.y<0||t0.y>=height||t1.y<0||t1.y>=height){dense_clip(width,height,t0,t1);if(t0.y!=t1.y){ac.y=t0.y;bc.y=t1.y;}}
  ac.x=t0.x*65536;bc.x=t1.x*65536;
  if(a.y!=b.y){int64_t dx=(bc.x-ac.x)/(bc.y-ac.y);if(a.y<b.y)edges.push_back({int(a.y),int(b.y),ac.x+(a.y-ac.y)*dx,dx});else edges.push_back({int(b.y),int(a.y),bc.x+(b.y-bc.y)*dx,dx});}
  a=b;
 }
 if(edges.size()<2)return;
 int first=height,last=0;for(const auto& e:edges){first=std::min(first,e.y0);last=std::max(last,e.y1);}first=std::max(first,0);last=std::min(last,height);
 std::vector<int64_t> active;active.reserve(edges.size());
 for(int y=first;y<last;y++){
  check();active.clear();for(const auto& e:edges)if(e.y0<=y&&y<e.y1)active.push_back(e.x+int64_t(y-e.y0)*e.dx);
  std::sort(active.begin(),active.end());
  for(size_t i=1;i<active.size();i+=2){int64_t left=(active[i-1]+65535)>>16,right=active[i]>>16;if(left<width&&right>=0)write(y,int(std::max(int64_t(0),left)),int(std::min(int64_t(width-1),right)));}
 }
}
