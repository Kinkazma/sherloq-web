// Forgeryscope's LightGlue SIFT profile: it differs from CM2 preprocessing.
// The OpenCV SIFT numerical object is shared with M3, not reimplemented here.
#include <opencv2/core.hpp>
#include <opencv2/features2d.hpp>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>
static cv::Mat descriptors,gray;
static std::vector<float> points;
extern "C" int fg_sift(const uint8_t* rgb,int width,int height,int transform){
  if(!rgb||width<1||height<1||transform<0||transform>3)return -1;
  try{
    cv::setNumThreads(1);points.clear();descriptors.release();
    gray.create(height,width,CV_8U);
    for(int y=0;y<height;y++)for(int x=0;x<width;x++){
      int xx=(transform==1||transform==3)?width-1-x:x,yy=(transform==2||transform==3)?height-1-y:y;
      const uint8_t* pixel=rgb+3*(yy*width+xx);
      // numpy RGB/255 float64 -> Torch float32 -> Kornia gray -> uint8 truncation.
      float r=float(double(pixel[0])/255.),g=float(double(pixel[1])/255.),b=float(double(pixel[2])/255.);
      float value=((r*.299f+g*.587f)+b*.114f)*255.f;
      gray.at<uint8_t>(y,x)=uint8_t(value);
    }
    std::vector<cv::KeyPoint> detected;
    cv::Mat raw;
    cv::SIFT::create(4096,4,.0066667,10)->detectAndCompute(gray,cv::noArray(),detected,raw);
    if(detected.empty())return 0;
    const int n=detected.size();
    std::vector<int> cells(n),keep;
    std::vector<float> maximum(size_t(width)*height,0),angle(size_t(width)*height,INFINITY);
    for(int i=0;i<n;i++){
      int x=int(std::nearbyint(detected[i].pt.x-.5f)),y=int(std::nearbyint(detected[i].pt.y-.5f));
      if(x<0||y<0||x>=width||y>=height)return -2;
      cells[i]=y*width+x;maximum[cells[i]]=std::max(maximum[cells[i]],detected[i].response);
    }
    const float radians=float(CV_PI/180.);
    for(int i=0;i<n;i++)if(detected[i].response==maximum[cells[i]])angle[cells[i]]=std::min(angle[cells[i]],std::abs(detected[i].angle*radians));
    for(int i=0;i<n;i++)if(detected[i].response==maximum[cells[i]]&&std::abs(detected[i].angle*radians)==angle[cells[i]])keep.push_back(i);
    if(keep.size()>4096){
      auto compare=[&](int a,int b){return detected[a].response>detected[b].response;};
      if(4096*64<=keep.size())std::partial_sort(keep.begin(),keep.begin()+4096,keep.end(),compare);
      else{std::nth_element(keep.begin(),keep.begin()+4095,keep.end(),compare);std::sort(keep.begin(),keep.begin()+4095,compare);}
      keep.resize(4096);
    }
    descriptors.create(int(keep.size()),128,CV_32F);points.reserve(keep.size()*5);
    for(size_t i=0;i<keep.size();i++){
      const auto& p=detected[keep[i]];
      points.insert(points.end(),{(p.pt.x+.5f)-.5f,(p.pt.y+.5f)-.5f,p.size,p.angle*radians,p.response});
      raw.row(keep[i]).copyTo(descriptors.row(int(i)));
    }
    return int(keep.size());
  }catch(...){return -1;}
}
extern "C" const float* fg_sift_points(){return points.data();}
extern "C" const float* fg_sift_descriptors(){return descriptors.ptr<float>();}
extern "C" const uint8_t* fg_sift_gray(){return gray.ptr<uint8_t>();}
extern "C" void fg_sift_release(){std::vector<float>().swap(points);descriptors.release();gray.release();}
