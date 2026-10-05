// Sewar's global filters/pyramids with bounded row caches. Formula source:
// comparison-sewar.h, retained native Sewar/SciPy arithmetic and border order.
#include <opencv2/core.hpp>
#include <emscripten.h>
#include <memory>
#include <vector>
#include <array>
#include <complex>
#include <stdexcept>
#include "comparison-fma.h"
#include "comparison-simd.h"
#include "comparison-kernels.h"
#include "comparison-paged-plane.h"
using Plane=ComparisonPlane<double>;
static int reflect(int i,int n){if(n==1)return 0;while(i<0||i>=n)i=i<0?-1-i:2*n-1-i;return i;}
template<class F>static Plane unary(const Plane&a,F f){Plane out(a.w,a.h);for(int y=0;y<a.h;y++){check("elementwise",y,a.h);const double*p=a.row(y);double*q=out.output(y);for(int x=0;x<a.w;x++)q[x]=f(p[x]);}return out;}
template<class F>static Plane binary(const Plane&a,const Plane&b,F f){Plane out(a.w,a.h);for(int y=0;y<a.h;y++){check("elementwise",y,a.h);const double*p=a.row(y),*q=b.row(y);double*r=out.output(y);for(int x=0;x<a.w;x++)r[x]=f(p[x],q[x]);}return out;}
static Plane mul(const Plane&a,const Plane&b){return binary(a,b,[](double a,double b){return a*b;});}
static Plane sub(const Plane&a,const Plane&b){return binary(a,b,[](double a,double b){return a-b;});}
static Plane uniform(const Plane&src,int size,bool channel=false){
 Plane vertical(src.w,src.h);std::vector<double> sums(src.w,0.);
 for(int k=0;k<size;k++){const double*p=src.row(reflect(k-size/2,src.h));for(int x=0;x<src.w;x++)sums[x]+=p[x];}
 for(int y=0;y<src.h;y++){check("uniform-axis0",y,src.h);if(y){const double*a=src.row(reflect(y+size-size/2-1,src.h)),*b=src.row(reflect(y-size/2-1,src.h));for(int x=0;x<src.w;x++)sums[x]+=a[x]-b[x];}double*q=vertical.output(y);for(int x=0;x<src.w;x++)q[x]=sums[x]/size;}
 Plane out(src.w,src.h);for(int y=0;y<src.h;y++){check("uniform-axis1",y,src.h);const double*p=vertical.row(y);double*q=out.output(y),sum=0;for(int k=0;k<size;k++)sum+=p[reflect(k-size/2,src.w)];for(int x=0;x<src.w;x++){if(x)sum+=p[reflect(x+size-size/2-1,src.w)]-p[reflect(x-size/2-1,src.w)];q[x]=sum/size;if(channel){double value=q[x],c=0;for(int k=0;k<size;k++)c+=value;q[x]=c/size;}}}return out;
}
static bool separatedArithmetic=false;
static void convolveSeparated(const cv::Mat& input,const cv::Mat& weights,cv::Mat& out){
 double*dst=out.ptr<double>();std::fill_n(dst,out.cols,0.);
 for(int ky=0;ky<weights.rows;ky++){const double*src=input.ptr<double>(weights.rows-1-ky)+weights.cols-1,*w=weights.ptr<double>(ky);int k=0;
 for(;k<=weights.cols-4;k+=4){int x=0;for(;x+1<out.cols;x+=2){auto g=wasm_f64x2_mul(wasm_v128_load(src+x-k),wasm_f64x2_splat(w[k]));for(int j=1;j<4;j++)g=wasm_f64x2_add(wasm_f64x2_mul(wasm_v128_load(src+x-k-j),wasm_f64x2_splat(w[k+j])),g);wasm_v128_store(dst+x,wasm_f64x2_add(wasm_v128_load(dst+x),g));}for(;x<out.cols;x++){double g=w[k]*src[x-k];for(int j=1;j<4;j++)g=w[k+j]*src[x-k-j]+g;dst[x]+=g;}}
 for(;k<weights.cols;k++){int x=0;for(;x+1<out.cols;x+=2)wasm_v128_store(dst+x,wasm_f64x2_add(wasm_f64x2_mul(wasm_v128_load(src+x-k),wasm_f64x2_splat(w[k])),wasm_v128_load(dst+x)));for(;x<out.cols;x++)dst[x]=w[k]*src[x-k]+dst[x];}
 }
}
static Plane convolve(Plane a,cv::Mat kernel,bool valid){
 if(valid&&(a.h<kernel.rows||a.w<kernel.cols)){if(a.h>kernel.rows||a.w>kernel.cols)throw std::runtime_error("Incompatible valid convolution dimensions");cv::Mat b(a.h,a.w,CV_64F);for(int y=0;y<a.h;y++)std::copy_n(a.row(y),a.w,b.ptr<double>(y));Plane swapped(kernel.cols,kernel.rows);for(int y=0;y<kernel.rows;y++)std::copy_n(kernel.ptr<double>(y),kernel.cols,swapped.output(y));a=std::move(swapped);kernel=b;}
 const int w=valid?a.w-kernel.cols+1:a.w,h=valid?a.h-kernel.rows+1:a.h,left=valid?0:kernel.cols-1-(kernel.cols-1)/2,top=valid?0:kernel.rows-1-(kernel.rows-1)/2;
 Plane out(w,h);cv::Mat band(kernel.rows,a.w+(valid?0:kernel.cols-1),CV_64F),result(1,w,CV_64F);
 for(int y=0;y<h;y++){check("convolve",y,h);for(int ky=0;ky<kernel.rows;ky++){double*p=band.ptr<double>(ky);std::fill_n(p,band.cols,0.);const int iy=y+ky-top;if(iy>=0&&iy<a.h)std::copy_n(a.row(iy),a.w,p+left);}if(separatedArithmetic)convolveSeparated(band,kernel,result);else comparisonConvolveRows(band,kernel,result);std::copy_n(result.ptr<double>(),w,out.output(y));}return out;
}
static cv::Mat kernel(const double*values,int size){return cv::Mat(size,size,CV_64F,const_cast<double*>(values));}
static Plane half(const Plane&a){Plane out((a.w+1)/2,(a.h+1)/2);for(int y=0;y<out.h;y++){check("pyramid",y,out.h);const double*p=a.row(y*2);double*q=out.output(y);for(int x=0;x<out.w;x++)q[x]=p[x*2];}return out;}
template<class F>static double pairwise(size_t n,F&next){if(n<8){double s=-0.;for(size_t i=0;i<n;i++)s+=next();return s;}if(n<=128){double r[8];for(int i=0;i<8;i++)r[i]=next();size_t i=8;for(;i<n-n%8;i+=8)for(int j=0;j<8;j++)r[j]+=next();double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=next();return s;}size_t cut=n/2;cut-=cut%8;double a=pairwise(cut,next),b=pairwise(n-cut,next);return a+b;}
static double sum(const Plane&a,int crop=0){const int w=a.w-2*crop,h=a.h-2*crop;if(w<=0||h<=0)return NAN;size_t at=0;const double*p=nullptr;auto next=[&](){int x=at%w;if(!x){int y=int(at/w)+crop;check("global-reduction",y,a.h);p=a.row(y)+crop;}at++;return p[x];};return pairwise(size_t(w)*h,next);}
static double mean(const Plane&a,int crop=0){return sum(a,crop)/double((a.w-2*crop)*(a.h-2*crop));}
static Plane highpass(const Plane&a){Plane out(a.w,a.h);for(int y=0;y<a.h;y++){check("highpass",y,a.h);const double*rows[3];for(int j=0;j<3;j++)rows[j]=a.row(reflect(y+j-1,a.h));double*q=out.output(y);for(int x=0;x<a.w;x++){double s=0;for(int j=-1;j<=1;j++)for(int k=-1;k<=1;k++)s+=rows[j+1][reflect(x+k,a.w)]*(j==0&&k==0?8:-1);q[x]=s+s;}}return out;}
struct Moments{Plane xx,yy,xy,vx,vy,cov;};
static Moments moments(const Plane&x,const Plane&y,const cv::Mat&win,bool valid){auto a=convolve(x,win,valid),b=convolve(y,win,valid);auto xx=mul(a,a),yy=mul(b,b),xy=mul(a,b);auto vx=sub(convolve(mul(x,x),win,valid),xx),vy=sub(convolve(mul(y,y),win,valid),yy),cov=sub(convolve(mul(x,y),win,valid),xy);return {xx,yy,xy,vx,vy,cov};}
static double rase(const Plane&x,const Plane&y){auto difference=sub(x,y),error=uniform(mul(difference,difference),8),means=uniform(x,8,true);return mean(binary(error,means,[](double e,double m){m/=64.;double r=std::sqrt(e);return m!=0?(100./m)*std::sqrt(r*r):0.;}),4);}
static double uqi(const Plane&x,const Plane&y){auto a=uniform(x,8),b=uniform(y,8),aa=uniform(mul(x,x),8),bb=uniform(mul(y,y),8),ab=uniform(mul(x,y),8);Plane out(x.w,x.h);for(int row=0;row<x.h;row++){check("uqi",row,x.h);const double*ap=a.row(row),*bp=b.row(row),*aap=aa.row(row),*bbp=bb.row(row),*abp=ab.row(row);double*q=out.output(row);for(int i=0;i<x.w;i++){double u=ap[i],v=bp[i],uv=u*v,ss=u*u+v*v,numerator=4*(64*abp[i]-uv)*uv,d1=64*(aap[i]+bbp[i])-ss,d=d1*ss;q[i]=d!=0?numerator/d:(d1==0&&ss!=0?2*uv/ss:1.);}}return mean(out,4);}
static double scc(const Plane&x,const Plane&y){cv::Mat win(8,8,CV_64F,cv::Scalar(1./64));auto m=moments(highpass(x),highpass(y),win,false);Plane out(m.cov.w,m.cov.h);for(int row=0;row<out.h;row++){check("scc",row,out.h);const double*a=m.vx.row(row),*b=m.vy.row(row),*c=m.cov.row(row);double*q=out.output(row);for(int i=0;i<out.w;i++){double d=std::sqrt(std::max(a[i],0.))*std::sqrt(std::max(b[i],0.));q[i]=d==0?0:c[i]/d;}}return mean(out);}
static double msssim(Plane x,Plane y){static const double weights[]={.0448,.2856,.3001,.2363,.1333};const int scales=std::min(5,int(std::floor(std::log2(std::min(x.h,x.w)/11.)))+1);if(scales<=0)return NAN;auto win=kernel(comparisonKernel_ssim,11);std::complex<double> score(1,0);const double c1=(.01*255)*(.01*255),c2=(.03*255)*(.03*255);
 for(int scale=0;scale<scales;scale++){{auto m=moments(x,y,win,true);Plane out(m.xx.w,m.xx.h);for(int row=0;row<out.h;row++){check("msssim",row,out.h);const double*a=m.xx.row(row),*b=m.yy.row(row),*ab=m.xy.row(row),*va=m.vx.row(row),*vb=m.vy.row(row),*cov=m.cov.row(row);double*q=out.output(row);for(int i=0;i<out.w;i++){double cs=2*cov[i]+c2,den=va[i]+vb[i]+c2;q[i]=scale==scales-1?((2*ab[i]+c1)*cs)/((a[i]+b[i]+c1)*den):cs/den;}}score*=std::pow(std::complex<double>(mean(out),0),weights[scale]);}if(scale<scales-1){x=half(uniform(x,2,true));y=half(uniform(y,2,true));}}
 return score.real();}
static double vifp(Plane x,Plane y){const double*kernels[]={comparisonKernel_vif17,comparisonKernel_vif9,comparisonKernel_vif5,comparisonKernel_vif3};const int sizes[]={17,9,5,3};double numerator=0,denominator=0;
 for(int scale=0;scale<4;scale++){auto win=kernel(kernels[scale],sizes[scale]);if(scale){x=half(convolve(x,win,true));y=half(convolve(y,win,true));}auto m=moments(x,y,win,true);Plane a(m.xx.w,m.xx.h),b(m.xx.w,m.xx.h);for(int row=0;row<a.h;row++){check("vifp",row,a.h);const double*va=m.vx.row(row),*vb=m.vy.row(row),*c=m.cov.row(row);double*ap=a.output(row),*bp=b.output(row);for(int i=0;i<a.w;i++){double vx=std::max(va[i],0.),vy=std::max(vb[i],0.),cov=c[i],gain=cov/(vx+1e-10),noise=vy-gain*cov;if(vx<1e-10){gain=0;noise=vy;vx=0;}if(vy<1e-10){gain=0;noise=0;}if(gain<0){noise=vy;gain=0;}if(noise<=1e-10)noise=1e-10;ap[i]=std::log10(1.+gain*gain*vx/(noise+2));bp[i]=std::log10(1.+vx/2);}}numerator+=sum(a);denominator+=sum(b);}return numerator/denominator;}
static std::array<double,5> results;
extern "C" int comparison_sewar_paged(int width,int height,int original,char*error){try{comparisonFastArithmetic=original!=1;separatedArithmetic=original==2;results.fill(NAN);Plane x(width,height),y(width,height);std::vector<unsigned char>rgb(size_t(width)*3);for(int side=0;side<2;side++)for(int row=0;row<height;row++){check("gray",row,height);if(sewarSource(side,row,rgb.data()))throw std::runtime_error("Sewar source failed");double*q=(side?y:x).output(row);for(int i=0;i<width;i++)q[i]=(rgb[i*3]*9798+rgb[i*3+1]*19235+rgb[i*3+2]*3735+16384)>>15;}
 try{results[0]=msssim(x,y);}catch(const std::runtime_error&){if(EM_ASM_INT({return !!Module.ioError;}))throw;}results[1]=rase(x,y);results[2]=scc(x,y);results[3]=uqi(x,y);try{results[4]=vifp(x,y);}catch(const std::runtime_error&){if(EM_ASM_INT({return !!Module.ioError;}))throw;}return 0;
 }catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
extern "C" const double* comparison_sewar_values(){return results.data();}
