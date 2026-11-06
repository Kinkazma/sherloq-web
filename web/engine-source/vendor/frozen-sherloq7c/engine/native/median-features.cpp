// Native median-filter model features. Input is an exact gray8 64x64 block.
// Pixel decoding, black padding and model inference belong to the caller.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>
#include <array>
#include "comparison-fma.h"

static cv::Mat gaussian(const cv::Mat& input){
 const int w=input.cols,h=input.rows;const auto weights=cv::getGaussianKernel(11,1.5,CV_64F);const double* k=weights.ptr<double>();
 cv::Mat padded,horizontal(input.size(),CV_64F),result(input.size(),CV_64F);cv::copyMakeBorder(input,padded,0,0,5,5,cv::BORDER_REFLECT_101);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){const double* src=padded.ptr<double>(y)+x;double sum=src[0]*k[0];for(int j=1;j<11;j++)sum=comparisonFma(src[j],k[j],sum);horizontal.at<double>(y,x)=sum;}
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){
  double sum=horizontal.at<double>(y,x)*k[5];for(int j=1;j<=5;j++)sum=comparisonFma(horizontal.at<double>(cv::borderInterpolate(y-j,h,cv::BORDER_REFLECT_101),x)+horizontal.at<double>(cv::borderInterpolate(y+j,h,cv::BORDER_REFLECT_101),x),k[5+j],sum);result.at<double>(y,x)=sum;
 }return result;
}
struct Statistics{
 cv::Mat values,mean,variance;double squareSum=0,sum=0;
 explicit Statistics(const cv::Mat& input){input.convertTo(values,CV_64F);cv::Mat squares=values.mul(values);for(int i=0;i<values.total();i++){sum+=values.ptr<double>()[i];squareSum+=squares.ptr<double>()[i];}mean=gaussian(values);variance=gaussian(squares)-mean.mul(mean);}
};
static void metrics(const Statistics& x,const Statistics& y,double* out){
 const int n=x.values.total();double mse=0,cross=0,errorSum=0,maximum=-INFINITY,absolute=0;
 for(int i=0;i<n;i++){const double a=x.values.ptr<double>()[i],b=y.values.ptr<double>()[i],e=a-b;mse+=e*e;cross+=a*b;errorSum+=e;maximum=std::max(maximum,e);absolute+=std::abs(e);}
 mse/=n;out[0]=mse;out[1]=mse>0?20*std::log10(255/std::sqrt(mse)):-1;out[2]=x.squareSum>0?cross/x.squareSum:-1;out[3]=errorSum/n;out[4]=y.squareSum>0?x.squareSum/y.squareSum:-1;out[5]=maximum;out[6]=x.sum>0?absolute/x.sum:-1;
 auto covariance=gaussian(x.values.mul(y.values));cv::Mat numerator(x.values.size(),CV_64F),denominator(x.values.size(),CV_64F),score;
 for(int i=0;i<n;i++){const double a=x.mean.ptr<double>()[i],b=y.mean.ptr<double>()[i],ab=a*b;
  numerator.ptr<double>()[i]=(2*ab+6.5025)*(2*(covariance.ptr<double>()[i]-ab)+58.5225);
  denominator.ptr<double>()[i]=((a*a+b*b)+6.5025)*((x.variance.ptr<double>()[i]+y.variance.ptr<double>()[i])+58.5225);
 }
 cv::divide(numerator,denominator,score);out[7]=cv::mean(score)[0];
}
extern "C" {
int median_features(const unsigned char* gray,int windows,int levels,double* result,int fast){
 try{if(windows<1||windows>4||levels<1||levels>4)return 0;comparisonFastArithmetic=fast;cv::Mat image(64,64,CV_8U,const_cast<unsigned char*>(gray));Statistics original(image);int index=0;
  for(int window=0;window<windows;window++){cv::Mat previous=image;Statistics stats=original;
   for(int level=0;level<levels;level++){cv::Mat filtered;cv::medianBlur(previous,filtered,2*(window+1)+1);Statistics next(filtered);metrics(stats,next,result+index);index+=8;previous=filtered;stats=next;}
  }return 1;
 }catch(const cv::Exception&){return 0;}catch(...){return 0;}
}
}
