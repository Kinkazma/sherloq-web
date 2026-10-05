// OpenCV 4.11 raster semantics used by native clone_corroboration.py.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
extern "C" {
int composition_fill(unsigned char* mask,int width,int height,const int* xy,int size,int convex,int value){
 if(!mask||!xy||width<1||height<1||size<3)return 0;
 try{cv::Mat dst(height,width,CV_8U,mask);std::vector<cv::Point> p;for(int i=0;i<size;i++)p.emplace_back(xy[2*i],xy[2*i+1]);
  if(convex)cv::fillConvexPoly(dst,p,value);else cv::fillPoly(dst,std::vector<std::vector<cv::Point>>{p},value);return 1;
 }catch(...){return 0;}
}
double composition_iou(const float* a,int na,const float* b,int nb){
 try{std::vector<cv::Point2f> p,q,r;for(int i=0;i<na;i++)p.emplace_back(a[2*i],a[2*i+1]);for(int i=0;i<nb;i++)q.emplace_back(b[2*i],b[2*i+1]);
  double inter=cv::intersectConvexConvex(p,q,r),sum=cv::contourArea(p)+cv::contourArea(q)-inter;return sum>0?inter/sum:0;
 }catch(...){return -1;}
}
}
