#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <algorithm>
static cv::Mat labels,stats,centroids,pixels;
static std::vector<int> coordinates,offsets;
static int count=0;
static cv::Mat scope_mask,scope_cells;
static std::vector<cv::Point2f> points(const float* xy,int n){std::vector<cv::Point2f> p;for(int i=0;i<n;i++)p.emplace_back(xy[2*i],xy[2*i+1]);return p;}
extern "C" {
int clone_entry_hull(const float* xy,int n,float* out){try{auto p=points(xy,n);std::vector<cv::Point2f> hull;cv::convexHull(p,hull);if(hull.size()<3||cv::contourArea(hull)<=0)return 0;for(int i=0;i<int(hull.size());i++){out[2*i]=hull[i].x;out[2*i+1]=hull[i].y;}return int(hull.size());}catch(...){return -1;}}
double clone_entry_distance(const float* a,int na,const float* b,int nb){try{auto ma=cv::moments(points(a,na)),mb=cv::moments(points(b,nb));double x=ma.m10/ma.m00-mb.m10/mb.m00,y=ma.m01/ma.m00-mb.m01/mb.m00;return std::sqrt(x*x+y*y);}catch(...){return -1;}}
double clone_entry_overlap(const float* a,int na,const float* b,int nb){try{auto p=points(a,na),q=points(b,nb);for(auto* v:{&p,&q})for(auto& x:*v){x.x=std::nearbyint(double(x.x));x.y=std::nearbyint(double(x.y));}std::vector<cv::Point2f> h,k,intersection;cv::convexHull(p,h);cv::convexHull(q,k);double area=std::min(cv::contourArea(h),cv::contourArea(k));if(area<=0)return 0;return std::clamp(double(cv::intersectConvexConvex(h,k,intersection,true))/area,0.,1.);}catch(...){return -1;}}
void clone_regions_close(){labels.release();stats.release();centroids.release();pixels.release();coordinates.clear();offsets.clear();count=0;}
int clone_regions_begin(const unsigned char* mask,int width,int height){clone_regions_close();try{cv::Mat source(height,width,CV_8U,const_cast<unsigned char*>(mask));count=cv::connectedComponentsWithStats(source,labels,stats,centroids,8,CV_32S);return count-1;}catch(...){clone_regions_close();return -1;}}
int clone_regions_select(int id){try{if(id<1||id>=count)return 0;const int* s=stats.ptr<int>(id);pixels=(labels(cv::Rect(s[0],s[1],s[2],s[3]))==id);pixels/=255;std::vector<std::vector<cv::Point>> contours;cv::findContours(pixels,contours,cv::RETR_EXTERNAL,cv::CHAIN_APPROX_SIMPLE);coordinates.clear();offsets.clear();offsets.push_back(0);for(const auto& contour:contours){for(auto p:contour){coordinates.push_back(p.x+s[0]);coordinates.push_back(p.y+s[1]);}offsets.push_back(int(coordinates.size()/2));}return 1;}catch(...){return 0;}}
const int* clone_regions_stats(int id){return id>=1&&id<count?stats.ptr<int>(id):nullptr;}
const unsigned char* clone_regions_pixels(){return pixels.data;}
const int* clone_regions_coordinates(){return coordinates.data();}
const int* clone_regions_offsets(){return offsets.data();}
int clone_regions_contours(){return int(offsets.size())-1;}
int clone_regions_points(){return int(coordinates.size()/2);}
int clone_mask_contours(const unsigned char* mask,int width,int height,int x,int y){try{cv::Mat input(height,width,CV_8U,const_cast<unsigned char*>(mask));std::vector<std::vector<cv::Point>> contours;cv::findContours(input,contours,cv::RETR_EXTERNAL,cv::CHAIN_APPROX_SIMPLE);coordinates.clear();offsets.clear();offsets.push_back(0);for(const auto& contour:contours){for(auto p:contour){coordinates.push_back(p.x+x);coordinates.push_back(p.y+y);}offsets.push_back(int(coordinates.size()/2));}return 1;}catch(...){return 0;}}
int clone_scope_begin(int width,int height){try{scope_mask=cv::Mat::zeros(height,width,CV_8U);return 1;}catch(...){return 0;}}
int clone_scope_fill(const int* xy,int n,int value){try{std::vector<cv::Point> p;for(int i=0;i<n;i++)p.emplace_back(xy[2*i],xy[2*i+1]);cv::fillPoly(scope_mask,std::vector<std::vector<cv::Point>>{p},value);return 1;}catch(...){return 0;}}
const unsigned char* clone_scope_data(){return scope_mask.data;}
const unsigned char* clone_scope_cells(int block){try{int rows=scope_mask.rows/block,cols=scope_mask.cols/block;scope_cells=cv::Mat(rows,cols,CV_8U,cv::Scalar(1));for(int y=0;y<rows;y++)for(int x=0;x<cols;x++)for(int yy=y*block;yy<(y+1)*block;yy++){const unsigned char* row=scope_mask.ptr<unsigned char>(yy);for(int xx=x*block;xx<(x+1)*block;xx++)if(!row[xx])scope_cells.at<unsigned char>(y,x)=0;}return scope_cells.data;}catch(...){return nullptr;}}
void clone_scope_close(){scope_mask.release();scope_cells.release();}
}
