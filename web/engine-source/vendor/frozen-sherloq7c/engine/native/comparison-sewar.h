// Sewar scalar metrics, preserving the native SciPy border/reduction semantics.
// See vendor/comparison for the source oracle and retained licenses.
#include <complex>
#include "comparison-kernels.h"
static cv::Mat comparisonUniform(const cv::Mat& input,int size,bool channelAxis=false){
 cv::Mat src=input;
 for(int axis=0;axis<2;axis++){
  cv::Mat dst(src.size(),CV_64F);int length=axis==0?src.rows:src.cols,lines=axis==0?src.cols:src.rows;
  for(int line=0;line<lines;line++){
   auto value=[&](int at){at=cv::borderInterpolate(at,length,cv::BORDER_REFLECT);return axis==0?src.at<double>(at,line):src.at<double>(line,at);};
   double sum=0;for(int j=0;j<size;j++)sum+=value(j-size/2);
   for(int i=0;i<length;i++){if(i)sum+=value(i+size-size/2-1)-value(i-size/2-1);if(axis==0)dst.at<double>(i,line)=sum/size;else dst.at<double>(line,i)=sum/size;}
  }src=dst;
 }
 // Sewar passes HxWx1 to uniform_filter for RASE and MS-SSIM downsampling.
 if(channelAxis)for(int i=0;i<src.total();i++){double x=src.ptr<double>()[i],sum=0;for(int k=0;k<size;k++)sum+=x;src.ptr<double>()[i]=sum/size;}
 return src;
}
static cv::Mat comparisonConvolve(const cv::Mat& image,const cv::Mat& kernel,bool valid){
 cv::Mat a=image,b=kernel;
 if(valid&&(a.rows<b.rows||a.cols<b.cols)){
  if(a.rows>b.rows||a.cols>b.cols)throw std::runtime_error("Incompatible valid convolution dimensions");std::swap(a,b);
 }
 cv::Mat out(valid?a.rows-b.rows+1:a.rows,valid?a.cols-b.cols+1:a.cols,CV_64F);
 const int oy=valid?b.rows-1:(b.rows-1)/2,ox=valid?b.cols-1:(b.cols-1)/2;
 if(comparisonContiguous){cv::Mat padded=a;if(!valid)cv::copyMakeBorder(a,padded,b.rows-1-oy,oy,b.cols-1-ox,ox,cv::BORDER_CONSTANT,cv::Scalar(0));comparisonConvolveRows(padded,b,out);return out;}
 for(int y=0;y<out.rows;y++)for(int x=0;x<out.cols;x++){
  double sum=0;
  for(int ky=0;ky<b.rows;ky++){
   const int iy=y+oy-ky;const double* row=iy>=0&&iy<a.rows?a.ptr<double>(iy):nullptr;const double* weights=b.ptr<double>(ky);
   auto value=[&](int k){int ix=x+ox-k;return row&&ix>=0&&ix<a.cols?row[ix]:0.;};int k=0;
   // SciPy 1.17.1 convolve2d groups four products before adding to the sum.
   for(;k<=b.cols-4;k+=4){double group=weights[k]*value(k);for(int j=1;j<4;j++)group=comparisonFma(weights[k+j],value(k+j),group);sum+=group;}
   for(;k<b.cols;k++)sum=comparisonFma(weights[k],value(k),sum);
  }out.at<double>(y,x)=sum;
 }return out;
}
static cv::Mat comparisonKernel(const double* data,int n){return cv::Mat(n,n,CV_64F,const_cast<double*>(data));}
static double comparisonMean(const cv::Mat& image,int crop=0){
 if(image.rows<=2*crop||image.cols<=2*crop)return NAN;
 auto data=crop?image(cv::Rect(crop,crop,image.cols-2*crop,image.rows-2*crop)).clone():image;
 return contrastSum(data.ptr<double>(),data.total())/double(data.total());
}
static cv::Mat comparisonHalf(const cv::Mat& src){cv::Mat dst((src.rows+1)/2,(src.cols+1)/2,CV_64F);for(int y=0;y<dst.rows;y++)for(int x=0;x<dst.cols;x++)dst.at<double>(y,x)=src.at<double>(2*y,2*x);return dst;}
static double comparisonRase(const cv::Mat& x,const cv::Mat& y){
 cv::Mat difference=x-y;auto error=comparisonUniform(difference.mul(difference),8),means=comparisonUniform(x,8,true);
 for(int i=0;i<error.total();i++){double m=means.ptr<double>()[i]/64.,r=std::sqrt(error.ptr<double>()[i]);error.ptr<double>()[i]=m!=0?(100./m)*std::sqrt(r*r):0.;}return comparisonMean(error,4);
}
static double comparisonUqi(const cv::Mat& x,const cv::Mat& y){
 auto a=comparisonUniform(x,8),b=comparisonUniform(y,8),aa=comparisonUniform(x.mul(x),8),bb=comparisonUniform(y.mul(y),8),ab=comparisonUniform(x.mul(y),8);
 for(int i=0;i<a.total();i++){double u=a.ptr<double>()[i],v=b.ptr<double>()[i],uv=u*v,ss=u*u+v*v,numerator=4*(64*ab.ptr<double>()[i]-uv)*uv,d1=64*(aa.ptr<double>()[i]+bb.ptr<double>()[i])-ss,d=d1*ss;a.ptr<double>()[i]=d!=0?numerator/d:(d1==0&&ss!=0?2*uv/ss:1.);}
 return comparisonMean(a,4);
}
struct ComparisonMoments{cv::Mat xx,yy,xy,vx,vy,cov;};
static ComparisonMoments comparisonMoments(const cv::Mat& x,const cv::Mat& y,const cv::Mat& win,bool valid){
 auto a=comparisonConvolve(x,win,valid),b=comparisonConvolve(y,win,valid);ComparisonMoments m;
 m.xx=a.mul(a);m.yy=b.mul(b);m.xy=a.mul(b);m.vx=comparisonConvolve(x.mul(x),win,valid)-m.xx;m.vy=comparisonConvolve(y.mul(y),win,valid)-m.yy;m.cov=comparisonConvolve(x.mul(y),win,valid)-m.xy;return m;
}
static cv::Mat comparisonHighpass(const cv::Mat& input){
 cv::Mat out(input.size(),CV_64F);for(int y=0;y<input.rows;y++)for(int x=0;x<input.cols;x++){
  double s=0;for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++)s+=input.at<double>(cv::borderInterpolate(y+j,input.rows,cv::BORDER_REFLECT),cv::borderInterpolate(x+k,input.cols,cv::BORDER_REFLECT))*(j==0&&k==0?8:-1);
  // generic_laplace invokes the same 2-D correlation once for each axis.
  out.at<double>(y,x)=s+s;
 }return out;
}
static double comparisonScc(const cv::Mat& x,const cv::Mat& y){
 cv::Mat win(8,8,CV_64F,cv::Scalar(1./64));auto m=comparisonMoments(comparisonHighpass(x),comparisonHighpass(y),win,false);
 for(int i=0;i<m.vx.total();i++){double d=std::sqrt(std::max(m.vx.ptr<double>()[i],0.))*std::sqrt(std::max(m.vy.ptr<double>()[i],0.));m.cov.ptr<double>()[i]=d==0?0:m.cov.ptr<double>()[i]/d;}return comparisonMean(m.cov);
}
static double comparisonMsssim(cv::Mat x,cv::Mat y){
 static const double weights[]={.0448,.2856,.3001,.2363,.1333};const int scales=std::min(5,int(std::floor(std::log2(std::min(x.rows,x.cols)/11.)))+1);if(scales<=0)return NAN;
 auto win=comparisonKernel(comparisonKernel_ssim,11);std::complex<double> score(1,0);
 const double c1=(.01*255)*(.01*255),c2=(.03*255)*(.03*255);
 for(int scale=0;scale<scales;scale++){
  auto m=comparisonMoments(x,y,win,true);for(int i=0;i<m.xx.total();i++){
   double cs=2*m.cov.ptr<double>()[i]+c2,den=m.vx.ptr<double>()[i]+m.vy.ptr<double>()[i]+c2;
   m.xy.ptr<double>()[i]=((2*m.xy.ptr<double>()[i]+c1)*cs)/((m.xx.ptr<double>()[i]+m.yy.ptr<double>()[i]+c1)*den);m.cov.ptr<double>()[i]=cs/den;
  }double value=comparisonMean(scale==scales-1?m.xy:m.cov);score*=std::pow(std::complex<double>(value,0),weights[scale]);
  if(scale<scales-1){x=comparisonHalf(comparisonUniform(x,2,true));y=comparisonHalf(comparisonUniform(y,2,true));}
 }return score.real();
}
static double comparisonVifp(cv::Mat x,cv::Mat y){
 const double* kernels[]={comparisonKernel_vif17,comparisonKernel_vif9,comparisonKernel_vif5,comparisonKernel_vif3};const int sizes[]={17,9,5,3};double numerator=0,denominator=0;
 for(int scale=0;scale<4;scale++){
  auto win=comparisonKernel(kernels[scale],sizes[scale]);if(scale){x=comparisonHalf(comparisonConvolve(x,win,true));y=comparisonHalf(comparisonConvolve(y,win,true));}
  auto m=comparisonMoments(x,y,win,true);
  for(int i=0;i<m.xx.total();i++){
   double vx=std::max(m.vx.ptr<double>()[i],0.),vy=std::max(m.vy.ptr<double>()[i],0.),cov=m.cov.ptr<double>()[i],gain=cov/(vx+1e-10),noise=vy-gain*cov;
   if(vx<1e-10){gain=0;noise=vy;vx=0;}if(vy<1e-10){gain=0;noise=0;}if(gain<0){noise=vy;gain=0;}if(noise<=1e-10)noise=1e-10;
   m.xx.ptr<double>()[i]=std::log10(1.+gain*gain*vx/(noise+2));m.yy.ptr<double>()[i]=std::log10(1.+vx/2);
  }numerator+=contrastSum(m.xx.ptr<double>(),m.xx.total());denominator+=contrastSum(m.yy.ptr<double>(),m.yy.total());
 }return numerator/denominator;
}
static cv::Mat comparisonSewar(const cv::Mat& first,const cv::Mat& second){
 cv::Mat x,y;cv::cvtColor(first,x,cv::COLOR_BGR2GRAY);cv::cvtColor(second,y,cv::COLOR_BGR2GRAY);x.convertTo(x,CV_64F);y.convertTo(y,CV_64F);cv::Mat result(1,5,CV_64F,cv::Scalar(NAN));
 try{result.at<double>(0)=comparisonMsssim(x,y);}catch(const std::runtime_error&){}
 result.at<double>(1)=comparisonRase(x,y);result.at<double>(2)=comparisonScc(x,y);result.at<double>(3)=comparisonUqi(x,y);
 try{result.at<double>(4)=comparisonVifp(x,y);}catch(const std::runtime_error&){}return result;
}
