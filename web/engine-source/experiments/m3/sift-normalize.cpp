// OpenCV NORM_MINMAX uchar output uses float32 coefficients and native FMA.
#include <opencv2/core.hpp>
#include <cmath>
#include <cfloat>
static void siftNormalize(cv::Mat& gray){
 double low,high;cv::minMaxLoc(gray,&low,&high);double scale=high-low>DBL_EPSILON?255/(high-low):0,shift=-low*scale;
 const float a=float(scale),b=float(shift);
 for(int y=0;y<gray.rows;y++){auto* row=gray.ptr<unsigned char>(y);for(int x=0;x<gray.cols;x++)row[x]=cv::saturate_cast<unsigned char>(std::fma(float(row[x]),a,b));}
}
