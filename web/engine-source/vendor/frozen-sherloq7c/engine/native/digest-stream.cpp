// Native img_hash algorithms with bounded source-row preparation.
// Scientific Color/Marr arithmetic stays shared with the qualified contiguous port.
#include "digest-extra.cpp"
#include <opencv2/core/softfloat.hpp>
#include "fixedpoint.inl.hpp"
#include <cstdint>
struct ProjectionSample {uint32_t x,target;};
static void captureProjection(int y,int x,unsigned char* target);
struct ProjectionShape {int rows,cols;ProjectionShape(int h,int w):rows(h),cols(w){} ProjectionShape(const cv::Mat& image):rows(image.rows),cols(image.cols){}};
#include "radial-tables.h"
#include "radial-variance-capture.cpp"
static int sourceWidth,sourceHeight,kind,side,neededStart,neededCount,capturePhase;
static cv::Mat prepared;
static std::vector<uint32_t> rowOffsets,rowCursor;
static std::vector<ProjectionSample> projectionSamples;
static RadialVarianceHashImpl radial(1.,180);
static void captureProjection(int y,int x,unsigned char* target){
 if(capturePhase==0)rowOffsets[y+1]++;
 else projectionSamples[rowCursor[y]++]={uint32_t(x),uint32_t(target-radial.projections_.data)};
}
static int linearCoefficients(int val,int source,int target,ufixedpoint16* coeffs){
 const cv::softdouble scale=cv::softdouble::one()/cv::softdouble(double(target)/source);
 const auto fval=scale*(cv::softdouble(val)+cv::softdouble(.5))-cv::softdouble(.5);const int offset=cvFloor(fval);
 if(offset<0||source==1){coeffs[0]=ufixedpoint16::one();coeffs[1]=ufixedpoint16::zero();return 0;}
 if(offset>=source-1){coeffs[0]=ufixedpoint16::one();coeffs[1]=ufixedpoint16::zero();return source-1;}
 coeffs[1]=fval-cv::softdouble(offset);coeffs[0]=ufixedpoint16::one()-coeffs[1];return offset;
}
static int cubicCoordinates(int val,int source,short* coeffs){
 const float coordinate=float(std::fma(val+.5,1./(512./source),-.5));const int offset=cvFloor(coordinate);cubicWeights(coordinate-offset,coeffs);return offset;
}
static void finishMarr(const cv::Mat& resized){
 // Identical post-resize operations to native/digest-extra.cpp, kind3 stage6.
 cv::Mat equalized,kernel(17,17,CV_32F),frequency;cv::equalizeHist(resized,equalized);
 for(int y=0;y<17;y++)for(int x=0;x<17;x++){float xx=(x-8)*.5f,yy=(y-8)*.5f,a=xx*xx+yy*yy;kernel.at<float>(y,x)=(2-a)*std::exp(a/2);}
 cv::filter2D(equalized,frequency,CV_32F,kernel);
 cv::Mat blocks(31,31,CV_32F);for(int y=0;y<31;y++)for(int x=0;x<31;x++)blocks.at<float>(y,x)=nativeSum(frequency(cv::Rect(y*16,x*16,16,16)));
 output=cv::Mat::zeros(1,72,CV_8U);int bit=0;unsigned char byte=0;
 for(int y=0;y<29;y+=4)for(int x=0;x<29;x+=4){const auto roi=blocks(cv::Rect(x,y,3,3));float mean=nativeSum(roi)/9.;for(int i=0;i<3;i++)for(int j=0;j<3;j++){byte<<=1;byte|=roi.at<float>(i,j)>mean;bit++;if(bit%8==0){output.ptr<unsigned char>()[bit/8-1]=byte;byte=0;}}}
}
extern "C" {
void hash_stream_close(){prepared.release();output.release();radial.projections_.release();radial.pixPerLine_.release();radial.features_.clear();std::vector<uint32_t>().swap(rowOffsets);std::vector<uint32_t>().swap(rowCursor);std::vector<ProjectionSample>().swap(projectionSamples);}
int hash_stream_begin(int width,int height,int algorithm){try{
 hash_stream_close();if(width<1||height<1||width>65500||height>65500||algorithm<0||algorithm>5)return 0;
 sourceWidth=width;sourceHeight=height;kind=algorithm;side=kind==0?8:kind==1?256:kind==4?32:512;
 if(kind!=5){prepared.create(side,side,kind==3?CV_8UC1:CV_8UC3);return 1;}
 rowOffsets.assign(height+1,0);capturePhase=0;
 // The projection traversal only needs dimensions while recording sample requests.
 const ProjectionShape shape(height,width);
 radial.radialProjections(shape);
 for(int y=1;y<=height;y++)rowOffsets[y]+=rowOffsets[y-1];
 projectionSamples.resize(rowOffsets.back());rowCursor=rowOffsets;capturePhase=1;radial.radialProjections(shape);
 return 1;
 }catch(...){hash_stream_close();return 0;}}
int hash_stream_rows(int targetRow,int count){
 if(kind==5){if(targetRow<0||count<1||targetRow+count>sourceHeight)return 0;neededStart=std::max(0,targetRow-3);neededCount=std::min(sourceHeight,targetRow+count+3)-neededStart;return 1;}
 if(targetRow<0||targetRow>=side)return 0;
 int low,high;if(kind==2||kind==3){short c[4];int y=cubicCoordinates(targetRow,sourceHeight,c);low=std::max(0,std::min(sourceHeight-1,y-1));high=std::max(0,std::min(sourceHeight-1,y+2));if(kind==3){low=std::max(0,low-3);high=std::min(sourceHeight-1,high+3);}}
 else{ufixedpoint16 c[2];low=linearCoefficients(targetRow,sourceHeight,side,c);high=std::min(sourceHeight-1,low+1);}
 neededStart=low;neededCount=high-low+1;return 1;
}
int hash_stream_start(){return neededStart;}
int hash_stream_count(){return neededCount;}
int hash_stream_side(){return side;}
int hash_stream_feed(const unsigned char* rgb,int targetRow,int count){try{
 cv::Mat band(neededCount,sourceWidth,CV_8UC3,const_cast<unsigned char*>(rgb)),gray,blurred;
 if(kind==3||kind==5){cv::cvtColor(band,gray,cv::COLOR_RGB2GRAY);if(kind==3)cv::GaussianBlur(gray,blurred,{7,7},0);else cv::GaussianBlur(gray,blurred,{0,0},1.,1.);}
 if(kind==5){for(int y=targetRow;y<targetRow+count;y++){const auto line=blurred.ptr<unsigned char>(y-neededStart);for(uint32_t j=rowOffsets[y];j<rowOffsets[y+1];j++)radial.projections_.data[projectionSamples[j].target]=line[projectionSamples[j].x];}return 1;}
 const auto& input=kind==3?blurred:band;const int channels=input.channels();
 if(kind==2||kind==3){
  short beta[4];const int sy=cubicCoordinates(targetRow,sourceHeight,beta);
  for(int x=0;x<side;x++){short alpha[4];const int sx=cubicCoordinates(x,sourceWidth,alpha);for(int c=0;c<channels;c++){
   int horizontal[4];for(int k=0;k<4;k++){const auto row=input.ptr<unsigned char>(std::max(0,std::min(sourceHeight-1,sy+k-1))-neededStart);int sum=0;for(int j=0;j<4;j++)sum+=row[std::max(0,std::min(sourceWidth-1,sx+j-1))*channels+c]*alpha[j];horizontal[k]=sum;}
   float value=horizontal[3]*(beta[3]*(1.f/4194304));for(int k=2;k>=0;k--)value=std::fma(float(horizontal[k]),beta[k]*(1.f/4194304),value);
   prepared.ptr<unsigned char>(targetRow)[x*channels+c]=cv::saturate_cast<unsigned char>(value);
  }}
 }else{
  ufixedpoint16 beta[2];const int sy=linearCoefficients(targetRow,sourceHeight,side,beta),y0=sy-neededStart,y1=std::min(sourceHeight-1,sy+1)-neededStart;
  for(int x=0;x<side;x++){ufixedpoint16 alpha[2];const int sx=linearCoefficients(x,sourceWidth,side,alpha),x1=std::min(sourceWidth-1,sx+1);for(int c=0;c<3;c++){
   auto a=alpha[0]*input.ptr<unsigned char>(y0)[sx*3+c]+alpha[1]*input.ptr<unsigned char>(y0)[x1*3+c];
   auto b=alpha[0]*input.ptr<unsigned char>(y1)[sx*3+c]+alpha[1]*input.ptr<unsigned char>(y1)[x1*3+c];
   prepared.ptr<unsigned char>(targetRow)[x*3+c]=uint8_t(beta[0]*a+beta[1]*b);
  }}
 }
 return 1;
 }catch(...){return 0;}}
int hash_stream_finish(){try{
 if(kind==2)return digest_extra(prepared.data,512,512,2,4);
 if(kind==3){finishMarr(prepared);return 1;}
 if(kind==5){radial.findFeatureVector();output.create(1,40,CV_8U);radial.hashCalculate(output);return 1;}
 cv::Mat bgr;cv::cvtColor(prepared,bgr,cv::COLOR_RGB2BGR);
 if(kind==0)cv::img_hash::averageHash(bgr,output);else if(kind==1)cv::img_hash::blockMeanHash(bgr,output);else cv::img_hash::pHash(bgr,output);return 1;
 }catch(...){return 0;}}
}
