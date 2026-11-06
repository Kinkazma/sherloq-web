// Native finish for the original median-filter features. Gaussian maps are
// supplied as exact binary64 values, never rounded f32. The equations and
// OpenCV divide/mean match native/median-features.cpp; classifier stays native.
#include <opencv2/core.hpp>
#include <cmath>
#include <cstdint>
#include <algorithm>
extern "C" int median_gpu_finish(const uint32_t* layers,const double* maps,int windows,int levels,double* result,double* variance){
 try{
  if(windows<1||windows>4||levels<1||levels>4)return 0;
  const int n=4096,layersCount=1+windows*levels;double initialSum=0,initialSquares=0;
  for(int i=0;i<n;i++){const double a=layers[i];initialSum+=a;initialSquares+=a*a;}
  const double mean=initialSum/n;*variance=initialSquares/n-mean*mean;
  int index=0;
  for(int w=0;w<windows;w++)for(int level=0;level<levels;level++){
   const int current=1+w*levels+level,previous=level?current-1:0,node=w*levels+level;
   const auto x=layers+previous*n,y=layers+current*n;
   const double* ux=maps+previous*n;const double* uy=maps+current*n;
   const double* xx=maps+(layersCount+previous)*n;const double* yy=maps+(layersCount+current)*n;
   const double* xy=maps+(2*layersCount+node)*n;
   double mse=0,cross=0,errorSum=0,maximum=-INFINITY,absolute=0,xSum=0,xSquares=0,ySquares=0;
   for(int i=0;i<n;i++){const double a=x[i],b=y[i],e=a-b;mse+=e*e;cross+=a*b;errorSum+=e;maximum=std::max(maximum,e);absolute+=std::abs(e);xSum+=a;xSquares+=a*a;ySquares+=b*b;}
   double* out=result+index;index+=8;mse/=n;out[0]=mse;out[1]=mse>0?20*std::log10(255/std::sqrt(mse)):-1;out[2]=xSquares>0?cross/xSquares:-1;out[3]=errorSum/n;out[4]=ySquares>0?xSquares/ySquares:-1;out[5]=maximum;out[6]=xSum>0?absolute/xSum:-1;
   cv::Mat numerator(64,64,CV_64F),denominator(64,64,CV_64F),score;
   for(int i=0;i<n;i++){const double a=ux[i],b=uy[i],ab=a*b,vx=xx[i]-a*a,vy=yy[i]-b*b;
    numerator.ptr<double>()[i]=(2*ab+6.5025)*(2*(xy[i]-ab)+58.5225);
    denominator.ptr<double>()[i]=((a*a+b*b)+6.5025)*((vx+vy)+58.5225);
   }
   cv::divide(numerator,denominator,score);out[7]=cv::mean(score)[0];
  }return 1;
 }catch(...){return -1;}
}
