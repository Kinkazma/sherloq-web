// Native StereoEngine search, pattern and lazy Farneback disparity.
#include "stereo-fma.h"
#include <emscripten/emscripten.h>
static double stereoTimings[5]={};
extern "C" double sherloq_stereo_clock(){return emscripten_get_now();}
extern "C" void sherloq_stereo_record(int stage,double elapsed){stereoTimings[stage]+=elapsed;}
extern "C" const double* cv_stereo_timings(){return stereoTimings;}
// The reference's float Gaussian uses explicit fused SIMD operations. Pin the
// same contraction order for the Farneback pyramid, independent of WASM SIMD.
namespace cv {
void sherloqStereoResize(const Mat& input,Mat& output,Size size){
 if(input.size()==size){input.copyTo(output);return;}
 if(input.cols==size.width*2&&input.rows==size.height*2){
  Mat result;resize(input,result,size,0,0,INTER_LINEAR);
  if(input.channels()==1)for(int y=0;y<size.height;y++)for(int x=0;x<size.width/4*4;x++)result.at<float>(y,x)=((input.at<float>(y*2,x*2)+input.at<float>(y*2,x*2+1))+(input.at<float>(y*2+1,x*2)+input.at<float>(y*2+1,x*2+1)))*.25f;
  result.copyTo(output);return;
 }
 int cn=input.channels(),w=size.width,h=size.height,xmax=w;
 double scaleX=1./(double(w)/input.cols),scaleY=1./(double(h)/input.rows);
 std::vector<int> offsets(w);std::vector<float> weights(w);
 for(int x=0;x<w;x++){float fx=std::fma(x+.5,scaleX,-.5);int sx=cvFloor(fx);fx-=sx;if(sx<0){fx=0;sx=0;}if(sx+1>=input.cols){xmax=std::min(xmax,x);fx=0;sx=input.cols-1;}offsets[x]=sx;weights[x]=fx;}
 Mat horizontal(input.rows,w,input.type()),result(h,w,input.type());int vectorEnd=(xmax*cn)/4*4;
 for(int y=0;y<input.rows;y++)for(int x=0;x<w;x++)for(int c=0;c<cn;c++){
  int sx=offsets[x];float left=input.ptr<float>(y)[sx*cn+c],fx=weights[x],v=left;
  if(x<xmax){float right=input.ptr<float>(y)[(sx+1)*cn+c];v=x*cn+c<vectorEnd?left*(1-fx)+right*fx:sherloq_stereo_fma(left,1-fx,right*fx);}
  horizontal.ptr<float>(y)[x*cn+c]=v;
 }
 for(int y=0;y<h;y++){float fy=std::fma(y+.5,scaleY,-.5);int sy=cvFloor(fy);fy-=sy;const float* top=horizontal.ptr<float>(std::clamp(sy,0,input.rows-1)),*bottom=horizontal.ptr<float>(std::clamp(sy+1,0,input.rows-1));for(int x=0;x<w*cn;x++)result.ptr<float>(y)[x]=sherloq_stereo_fma(top[x],1-fy,bottom[x]*fy);}
 result.copyTo(output);
}
void sherloqStereoGaussian(const Mat& input,Mat& output,Size size,double sigma,double){
 int radius=size.width/2,w=input.cols,h=input.rows;
 Mat weights=getGaussianKernel(size.width,sigma,CV_32F),horizontal(input.size(),CV_32F),result(input.size(),CV_32F),padded;
 copyMakeBorder(input,padded,0,0,radius,radius,BORDER_REFLECT_101);
 const float* k=weights.ptr<float>();
 for(int y=0;y<h;y++){
  const float* src=padded.ptr<float>(y)+radius;float* dst=horizontal.ptr<float>(y);
  if(size.width<=5){for(int x=0;x<w;x++){float sum=w%2&&x==w-1?sherloq_stereo_fma(src[x-1]+src[x+1],k[radius+1],src[x]*k[radius]):sherloq_stereo_fma(src[x],k[radius],(src[x-1]+src[x+1])*k[radius+1]);if(radius==2)sum=sherloq_stereo_fma(src[x-2]+src[x+2],k[radius+2],sum);dst[x]=sum;}}
  else{
   for(int x=0;x<w;x++)dst[x]=src[x-radius]*k[0];
   for(int j=1;j<size.width;j++){float weight=k[j];const float* shifted=src+j-radius;for(int x=0;x<w;x++)dst[x]=sherloq_stereo_fma(shifted[x],weight,dst[x]);}
  }
 }
 for(int y=0;y<h;y++){
  float* dst=result.ptr<float>(y);const float* center=horizontal.ptr<float>(y);
  for(int x=0;x<w;x++)dst[x]=center[x]*k[radius];
  for(int j=1;j<=radius;j++){
   const float* above=horizontal.ptr<float>(borderInterpolate(y-j,h,BORDER_REFLECT_101)),*below=horizontal.ptr<float>(borderInterpolate(y+j,h,BORDER_REFLECT_101));float weight=k[radius+j];
   for(int x=0;x<w;x++)dst[x]=sherloq_stereo_fma(above[x]+below[x],weight,dst[x]);
  }
 }
 output=result;
}
}
static int stereoOffset=-1;
static cv::Mat stereoSearch(const cv::Mat& bgr){
 stereoOffset=-1;int h=bgr.rows,w=bgr.cols;if(h<2||w/3<=11)return cv::Mat(1,0,CV_32F);
 cv::Mat gray,small;cv::cvtColor(bgr,gray,cv::COLOR_BGR2GRAY);cv::resize(gray,small,{},1,.5);cv::Mat differences(1,w/3-10,CV_32F);
 for(int i=0;i<differences.cols;i++){int offset=i+10;cv::Mat delta;cv::absdiff(small.colRange(offset,w),small.colRange(0,w-offset),delta);differences.at<float>(i)=cv::mean(delta)[0];}
 float maximum=-INFINITY;for(int i=0;i<differences.cols-1;i++){float d=differences.at<float>(i+1)-differences.at<float>(i);if(d>maximum){maximum=d;stereoOffset=i+10;}}if(maximum<2)stereoOffset=-1;return differences;
}
static cv::Mat stereoPattern(const cv::Mat& bgr,int offset){cv::Mat difference;cv::absdiff(bgr.colRange(offset,bgr.cols),bgr.colRange(0,bgr.cols-offset),difference);std::vector<cv::Mat> planes;cv::split(difference,planes);for(auto& p:planes)p=norm(p);cv::merge(planes,difference);return difference;}
static cv::Mat stereoFlow(const cv::Mat& bgr,int offset,bool fast=true){struct Restore {~Restore(){stereoFastArithmetic=true;}} restore;stereoFastArithmetic=fast;std::fill(stereoTimings,stereoTimings+5,0.);cv::Mat left,right,flow;cv::cvtColor(bgr.colRange(offset,bgr.cols),left,cv::COLOR_BGR2GRAY);cv::cvtColor(bgr.colRange(0,bgr.cols-offset),right,cv::COLOR_BGR2GRAY);cv::calcOpticalFlowFarneback(left,right,flow,.5,5,15,5,5,1.2,cv::OPTFLOW_FARNEBACK_GAUSSIAN);cv::extractChannel(flow,flow,0);return flow;}
static cv::Mat stereoNormalize(const cv::Mat& input,double maximum){double lo,hi;cv::minMaxLoc(input.reshape(1),&lo,&hi);float a=maximum*(hi-lo>DBL_EPSILON?1./(hi-lo):0.),b=-float(lo*double(a));cv::Mat out(input.size(),input.type());for(int i=0;i<input.total()*input.channels();i++)out.ptr<float>()[i]=std::fma(input.ptr<float>()[i],a,b);return out;}
static cv::Mat stereoView(const cv::Mat& pattern,int mode,const cv::Mat& flow){
 if(mode==0)return pattern;
 if(mode==1){cv::Mat gray,mask;cv::cvtColor(pattern,gray,cv::COLOR_BGR2GRAY);double threshold=cv::threshold(gray,mask,0,255,cv::THRESH_TRIANGLE);cv::threshold(gray,mask,threshold,255,cv::THRESH_BINARY);cv::cvtColor(mask,mask,cv::COLOR_GRAY2BGR);cv::medianBlur(mask,mask,3);return mask;}
 if(mode==2){auto result=np8(stereoNormalize(flow,255));cv::cvtColor(result,result,cv::COLOR_GRAY2BGR);return result;}
 cv::Mat normal,shaded;normal=stereoNormalize(flow,1);pattern.convertTo(shaded,CV_32F);for(int y=0;y<shaded.rows;y++)for(int x=0;x<shaded.cols;x++){auto& p=shaded.at<cv::Vec3f>(y,x);float v=normal.at<float>(y,x);for(int c=0;c<3;c++)p[c]*=v;}return np8(stereoNormalize(shaded,255));
}
