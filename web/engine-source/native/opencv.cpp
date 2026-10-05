// Portable OpenCV 4.11 primitives. RGB boundary; native algorithms operate in BGR.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/photo.hpp>
#include <opencv2/video/tracking.hpp>
#include <opencv2/img_hash.hpp>
#include <cmath>
#include <cstdint>
#include <vector>
#include <algorithm>
#include "gamma-lut.h"
#include "hsv-tables.h"
static cv::Mat output;
static double pcaModel[15];
static unsigned char trunc8(double x){return std::isfinite(x)?static_cast<unsigned char>(static_cast<int64_t>(std::trunc(x))&255):0;}
static cv::Mat np8(const cv::Mat& x){
 cv::Mat out(x.rows,x.cols,CV_MAKETYPE(CV_8U,x.channels()));const int n=x.cols*x.channels();
 for(int y=0;y<x.rows;y++)for(int i=0;i<n;i++)out.ptr<uchar>(y)[i]=x.depth()==CV_32F?trunc8(x.ptr<float>(y)[i]):trunc8(x.ptr<double>(y)[i]);return out;
}
static cv::Mat norm(const cv::Mat& x){
 cv::Mat value;cv::normalize(x,value,0,255,cv::NORM_MINMAX);
 if(x.depth()==CV_64F&&x.total()*x.channels()>=4){double lo,hi;cv::minMaxLoc(x.reshape(1),&lo,&hi);double scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.,shift=-lo*scale;for(int y=0;y<x.rows;y++)for(int i=0;i<x.cols*x.channels();i++)value.ptr<double>(y)[i]=std::fma(x.ptr<double>(y)[i],scale,shift);}
 return value.depth()==CV_8U?value:np8(value);
}
static void hsvToBgr(const cv::Mat& hsv,cv::Mat& result){
 cv::cvtColor(hsv,result,cv::COLOR_HSV2BGR);
 // Preserve the reference's explicit 16-pixel vector-prefix truncation rule.
 // This is a numerical contract, not detection of the browser/device brand.
 static const int order[6][3]={{1,3,0},{1,0,2},{3,0,1},{0,2,1},{0,1,3},{2,1,0}};
 for(int y=0;y<hsv.rows;y++)for(int x=0;x<hsv.cols;x++){
  auto input=hsv.at<cv::Vec3b>(y,x);float h=input[0]*(6.f/180.f),sat=input[1]*(1.f/255.f),v=input[2]*(1.f/255.f);int sector=int(h);h-=sector;sector%=6;
  bool prefix=x<hsv.cols/16*16;
  float table[4]={v,v*(1.f-sat),v*(prefix?1.f-sat*h:std::fma(-sat,h,1.f)),v*(prefix?1.f-sat*(1.f-h):std::fma(-sat,1.f-h,1.f))};auto& out=result.at<cv::Vec3b>(y,x);
  for(int c=0;c<3;c++)out[c]=prefix?trunc8(table[order[sector][c]]*255.f):cv::saturate_cast<uchar>(table[order[sector][c]]*255.f);
 }
}
static cv::Mat floatHue(const cv::Mat& input,bool hls){
 cv::Mat result;cv::cvtColor(input,result,hls?cv::COLOR_BGR2HLS:cv::COLOR_BGR2HSV);
 for(int y=0;y<input.rows;y++)for(int x=0;x<input.cols;x++){
  auto v=input.at<cv::Vec3f>(y,x);float b=v[0],g=v[1],r=v[2],hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;
  bool prefix=x<input.cols/4*4;float h=0,s=0,l=(hi+lo)*.5f,part=hi==r?(g<b?360.f:0.f):(hi==g?120.f:240.f),base=hi==r?g-b:(hi==g?b-r:r-g);
  if(!hls||d>FLT_EPSILON){float inv=hls?60.f/d:float(60./(d+FLT_EPSILON));
   h=prefix?std::fma(base,inv,part):std::fma(base,inv,hi==r?0.f:part);if(h<0)h+=360.f;
   s=hls?d/(l<.5f?hi+lo:(prefix?2.f-(hi+lo):(2.f-hi)-lo)):d/(std::abs(hi)+FLT_EPSILON);
  }result.at<cv::Vec3f>(y,x)=hls?cv::Vec3f(h,l,s):cv::Vec3f(h,s,hi);
 }return result;
}
static cv::Mat normalized8(const cv::Mat& src){
 double lo,hi;cv::minMaxLoc(src,&lo,&hi);double scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.;float a=scale,b=-lo*scale;cv::Mat out;cv::normalize(src,out,0,255,cv::NORM_MINMAX,CV_8U);
 if(src.total()>=8)for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++)out.at<uchar>(y,x)=cv::saturate_cast<uchar>(std::fma(float(src.at<double>(y,x)),a,b));
 else for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){double v=std::fma(src.at<double>(y,x),double(a),double(b));int32_t rounded=std::isfinite(v)&&std::abs(v)<9223372036854775808.0?int32_t(uint32_t(int64_t(std::nearbyint(v)))):0;out.at<uchar>(y,x)=cv::saturate_cast<uchar>(rounded);}
 return out;
}
static cv::Mat lut(int low,int high){
 double x1=std::max(low,0),y1=std::max(-low,0),x2=high>=0?255-high:255,y2=high>=0?255:255+high;cv::Mat result(1,256,CV_8U);
 for(int i=0;i<256;i++)result.at<uchar>(i)=x1==x2?255:trunc8(std::clamp((i*(y1-y2)+x1*y2-y1*x2)/(x1-x2),0.,255.));return result;
}
static cv::Mat equalize(const cv::Mat& src){std::vector<cv::Mat> planes;cv::split(src,planes);for(auto& p:planes)cv::equalizeHist(p,p);cv::Mat result;cv::merge(planes,result);return result;}
static cv::Mat gray3(const cv::Mat& src){cv::Mat result;if(src.channels()==3)cv::cvtColor(src,result,cv::COLOR_BGR2GRAY);else result=src;cv::cvtColor(result,result,cv::COLOR_GRAY2BGR);return result;}
static cv::Mat normalized(const cv::Mat& src){cv::Mat result(src.rows,src.cols,CV_32FC3);for(int y=0;y<src.rows;y++)for(int i=0;i<src.cols*3;i++)result.ptr<float>(y)[i]=float(src.ptr<uchar>(y)[i])/255.f;return result;}
static cv::Mat hsv8Reference(const cv::Mat& src){
 cv::Mat result(src.size(),src.type());for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  auto v=src.at<cv::Vec3b>(y,x);int b=v[0],g=v[1],r=v[2],hi=std::max({r,g,b}),lo=std::min({r,g,b}),diff=hi-lo,h=0,s=0;
  if(diff){int base=hi==r?g-b:(hi==g?b-r+2*diff:r-g+4*diff);
   if(x<src.cols/8*8){s=(diff*hsvSDiv[hi]+2048)>>12;h=(base*hsvHDiv[diff]+2048)>>12;}
   else{s=(int(float(diff*(255<<12))*(1.f/hi))+2048)>>12;h=(base*int((180<<12)/(6.f*diff)+.5f)+2048)>>12;}
   if(h<0)h+=180;
  }result.at<cv::Vec3b>(y,x)=cv::Vec3b(h,s,hi);
 }return result;
}
static cv::Mat color(const cv::Mat& src,int space,int channel){
 cv::Mat value;
 if(space==0)cv::extractChannel(src,value,2-channel);
 else if(space>=5){const int codes[]={cv::COLOR_BGR2YCrCb,cv::COLOR_BGR2XYZ,cv::COLOR_BGR2Lab,cv::COLOR_BGR2Luv};cv::cvtColor(src,value,codes[space-5]);cv::extractChannel(value,value,channel);}
 else if(space==3||space==4){cv::Mat full=floatHue(normalized(src),space==4);value.create(src.rows,src.cols,CV_8U);for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){float v=full.at<cv::Vec3f>(y,x)[channel]*255.f;if(channel==0)v/=360.f;value.at<uchar>(y,x)=trunc8(v);}}
 else{
  auto full=normalized(src);value.create(src.rows,src.cols,CV_8U);cv::Mat perceptual;if(space==2&&channel==3)cv::cvtColor(full,perceptual,cv::COLOR_BGR2GRAY);
  for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
   auto v=full.at<cv::Vec3f>(y,x);float b=v[0],g=v[1],r=v[2],high=std::max({r,g,b}),low=std::min({r,g,b}),z;
   if(space==1){float black=1.f-high,denominator=1.f-black;z=channel==3?black:((1.f-v[2-channel])-black);if(channel<3&&denominator!=0)z/=denominator;z*=255.f;value.at<uchar>(y,x)=trunc8(z);}
   else{if(channel==0)z=(high+low)/2.f;else if(channel==1)z=.21f*r+.72f*g+.07f*b;else if(channel==2)z=((b+g)+r)/3.f;else z=perceptual.at<float>(y,x);value.at<uchar>(y,x)=trunc8(double(z)*255.);}
  }
 }
 cv::cvtColor(value,value,cv::COLOR_GRAY2BGR);return value;
}
static cv::Mat bilateralReference(const cv::Mat& src,int radius,double sigma){
 int cn=src.channels(),lanes=cn==1?4:16;cv::Mat padded,result(src.size(),src.type());cv::copyMakeBorder(src,padded,radius,radius,radius,radius,cv::BORDER_REFLECT_101);
 std::vector<float> colorWeight(cn*256),spaceWeight;std::vector<int> offsets;double coeff=-.5/(sigma*sigma);
 for(int i=0;i<cn*256;i++)colorWeight[i]=float(std::exp(i*i*coeff));
 for(int y=-radius;y<=radius;y++)for(int x=-radius;x<=radius;x++){double r=std::sqrt(double(y*y+x*x));if(r>radius)continue;spaceWeight.push_back(float(std::exp(r*r*coeff)));offsets.push_back(y*int(padded.step)+x*cn);}
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  const uchar* center=padded.ptr<uchar>(y+radius)+(x+radius)*cn;float sum[3]={0,0,0},wsum=0;size_t k=0;
  if(x>=src.cols/lanes*lanes){for(;k+3<offsets.size();k+=4){float weights[4],products[3][4];for(int t=0;t<4;t++){auto pixel=center+offsets[k+t];int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(pixel[c])-center[c]);weights[t]=spaceWeight[k+t]*colorWeight[distance];for(int c=0;c<cn;c++)products[c][t]=pixel[c]*weights[t];}wsum+=(weights[0]+weights[1])+(weights[2]+weights[3]);for(int c=0;c<cn;c++)sum[c]+=(products[c][0]+products[c][1])+(products[c][2]+products[c][3]);}}
  for(;k<offsets.size();k++){auto pixel=center+offsets[k];int distance=0;for(int c=0;c<cn;c++)distance+=std::abs(int(pixel[c])-center[c]);float w=spaceWeight[k]*colorWeight[distance];wsum+=w;for(int c=0;c<cn;c++)sum[c]=std::fma(float(pixel[c]),w,sum[c]);}
  float inv=1.f/wsum;for(int c=0;c<cn;c++)result.ptr<uchar>(y)[x*cn+c]=cv::saturate_cast<uchar>(cn==1?sum[c]/wsum:sum[c]*inv);
 }return result;
}
static cv::Mat noise(const cv::Mat& src,const double* p){
 int mode=p[0],radius=p[1],sigma=p[2],levels=p[5],kernel=radius*2+1;cv::Mat original=src,filtered,result;
 if(p[3])cv::cvtColor(src,original,cv::COLOR_BGR2GRAY);
 switch(mode){case 0:cv::medianBlur(original,filtered,kernel);break;case 1:cv::GaussianBlur(original,filtered,{kernel,kernel},0);break;case 2:cv::blur(original,filtered,{kernel,kernel});break;case 3:filtered=bilateralReference(original,radius,sigma);break;case 4:if(p[3])cv::fastNlMeansDenoising(original,filtered,kernel);else cv::fastNlMeansDenoisingColored(original,filtered,kernel,kernel);break;default:throw std::runtime_error("mode");}
 if(p[4])result=filtered;else{cv::absdiff(original,filtered,result);if(!levels)result=equalize(result);else cv::LUT(result,lut(0,255-levels),result);}
 if(p[3])cv::cvtColor(result,result,cv::COLOR_GRAY2BGR);return result;
}
static cv::Mat gradient(const cv::Mat& src,const double* p){
 cv::Mat gray,dx,dy;cv::cvtColor(src,gray,cv::COLOR_BGR2GRAY);cv::spatialGradient(gray,dx,dy);
 double mx=0,my=0;cv::Mat magnitude(src.rows,src.cols,CV_32F);
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){int a=std::abs(dx.at<short>(y,x)),b=std::abs(dy.at<short>(y,x));mx=std::max(mx,double(a));my=std::max(my,double(b));magnitude.at<float>(y,x)=a+b;}
 cv::Mat red(src.rows,src.cols,CV_8U),green=red.clone(),blue;bool invert=p[2];int mode=p[1];
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  float a=dx.at<short>(y,x),b=dy.at<short>(y,x);if(invert){a=-a;b=-b;}
  red.at<uchar>(y,x)=mx?trunc8((a/float(mx)*127.f)+127.f):127;green.at<uchar>(y,x)=my?trunc8((b/float(my)*127.f)+127.f):127;
 }
 if(mode==0||mode==1)blue=cv::Mat(src.rows,src.cols,CV_8U,cv::Scalar(mode?255:0));
 else if(mode==2)blue=norm(magnitude);
 else{cv::Mat lengths(src.rows,src.cols,CV_64F);for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){double a=red.at<uchar>(y,x),b=green.at<uchar>(y,x);lengths.at<double>(y,x)=std::sqrt(a*a+b*b);}blue=norm(lengths);}
 cv::Mat result;cv::merge(std::vector<cv::Mat>{blue,green,red},result);int intensity=int(p[0]/100*127);if(p[3])result=equalize(result);else if(intensity)cv::LUT(result,lut(intensity,intensity),result);return result;
}
static cv::Mat claheReference(const cv::Mat& src,double clip){
 cv::Mat padded=src;if(src.cols%8||src.rows%8)cv::copyMakeBorder(src,padded,0,8-src.rows%8,0,8-src.cols%8,cv::BORDER_REFLECT_101);
 int tw=padded.cols/8,th=padded.rows/8,area=tw*th,limit=std::max(int(clip*area/256),1);float scale=255.f/area;std::vector<uchar> tables(64*256);
 for(int ty=0;ty<8;ty++)for(int tx=0;tx<8;tx++){
  int hist[256]={0};for(int y=ty*th;y<(ty+1)*th;y++)for(int x=tx*tw;x<(tx+1)*tw;x++)hist[padded.at<uchar>(y,x)]++;
  int clipped=0;for(int& v:hist)if(v>limit){clipped+=v-limit;v=limit;}int batch=clipped/256,residual=clipped-batch*256;for(int& v:hist)v+=batch;
  if(residual){int step=std::max(256/residual,1);for(int i=0;i<256&&residual;i+=step,residual--)hist[i]++;}
  int sum=0;for(int i=0;i<256;i++){sum+=hist[i];tables[(ty*8+tx)*256+i]=cv::saturate_cast<uchar>(sum*scale);}
 }
 cv::Mat result(src.rows,src.cols,CV_8U);float ix=1.f/tw,iy=1.f/th;
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  float fx=std::fma(float(x),ix,-.5f),fy=std::fma(float(y),iy,-.5f);int x1=cvFloor(fx),y1=cvFloor(fy),x2=std::min(x1+1,7),y2=std::min(y1+1,7);float a=fx-x1,b=fy-y1;a=std::clamp(a,0.f,1.f);b=std::clamp(b,0.f,1.f);x1=std::max(x1,0);y1=std::max(y1,0);int v=src.at<uchar>(y,x);
  float upper=std::fma(float(tables[(y1*8+x1)*256+v]),1.f-a,tables[(y1*8+x2)*256+v]*a);
  float lower=std::fma(float(tables[(y2*8+x1)*256+v]),1.f-a,tables[(y2*8+x2)*256+v]*a);
  result.at<uchar>(y,x)=cv::saturate_cast<uchar>(std::fma(upper,1.f-b,lower*b));
 }return result;
}
static cv::Mat adjust(const cv::Mat& src,const double* p){
 int bright=p[0],saturation=p[1],hue=p[2],gamma=p[3],shadows=p[4],highlights=p[5],sweep=p[6],width=p[7],sharp=int(p[8])/4,threshold=p[9],eq=p[10];cv::Mat result=src;
 if(sharp){cv::Mat blurred;cv::GaussianBlur(result,blurred,{2*sharp+1,2*sharp+1},0);cv::addWeighted(result,1.5,blurred,-.5,0,result);}
 if(bright||saturation||hue){cv::Mat hsv=hsv8Reference(result);for(int y=0;y<hsv.rows;y++)for(int x=0;x<hsv.cols;x++){auto& v=hsv.at<cv::Vec3b>(y,x);if(hue){int h=v[0]+hue;if(h>180)h-=180;v[0]=h;}v[1]=cv::saturate_cast<uchar>(int(v[1])+saturation);v[2]=cv::saturate_cast<uchar>(int(v[2])+bright);}hsvToBgr(hsv,result);}
 cv::Mat table(1,256,CV_8U);std::copy(gammaLut[gamma-1],gammaLut[gamma-1]+256,table.ptr<uchar>());
 if(shadows){auto t=lut(int(shadows/100.*255),0);cv::LUT(table,t,table);}if(highlights){auto t=lut(0,int(highlights/100.*255));cv::LUT(table,t,table);}if(width<255){int radius=width/2;auto t=lut(std::max(sweep-radius,0),255-std::min(sweep+radius,255));cv::LUT(table,t,table);}cv::LUT(result,table,result);
 if(eq){std::vector<cv::Mat> hsv;cv::Mat converted=hsv8Reference(result);cv::split(converted,hsv);if(eq==1)cv::equalizeHist(hsv[2],hsv[2]);else{double clips[]={2,5,10,20};hsv[2]=claheReference(hsv[2],clips[eq-2]);}cv::merge(hsv,converted);hsvToBgr(converted,result);}
 if(threshold<255){if(!threshold){cv::Mat gray,binary;cv::cvtColor(result,gray,cv::COLOR_BGR2GRAY);threshold=cv::threshold(gray,binary,0,255,cv::THRESH_OTSU);}cv::threshold(result,result,threshold,255,cv::THRESH_BINARY);}if(p[11])cv::bitwise_not(result,result);return result;
}
static cv::Mat sep32Fma(const cv::Mat& src,const cv::Mat& kx,const cv::Mat& ky){
 int r=kx.rows/2;cv::Mat horizontal(src.rows,src.cols,CV_32F),result(src.rows,src.cols,CV_32F);
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  float sum=float(kx.at<double>(0))*src.at<uchar>(y,cv::borderInterpolate(x-r,src.cols,cv::BORDER_REFLECT_101));
  for(int k=1;k<kx.rows;k++)sum=std::fma(float(kx.at<double>(k)),float(src.at<uchar>(y,cv::borderInterpolate(x-r+k,src.cols,cv::BORDER_REFLECT_101))),sum);
  horizontal.at<float>(y,x)=sum;
 }
 for(int y=0;y<src.rows;y++)for(int x=0;x<src.cols;x++){
  float sum=float(ky.at<double>(r))*horizontal.at<float>(y,x);
  for(int k=1;k<=r;k++){float pair=horizontal.at<float>(cv::borderInterpolate(y+k,src.rows,cv::BORDER_REFLECT_101),x)+horizontal.at<float>(cv::borderInterpolate(y-k,src.rows,cv::BORDER_REFLECT_101),x);sum=std::fma(float(ky.at<double>(r+k)),pair,sum);}
  result.at<float>(y,x)=sum;
 }return result;
}
static cv::Mat echo(const cv::Mat& src,const double* p){
 std::vector<cv::Mat> planes;cv::split(src,planes);for(auto& plane:planes){cv::Mat d;if(p[0]>=5){cv::Mat kx,ky;cv::getDerivKernels(kx,ky,2,0,2*int(p[0])+1,false,CV_64F);cv::Mat tmp=sep32Fma(plane,kx,ky)+sep32Fma(plane,ky,kx);tmp.convertTo(d,CV_64F);}else cv::Laplacian(plane,d,CV_64F,2*int(p[0])+1);d=cv::abs(d);plane=normalized8(d);}cv::Mat result;cv::merge(planes,result);cv::LUT(result,lut(0,int(p[1]/100*255)),result);return p[2]?gray3(result):result;
}
// Fixed three-axis Jacobi rotation order from OpenCV, with native fused arithmetic.
static double hypotReference(double a,double b){a=std::abs(a);b=std::abs(b);if(a>b){b/=a;return a*std::sqrt(std::fma(b,b,1.));}if(b>0){a/=b;return b*std::sqrt(std::fma(a,a,1.));}return 0;}
static void eigenReference(double* a,double* w,double* v){
 int ir[3]={0},ic[3]={0};std::fill(v,v+9,0.);for(int k=0;k<3;k++){w[k]=a[4*k];v[4*k]=1.;}
 auto indices=[&](int k){if(k<2){int m=k+1;for(int i=k+2;i<3;i++)if(std::abs(a[k*3+m])<std::abs(a[k*3+i]))m=i;ir[k]=m;}if(k>0){int m=0;for(int i=1;i<k;i++)if(std::abs(a[m*3+k])<std::abs(a[i*3+k]))m=i;ic[k]=m;}};for(int k=0;k<3;k++)indices(k);
 for(int iteration=0;iteration<270;iteration++){
  int k=0,l=ir[0];double mv=std::abs(a[l]);for(int i=1;i<2;i++)if(mv<std::abs(a[i*3+ir[i]])){mv=std::abs(a[i*3+ir[i]]);k=i;l=ir[i];}for(int i=1;i<3;i++)if(mv<std::abs(a[ic[i]*3+i])){mv=std::abs(a[ic[i]*3+i]);k=ic[i];l=i;}
  double p=a[k*3+l];if(std::abs(p)<=DBL_EPSILON)break;double y=(w[l]-w[k])*.5,t=std::abs(y)+hypotReference(p,y),sn=hypotReference(p,t),c=t/sn;sn=p/sn;t=(p/t)*p;if(y<0){sn=-sn;t=-t;}a[k*3+l]=0;w[k]-=t;w[l]+=t;
  auto rotate=[&](double& x,double& y){double aa=x,bb=y;x=std::fma(aa,c,-bb*sn);y=std::fma(aa,sn,bb*c);};
  for(int i=0;i<k;i++)rotate(a[i*3+k],a[i*3+l]);for(int i=k+1;i<l;i++)rotate(a[k*3+i],a[i*3+l]);for(int i=l+1;i<3;i++)rotate(a[k*3+i],a[l*3+i]);for(int i=0;i<3;i++)rotate(v[k*3+i],v[l*3+i]);indices(k);indices(l);
 }
 for(int k=0;k<2;k++){int m=k;for(int i=k+1;i<3;i++)if(w[m]<w[i])m=i;if(k!=m){std::swap(w[k],w[m]);for(int i=0;i<3;i++)std::swap(v[k*3+i],v[m*3+i]);}}
}
static void preparePca(const cv::Mat& src){
 cv::Mat data,samples;src.reshape(1,int(src.total())).convertTo(data,CV_64F);samples=data;
 if(data.rows<3)cv::repeat(data,3,1,samples);
 cv::PCA model;cv::reduce(samples,model.mean,0,cv::REDUCE_AVG,CV_64F);std::copy(model.mean.ptr<double>(),model.mean.ptr<double>()+3,pcaModel);double covariance[9]={0};for(int i=0;i<3;i++)for(int j=i;j<3;j++){double sum=0;for(int k=0;k<samples.rows;k++)sum=std::fma(samples.at<double>(k,i)-pcaModel[i],samples.at<double>(k,j)-pcaModel[j],sum);covariance[i*3+j]=covariance[j*3+i]=sum*(1./samples.rows);}eigenReference(covariance,pcaModel+12,pcaModel+3);

}
static cv::Mat pcaView(const cv::Mat& src,const double* params,const double* basis=nullptr){
 if(basis)std::copy(basis,basis+15,pcaModel);else preparePca(src);cv::Mat data;src.reshape(1,int(src.total())).convertTo(data,CV_64F);
 for(int i=0;i<data.rows;i++)for(int c=0;c<3;c++)data.at<double>(i,c)-=pcaModel[c];
 int component=params[0],mode=params[1];const double* vector=pcaModel+3+component*3;cv::Mat result;
 if(mode==1){cv::Mat raw(data.rows,3,CV_64F);for(int i=0;i<data.rows;i++)for(int c=0;c<3;c++){double sum=0;for(int k=0;k<3;k++)sum=std::fma(data.at<double>(i,k),pcaModel[3+c*3+k],sum);raw.at<double>(i,c)=sum;}cv::Mat plane(src.rows,src.cols,CV_64F);for(int i=0;i<data.rows;i++)plane.ptr<double>()[i]=raw.at<double>(i,component);result=norm(plane);}
 else{
  std::vector<cv::Mat> cross;for(int c=0;c<3;c++){int j=(c+1)%3,k=(c+2)%3;cv::Mat plane(src.rows,src.cols,CV_64F);for(int i=0;i<data.rows;i++)plane.ptr<double>()[i]=data.at<double>(i,j)*vector[k]-data.at<double>(i,k)*vector[j];cross.push_back(plane);}
  if(mode==0){cv::Mat distance(src.rows,src.cols,CV_64F);double length=std::sqrt(vector[0]*vector[0]+vector[1]*vector[1]+vector[2]*vector[2]);for(int i=0;i<data.rows;i++){double a=cross[0].ptr<double>()[i],b=cross[1].ptr<double>()[i],c=cross[2].ptr<double>()[i];distance.ptr<double>()[i]=std::sqrt((a*a+b*b)+c*c)/length;}result=norm(distance);}
  else{for(auto& plane:cross)plane=norm(plane);cv::merge(cross,result);}
 }
 if(params[2])cv::bitwise_not(result,result);if(params[3])result=equalize(result);if(result.channels()==1)cv::cvtColor(result,result,cv::COLOR_GRAY2BGR);return result;
}
#include "frequency.h"
#include "contrast.h"
#include "stereo.h"
#include "comparison.h"
#include "comparison-fma.h"
#include "comparison-simd.h"
#include "prnu.h"
#include "noisesniffer.h"
#include "comparison-sewar.h"
#include "comparison-helpers.h"
#include "../.build/comparison-ssimulacra.h"
#include "../.build/comparison-butteraugli.h"
extern "C" {
void cv_prnu_fma_mode(int);
int cv_prnu_prepare(const unsigned char* rgb,int width,int height,int fast){try{cv_prnu_fma_mode(fast);cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb));output=prnuResidual(input);return 1;}catch(...){output.release();return 0;}}
int cv_prnu_method(){return int(prnuFftMethod);}
double cv_prnu_noise(){return prnuNoisePower;}
int cv_comparison(const unsigned char* first,const unsigned char* second,int width,int height,int mode,int original){try{comparisonFastArithmetic=original!=1&&original!=3;comparisonContiguous=original==0||original==3;cv::Mat a(height,width,CV_8UC3,const_cast<unsigned char*>(first)),b(height,width,CV_8UC3,const_cast<unsigned char*>(second)),aa,bb;cv::cvtColor(a,aa,cv::COLOR_RGB2BGR);cv::cvtColor(b,bb,cv::COLOR_RGB2BGR);if(mode==0){cv::Mat difference;cv::absdiff(aa,bb,difference);difference=norm(difference);cv::cvtColor(difference,output,cv::COLOR_BGR2RGB);}else if(mode==1)output=comparisonSsim(aa,bb);else if(mode==2)output=comparisonHistograms(aa,bb);else if(mode==3)output=comparisonSewar(aa,bb);else if(mode==4)output=comparisonButteraugli::compute(aa,bb);else if(mode==5)output=cv::Mat(1,1,CV_64F,cv::Scalar(comparisonSsimulacra::compute(aa,bb)));else return 0;return 1;}catch(...){output.release();return 0;}}
double cv_comparison_score(){return comparisonScore;}
int cv_comparison_render(const double* map,int width,int height){try{cv::Mat m(height,width,CV_64F,const_cast<double*>(map));auto view=norm(m);cv::bitwise_not(view,view);cv::cvtColor(view,output,cv::COLOR_GRAY2RGB);return 1;}catch(...){output.release();return 0;}}
int cv_stereo_prepare(const unsigned char* rgb,int width,int height,int mode,int offset){try{cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);if(mode==0)output=stereoSearch(bgr);else if(mode==1){auto pattern=stereoPattern(bgr,offset);cv::cvtColor(pattern,output,cv::COLOR_BGR2RGB);}else if(mode==2||mode==7)output=stereoFlow(bgr,offset,mode==2);else return 0;return 1;}catch(...){output.release();return 0;}}
int cv_stereo_offset(){return stereoOffset;}
int cv_stereo_view(const unsigned char* pattern,int width,int height,int mode,const float* flow){try{cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(pattern)),bgr,f;if(flow)f=cv::Mat(height,width,CV_32F,const_cast<float*>(flow));cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);auto result=stereoView(bgr,mode,f);cv::cvtColor(result,output,cv::COLOR_BGR2RGB);return 1;}catch(...){output.release();return 0;}}

int cv_contrast_prepare(const unsigned char* rgb,int width,int height,int block){try{cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);output=contrastMaps(bgr,block);return 1;}catch(...){output.release();return 0;}}
int cv_contrast_view(const float* values,int cols,int rows,int width,int height,int block,int mode){try{cv::Mat input(rows,cols,CV_32FC3,const_cast<float*>(values));output=contrastView(input,width,height,block,mode);return 1;}catch(...){output.release();return 0;}}

int cv_frequency_prepare(const unsigned char* rgb,int width,int height){try{output.release();cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);output=frequencyBase(bgr);return 1;}catch(...){output.release();return 0;}}
int cv_frequency_view(const float* values,int columns,int rows,int width,int height,const double* p,const float* mask){try{cv::Mat input(rows,columns,CV_32FC4,const_cast<float*>(values));frequencyView(input,width,height,p,mask);return 1;}catch(...){for(auto& frame:frequencyFrames)frame.release();return 0;}}
int cv_frequency_mask(int width,int height,double split,double smooth,int kind){try{output=frequencyMaskInput(width,height,split,smooth,kind);return 1;}catch(...){output.release();return 0;}}
int cv_frequency_frame(int i){if(i<0||i>4)return 0;output=i==4?frequencyMask:frequencyFrames[i];return !output.empty();}
double cv_frequency_zero(){return frequencyZero;}

int cv_run(const unsigned char* rgb,int width,int height,int op,const double* params){
 try{output.release();cv::setNumThreads(1);cv::Mat source(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr,result;cv::cvtColor(source,bgr,cv::COLOR_RGB2BGR);
 switch(op){case 1:result=color(bgr,params[0],params[1]);break;case 2:result=noise(bgr,params);break;case 3:result=gradient(bgr,params);break;case 4:result=adjust(bgr,params);break;case 5:result=echo(bgr,params);break;case 6:cv::resize(bgr,result,{int(params[0]),int(params[1])},0,0,cv::INTER_LANCZOS4);break;case 7:result=pcaView(bgr,params);break;case 8:result=pcaView(bgr,params,params+4);break;case 9:result=params[0]?equalize(bgr):bgr;if(params[1])result=gray3(result);break;default:return 0;}cv::cvtColor(result,output,cv::COLOR_BGR2RGB);return 1;
 }catch(...){output.release();return 0;}
}
int cv_pca_model(const unsigned char* rgb,int width,int height){try{output.release();cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);preparePca(bgr);output=cv::Mat(1,15,CV_64F,pcaModel).clone();return 1;}catch(...){output.release();return 0;}}
int cv_hash(const unsigned char* rgb,int width,int height,int kind){try{output.release();cv::setNumThreads(1);cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);
 switch(kind){case 0:cv::img_hash::averageHash(bgr,output);break;case 1:cv::img_hash::blockMeanHash(bgr,output);break;case 2:cv::img_hash::colorMomentHash(bgr,output);break;case 3:cv::img_hash::marrHildrethHash(bgr,output);break;case 4:cv::img_hash::pHash(bgr,output);break;case 5:cv::img_hash::radialVarianceHash(bgr,output);break;default:return 0;}return 1;}catch(...){output.release();return 0;}}
int cv_plot(const unsigned char* rgb,int width,int height,int scale){try{output.release();cv::setNumThreads(1);cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),bgr;cv::cvtColor(input,bgr,cv::COLOR_RGB2BGR);for(int i=0;i<scale;i++)cv::pyrDown(bgr,bgr);auto unit=normalized(bgr),hsv=floatHue(unit,false);output.create(int(bgr.total()),6,CV_32F);for(int y=0;y<bgr.rows;y++)for(int x=0;x<bgr.cols;x++){auto p=output.ptr<float>(y*bgr.cols+x),r=unit.ptr<float>(y)+x*3,h=hsv.ptr<float>(y)+x*3;for(int c=0;c<3;c++){p[c]=r[2-c];p[3+c]=c==0?h[c]/360.f:h[c];}}return 1;}catch(...){output.release();return 0;}}
int cv_decode(const unsigned char* bytes,int length){try{output.release();cv::Mat encoded(1,length,CV_8U,const_cast<unsigned char*>(bytes));auto bgr=cv::imdecode(encoded,cv::IMREAD_COLOR);if(bgr.empty())return 0;cv::cvtColor(bgr,output,cv::COLOR_BGR2RGB);return 1;}catch(...){output.release();return 0;}}
int cv_decode_gray(const unsigned char* bytes,int length){try{output.release();cv::Mat encoded(1,length,CV_8U,const_cast<unsigned char*>(bytes));output=cv::imdecode(encoded,cv::IMREAD_GRAYSCALE);return !output.empty();}catch(...){output.release();return 0;}}
int cv_noise_map(const double* values,int width,int height,int targetWidth,int targetHeight){try{output.release();cv::Mat input(height,width,CV_64F,const_cast<double*>(values)),resized;auto normalized=normalized8(input);cv::resize(normalized,resized,{targetWidth,targetHeight},0,0,cv::INTER_NEAREST);cv::cvtColor(resized,output,cv::COLOR_GRAY2RGB);return 1;}catch(...){output.release();return 0;}}
const unsigned char* cv_data(){return output.data;}int cv_width(){return output.cols;}int cv_height(){return output.rows;}int cv_size(){return output.total()*output.elemSize();}void cv_release(){output.release();for(auto& frame:frequencyFrames)frame.release();frequencyMask.release();}
const double* cv_model(){return pcaModel;}
}
