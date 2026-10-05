// Grayscale preprocessing and polygon semantics shared with the native CM2 path.
#include "../experiments/m3/sift-resize.cpp"
#include <opencv2/imgproc.hpp>
static cv::Mat scaledGray;
extern "C" {
void m3_sift_normalize(unsigned char* values,int count,int low,int high){const double a=high>low?255./(high-low):0,b=-low*a;for(int i=0;i<count;i++)values[i]=cv::saturate_cast<unsigned char>(std::fma(float(values[i]),float(a),float(b)));}
int m3_sift_scale_four(const unsigned char* input,int width,int height){try{siftResizeFour(cv::Mat(height,width,CV_8U,const_cast<unsigned char*>(input)),scaledGray);return 1;}catch(...){return -1;}}
const unsigned char* m3_sift_scaled_gray(){return scaledGray.data;}
void m3_sift_scaled_release(){scaledGray.release();}
int m3_sift_polygon(unsigned char* mask,int width,int height,const int32_t* xy,int count,int value){try{cv::Mat view(height,width,CV_8U,mask);std::vector<cv::Point> polygon;polygon.reserve(count);for(int i=0;i<count;i++)polygon.emplace_back(xy[i*2],xy[i*2+1]);cv::fillPoly(view,std::vector<std::vector<cv::Point>>{polygon},cv::Scalar(value));return 1;}catch(...){return 0;}}
}
