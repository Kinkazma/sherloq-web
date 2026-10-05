#include "m3-image-shape.hpp"
// Portable copy/move primitives. The JS owner must admit all allocations.
// OpenCV 4.11.0 and pinned LLVM15 sorting retain their upstream licenses.
#include <opencv2/core.hpp>
#include <opencv2/features2d.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <cfloat>
#include <cstdint>
#include <cstring>
#include "cloning-legacy-sort.hpp"

// Results live only during one synchronous JS call/readback/release section.
// Drawing uses caller-owned memory and has no shared state between batches.
static std::vector<double> result;
static cv::Mat descriptors;
extern "C" void m3_brisk_set_points_only(int);
struct BriskPointsOnly {BriskPointsOnly(bool enabled){m3_brisk_set_points_only(enabled);}~BriskPointsOnly(){m3_brisk_set_points_only(0);}};
static int detect(const unsigned char* gray, const unsigned char* mask, int width, int height, int family, bool pointsOnly=false) {
    result.clear(); descriptors.release();
    if (!gray || !m3ImageShape(width,height,7)) return -1;
    try {
        cv::Ptr<cv::Feature2D> detector=family==2?cv::Ptr<cv::Feature2D>(cv::BRISK::create()):family==1?cv::Ptr<cv::Feature2D>(cv::AKAZE::create()):cv::Ptr<cv::Feature2D>(cv::ORB::create());
        cv::Mat image(height,width,CV_8U,const_cast<unsigned char*>(gray)), region;
        if (mask) region=cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(mask));
        BriskPointsOnly mode(pointsOnly);std::vector<cv::KeyPoint> points;detector->detectAndCompute(image,region,points,descriptors);
        result.reserve(points.size()*7);
        for (const auto& p:points) result.insert(result.end(),{p.pt.x,p.pt.y,p.size,p.angle,p.response,static_cast<double>(p.octave),static_cast<double>(p.class_id)});
        return static_cast<int>(points.size());
    } catch (const cv::Exception& error) {result.clear();descriptors.release();return error.code==cv::Error::StsNoMem?-3:-2;} catch (const std::bad_alloc&) {result.clear();descriptors.release();return -3;} catch (...) { result.clear(); descriptors.release(); return -2; }
}
extern "C" {
int cloning_detect(const unsigned char* gray, const unsigned char* mask, int width, int height) { return detect(gray,mask,width,height,false); }
int cloning_detect_akaze(const unsigned char* gray, const unsigned char* mask, int width, int height) { return detect(gray,mask,width,height,true); }
int cloning_detect_brisk(const unsigned char* gray, const unsigned char* mask, int width, int height) { return detect(gray,mask,width,height,2); }
int cloning_detect_brisk_points(const unsigned char* gray, const unsigned char* mask, int width, int height) {return detect(gray,mask,width,height,2,true);}
int cloning_describe_brisk(const unsigned char* gray,int width,int height,const double* packed,int count){
    result.clear();descriptors.release();if(count==0)return 0;
    try{std::vector<cv::KeyPoint> points;points.reserve(count);for(int i=0;i<count;i++){const double* p=packed+i*7;points.emplace_back(float(p[0]),float(p[1]),float(p[2]),float(p[3]),float(p[4]),int(p[5]),int(p[6]));}
        auto detector=cv::BRISK::create();detector->compute(cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(gray)),points,descriptors);
        result.reserve(points.size()*7);for(const auto& p:points)result.insert(result.end(),{p.pt.x,p.pt.y,p.size,p.angle,p.response,double(p.octave),double(p.class_id)});return int(points.size());
    }catch(const std::bad_alloc&){return -3;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-3:-2;}catch(...){return -2;}
}
const double* cloning_result() { return result.data(); }
const unsigned char* cloning_descriptors() { return descriptors.data; }
void cloning_release() { std::vector<double>().swap(result);descriptors.release(); }
int cloning_select(const double* points, int count, double response, uint32_t* indices) {
    if (count<0 || !std::isfinite(response) || response<0 || response>100 || (count && (!points || !indices))) return -1;
    if (!count) return 0;
    double low=points[4],high=low;
    for (int i=0;i<count;i++) { double v=points[i*7+4];if(!std::isfinite(v))return -1;low=std::min(low,v);high=std::max(high,v); }
    const double scale=100*(high-low>DBL_EPSILON?1/(high-low):0),shift=-low*scale;
    int selected=0;
    for (int i=0;i<count;i++) if (std::fma(points[i*7+4],scale,shift)>=100-response) indices[selected++]=i;
    return selected;
}
int cloning_match_sized(const unsigned char* source, int count, float radius, int start, int length, int stride) {
    result.clear();
    if (!count) return 0;
    if (!source || count<0 || start<0 || length<0 || length>64 || start>count-length || !std::isfinite(radius) || radius<=0 || (stride!=32 && stride!=61 && stride!=64)) return -1;
    try {
        std::vector<cv::DMatch> row;row.reserve(count);
        for (int query=start;query<start+length;query++) {
            row.clear();const unsigned char* a=source+query*stride;
            for (int train=0;train<count;train++) {
                const unsigned char* b=source+train*stride;int distance=0,k=0;
                for (;k+3<stride;k+=4) { uint32_t x,y;std::memcpy(&x,a+k,4);std::memcpy(&y,b+k,4);distance+=__builtin_popcount(x^y); }
                for (;k<stride;k++) distance+=__builtin_popcount(static_cast<unsigned>(a[k]^b[k]));
                if (distance<=radius) row.emplace_back(query-start,train,0,static_cast<float>(distance));
            }
            cloning_legacy::sort(row.begin(),row.end(),[](const cv::DMatch& a,const cv::DMatch& b){return a.distance<b.distance;});
            for (const auto& m:row) if(query!=m.trainIdx) result.insert(result.end(),{static_cast<double>(query),static_cast<double>(m.trainIdx),m.distance});
        }
        return static_cast<int>(result.size()/3);
    } catch (const std::bad_alloc&) { result.clear();return -3; } catch (...) { result.clear();return -2; }
}
int cloning_match(const unsigned char* source,int count,float radius,int start,int length) { return cloning_match_sized(source,count,radius,start,length,32); }
double cloning_norm(double x,double y) { return std::sqrt(std::fma(y,y,x*x)); }
int cloning_draw_points(unsigned char* rgb,int width,int height,const double* points,int count) {
    if(!rgb || width<1 || height<1 || count<0 || count>512 || (count&&!points))return 0;
    try {
        cv::Mat output(height,width,CV_8UC3,rgb);
        for(int i=0;i<count;i++) cv::circle(output,{static_cast<int>(points[i*7]),static_cast<int>(points[i*7+1])},2,cv::Scalar(72,227,250));
        return 1;
    }catch(...){return 0;}
}
int cloning_draw_matches(unsigned char* rgb,int width,int height,const int32_t* commands,int count,int hide) {
    if(!rgb || width<1 || height<1 || count<0 || count>128 || (count&&!commands))return 0;
    try {
        cv::Mat output(height,width,CV_8UC3,rgb),hsv(1,1,CV_8UC3),color;
        for(int i=0;i<count;i++) {
            const int32_t* c=commands+i*8;cv::Point a(c[0],c[1]),b(c[2],c[3]);
            hsv.at<cv::Vec3b>(0)=cv::Vec3b(c[6],255,c[7]);cv::cvtColor(hsv,color,cv::COLOR_HSV2RGB);
            auto value=color.at<cv::Vec3b>(0);cv::Scalar scalar(value[0],value[1],value[2]);
            cv::circle(output,a,c[4],scalar,1,cv::LINE_AA);cv::circle(output,b,c[5],scalar,1,cv::LINE_AA);
            if(!hide)cv::line(output,a,b,scalar,1,cv::LINE_AA);
        }
        return 1;
    }catch(...){return 0;}
}
int cloning_count(const float* angles,int count) {
    if(!count)return 0;
    if(!angles || count<0)return -1;
    try {
        cv::setRNGSeed(0);cv::Mat input(count,1,CV_32F,const_cast<float*>(angles)),labels;
        cv::TermCriteria criteria(cv::TermCriteria::EPS+cv::TermCriteria::MAX_ITER,10,1.);
        std::vector<double> compact;
        for(int k=1;k<=std::min(10,count);k++)compact.push_back(cv::kmeans(input,k,labels,criteria,10,cv::KMEANS_PP_CENTERS));
        auto bounds=std::minmax_element(compact.begin(),compact.end());double low=*bounds.first,high=*bounds.second;
        const double scale=high-low>DBL_EPSILON?1/(high-low):0,shift=-low*scale;
        for(size_t i=0;i<compact.size();i++)if(std::fma(compact[i],scale,shift)<.005)return static_cast<int>(i)+1;
        return 1;
    }catch(...){return -1;}
}
}

// GPU computes exact integer Hamming distances; retain the native CPU sorter,
// including its tie order and removal of the self match after sorting.
extern "C" int cloning_order_hamming(const uint32_t* distances,int count,float radius,int start,int length){
 result.clear();if(!distances||count<0||start<0||length<0||length>64||start>count-length)return -1;
 try{std::vector<cv::DMatch> row;row.reserve(count);for(int q=0;q<length;q++){row.clear();for(int t=0;t<count;t++){const auto d=distances[q*count+t];if(d<=radius)row.emplace_back(q,t,0,float(d));}cloning_legacy::sort(row.begin(),row.end(),[](const cv::DMatch&a,const cv::DMatch&b){return a.distance<b.distance;});for(const auto&m:row)if(start+q!=m.trainIdx)result.insert(result.end(),{double(start+q),double(m.trainIdx),m.distance});}return result.size()/3;}catch(const std::bad_alloc&){result.clear();return -3;}catch(...){result.clear();return -2;}
}
