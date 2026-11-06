#include <cfloat>
#include <cstring>
#include <cmath>
#include <cstdio>
#define COMPARISON_PAGED_DECLARE_CALLBACKS
#include "../vendor/comparison-butteraugli-paged-source/butteraugli.h"
#include "stereo-fma.h"
#include "../.build/butteraugli-paged-heatmap.h"
EM_ASYNC_JS(int,butterOutput,(int row,int width,const unsigned char* pointer),{try{await Module.outputRow(row,width,pointer);return 0;}catch(e){Module.ioError=e;return 1;}});
static double score;
extern "C" int comparison_butteraugli_paged(int width,int height,int view,int original,char*error){try{stereoFastArithmetic=!original;using namespace butteraugli;auto first=CreatePlanes<float>(width,height,3),second=CreatePlanes<float>(width,height,3);double lut[256];for(int i=0;i<256;i++){double s=i/255.;lut[i]=255*(s<=.04045?s/12.92:std::pow((s+.055)/1.055,2.4));}std::vector<unsigned char>rgb(size_t(width)*3);
 for(int side=0;side<2;side++)for(int y=0;y<height;y++){check("gray",y,height);if(sewarSource(side,y,rgb.data()))throw std::runtime_error("Butteraugli source failed");auto&planes=side?second:first;float*a=planes[0].Row(y),*b=planes[1].Row(y),*c=planes[2].Row(y);for(int x=0;x<width;x++)a[x]=b[x]=c[x]=lut[(rgb[x*3]*9798+rgb[x*3+1]*19235+rgb[x*3+2]*3735+16384)>>15];}
 ImageF map;double value;if(!ButteraugliInterface(first,second,1.,map,value))throw std::runtime_error("Butteraugli comparison failed");char formatted[64];std::snprintf(formatted,sizeof(formatted),"%.6f",value);score=std::strtod(formatted,nullptr);
 if(view){const double good=ButteraugliFuzzyInverse(1.5),bad=ButteraugliFuzzyInverse(.5);for(int y=0;y<height;y++){check("heatmap",y,height);const float*p=static_cast<const ImageF&>(map).Row(y);for(int x=0;x<width;x++)ScoreToRgb(p[x],good,bad,rgb.data()+x*3);if(butterOutput(y,width,rgb.data()))throw std::runtime_error("Butteraugli output failed");}}
 return 0;
 }catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
extern "C" double comparison_butteraugli_score(){return score;}
