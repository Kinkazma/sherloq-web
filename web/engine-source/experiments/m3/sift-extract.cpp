#include "sift-normalize.cpp"
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/features2d.hpp>
#include <vector>
#include <cmath>
#include "sift-resize.cpp"
static std::vector<float> packed;
static cv::Mat descriptors, prepared, rawGray, normalizedGray;
extern "C" {
// One ROI at a time, BGR input in native reference channel order.
int sift_extract(const unsigned char* bgr,const unsigned char* mask,int width,int height,int limit){
 try{
  packed.clear();descriptors.release();
  cv::Mat gray,enlarged,region;
  cv::cvtColor(cv::Mat(height,width,CV_8UC3,const_cast<unsigned char*>(bgr)),gray,cv::COLOR_BGR2GRAY);
  rawGray=gray.clone();siftNormalize(gray);normalizedGray=gray.clone();
  int scale=(width+height)/2.0<1024?4:1;
  if(int64_t(width)*height*scale*scale>32000000)return -2;
  if(scale==4)siftResizeFour(gray,enlarged);else enlarged=gray.clone();
  if(mask)cv::resize(cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(mask)),region,enlarged.size(),0,0,cv::INTER_NEAREST);
  prepared=enlarged.clone();
  std::vector<cv::KeyPoint> points;
  cv::SIFT::create(limit*2,3,.001)->detectAndCompute(enlarged,region,points,descriptors);
  packed.reserve(points.size()*7);
  for(const auto& p:points){packed.insert(packed.end(),{p.pt.x/scale,p.pt.y/scale,p.size/scale,p.angle,p.response,float(p.octave),float(p.class_id)});}
  return int(points.size());
 }catch(...){packed.clear();descriptors.release();return -1;}
}
const unsigned char* sift_gray(int normalized){return (normalized?normalizedGray:rawGray).ptr<unsigned char>();}
const unsigned char* sift_prepared(){return prepared.ptr<unsigned char>();}
const float* sift_points(){return packed.data();}
const float* sift_descriptors(){return descriptors.ptr<float>();}
void sift_release(){std::vector<float>().swap(packed);descriptors.release();}
}
