#include "m3-image-shape.hpp"
#include "../experiments/m3/sift-normalize.cpp"
// Native CM2 feature families, independent from the historical cloning engine.
#include <opencv2/core.hpp>
#include <opencv2/features2d.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <numeric>
#include <cmath>
#include "../experiments/m3/sift-resize.cpp"
static std::vector<float> packed;
static cv::Mat descriptors;
static int totalFeatures=0;
extern "C" void m3_brisk_set_limit(int);
extern "C" int m3_brisk_total();
struct BriskLimit {BriskLimit(int n){m3_brisk_set_limit(n);}~BriskLimit(){m3_brisk_set_limit(0);}};
extern "C" {
void sparse_release(){std::vector<float>().swap(packed);descriptors.release();}
int sparse_polygon(unsigned char* mask,int width,int height,const int32_t* xy,int count,int value){
 if(!mask||width<1||height<1||!xy||count<3||count>100000)return 0;
 try{cv::Mat view(height,width,CV_8U,mask);std::vector<cv::Point> polygon;polygon.reserve(count);for(int i=0;i<count;i++)polygon.emplace_back(xy[i*2],xy[i*2+1]);cv::fillPoly(view,std::vector<std::vector<cv::Point>>{polygon},cv::Scalar(value));return 1;}catch(...){return 0;}
}
int sparse_extract(const unsigned char* bgr,const unsigned char* mask,int width,int height,int limit,int family,int grayscale){
 sparse_release();totalFeatures=0;if(!bgr||!m3ImageShape(width,height)||limit<100||limit>20000||family<0||family>5)return -1;
 try{
  cv::Mat gray,region;if(grayscale)gray=cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(bgr));else cv::cvtColor(cv::Mat(height,width,CV_8UC3,const_cast<unsigned char*>(bgr)),gray,cv::COLOR_BGR2GRAY);
  if(family==5&&!grayscale)for(int i=0;i<width*height;i++){float r=float(bgr[i*3+2])/255.f,g=float(bgr[i*3+1])/255.f,b=float(bgr[i*3])/255.f;gray.data[i]=uint8_t(((r*.299f+g*.587f)+b*.114f)*255.f);}
  if(mask)region=cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(mask));
  cv::Ptr<cv::Feature2D> detector;int scale=1;
  if(family==4){siftNormalize(gray);scale=(width+height)/2.0<1024?4:1;if(int64_t(width)*height*scale*scale>32000000)return -3;
   if(scale==4){cv::Mat enlarged;siftResizeFour(gray,enlarged);gray=enlarged;if(mask){cv::Mat resized;cv::resize(region,resized,gray.size(),0,0,cv::INTER_NEAREST);region=resized;}}
   detector=cv::SIFT::create(limit*2,3,.001);
  }else if(family==5)detector=cv::SIFT::create(0,4,.0066667,10);
  else if(family==0)detector=cv::SIFT::create(limit);
  else if(family==1)detector=cv::AKAZE::create();
  else if(family==2)detector=cv::BRISK::create();
  else detector=cv::ORB::create(limit);
  BriskLimit briskLimit(family==2?limit:0);std::vector<cv::KeyPoint> points;detector->detectAndCompute(gray,region,points,descriptors);
  if(family==5){
   const int n=width*height;std::vector<float> best(n,0.f),angle(n,INFINITY);auto cell=[&](const cv::KeyPoint& p){return cvRound(p.pt.y-.5f)*width+cvRound(p.pt.x-.5f);};
   for(const auto& p:points)best[cell(p)]=std::max(best[cell(p)],p.response);
   for(const auto& p:points)if(best[cell(p)]==p.response)angle[cell(p)]=std::min(angle[cell(p)],p.angle);
   std::vector<int> ids;for(int i=0;i<int(points.size());i++){const auto& p=points[i];if(best[cell(p)]!=p.response||angle[cell(p)]!=p.angle)continue;const int x=std::clamp(cvRound(p.pt.x),0,width-1),y=std::clamp(cvRound(p.pt.y),0,height-1);if(mask&&!mask[y*width+x])continue;ids.push_back(i);}
   totalFeatures=ids.size();std::stable_sort(ids.begin(),ids.end(),[&](int a,int b){return points[a].response>points[b].response;});if(ids.size()>size_t(limit))ids.resize(limit);
   std::stable_sort(ids.begin(),ids.end(),[&](int a,int b){return points[a].pt.y!=points[b].pt.y?points[a].pt.y<points[b].pt.y:points[a].pt.x<points[b].pt.x;});
   cv::Mat selected(ids.size(),128,CV_32F);std::vector<cv::KeyPoint> chosen;chosen.reserve(ids.size());
   for(int i=0;i<int(ids.size());i++){auto p=points[ids[i]];p.angle=(p.angle*float(CV_PI/180))*float(180/CV_PI);p.octave=0;p.class_id=-1;chosen.push_back(p);const float* raw=descriptors.ptr<float>(ids[i]);float* d=selected.ptr<float>(i);float sum=0,lanes[4]={};for(int j=0;j<128;j++)sum+=raw[j];sum=std::max(sum,1e-6f);for(int j=0;j<128;j++){d[j]=std::sqrt(std::max(raw[j]/sum,1e-6f));lanes[j%4]+=d[j]*d[j];}float norm=std::max(std::sqrt(((lanes[0]+lanes[1])+lanes[2])+lanes[3]),1e-6f);for(int j=0;j<128;j++)d[j]/=norm;}
   descriptors=selected;points=std::move(chosen);
  }else {
   totalFeatures=family==2?m3_brisk_total():points.size();
   if(family!=4&&points.size()>size_t(limit)){
    std::vector<int> ids(points.size());std::iota(ids.begin(),ids.end(),0);
    std::partial_sort(ids.begin(),ids.begin()+limit,ids.end(),[&](int a,int b){return points[a].response!=points[b].response?points[a].response>points[b].response:a<b;});ids.resize(limit);
    cv::Mat selected(limit,descriptors.cols,descriptors.type());std::vector<cv::KeyPoint> chosen;chosen.reserve(limit);
    for(int i=0;i<limit;i++){chosen.push_back(points[ids[i]]);descriptors.row(ids[i]).copyTo(selected.row(i));}points=std::move(chosen);descriptors=selected;
   }
  }
  packed.reserve(points.size()*7);for(const auto& p:points)packed.insert(packed.end(),{p.pt.x/scale,p.pt.y/scale,p.size/scale,p.angle,p.response,float(p.octave),float(p.class_id)});
  return points.size();
 }catch(const std::bad_alloc&){sparse_release();return -4;}catch(const cv::Exception& e){sparse_release();return e.code==cv::Error::StsNoMem?-4:-2;}catch(...){sparse_release();return -2;}
}
const float* sparse_points(){return packed.data();}
const unsigned char* sparse_descriptors(){return descriptors.data;}
int sparse_descriptor_size(){return descriptors.cols;}
int sparse_total_features(){return totalFeatures;}
}
