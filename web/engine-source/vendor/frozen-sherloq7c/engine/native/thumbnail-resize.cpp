#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <new>
// Preserve the complete native Lanczos4 coordinate system. The caller exports
// output rows and compares them to a segmented source without materializing it.
static cv::Mat resized;
static int failure=0;
extern "C" {
int thumbnail_resize(const unsigned char* rgb,int sw,int sh,int width,int height){
 resized.release();failure=0;
 if(!rgb||sw<1||sh<1||width<1||height<1||sw>65500||sh>65500||width>65500||height>65500){failure=1;return 0;}
 try{cv::Mat source(sh,sw,CV_8UC3,const_cast<unsigned char*>(rgb));cv::resize(source,resized,{width,height},0,0,cv::INTER_LANCZOS4);return 1;}
 catch(const cv::Exception& e){failure=e.code==cv::Error::StsNoMem?2:1;}catch(const std::bad_alloc&){failure=2;}catch(...){failure=1;}
 resized.release();return 0;
}
int thumbnail_error(){return failure;}
const unsigned char* thumbnail_data(){return resized.data;}
int thumbnail_size(){return int(resized.total()*resized.elemSize());}
void thumbnail_close(){resized.release();}
}
