#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cstdint>
// SAFIRE and FOCAL use native uint8 OpenCV interpolation before RGB conversion.
// RGB/BGR channel permutation commutes with this per-channel resize.
extern "C" int research_prepare(const uint8_t* rgb,int w,int h,float* output,int unit){
 if(!rgb||!output||w<1||h<1||w>16384||h>16384||(unit!=0&&unit!=1))return 0;
 try{cv::Mat input(h,w,CV_8UC3,const_cast<uint8_t*>(rgb)),resized;cv::resize(input,resized,{1024,1024},0,0,cv::INTER_LINEAR);for(int i=0;i<1024*1024;i++)for(int c=0;c<3;c++)output[c*1024*1024+i]=unit?float(double(resized.data[i*3+c])/255.):float(resized.data[i*3+c]);return 1;}catch(...){return -1;}
}
