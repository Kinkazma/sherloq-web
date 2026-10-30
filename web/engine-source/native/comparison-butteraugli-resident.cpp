#include <cfloat>
#include <cstring>
#include <cmath>
#include <cstdio>
#include "../vendor/comparison-butteraugli-resident-source/butteraugli.h"
#include "stereo-fma.h"
#include "../.build/butteraugli-paged-heatmap.h"
static double score;
extern "C" int comparison_butteraugli_resident(int width,int height,const unsigned char*input0,const unsigned char*input1,unsigned char*output,int original,char*error){try{stereoFastArithmetic=!original;using namespace butteraugli;auto first=CreatePlanes<float>(width,height,3),second=CreatePlanes<float>(width,height,3);double lut[256];for(int i=0;i<256;i++){double s=i/255.;lut[i]=255*(s<=.04045?s/12.92:std::pow((s+.055)/1.055,2.4));}std::vector<unsigned char>rgb(size_t(width)*3);
 for(int side=0;side<2;side++)for(int y=0;y<height;y++){std::copy_n((side?input1:input0)+size_t(y)*width*3,width*3,rgb.data());auto&planes=side?second:first;float*a=planes[0].Row(y),*b=planes[1].Row(y),*c=planes[2].Row(y);for(int x=0;x<width;x++)a[x]=b[x]=c[x]=lut[(rgb[x*3]*9798+rgb[x*3+1]*19235+rgb[x*3+2]*3735+16384)>>15];}
 ImageF map;double value;if(!ButteraugliInterface(first,second,1.,map,value))throw std::runtime_error("Butteraugli comparison failed");char formatted[64];std::snprintf(formatted,sizeof(formatted),"%.6f",value);score=std::strtod(formatted,nullptr);
 if(output){const double good=ButteraugliFuzzyInverse(1.5),bad=ButteraugliFuzzyInverse(.5);for(int y=0;y<height;y++){const float*p=static_cast<const ImageF&>(map).Row(y);for(int x=0;x<width;x++)ScoreToRgb(p[x],good,bad,rgb.data()+x*3);std::copy_n(rgb.data(),width*3,output+size_t(y)*width*3);}}
 return 0;
 }catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
extern "C" double comparison_butteraugli_score(){return score;}
