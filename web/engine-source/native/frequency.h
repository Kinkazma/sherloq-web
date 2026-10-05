// Native FrequencyEngine pipeline: float32 DFT, reference arithmetic and explicit padding.
static cv::Mat frequencyFrames[4],frequencyMask;
static double frequencyZero=0;
namespace cv { namespace details {const float* getLogTab32f();}}
static cv::Mat frequencyNormalize(const cv::Mat& input){
 double lo,hi;cv::minMaxLoc(input,&lo,&hi);double scale=hi-lo>DBL_EPSILON?255.*(1./(hi-lo)):0.;float a=scale,b=-lo*double(a);cv::Mat out(input.size(),CV_32F);
 for(int y=0;y<input.rows;y++)for(int x=0;x<input.cols;x++)out.at<float>(y,x)=std::fma(input.at<float>(y,x),a,b);return out;
}
static float frequencyLog(float value){
 uint32_t bits;std::memcpy(&bits,&value,4);uint32_t mantissa=(bits&((1u<<15)-1))|(127u<<23);float unit;std::memcpy(&unit,&mantissa,4);int index=(bits>>14)&510;const float* table=cv::details::getLogTab32f();
 float base=std::fma(float(int((bits>>23)&255)-127),float(.69314718055994530941723212145818),table[index]);float x=std::fma(unit-1.f,table[index+1],index==510?-1.f/512:0.f);
 return std::fma(std::fma(std::fma(x,1.f/3,-.5f),x,1.f),x,base);
}
static float frequencyAngle(float y,float x){
 const float p1=.9997878412794807f*float(180/CV_PI),p3=-.3258083974640975f*float(180/CV_PI),p5=.1555786518463281f*float(180/CV_PI),p7=-.04432655554792128f*float(180/CV_PI);
 float ax=std::abs(x),ay=std::abs(y),c=std::min(ax,ay)/(std::max(ax,ay)+float(DBL_EPSILON)),cc=c*c,a=std::fma(std::fma(std::fma(cc,p7,p5),cc,p3),cc,p1)*c;if(ax<ay)a=90.f-a;if(x<0)a=180.f-a;if(y<0)a=360.f-a;return a*float(CV_PI/180);
}
static cv::Mat frequencyMagnitude(const cv::Mat& a,const cv::Mat& b){cv::Mat out(a.size(),CV_32F);for(int y=0;y<a.rows;y++)for(int x=0;x<a.cols;x++)out.at<float>(y,x)=std::sqrt(std::fma(a.at<float>(y,x),a.at<float>(y,x),b.at<float>(y,x)*b.at<float>(y,x)));return out;}
#include "sqrt-tables.h"
static float estimateReference(float x,bool rsqrt){
 int exponent;float unit=std::frexp(x,&exponent)*2.f;exponent--;uint32_t bits;std::memcpy(&bits,&unit,4);int index=(bits>>15)&255;int parity=(exponent%2+2)%2;
 bits=rsqrt?(parity?rsqrtEstimateTwo[index]:rsqrtEstimateOne[index]):reciprocalEstimate[index];float estimate;std::memcpy(&estimate,&bits,4);return std::ldexp(estimate,rsqrt?-(exponent-parity)/2:-exponent);
}
static float sqrtCarotene(float value){
 if(value==0)return 0;float e=estimateReference(value,true);for(int i=0;i<2;i++)e=(std::fma(-(e*e),value,3.f)*.5f)*e;
 float inverse=estimateReference(e,false);for(int i=0;i<2;i++)inverse=std::fma(-e,inverse,2.f)*inverse;return inverse;
}
static cv::Mat frequencyReconstructionMagnitude(const cv::Mat& a,const cv::Mat& b){
 cv::Mat out(a.size(),CV_32F);size_t total=a.total();
 // The reference GCD HAL splits magnitude into rounded 64K stripes. Each
 // stripe has its own scalar odd tail; those tails matter before min/max
 // normalization. Column inputs remain strided one-element rows in Python.
 int stripes=a.cols==1?int(total):std::max(1,cvRound(total/65536.));
 size_t begin=0;
 for(int stripe=0;stripe<stripes;stripe++){
  size_t end=(uint64_t(stripe+1)*total+stripes/2)/stripes,vectorEnd=begin+(end-begin)/2*2;
  for(size_t i=begin;i<end;i++){float x=a.ptr<float>()[i],y=b.ptr<float>()[i];out.ptr<float>()[i]=i<vectorEnd?sqrtCarotene(x*x+y*y):std::sqrt(std::fma(x,x,y*y));}begin=end;
 }return out;
}
static inline float frequencyMaskFma(float x,float y,float z){
 // A binary32 product is exact in binary64. Only a halfway double result
 // (or float underflow) needs the general fused implementation to avoid
 // double rounding. Mask values and weights are finite and nonnegative.
 double sum=double(x)*double(y)+double(z);uint64_t bits;std::memcpy(&bits,&sum,8);
 if((bits&0x1fffffff)==0x10000000||(sum!=0&&sum<FLT_MIN))return std::fma(x,y,z);
 return float(sum);
}
static cv::Mat frequencyBlur(const cv::Mat& input,int kernel){
 if(kernel==1)return input;int r=kernel/2;auto weights=cv::getGaussianKernel(kernel,0,CV_32F);cv::Mat horizontal(input.size(),CV_32F),out(input.size(),CV_32F);
 std::vector<int> representatives(input.cols+1,-1);
 for(int y=0;y<input.rows;y++){
  // The input is a filled circle: equal run lengths identify identical rows.
  // Sharing them changes neither the coefficients nor accumulation order.
  int length=cv::countNonZero(input.row(y));int previous=representatives[length];
  if(previous>=0){horizontal.row(previous).copyTo(horizontal.row(y));continue;}representatives[length]=y;
  for(int x=0;x<input.cols;x++){
  if(input.cols==1){horizontal.at<float>(y,x)=input.at<float>(y,x);continue;}
  auto sample=[&](int dx){return input.at<float>(y,cv::borderInterpolate(x+dx,input.cols,cv::BORDER_REFLECT_101));};float sum;
  if(kernel<=5){sum=std::fma(sample(0),weights.at<float>(r),(sample(-1)+sample(1))*weights.at<float>(r+1));if(kernel==5)sum=std::fma(sample(-2)+sample(2),weights.at<float>(r+2),sum);}
  else{sum=sample(-r)*weights.at<float>(0);for(int k=1;k<kernel;k++)sum+=sample(k-r)*weights.at<float>(k);}horizontal.at<float>(y,x)=sum;
 }}
 if(input.rows==1)return horizontal;
 for(int y=0;y<input.rows;y++){
  float* dest=out.ptr<float>(y);const float* center=horizontal.ptr<float>(y);float weight=weights.at<float>(r);
  for(int x=0;x<input.cols;x++)dest[x]=center[x]*weight;
  for(int k=1;k<=r;k++){
   const float* plus=horizontal.ptr<float>(cv::borderInterpolate(y+k,input.rows,cv::BORDER_REFLECT_101));const float* minus=horizontal.ptr<float>(cv::borderInterpolate(y-k,input.rows,cv::BORDER_REFLECT_101));weight=weights.at<float>(r+k);
   for(int x=0;x<input.cols;x++)dest[x]=frequencyMaskFma(plus[x]+minus[x],weight,dest[x]);
  }
 }return out;
}
static cv::Mat shiftFrequency(const cv::Mat& input,bool inverse){
 cv::Mat out(input.size(),input.type());int dy=inverse?(input.rows+1)/2:input.rows/2,dx=inverse?(input.cols+1)/2:input.cols/2;size_t bytes=input.elemSize();
 for(int y=0;y<input.rows;y++)for(int x=0;x<input.cols;x++)std::memcpy(out.ptr((y+dy)%input.rows)+((x+dx)%input.cols)*bytes,input.ptr(y)+x*bytes,bytes);return out;
}
static cv::Mat frequencyBase(const cv::Mat& bgr){
 cv::Mat gray,padded,dft,mag,phase,unused,logged;cv::cvtColor(bgr,gray,cv::COLOR_BGR2GRAY);cv::copyMakeBorder(gray,padded,0,cv::getOptimalDFTSize(gray.rows)-gray.rows,0,cv::getOptimalDFTSize(gray.cols)-gray.cols,cv::BORDER_CONSTANT);padded.convertTo(padded,CV_32F);cv::dft(padded,dft,cv::DFT_COMPLEX_OUTPUT);dft=shiftFrequency(dft,false);std::vector<cv::Mat> parts;cv::split(dft,parts);
 mag=frequencyMagnitude(parts[1],parts[0]);logged.create(mag.size(),CV_32F);phase.create(mag.size(),CV_32F);for(int y=0;y<mag.rows;y++)for(int x=0;x<mag.cols;x++){logged.at<float>(y,x)=frequencyLog(mag.at<float>(y,x));phase.at<float>(y,x)=frequencyAngle(parts[1].at<float>(y,x),parts[0].at<float>(y,x));}mag=frequencyNormalize(logged);phase=frequencyNormalize(phase);parts.push_back(mag);parts.push_back(phase);cv::Mat out;cv::merge(parts,out);return out;
}
static cv::Mat frequencyMaskInput(int width,int height,double split,double smooth,int kind){
 double half=std::sqrt(double(height)*height+double(width)*width)/2.;int radius=int(half*split/100),kernel=2*int(half*smooth/100)+1;
 if(kind==1)return cv::getGaussianKernel(kernel,0,CV_32F);cv::Mat mask(height,width,CV_32F,cv::Scalar(0));cv::circle(mask,{width/2,height/2},radius,1,cv::FILLED);return kind==2?frequencyBlur(mask,kernel):mask;
}
static void frequencyView(const cv::Mat& base,int width,int height,const double* p,const float* suppliedMask=nullptr){
 std::vector<cv::Mat> parts;cv::split(base,parts);cv::Mat mask=suppliedMask?cv::Mat(base.size(),CV_32F,const_cast<float*>(suppliedMask)).clone():frequencyMaskInput(base.cols,base.rows,p[0],p[1],2);double maximum;cv::minMaxLoc(mask,nullptr,&maximum);for(int y=0;y<mask.rows;y++)for(int x=0;x<mask.cols;x++)mask.at<float>(y,x)/=float(maximum);
 int zero=0;for(int y=0;y<mask.rows;y++)for(int x=0;x<mask.cols;x++){if(p[2]&&parts[2].at<float>(y,x)<int(p[2]/100*255))mask.at<float>(y,x)=0;if(mask.at<float>(y,x)==0)zero++;}frequencyZero=p[2]?double(zero)/mask.total()*100:0;frequencyMask=mask;
 for(int high=0;high<2;high++){
  cv::Mat filtered(base.size(),CV_32FC2);for(int y=0;y<base.rows;y++)for(int x=0;x<base.cols;x++){float weight=high?1.f-mask.at<float>(y,x):mask.at<float>(y,x);filtered.at<cv::Vec2f>(y,x)={parts[0].at<float>(y,x)*weight,parts[1].at<float>(y,x)*weight};}
  filtered=shiftFrequency(filtered,true);cv::Mat inverse;cv::idft(filtered,inverse,cv::DFT_SCALE);filtered=inverse;std::vector<cv::Mat> pair;cv::split(filtered,pair);auto magnitude=frequencyReconstructionMagnitude(pair[0],pair[1]);
  if(!high)magnitude=magnitude(cv::Rect(0,0,width,height));auto normalization=frequencyNormalize(magnitude);auto normalized=np8(normalization);if(high)normalized=normalized(cv::Rect(0,0,width,height));cv::cvtColor(normalized,frequencyFrames[high],cv::COLOR_GRAY2RGB);
 }
 for(int i=0;i<2;i++){cv::Mat display(base.size(),CV_8U);for(int y=0;y<base.rows;y++)for(int x=0;x<base.cols;x++)display.at<uchar>(y,x)=trunc8(parts[2+i].at<float>(y,x)*mask.at<float>(y,x));if(p[3])cv::GaussianBlur(display,display,{int(p[3])*2+1,int(p[3])*2+1},0);cv::cvtColor(display,frequencyFrames[2+i],cv::COLOR_GRAY2RGB);}
}
