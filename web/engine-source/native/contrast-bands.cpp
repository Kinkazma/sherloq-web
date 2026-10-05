// Global padded geometry is supplied by the owner. Only a core block-row and
// real neighboring rows cross this boundary; no independent tile normalization.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdint>
#include <vector>
#include "contrast.h"
static int reflected(int x,int n){if(n==1)return 0;while(x<0||x>=n)x=x<0?-x:2*n-2-x;return x;}
extern "C" {
int contrast_rows(const uint8_t* rgb,int width,int height,int start,int rows,int block,float* out){
 if(width<1||height<1||start<0||rows<1||start+rows>height||block<1||width%block||rows%block)return 0;
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),gray;cv::cvtColor(input,gray,cv::COLOR_RGB2GRAY);
  std::vector<float> at(size_t(block)*block),tt(size_t(block)*block);int nc=width/block;
  for(int cy=0;cy<rows/block;cy++)for(int cx=0;cx<nc;cx++){
   const int x0=cx*block,y0=start+cy*block;double error=contrastHistogram(gray(cv::Rect(x0,y0,block,block)));
   for(int y=0;y<block;y++)for(int x=0;x<block;x++){
    const int xx=x0+x,yy=y0+y,left=reflected(xx-1,width),right=reflected(xx+1,width),above=reflected(yy-1,height),below=reflected(yy+1,height);
    float d[3];for(int c=0;c<3;c++){
     // The native [-1,0,1] x [-1,0,1] derivative is an exact integer here.
     const int top=int(rgb[(size_t(above)*width+right)*3+c])-rgb[(size_t(above)*width+left)*3+c];
     const int bottom=int(rgb[(size_t(below)*width+right)*3+c])-rgb[(size_t(below)*width+left)*3+c];d[c]=float(bottom-top);
    }
    float b=d[2],g=d[1],r=d[0];at[size_t(y)*block+x]=((std::abs(b)+std::abs(g))+std::abs(r))/3.f;tt[size_t(y)*block+x]=((std::abs(g-r)+std::abs(g-b))+std::abs(r-b))/3.f;
   }
   const float am=contrastMean(at),tm=contrastMean(tt);double similarity=0;if(am!=0){float ratio=tm/am;similarity=ratio>.75?1:double(ratio)/.75;}
   const size_t i=(size_t(cy)*nc+cx)*3;out[i]=float(error);out[i+1]=float(similarity);out[i+2]=float(error*similarity);
  }return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int contrast_cells(const float* maps,int cols,int rows,int mode,uint8_t* out){
 if(cols<1||rows<1||mode<0||mode>2)return 0;
 try{cv::Mat input(rows,cols,CV_32FC3,const_cast<float*>(maps)),plane;cv::extractChannel(input,plane,mode);cv::convertScaleAbs(plane,plane,255);cv::medianBlur(plane,plane,3);for(int y=0;y<rows;y++)std::copy(plane.ptr<uint8_t>(y),plane.ptr<uint8_t>(y)+cols,out+size_t(y)*cols);return 1;}
 catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
}
