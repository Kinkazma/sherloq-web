// OpenCV 4.11 INTER_CUBIC uchar x4, retaining the ARM SIMD vertical arithmetic.
// Formula/order: modules/imgproc/src/resize.cpp, VResizeCubicVec_32s8u.
#include <opencv2/core.hpp>
#include <cmath>
#include <vector>
static void siftResizeFour(const cv::Mat& input,cv::Mat& output){
 CV_Assert(input.type()==CV_8U);const int width=input.cols*4,height=input.rows*4;
 output.create(height,width,CV_8U);cv::Mat horizontal(input.rows,width,CV_32S);
 auto coefficients=[](float x,short* c){const float a=-.75f,t=1-x;float f[4];f[0]=((a*(x+1)-5*a)*(x+1)+8*a)*(x+1)-4*a;f[1]=((a+2)*x-(a+3))*x*x+1;f[2]=((a+2)*t-(a+3))*t*t+1;f[3]=1-f[0]-f[1]-f[2];for(int k=0;k<4;k++)c[k]=cv::saturate_cast<short>(f[k]*2048);};
 for(int x=0;x<width;x++){
  float position=(x+.5f)*.25f-.5f;int left=int(std::floor(position));short c[4];coefficients(position-left,c);
  for(int y=0;y<input.rows;y++){int sum=0;for(int k=0;k<4;k++)sum+=input.at<unsigned char>(y,std::max(0,std::min(input.cols-1,left+k-1)))*c[k];horizontal.at<int>(y,x)=sum;}
 }
 for(int y=0;y<height;y++){
  float position=(y+.5f)*.25f-.5f;int top=int(std::floor(position));short c[4];coefficients(position-top,c);const int* rows[4];for(int k=0;k<4;k++)rows[k]=horizontal.ptr<int>(std::max(0,std::min(input.rows-1,top+k-1)));
  for(int x=0;x<width;x++){
   if(x<width/8*8){float value=std::fma(float(rows[0][x]),c[0]/4194304.f,std::fma(float(rows[1][x]),c[1]/4194304.f,std::fma(float(rows[2][x]),c[2]/4194304.f,float(rows[3][x])*(c[3]/4194304.f))));output.at<unsigned char>(y,x)=cv::saturate_cast<unsigned char>(value);}
   else{int value=0;for(int k=0;k<4;k++)value+=rows[k][x]*c[k];output.at<unsigned char>(y,x)=cv::saturate_cast<unsigned char>((value+(1<<21))>>22);}
  }
 }
}
