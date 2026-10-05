// Native OpenCV interpolation policy for D2PRL return to source coordinates.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <vector>
#include <algorithm>
#ifndef SHERLOQ_SPATIAL_MAX_INPUT
#define SHERLOQ_SPATIAL_MAX_INPUT 448
#endif
extern "C" int d2prl_resize_plane_probe(const float* input,int width,int height,int out_width,int out_height,int nearest,int mode,float* output){
 if(!input||!output||width<1||height<1||width>SHERLOQ_SPATIAL_MAX_INPUT||height>SHERLOQ_SPATIAL_MAX_INPUT||out_width<1||out_height<1||out_width>8192||out_height>8192||(int64_t)out_width*out_height>32*1024*1024||(nearest!=0&&nearest!=1))return 0;
 for(int i=0;i<width*height;i++)if(!std::isfinite(input[i]))return 0;
 try{
  if(!nearest && width==2*out_width && height==2*out_height){
   for(int y=0;y<out_height;y++)for(int x=0;x<out_width;x++){const float *a=input+2*y*width+2*x,*b=a+width;const float sum=x<(out_width/4)*4?(a[0]+a[1])+(b[0]+b[1]):((a[0]+a[1])+b[0])+b[1];output[y*out_width+x]=sum*.25f;}return 1;
  }
  // Pinned horizontal vector products, scalar fused tails, and fused vertical.
  // This order follows OpenCV4.11 native NEON plus scalar compiled arithmetic.
  // Identical size and exact2x downsample retain OpenCV's early copy/area path.
  if(!nearest && !(width==out_width&&height==out_height) && !(width==2*out_width&&height==2*out_height)){
   const double sx=1./((double)out_width/width),sy=1./((double)out_height/height);
   int xmax=out_width;std::vector<int> xs(out_width);std::vector<float> alpha(out_width);
   for(int x=0;x<out_width;x++){float f=(float)((x+.5)*sx-.5);int k=(int)std::floor(f);f-=k;if(k<0){k=0;f=0;}if(k>=width-1){k=width-1;f=0;xmax=std::min(xmax,x);}xs[x]=k;alpha[x]=f;}
   for(int y=0;y<out_height;y++){float f=(float)((y+.5)*sy-.5);int k=(int)std::floor(f);f-=k;const float b0=1.f-f,b1=f;const int y0=std::clamp(k,0,height-1),y1=std::clamp(k+1,0,height-1);
    for(int x=0;x<out_width;x++){const int x0=xs[x],x1=std::min(width-1,x0+1);const float a1=alpha[x],a0=1.f-a1;auto horizontal=[&](int yy){const float l=input[yy*width+x0],r=input[yy*width+x1];if(x>=xmax)return l;if(x>=(xmax/4)*4){if(mode/3==1)return std::fma(l,a0,r*a1);if(mode/3==2)return std::fma(r,a1,l*a0);}return l*a0+r*a1;};const float t0=horizontal(y0),t1=horizontal(y1);output[y*out_width+x]=x<(out_width/4)*4||mode%3==1?std::fma(t0,b0,t1*b1):mode%3==2?std::fma(t1,b1,t0*b0):t0*b0+t1*b1;}
   }return 1;
  }
  cv::Mat source(height,width,CV_32F,const_cast<float*>(input)),dest(out_height,out_width,CV_32F,output);cv::resize(source,dest,dest.size(),0,0,nearest?cv::INTER_NEAREST:cv::INTER_LINEAR);return 1;}catch(...){return 0;}
}

extern "C" int d2prl_resize_plane(const float* input,int w,int h,int ow,int oh,int nearest,float* output){return d2prl_resize_plane_probe(input,w,h,ow,oh,nearest,4,output);}
