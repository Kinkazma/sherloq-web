#ifndef SHERLOQ_SEPARATION_NATIVE16_H
#define SHERLOQ_SEPARATION_NATIVE16_H
#include <opencv2/core.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

// New typed arithmetic only. Historical byte kernels never call this helper.
// The CPU filter and marked-centre GPU repair share exactly these coefficients
// and this accumulation order.
struct SeparationBilateral16Table {
 int channels;
 std::vector<int32_t> dx,dy;
 std::vector<float> spatial,color;
 SeparationBilateral16Table(int radius,int sigmaUI,bool gray):channels(gray?1:3),color(channels*65536){
  const double spatialCoeff=-.5/(double(sigmaUI)*sigmaUI);
  const double sigmaColor=double(sigmaUI)*257.;
  const double colorCoeff=-.5/(sigmaColor*sigmaColor);
  for(int i=0;i<channels*65536;i++)color[i]=float(std::exp(double(i)*double(i)*colorCoeff));
  for(int y=-radius;y<=radius;y++)for(int x=-radius;x<=radius;x++){
   const double distance=std::sqrt(double(x*x+y*y));if(distance>radius)continue;
   dx.push_back(x);dy.push_back(y);spatial.push_back(float(std::exp(distance*distance*spatialCoeff)));
  }
 }
};

template<class Sample> static inline void separationBilateral16Pixel(
 const SeparationBilateral16Table& table,const uint16_t* centre,Sample sample,
 bool gray,int originalX,int nativeWidth,uint16_t* result){
 const int cn=table.channels,lanes=gray?4:16,n=int(table.dx.size());
 float sum[3]={0,0,0},mass=0;int k=0;
 auto weighted=[&](int i,float& weight,float* products){
  int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(sample(i,c))-int(centre[c]));
  weight=table.spatial[i]*table.color[distance];
  for(int c=0;c<cn;c++)products[c]=float(sample(i,c))*weight;
 };
 if(originalX>=nativeWidth/lanes*lanes)for(;k+3<n;k+=4){
  float weights[4],products[4][3];for(int t=0;t<4;t++)weighted(k+t,weights[t],products[t]);
  mass+=(weights[0]+weights[1])+(weights[2]+weights[3]);
  for(int c=0;c<cn;c++)sum[c]+=(products[0][c]+products[1][c])+(products[2][c]+products[3][c]);
 }
 for(;k<n;k++){
  int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(sample(k,c))-int(centre[c]));
  const float weight=table.spatial[k]*table.color[distance];mass+=weight;
  for(int c=0;c<cn;c++)sum[c]=std::fma(float(sample(k,c)),weight,sum[c]);
 }
 const float inverse=1.f/mass;
 for(int c=0;c<cn;c++)result[c]=cv::saturate_cast<uint16_t>(gray?sum[c]/mass:sum[c]*inverse);
}
#endif
