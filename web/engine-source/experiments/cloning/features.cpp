// Offline parity probe. No product entry point or runtime activation.
#include <opencv2/core.hpp>
#include <opencv2/features2d.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <cmath>
#include <limits>
#include <cstring>
#include <cstdint>
#include "cloning-legacy-sort.hpp"
static std::vector<double> packed;
static std::vector<double> matched;
static cv::Mat descriptors;
static cv::Mat output;
static std::vector<double> compactness;
extern "C" {
int features_detect(const unsigned char* gray, const unsigned char* mask,
                    int width, int height, int algorithm) {
    packed.clear(); descriptors.release();
    if (!gray || width < 1 || height < 1 || algorithm < 0 || algorithm > 2) return -1;
    try {
        cv::Ptr<cv::Feature2D> detector;
        if (algorithm == 0) detector = cv::BRISK::create();
        else if (algorithm == 1) detector = cv::ORB::create();
        else detector = cv::AKAZE::create();
        cv::Mat input(height, width, CV_8U, const_cast<unsigned char*>(gray));
        cv::Mat region;
        if (mask) region = cv::Mat(height, width, CV_8U, const_cast<unsigned char*>(mask));
        std::vector<cv::KeyPoint> points;
        detector->detectAndCompute(input, region, points, descriptors);
        packed.reserve(points.size()*7);
        for (const auto& p : points) {
            packed.insert(packed.end(), {p.pt.x, p.pt.y, p.size, p.angle, p.response,
                                         static_cast<double>(p.octave), static_cast<double>(p.class_id)});
        }
        return static_cast<int>(points.size());
    } catch (...) { packed.clear(); descriptors.release(); return -2; }
}
const double* features_points() { return packed.data(); }
const unsigned char* features_descriptors() { return descriptors.data; }
int features_descriptor_size() { return descriptors.cols; }
int features_select(double response) {
    if (!std::isfinite(response) || response < 0 || response > 100) return -1;
    if (packed.empty()) return 0;
    double low = packed[4], high = low;
    for (size_t i=4; i<packed.size(); i+=7) { low = std::min(low, packed[i]); high = std::max(high, packed[i]); }
    double scale = 100*(high-low > std::numeric_limits<double>::epsilon() ? 1/(high-low) : 0);
    double shift = -low*scale;
    std::vector<double> selected;
    cv::Mat kept;
    for (size_t i=0; i<packed.size()/7; ++i) {
        if (std::fma(packed[i*7+4], scale, shift) >= 100-response) {
            selected.insert(selected.end(), packed.begin()+i*7, packed.begin()+(i+1)*7);
            kept.push_back(descriptors.row(static_cast<int>(i)));
        }
    }
    packed.swap(selected); descriptors = kept;
    return static_cast<int>(packed.size()/7);
}
int features_match(const unsigned char* source, int count, int stride, float radius, int start, int length) {
    matched.clear();
    if (count == 0) return 0;
    if (!source || count < 0 || stride < 1 || start < 0 || length < 0 || start > count-length) return -1;
    try {
        cv::Mat input(count, stride, CV_8U, const_cast<unsigned char*>(source));
        auto matcher = cv::BFMatcher::create(cv::NORM_HAMMING, true);
        std::vector<std::vector<cv::DMatch>> result;
        matcher->radiusMatch(input.rowRange(start, start+length), input, result, radius);
        for (auto& row : result) {
            // radiusMatch first appends train indices in increasing order, then
            // sorts only by distance. Equal-distance order affects clustering.
            std::sort(row.begin(), row.end(), [](const cv::DMatch& a, const cv::DMatch& b){ return a.trainIdx < b.trainIdx; });
            cloning_legacy::sort(row.begin(), row.end(), [](const cv::DMatch& a, const cv::DMatch& b){ return a.distance < b.distance; });
            for (const auto& m : row) if (m.queryIdx+start != m.trainIdx) matched.insert(matched.end(), {static_cast<double>(m.queryIdx+start), static_cast<double>(m.trainIdx), m.distance});
        }
        return static_cast<int>(matched.size()/3);
    } catch (...) { matched.clear(); return -2; }
}
const double* features_matches() { return matched.data(); }
int features_match_direct(const unsigned char* source, int count, int stride, float radius, int start, int length) {
    matched.clear();
    if (count==0) return 0;
    if (!source || count<0 || count>30000 || stride<1 || stride>64 || start<0 || length<0 || length>64 || start>count-length || !std::isfinite(radius) || radius<=0) return -1;
    try {
        std::vector<cv::DMatch> row;row.reserve(count);
        for (int query=start;query<start+length;query++) {
            row.clear();const unsigned char* a=source+query*stride;
            for (int train=0;train<count;train++) {
                const unsigned char* b=source+train*stride;int distance=0,k=0;
                for (;k+3<stride;k+=4) { uint32_t x,y;std::memcpy(&x,a+k,4);std::memcpy(&y,b+k,4);distance+=__builtin_popcount(x^y); }
                for (;k<stride;k++) distance+=__builtin_popcount(static_cast<unsigned>(a[k]^b[k]));
                // Keep self in the sort, then remove it, like radiusMatch.
                if (distance<=radius) row.emplace_back(query-start,train,0,static_cast<float>(distance));
            }
            cloning_legacy::sort(row.begin(),row.end(),[](const cv::DMatch& a,const cv::DMatch& b){return a.distance<b.distance;});
            for (const auto& value:row) if (query!=value.trainIdx) matched.insert(matched.end(),{static_cast<double>(query),static_cast<double>(value.trainIdx),value.distance});
        }
        return static_cast<int>(matched.size()/3);
    } catch (...) { matched.clear(); return -2; }
}
double features_norm(double x, double y) { return std::sqrt(std::fma(y,y,x*x)); }
int features_heap_fallbacks() { return cloning_legacy::heapFallbacks; }
int features_render(const unsigned char* rgb, int width, int height, const double* points,
                    int pointCount, const int* commands, int count, int show, int hide) {
    try {
        output = cv::Mat(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)).clone();
        if (show) for (int i=0;i<pointCount;i++) cv::circle(output,{static_cast<int>(points[i*7]),static_cast<int>(points[i*7+1])},2,cv::Scalar(72,227,250));
        for (int i=0;i<count;i++) {
            const int* c = commands+i*8;
            cv::Mat hsv(1,1,CV_8UC3), color;
            hsv.at<cv::Vec3b>(0) = cv::Vec3b(c[6],255,c[7]);
            cv::cvtColor(hsv,color,cv::COLOR_HSV2RGB);
            auto value=color.at<cv::Vec3b>(0);cv::Scalar scalar(value[0],value[1],value[2]);
            cv::Point a(c[0],c[1]),b(c[2],c[3]);
            cv::circle(output,a,c[4],scalar,1,cv::LINE_AA);cv::circle(output,b,c[5],scalar,1,cv::LINE_AA);
            if (!hide) cv::line(output,a,b,scalar,1,cv::LINE_AA);
        }
        return 1;
    } catch (...) { output.release(); return 0; }
}
const unsigned char* features_output() { return output.data; }
int features_count(const float* angles, int count) {
    compactness.clear();
    if (count<1) return 0;
    try {
        cv::setRNGSeed(0);
        cv::Mat input(count,1,CV_32F,const_cast<float*>(angles)),labels;
        cv::TermCriteria criteria(cv::TermCriteria::EPS+cv::TermCriteria::MAX_ITER,10,1.);
        for (int k=1;k<=std::min(10,count);k++) compactness.push_back(cv::kmeans(input,k,labels,criteria,10,cv::KMEANS_PP_CENTERS));
        const auto bounds=std::minmax_element(compactness.begin(),compactness.end());
        double low=*bounds.first,high=*bounds.second;
        double scale=high-low>std::numeric_limits<double>::epsilon()?1/(high-low):0,shift=-low*scale;
        for (size_t i=0;i<compactness.size();i++) if (std::fma(compactness[i],scale,shift)<.005) return static_cast<int>(i)+1;
        return 1;
    } catch (...) { return -1; }
}
const double* features_compactness() { return compactness.data(); }
void features_release() { std::vector<double>().swap(packed); std::vector<double>().swap(matched); std::vector<double>().swap(compactness); descriptors.release(); output.release(); }
}
