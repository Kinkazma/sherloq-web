#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <stdexcept>
#include <vector>
extern "C" {
#include "wt.h"
}

namespace {
struct Plane {
 size_t rows,cols;std::vector<double> data;
 Plane(size_t r,size_t c):rows(r),cols(c),data(r*c){}
};
struct Info {
 size_t shape[2];pywt_index_t strides[2];ArrayInfo info;
 explicit Info(const Plane& p):shape{p.rows,p.cols},strides{int(p.cols*8),8},info{shape,strides,2}{}
};
using Wavelet=std::unique_ptr<DiscreteWavelet,decltype(&free_discrete_wavelet)>;
Wavelet wavelet(int family,int order){
 const WAVELET_NAME names[]={DB,SYM,COIF,BIOR};
 if(family<0||family>3)throw std::runtime_error("family");
 Wavelet w(discrete_wavelet(names[family],order),free_discrete_wavelet);
 if(!w)throw std::runtime_error("wavelet");return w;
}
Plane down(const Plane& p,const DiscreteWavelet* w,int axis,Coefficient type){
 Plane out(axis==0?dwt_buffer_length(p.rows,w->dec_len,MODE_SYMMETRIC):p.rows,axis==1?dwt_buffer_length(p.cols,w->dec_len,MODE_SYMMETRIC):p.cols);Info in(p),to(out);
 if(double_downcoef_axis(p.data.data(),in.info,out.data.data(),to.info,w,axis,type,MODE_SYMMETRIC,0,DWT_TRANSFORM))throw std::runtime_error("dwt");return out;
}
Plane crop(const Plane& p,size_t rows,size_t cols){
 if(rows>p.rows||cols>p.cols)throw std::runtime_error("crop");Plane out(rows,cols);
 for(size_t y=0;y<rows;y++)std::copy_n(p.data.data()+y*p.cols,cols,out.data.data()+y*cols);return out;
}
Plane up(const Plane& a,const Plane& d,const DiscreteWavelet* w,int axis){
 if(a.rows!=d.rows||a.cols!=d.cols)throw std::runtime_error("shapes");
 Plane out(axis==0?idwt_buffer_length(a.rows,w->rec_len,MODE_SYMMETRIC):a.rows,axis==1?idwt_buffer_length(a.cols,w->rec_len,MODE_SYMMETRIC):a.cols);Info ai(a),di(d),to(out);
 if(double_idwt_axis(a.data.data(),&ai.info,d.data.data(),&di.info,out.data.data(),to.info,w,axis,MODE_SYMMETRIC))throw std::runtime_error("idwt");return out;
}
void threshold(Plane& p,double fraction,int mode){
 double maximum=0;for(double x:p.data)maximum=std::max(maximum,std::abs(x));if(maximum==0)return;
 const double value=fraction*maximum,square=value*value;
 for(double& x:p.data){double magnitude=std::abs(x);switch(mode){
  case 0:{double factor=1-value/magnitude;x*=factor<0?0:factor;break;}
  case 1:if(magnitude<value)x=0;break;
  case 2:{double factor=1-square/(magnitude*magnitude);x*=factor<0?0:factor;break;}
  case 3:if(x<value)x=0;break;
  case 4:if(x>value)x=0;break;
  default:throw std::runtime_error("mode");
 }}
}
std::vector<double> output;
struct Transform {
 int width,height;Plane a;std::vector<std::array<Plane,3>> details;
 Transform(int w,int h):width(w),height(h),a(h,w){}
};
Transform prepare(const unsigned char* rgb,int width,int height,const DiscreteWavelet* w){
 Transform t(width,height);for(size_t i=0;i<t.a.data.size();i++)t.a.data[i]=rgb[i*3+2];
 int maximum=dwt_max_level(std::min(width,height),w->dec_len);
 for(int i=0;i<maximum;i++){
  auto lo=down(t.a,w,0,COEF_APPROX),hi=down(t.a,w,0,COEF_DETAIL);
  t.details.push_back({down(hi,w,1,COEF_APPROX),down(lo,w,1,COEF_DETAIL),down(hi,w,1,COEF_DETAIL)});
  t.a=down(lo,w,1,COEF_APPROX);
 }return t;
}
Plane reconstruct(Transform& t,const DiscreteWavelet* w,int thresholdPercent,int level,int mode){
 int maximum=t.details.size();if(level<0)level=maximum?std::max(1,maximum/2):0;
 if(thresholdPercent==0||level==0){thresholdPercent=0;level=0;mode=0;}level=std::min(level,maximum);
 for(int i=maximum-1;i>=0;i--){
  auto& d=t.details[i];if(thresholdPercent&&i<level)for(auto& band:d)threshold(band,thresholdPercent/100.,mode);
  if(t.a.rows!=d[0].rows||t.a.cols!=d[0].cols)t.a=crop(t.a,d[0].rows,d[0].cols);
  t.a=up(up(t.a,d[1],w,1),up(d[0],d[2],w,1),w,0);
 }return crop(t.a,t.height,t.width);
}
void append(const Plane& p){output.push_back(p.rows);output.push_back(p.cols);output.insert(output.end(),p.data.begin(),p.data.end());}
Plane readPlane(const double* data,size_t length,size_t& at){
 if(at+2>length||data[at]<1||data[at+1]<1||data[at]*data[at+1]>length-at-2)throw std::runtime_error("coefficients");
 size_t rows=data[at++],cols=data[at++];Plane p(rows,cols);std::copy_n(data+at,rows*cols,p.data.begin());at+=rows*cols;return p;
}
}
extern "C" {
int wavelet_detail(const unsigned char* gray,int width,int height){
 try{output.clear();auto w=wavelet(0,8);Plane p(height,width);for(size_t i=0;i<p.data.size();i++)p.data[i]=gray[i];auto detail=down(down(p,w.get(),0,COEF_DETAIL),w.get(),1,COEF_DETAIL);append(detail);return 1;}catch(...){output.clear();return 0;}
}
int wavelet_noise(const double* values,int width,int height,int block){
 try{output.clear();if(block<1||block>std::min(width,height))return 0;Plane noise(height/block,width/block);std::vector<double> work(block*block);size_t half=work.size()/2;
  for(size_t y=0;y<noise.rows;y++)for(size_t x=0;x<noise.cols;x++){
   for(int j=0;j<block;j++)for(int i=0;i<block;i++)work[j*block+i]=std::abs(values[(y*block+j)*width+x*block+i]);
   std::nth_element(work.begin(),work.begin()+half,work.end());double median=work[half];if(work.size()%2==0)median=(median+*std::max_element(work.begin(),work.begin()+half))/2.;noise.data[y*noise.cols+x]=median/.6745;
  }append(noise);return 1;
 }catch(...){output.clear();return 0;}
}
int wavelet_prepare(const unsigned char* rgb,int width,int height,int family,int order){
 try{output.clear();auto w=wavelet(family,order);auto t=prepare(rgb,width,height,w.get());output={5501.,double(width),double(height),double(t.details.size())};append(t.a);for(auto& d:t.details)for(auto& p:d)append(p);return 1;}catch(...){output.clear();return 0;}
}
int wavelet_reconstruct(const double* data,int length,int family,int order,int thresholdPercent,int level,int mode){
 try{output.clear();if(length<6||data[0]!=5501||data[1]<1||data[2]<1||data[3]<0||data[3]>30)throw std::runtime_error("coefficients");
  auto w=wavelet(family,order);Transform t(data[1],data[2]);size_t at=4;t.a=readPlane(data,length,at);
  for(int i=0;i<data[3];i++){auto h=readPlane(data,length,at),v=readPlane(data,length,at),d=readPlane(data,length,at);t.details.push_back({std::move(h),std::move(v),std::move(d)});}if(at!=size_t(length))throw std::runtime_error("trailing");
  output=reconstruct(t,w.get(),thresholdPercent,level,mode).data;return 1;
 }catch(...){output.clear();return 0;}
}
int wavelet_run(const unsigned char* rgb,int width,int height,int family,int order,int thresholdPercent,int level,int mode){
 try{
  output.clear();auto w=wavelet(family,order);auto t=prepare(rgb,width,height,w.get());output=reconstruct(t,w.get(),thresholdPercent,level,mode).data;return 1;
 }catch(...){output.clear();return 0;}
}
const double* wavelet_data(){return output.data();}
int wavelet_size(){return output.size();}
void wavelet_release(){std::vector<double>().swap(output);}
}
