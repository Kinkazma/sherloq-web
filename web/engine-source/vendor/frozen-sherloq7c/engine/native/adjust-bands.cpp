// Full oriented rows preserve the qualified vector/scalar HSV tails.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
#include <cfloat>
#include "gamma-lut.h"
#include "hsv-tables.h"
#include "adjust-reference.h"
extern "C" {
int adjust_local_rows(const uint8_t* rgb,int width,int height,int start,int rows,const double* params,uint8_t* out){
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);
  double local[12];std::copy(params,params+12,local);local[9]=255;local[10]=0;local[11]=0;
  cv::Mat processed=adjust(bgr,local),core=processed.rowRange(start,start+rows),target(rows,width,CV_8UC3,out);
  if(params[10])hsv8Reference(core).copyTo(target);else cv::cvtColor(core,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int adjust_tile_histogram(const uint8_t* hsv,int width,int rows,int y0,int paddedWidth,int paddedHeight,int32_t* hist){
 std::fill(hist,hist+64*256,0);int tw=paddedWidth/8,th=paddedHeight/8;
 for(int y=0;y<rows;y++)for(int x=0;x<paddedWidth;x++){int sx=x<width?x:cv::borderInterpolate(x,width,cv::BORDER_REFLECT_101);hist[(((y0+y)/th)*8+x/tw)*256+hsv[(y*width+sx)*3+2]]++;}return 1;
}
int adjust_tables(const int32_t* hist,int area,int level,uint8_t* tables){
 const double clips[]={2,5,10,20};const int limit=std::max(int(clips[level-2]*area/256),1);float scale=255.f/area;
 for(int tile=0;tile<64;tile++){int bins[256],clipped=0;for(int i=0;i<256;i++){bins[i]=hist[tile*256+i];if(bins[i]>limit){clipped+=bins[i]-limit;bins[i]=limit;}}
  int batch=clipped/256,residual=clipped-batch*256;for(int& v:bins)v+=batch;
  if(residual){int step=std::max(256/residual,1);for(int i=0;i<256&&residual;i+=step,residual--)bins[i]++;}
  int sum=0;for(int i=0;i<256;i++){sum+=bins[i];tables[tile*256+i]=cv::saturate_cast<uchar>(sum*scale);}
 }return 1;
}
int adjust_map_rows(const uint8_t* hsv,int width,int rows,int y0,int paddedWidth,int paddedHeight,int kind,const uint8_t* tables,uint8_t* out){
 try{
  cv::Mat values(rows,width,CV_8UC3);std::copy(hsv,hsv+size_t(width)*rows*3,values.ptr<uchar>());const int tw=paddedWidth/8,th=paddedHeight/8;float ix=1.f/tw,iy=1.f/th;
  for(int y=0;y<rows;y++)for(int x=0;x<width;x++){
   auto& pixel=values.at<cv::Vec3b>(y,x);const int v=pixel[2];if(kind==1){pixel[2]=tables[v];continue;}
   float fx=std::fma(float(x),ix,-.5f),fy=std::fma(float(y+y0),iy,-.5f);int x1=cvFloor(fx),y1=cvFloor(fy),x2=std::min(x1+1,7),y2=std::min(y1+1,7);float a=fx-x1,b=fy-y1;a=std::clamp(a,0.f,1.f);b=std::clamp(b,0.f,1.f);x1=std::max(x1,0);y1=std::max(y1,0);
   float upper=std::fma(float(tables[(y1*8+x1)*256+v]),1.f-a,tables[(y1*8+x2)*256+v]*a),lower=std::fma(float(tables[(y2*8+x1)*256+v]),1.f-a,tables[(y2*8+x2)*256+v]*a);
   pixel[2]=cv::saturate_cast<uchar>(std::fma(upper,1.f-b,lower*b));
  }
  cv::Mat bgr;hsvToBgr(values,bgr);cv::Mat target(rows,width,CV_8UC3,out);cv::cvtColor(bgr,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
double adjust_otsu(const int32_t* hist,int count){
 // Original OpenCV histogram reduction/order; no tile thresholds or rebinning.
 double mu=0,scale=1./count;for(int i=0;i<256;i++)mu+=i*double(hist[i]);mu*=scale;double mu1=0,q1=0,max_sigma=0,max_val=0;
 for(int i=0;i<256;i++){double p_i=hist[i]*scale;mu1*=q1;q1+=p_i;double q2=1.-q1;if(std::min(q1,q2)<FLT_EPSILON||std::max(q1,q2)>1.-FLT_EPSILON)continue;mu1=(mu1+i*p_i)/q1;double mu2=(mu-q1*mu1)/q2,sigma=q1*q2*(mu1-mu2)*(mu1-mu2);if(sigma>max_sigma){max_sigma=sigma;max_val=i;}}
 return max_val;
}
static void hsvToBgrScoped(const cv::Mat& hsv,cv::Mat& result,int x0,int nativeWidth){
 cv::cvtColor(hsv,result,cv::COLOR_HSV2BGR);
 // Preserve the reference's explicit 16-pixel vector-prefix truncation rule.
 // This is a numerical contract, not detection of the browser/device brand.
 static const int order[6][3]={{1,3,0},{1,0,2},{3,0,1},{0,2,1},{0,1,3},{2,1,0}};
 for(int y=0;y<hsv.rows;y++)for(int x=0;x<hsv.cols;x++){
  auto input=hsv.at<cv::Vec3b>(y,x);float h=input[0]*(6.f/180.f),sat=input[1]*(1.f/255.f),v=input[2]*(1.f/255.f);int sector=int(h);h-=sector;sector%=6;
  bool prefix=x+x0<nativeWidth/16*16;
  float table[4]={v,v*(1.f-sat),v*(prefix?1.f-sat*h:std::fma(-sat,h,1.f)),v*(prefix?1.f-sat*(1.f-h):std::fma(-sat,1.f-h,1.f))};auto& out=result.at<cv::Vec3b>(y,x);
  for(int c=0;c<3;c++)out[c]=prefix?trunc8(table[order[sector][c]]*255.f):cv::saturate_cast<uchar>(table[order[sector][c]]*255.f);
 }
}

static cv::Mat hsv8Scoped(const cv::Mat& src,int x0,int nativeWidth){
 cv::Mat result(src.size(),src.type());for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  auto v=src.at<cv::Vec3b>(y,x);int b=v[0],g=v[1],r=v[2],hi=std::max({r,g,b}),lo=std::min({r,g,b}),diff=hi-lo,h=0,s=0;
  if(diff){int base=hi==r?g-b:(hi==g?b-r+2*diff:r-g+4*diff);
   if(x+x0<nativeWidth/8*8){s=(diff*hsvSDiv[hi]+2048)>>12;h=(base*hsvHDiv[diff]+2048)>>12;}
   else{s=(int(float(diff*(255<<12))*(1.f/hi))+2048)>>12;h=(base*int((180<<12)/(6.f*diff)+.5f)+2048)>>12;}
   if(h<0)h+=180;
  }result.at<cv::Vec3b>(y,x)=cv::Vec3b(h,s,hi);
 }return result;
}

// Preserve the reference HSV vector/scalar prefixes at their global native x.
static int adjust_local_rows_scoped_impl(const uint8_t* rgb,int width,int height,int start,int rows,int x0,int nativeWidth,const double* p,const uint8_t* mask,uint8_t* out){
 try{
  cv::Mat input(height,width,CV_8UC3,const_cast<uint8_t*>(rgb)),result;cv::cvtColor(input,result,cv::COLOR_RGB2BGR);
  int bright=p[0],saturation=p[1],hue=p[2],gamma=p[3],shadows=p[4],highlights=p[5],sweep=p[6],window=p[7],sharp=int(p[8])/4;
  if(sharp){
   const cv::Size size(2*sharp+1,2*sharp+1);cv::Mat blurred;cv::GaussianBlur(result,blurred,size,0);
   if(mask&&!std::all_of(mask,mask+size_t(width)*height,[](uint8_t value){return value!=0;})){
    cv::Mat validity(height,width,CV_8U,const_cast<uint8_t*>(mask)),weights,weighted,denominator,numerator,complete;
    validity.convertTo(weights,CV_64F);result.convertTo(weighted,CV_64FC3);
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)if(!mask[size_t(y)*width+x])weighted.at<cv::Vec3d>(y,x)=cv::Vec3d(0,0,0);
    cv::GaussianBlur(weights,denominator,size,0,0,cv::BORDER_REFLECT_101);cv::GaussianBlur(weighted,numerator,size,0,0,cv::BORDER_REFLECT_101);
    cv::erode(validity,complete,cv::getStructuringElement(cv::MORPH_RECT,size),cv::Point(-1,-1),1,cv::BORDER_REFLECT_101);
    for(int y=start;y<start+rows;y++)for(int x=0;x<width;x++)if(mask[size_t(y)*width+x]&&!complete.at<uchar>(y,x)){
     double weight=denominator.at<double>(y,x);if(!(weight>0))return -2;auto values=numerator.at<cv::Vec3d>(y,x);auto& pixel=blurred.at<cv::Vec3b>(y,x);for(int c=0;c<3;c++)pixel[c]=cv::saturate_cast<uchar>(values[c]/weight);
    }
   }
   cv::addWeighted(result,1.5,blurred,-.5,0,result);
  }
  if(bright||saturation||hue){cv::Mat hsv=hsv8Scoped(result,x0,nativeWidth);for(int y=0;y<hsv.rows;y++)for(int x=0;x<hsv.cols;x++){auto& v=hsv.at<cv::Vec3b>(y,x);if(hue){int h=v[0]+hue;if(h>180)h-=180;v[0]=h;}v[1]=cv::saturate_cast<uchar>(int(v[1])+saturation);v[2]=cv::saturate_cast<uchar>(int(v[2])+bright);}hsvToBgrScoped(hsv,result,x0,nativeWidth);}
  cv::Mat table(1,256,CV_8U);std::copy(gammaLut[gamma-1],gammaLut[gamma-1]+256,table.ptr<uchar>());
  if(shadows){auto t=lut(int(shadows/100.*255),0);cv::LUT(table,t,table);}if(highlights){auto t=lut(0,int(highlights/100.*255));cv::LUT(table,t,table);}if(window<255){int radius=window/2;auto t=lut(std::max(sweep-radius,0),255-std::min(sweep+radius,255));cv::LUT(table,t,table);}cv::LUT(result,table,result);
  cv::Mat core=result.rowRange(start,start+rows),target(rows,width,CV_8UC3,out);if(p[10])hsv8Scoped(core,x0,nativeWidth).copyTo(target);else cv::cvtColor(core,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int adjust_local_rows_scoped(const uint8_t* rgb,int width,int height,int start,int rows,int x0,int nativeWidth,const double* p,uint8_t* out){return adjust_local_rows_scoped_impl(rgb,width,height,start,rows,x0,nativeWidth,p,nullptr,out);}
int adjust_local_rows_scoped_masked(const uint8_t* rgb,const uint8_t* mask,int width,int height,int start,int rows,int x0,int nativeWidth,const double* p,uint8_t* out){return adjust_local_rows_scoped_impl(rgb,width,height,start,rows,x0,nativeWidth,p,mask,out);}
// Scoped CLAHE retains each tile's actual admitted observation count. The
// existing complete-grid entry points and their arithmetic stay unchanged.
int adjust_tables_scoped(const int32_t* hist,const int32_t* areas,int level,uint8_t* tables){
 if(level<2||level>5)return -2;
 const double clips[]={2,5,10,20};
 for(int tile=0;tile<64;tile++){
  const int area=areas[tile];if(area<0)return -2;
  int sumInput=0;for(int i=0;i<256;i++){const int v=hist[tile*256+i];if(v<0)return -2;sumInput+=v;}
  if(sumInput!=area)return -2;
  if(!area){for(int i=0;i<256;i++)tables[tile*256+i]=i;continue;}
  const int limit=std::max(int(clips[level-2]*area/256),1);float scale=255.f/area;
  int bins[256],clipped=0;for(int i=0;i<256;i++){bins[i]=hist[tile*256+i];if(bins[i]>limit){clipped+=bins[i]-limit;bins[i]=limit;}}
  int batch=clipped/256,residual=clipped-batch*256;for(int& v:bins)v+=batch;
  if(residual){int step=std::max(256/residual,1);for(int i=0;i<256&&residual;i+=step,residual--)bins[i]++;}
  int sum=0;for(int i=0;i<256;i++){sum+=bins[i];tables[tile*256+i]=cv::saturate_cast<uchar>(sum*scale);}
 }return 1;
}
static int adjust_map_rows_scoped_impl(const uint8_t* hsv,int width,int rows,int x0,int y0,int nativeWidth,int paddedWidth,int paddedHeight,int kind,const uint8_t* tables,const int32_t* areas,uint8_t* out){
 try{
  cv::Mat values(rows,width,CV_8UC3);std::copy(hsv,hsv+size_t(width)*rows*3,values.ptr<uchar>());const int tw=paddedWidth/8,th=paddedHeight/8;float ix=1.f/tw,iy=1.f/th;
  for(int y=0;y<rows;y++)for(int x=0;x<width;x++){
   auto& pixel=values.at<cv::Vec3b>(y,x);const int v=pixel[2];if(kind==1){pixel[2]=tables[v];continue;}
   float fx=std::fma(float(x+x0),ix,-.5f),fy=std::fma(float(y+y0),iy,-.5f);int x1=cvFloor(fx),y1=cvFloor(fy),x2=std::min(x1+1,7),y2=std::min(y1+1,7);float a=fx-x1,b=fy-y1;a=std::clamp(a,0.f,1.f);b=std::clamp(b,0.f,1.f);x1=std::max(x1,0);y1=std::max(y1,0);
   float upper=std::fma(float(tables[(y1*8+x1)*256+v]),1.f-a,tables[(y1*8+x2)*256+v]*a),lower=std::fma(float(tables[(y2*8+x1)*256+v]),1.f-a,tables[(y2*8+x2)*256+v]*a);
   if(!areas||(areas[y1*8+x1]&&areas[y1*8+x2]&&areas[y2*8+x1]&&areas[y2*8+x2]))pixel[2]=cv::saturate_cast<uchar>(std::fma(upper,1.f-b,lower*b));
   else{const int tiles[4]={y1*8+x1,y1*8+x2,y2*8+x1,y2*8+x2};const float weights[4]={(1.f-a)*(1.f-b),a*(1.f-b),(1.f-a)*b,a*b};float sum=0,total=0;for(int i=0;i<4;i++)if(areas[tiles[i]]&&weights[i]>0){sum=std::fma(float(tables[tiles[i]*256+v]),weights[i],sum);total+=weights[i];}if(!(total>0))return -2;pixel[2]=cv::saturate_cast<uchar>(sum/total);}
  }
  cv::Mat bgr;hsvToBgrScoped(values,bgr,x0,nativeWidth);cv::Mat target(rows,width,CV_8UC3,out);cv::cvtColor(bgr,target,cv::COLOR_BGR2RGB);return 1;
 }catch(const std::bad_alloc&){return -1;}catch(const cv::Exception& e){return e.code==cv::Error::StsNoMem?-1:-2;}catch(...){return -2;}
}
int adjust_map_rows_scoped(const uint8_t* hsv,int width,int rows,int x0,int y0,int nativeWidth,int paddedWidth,int paddedHeight,int kind,const uint8_t* tables,uint8_t* out){return adjust_map_rows_scoped_impl(hsv,width,rows,x0,y0,nativeWidth,paddedWidth,paddedHeight,kind,tables,nullptr,out);}
int adjust_map_rows_scoped_observed(const uint8_t* hsv,int width,int rows,int x0,int y0,int nativeWidth,int paddedWidth,int paddedHeight,int kind,const uint8_t* tables,const int32_t* areas,uint8_t* out){return adjust_map_rows_scoped_impl(hsv,width,rows,x0,y0,nativeWidth,paddedWidth,paddedHeight,kind,tables,areas,out);}
}
