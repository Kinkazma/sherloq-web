// This file is part of OpenCV project.
// It is subject to the license terms in the LICENSE file found in the top-level directory
// of this distribution and at http://opencv.org/license.html.

// Offline OpenCV v_atan_f32 adaptation, 2026-09-30.
// OpenCV Apache-2.0 license retained in vendor/opencv/LICENSE.
// Offline OpenCV v_atan_f32 adaptation, OpenCV Apache-2.0.
#include <cmath>
#include <algorithm>
#include <cfloat>
void cloningAKAZEAngles(const float* Y,const float* X,float* angles,int count){
 const float p1=0.9997878412794807f*float(180/3.1415926535897932384626433832795),p3=-0.3258083974640975f*float(180/3.1415926535897932384626433832795),p5=0.1555786518463281f*float(180/3.1415926535897932384626433832795),p7=-0.04432655554792128f*float(180/3.1415926535897932384626433832795);
 const float scale=float(3.1415926535897932384626433832795/180);
 for(int i=0;i<count;i++){
  float x=X[i],y=Y[i],ax=std::abs(x),ay=std::abs(y),c=std::min(ax,ay)/(std::max(ax,ay)+float(DBL_EPSILON)),cc=c*c;
  float a=std::fma(std::fma(std::fma(cc,p7,p5),cc,p3),cc,p1)*c;
  if(ax<ay)a=90.f-a;if(x<0)a=180.f-a;if(y<0)a=360.f-a;angles[i]=a*scale;
 }
}
