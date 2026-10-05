// OpenCV4.11 img_hash adaptation; source identities are pinned in vendor/digest-extra.
// OpenCV notices: vendor/opencv/LICENSE. Carotene adaptations: vendor/digest-extra/CAROTENE-LICENSE.txt.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <vector>
#include <cstring>
#include "sqrt-tables.h"
static void cubicWeights(float x,short* coefficients){
 const float t=x+1,u=1-x;
 const float a=std::fma(std::fma(std::fma(-.75f,t,3.75f),t,-6.f),t,3.f);
 const float b=std::fma(std::fma(1.25f,x,-2.25f)*x,x,1.f);
 const float c=std::fma(std::fma(1.25f,u,-2.25f)*u,u,1.f);
 const float values[]={a,b,c,((1.f-a)-b)-c};
 for(int i=0;i<4;i++)coefficients[i]=cv::saturate_cast<short>(values[i]*2048.f);
}
static void resizeCubic(const cv::Mat& source,cv::Mat& destination){
 const int side=512,channels=source.channels();destination.create(side,side,source.type());
 short alpha[side*4];int offsets[side];
 for(int x=0;x<side;x++){float coordinate=float(std::fma(x+.5,1./(double(side)/source.cols),-.5));offsets[x]=cvFloor(coordinate);cubicWeights(coordinate-offsets[x],alpha+x*4);}
 std::vector<int> horizontal(side*channels*4);
 for(int y=0;y<side;y++){
  float coordinate=float(std::fma(y+.5,1./(double(side)/source.rows),-.5));int sy=cvFloor(coordinate);short beta[4];cubicWeights(coordinate-sy,beta);
  for(int k=0;k<4;k++){const auto row=source.ptr<unsigned char>(std::max(0,std::min(source.rows-1,sy+k-1)));for(int x=0;x<side;x++)for(int c=0;c<channels;c++){int sum=0;for(int j=0;j<4;j++)sum+=row[std::max(0,std::min(source.cols-1,offsets[x]+j-1))*channels+c]*alpha[x*4+j];horizontal[(k*side+x)*channels+c]=sum;}}
  for(int x=0;x<side*channels;x++){
   float value=horizontal[3*side*channels+x]*(beta[3]*(1.f/4194304));
   for(int k=2;k>=0;k--)value=std::fma(float(horizontal[k*side*channels+x]),beta[k]*(1.f/4194304),value);
   destination.ptr<unsigned char>(y)[x]=cv::saturate_cast<unsigned char>(value);
  }
 }
}
static float reciprocal(float value){
 if(value==0)return 0;int exponent;const float unit=std::frexp(value,&exponent)*2.f;uint32_t bits;std::memcpy(&bits,&unit,4);bits=reciprocalEstimate[(bits>>15)&255];float estimate;std::memcpy(&estimate,&bits,4);estimate=std::ldexp(estimate,1-exponent);return estimate*std::fma(-estimate,value,2.f);
}
static void nativeHsv(const cv::Mat& source,cv::Mat& destination){
 destination.create(source.size(),source.type());
 for(int y=0;y<source.rows;y++)for(int x=0;x<source.cols;x++){
  const auto v=source.at<cv::Vec3b>(y,x);const int b=v[0],g=v[1],r=v[2],high=std::max(r,std::max(g,b)),low=std::min(r,std::min(g,b)),diff=high-low;
  int hue=high==r?g-b:high==g?b-r+2*diff:r-g+4*diff;
  const int s=(diff*cvRound(reciprocal(float(high))*1044480.f)+2048)>>12;
  hue=(hue*cvRound(reciprocal(float(diff*6))*737280.f)+2048)>>12;if(hue<0)hue+=180;
  destination.at<cv::Vec3b>(y,x)=cv::Vec3b(hue,s,high);
 }
}
static double nativeSum(const cv::Mat& source){
 // Native NEON promotes float values before summation; the scalar fallback
 // groups four float additions first. These16px/3px blocks fit exactly in f64.
 double total=0;for(int y=0;y<source.rows;y++)for(int x=0;x<source.cols;x++)total+=double(source.at<float>(y,x));return total;
}
static cv::Mat output;
extern "C" {
int digest_extra(const unsigned char* rgb,int width,int height,int kind,int stage){try{
 cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);output.release();
 if(kind==2){
  cv::Mat resized,blurred,hsv,ycc;resizeCubic(bgr,resized);if(stage==0){output=resized;return 1;}
  cv::GaussianBlur(resized,blurred,{3,3},0);if(stage==1){output=blurred;return 1;}
  nativeHsv(blurred,hsv);if(stage==2){output=hsv;return 1;}
  cv::cvtColor(blurred,ycc,cv::COLOR_BGR2YCrCb);if(stage==3){output=ycc;return 1;}
  output.create(1,42,CV_64F);int channel=0;for(const auto& image:{hsv,ycc}){std::vector<cv::Mat> channels;cv::split(image,channels);for(const auto& value:channels)cv::HuMoments(cv::moments(value),output.ptr<double>()+7*channel++);}
 }else{
  cv::Mat gray,blurred,resized,equalized,kernel(17,17,CV_32F),frequency;cv::cvtColor(bgr,gray,cv::COLOR_BGR2GRAY);if(stage==0){output=gray;return 1;}
  cv::GaussianBlur(gray,blurred,{7,7},0);if(stage==1){output=blurred;return 1;}
  resizeCubic(blurred,resized);if(stage==2){output=resized;return 1;}
  cv::equalizeHist(resized,equalized);if(stage==3){output=equalized;return 1;}
  for(int y=0;y<17;y++)for(int x=0;x<17;x++){float xx=(x-8)*.5f,yy=(y-8)*.5f,a=xx*xx+yy*yy;kernel.at<float>(y,x)=(2-a)*std::exp(a/2);}
  if(stage==7){output=kernel;return 1;}cv::filter2D(equalized,frequency,CV_32F,kernel);if(stage==4){output=frequency;return 1;}
  cv::Mat blocks(31,31,CV_32F);for(int y=0;y<31;y++)for(int x=0;x<31;x++)blocks.at<float>(y,x)=nativeSum(frequency(cv::Rect(y*16,x*16,16,16)));
  if(stage==5){output=blocks;return 1;}output=cv::Mat::zeros(1,72,CV_8U);int bit=0;unsigned char byte=0;
  for(int y=0;y<29;y+=4)for(int x=0;x<29;x+=4){const auto roi=blocks(cv::Rect(x,y,3,3));float mean=nativeSum(roi)/9.;for(int i=0;i<3;i++)for(int j=0;j<3;j++){byte<<=1;byte|=roi.at<float>(i,j)>mean;bit++;if(bit%8==0){output.ptr<unsigned char>()[bit/8-1]=byte;byte=0;}}}
 }
 return 1;
}catch(...){output.release();return 0;}}
const unsigned char* digest_data(){return output.data;}int digest_size(){return output.total()*output.elemSize();}void digest_release(){output.release();}
}
