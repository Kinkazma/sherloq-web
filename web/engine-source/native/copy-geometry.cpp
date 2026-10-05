// OpenCV 4.11.0: same seeded estimators and parameters as core/copy_geometry.py.
#include <opencv2/core.hpp>
#include <opencv2/calib3d.hpp>
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <vector>
extern "C" {
int copy_fit(const double* source,const double* target,int count,int model,double threshold,int reflection,double* output) {
 if(!source||!target||!output||count<4||model<1||model>3||!std::isfinite(threshold)||threshold<=0)return -1;
 try {
  cv::Mat a(count,2,CV_64F,const_cast<double*>(source)),b(count,2,CV_64F,const_cast<double*>(target)),matrix,inliers;
  if(reflection&&model==1){a=a.clone();a.col(0)*=-1;}
  cv::setRNGSeed(1701);
  if(model==3)matrix=cv::findHomography(a,b,cv::USAC_MAGSAC,threshold,inliers,5000,.995);
  else {
   cv::Mat affine=model==1?cv::estimateAffinePartial2D(a,b,inliers,cv::RANSAC,threshold,5000,.995,10):cv::estimateAffine2D(a,b,inliers,cv::RANSAC,threshold,5000,.995,10);
   if(affine.empty())return 0;
   matrix=cv::Mat::eye(3,3,CV_64F);affine.copyTo(matrix.rowRange(0,2));
  }
  if(matrix.empty()||!cv::checkRange(matrix))return 0;
  if(reflection&&model==1){cv::Mat mirror=cv::Mat::eye(3,3,CV_64F);mirror.at<double>(0,0)=-1;matrix=matrix*mirror;}
  cv::Mat values;cv::SVD::compute(matrix,values);
  if(values.at<double>(2)<=0||values.at<double>(0)/values.at<double>(2)>1e12)return 0;
  for(int i=0;i<9;i++)output[i]=matrix.at<double>(i/3,i%3);
  return 1;
 }catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-3:-2;}catch(const std::bad_alloc&){return -3;}catch(...){return -2;}
}
double copy_overlap(const float* a,const float* b,int count) {
 if(!a||!b||count<1)return -1;
 try {
  cv::Mat pa(count,1,CV_32FC2,const_cast<float*>(a)),pb(count,1,CV_32FC2,const_cast<float*>(b));
  std::vector<cv::Point2f> ha,hb,intersection;cv::convexHull(pa,ha);cv::convexHull(pb,hb);
  double area=std::min(cv::contourArea(ha),cv::contourArea(hb));
  if(area<=0)return 0;
  return std::max(0.,std::min(1.,cv::intersectConvexConvex(ha,hb,intersection,true)/area));
 }catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-3:-1;}catch(const std::bad_alloc&){return -3;}catch(...){return -1;}
}
int copy_draw_group(unsigned char* rgb,int width,int height,const double* points,const double* pairs,const uint32_t* rows,int count,const unsigned char* colors,const unsigned char* base,int flags){
 if(!rgb||width<1||height<1||!points||!pairs||!rows||count<1||!colors||!base)return 0;
 try{
  cv::Mat output(height,width,CV_8UC3,rgb);cv::Scalar family(base[2],base[1],base[0]);
  if(flags&8){
   std::vector<cv::Point2d> a,b;a.reserve(count);b.reserve(count);
   for(int i=0;i<count;i++){int ia=int(pairs[rows[i]*4]),ib=int(pairs[rows[i]*4+1]);a.emplace_back(points[ia*7],points[ia*7+1]);b.emplace_back(points[ib*7],points[ib*7+1]);}
   auto norm=[](cv::Point2d p){return std::sqrt(p.x*p.x+p.y*p.y);};const auto ref=a[0],other=b[0];
   for(int i=0;i<count;i++)if(norm(a[i]-ref)+norm(b[i]-other)>norm(a[i]-other)+norm(b[i]-ref))std::swap(a[i],b[i]);
   for(const auto& side:{a,b}){
    std::vector<cv::Point> rounded;std::vector<cv::Point2d> unique=side;std::sort(unique.begin(),unique.end(),[](auto a,auto b){return a.x<b.x||(a.x==b.x&&a.y<b.y);});unique.erase(std::unique(unique.begin(),unique.end()),unique.end());if(unique.size()<3)continue;
    for(auto p:side)rounded.emplace_back(cvRound(p.x),cvRound(p.y));std::vector<cv::Point> hull;cv::convexHull(rounded,hull);const auto rect=cv::boundingRect(hull);
    if(rect.x<0||rect.y<0||rect.x+rect.width>width||rect.y+rect.height>height)return 0;
    cv::Mat roi=output(rect),overlay=roi.clone();std::vector<cv::Point> local=hull;for(auto& p:local)p-=rect.tl();cv::fillConvexPoly(overlay,local,family,cv::LINE_AA);
    cv::addWeighted(overlay,.28,roi,.72,0,roi);cv::polylines(output,hull,true,family,2,cv::LINE_AA);
   }
  }
  for(int i=0;i<count;i++){
   int row=rows[i],ia=int(pairs[row*4]),ib=int(pairs[row*4+1]);cv::Point a(cvRound(points[ia*7]),cvRound(points[ia*7+1])),b(cvRound(points[ib*7]),cvRound(points[ib*7+1]));cv::Scalar color(colors[row*3+2],colors[row*3+1],colors[row*3]);
   if(flags&2)cv::line(output,a,b,color,1,cv::LINE_AA);
   if(flags&1){cv::circle(output,a,std::max(2,cvRound(points[ia*7+2]/2)),color,1,cv::LINE_AA);cv::circle(output,b,std::max(2,cvRound(points[ib*7+2]/2)),color,1,cv::LINE_AA);}
   if(flags&4){cv::circle(output,a,2,color,-1,cv::LINE_AA);cv::circle(output,b,2,color,-1,cv::LINE_AA);}
  }return 1;
 }catch(...){return 0;}
}
int copy_draw_polygon(unsigned char* rgb,int width,int height,const int32_t* coords,int count){
 if(!rgb||!coords||count<3)return 0;
 try{std::vector<cv::Point> polygon;for(int i=0;i<count;i++)polygon.emplace_back(coords[i*2],coords[i*2+1]);cv::Mat output(height,width,CV_8UC3,rgb);cv::polylines(output,polygon,true,cv::Scalar(255,165,0),1,cv::LINE_AA);return 1;}catch(...){return 0;}
}

}
