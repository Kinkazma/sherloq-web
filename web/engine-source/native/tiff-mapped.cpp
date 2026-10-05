#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <new>
static cv::Mat output;
static int failure;
extern "C" {
int tiff_decode(const unsigned char* bytes,int length,int grayscale){
 output.release();failure=0;
 try{
  cv::Mat encoded(1,length,CV_8U,const_cast<unsigned char*>(bytes));
  output=cv::imdecode(encoded,grayscale?cv::IMREAD_GRAYSCALE:cv::IMREAD_COLOR);
  if(output.empty()){failure=1;return 0;}
  if(output.depth()!=CV_8U||output.channels()!=(grayscale?1:3)){failure=1;output.release();return 0;}
  if(!grayscale)for(int y=0;y<output.rows;y++){auto row=output.ptr<unsigned char>(y);for(int x=0;x<output.cols;x++)std::swap(row[x*3],row[x*3+2]);}
  return 1;
 }catch(const cv::Exception& e){failure=e.code==cv::Error::StsNoMem?2:1;}catch(const std::bad_alloc&){failure=2;}catch(...){failure=1;}
 output.release();return 0;
}
int tiff_error(){return failure;}
int tiff_width(){return output.cols;}
int tiff_height(){return output.rows;}
int tiff_size(){return output.total()*output.elemSize();}
const unsigned char* tiff_data(){return output.data;}
void tiff_release(){output.release();}
}
