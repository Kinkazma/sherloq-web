// Offline interpolation test. Both paths receive the same native source pixels.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
namespace cv { void cloningBriskArea(const Mat&,Mat&); }
static cv::Mat output;
extern "C" {
int probe_resize(const unsigned char* source,int width,int height,int targetWidth,int targetHeight,int adapted) {
    try {
        if (!source || width<1 || height<1 || targetWidth<1 || targetHeight<1 || targetWidth>width || targetHeight>height) return 0;
        cv::Mat input(height,width,CV_8U,const_cast<unsigned char*>(source));
        output.create(targetHeight,targetWidth,CV_8U);
        if (adapted) cv::cloningBriskArea(input,output);
        else cv::resize(input,output,output.size(),0,0,cv::INTER_AREA);
        return 1;
    } catch (...) { output.release(); return 0; }
}
const unsigned char* probe_result() { return output.data; }
void probe_release() { output.release(); }
}
