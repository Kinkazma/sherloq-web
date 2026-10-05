// Offline probes for the independently compared AKAZE numerical stages.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
namespace cv { void compute_derivative_kernels(OutputArray,OutputArray,int,int,int); }
void cloningAKAZEGaussian(cv::InputArray,cv::OutputArray,cv::Size,double,double,int);
void cloningAKAZEScharr(cv::InputArray,cv::OutputArray,int,int,int,double,double,int);
void cloningAKAZESep(cv::InputArray,cv::OutputArray,int,cv::InputArray,cv::InputArray);
void cloningAKAZEResize(cv::InputArray,cv::OutputArray,cv::Size,double,double,int);
static cv::Mat output;
extern "C" {
int akaze_probe(const float* source,int width,int height,int operation,int adapted){
 try{
  if(!source||width<7||height<7||operation<0||operation>12)return 0;
  cv::Mat input(height,width,CV_32F,const_cast<float*>(source));
  if(operation<2){
   int n=operation==0?9:5;float sigma=operation==0?1.6f:1.f;
   if(adapted)cloningAKAZEGaussian(input,output,{n,n},sigma,sigma,cv::BORDER_REPLICATE);
   else cv::GaussianBlur(input,output,{n,n},sigma,sigma,cv::BORDER_REPLICATE);
  }else if(operation<4){
   int dx=operation==2,dy=operation==3;
   if(adapted)cloningAKAZEScharr(input,output,CV_32F,dx,dy,1,0,cv::BORDER_DEFAULT);
   else cv::Scharr(input,output,CV_32F,dx,dy,1,0,cv::BORDER_DEFAULT);
  }else if(operation<12){
   int scale=(operation-4)/2+1,dx=operation%2==0,dy=!dx;cv::Mat kx,ky;
   cv::compute_derivative_kernels(kx,ky,dx,dy,scale);
   if(adapted)cloningAKAZESep(input,output,CV_32F,kx,ky);
   else cv::sepFilter2D(input,output,CV_32F,kx,ky);
  }else{
   cv::Size size(width/2,height/2);
   if(adapted)cloningAKAZEResize(input,output,size,0,0,cv::INTER_AREA);
   else cv::resize(input,output,size,0,0,cv::INTER_AREA);
  }
  return output.total();
 }catch(...){output.release();return 0;}
}
const float* akaze_probe_result(){return output.ptr<float>();}
void akaze_probe_release(){output.release();}
}
