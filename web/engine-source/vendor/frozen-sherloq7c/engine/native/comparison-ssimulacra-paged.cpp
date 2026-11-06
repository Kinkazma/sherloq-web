// Paged grayscale entry point of retained Cloudinary SSIMULACRA.
// Retain vendor/comparison/ssimulacra/ssimulacra.cpp notices and constants.
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <cfloat>
#include <cstring>
#include <cmath>
#include <cstdio>
#include "comparison-paged-plane.h"
#include "stereo-fma.h"
#include "stereo-gaussian-simd.h"
#include "sqrt-tables.h"
using Plane=ComparisonPlane<float>;
static int reflect101(int x,int n){if(n==1)return 0;while(x<0||x>=n)x=x<0?-x:2*n-x-2;return x;}
static Plane gaussian(const Plane&a){auto weights=cv::getGaussianKernel(11,1.5,CV_32F);const float*k=weights.ptr<float>();Plane horizontal(a.w,a.h),out(a.w,a.h);std::vector<float>padded(a.w+10);
 for(int y=0;y<a.h;y++){check("gaussian-horizontal",y,a.h);const float*p=a.row(y);for(int i=0;i<a.w+10;i++)padded[i]=p[reflect101(i-5,a.w)];float*q=horizontal.output(y);for(int x=0;x<a.w;x++)q[x]=padded[x]*k[0];for(int j=1;j<11;j++)stereoGaussianAccumulate<false>(q,padded.data()+j,nullptr,k[j],a.w);}
 for(int y=0;y<a.h;y++){check("gaussian-vertical",y,a.h);const float*p=horizontal.row(y);float*q=out.output(y);for(int x=0;x<a.w;x++)q[x]=p[x]*k[5];for(int j=1;j<=5;j++){const float*above=horizontal.row(reflect101(y-j,a.h)),*below=horizontal.row(reflect101(y+j,a.h));stereoGaussianAccumulate<true>(q,above,below,k[5+j],a.w);}}return out;}
static Plane product(const Plane&a,const Plane&b){Plane out(a.w,a.h);for(int y=0;y<a.h;y++){check("product",y,a.h);const float*p=a.row(y),*q=b.row(y);float*r=out.output(y);for(int x=0;x<a.w;x++)r[x]=p[x]*q[x];}return out;}
static Plane minus(const Plane&a,const Plane&b){Plane out(a.w,a.h);for(int y=0;y<a.h;y++){check("variance",y,a.h);const float*p=a.row(y),*q=b.row(y);float*r=out.output(y);for(int x=0;x<a.w;x++)r[x]=p[x]-q[x];}return out;}
static Plane area(const Plane&a,int factor){int w=cvRound(a.w/double(factor)),h=cvRound(a.h/double(factor));Plane out(w,h);cv::Mat band(factor,a.w,CV_32F),result;
 for(int y=0;y<h;y++){check("pyramid",y,h);int rows=std::min(factor,a.h-y*factor);for(int j=0;j<rows;j++)std::copy_n(a.row(y*factor+j),a.w,band.ptr<float>(j));cv::resize(band.rowRange(0,rows),result,cv::Size(),1./factor,1./rows,cv::INTER_AREA);float*q=out.output(y);std::copy_n(result.ptr<float>(),w,q);
 if(factor==2&&rows==2){const float*top=band.ptr<float>(),*bottom=band.ptr<float>(1);for(int x=0;x<std::min(w,a.w/2)/4*4;x++)q[x]=((top[2*x]+top[2*x+1])+(bottom[2*x]+bottom[2*x+1]))*.25f;}}
 return out;}
// Same continuous mean reduction as retained native helper; no row-boundary reset.
template<class Read>static double continuousMean(size_t n,Read read){double lanes[4]={},sum=0;size_t i=0;for(;i+8<=n;i+=8)for(int k=0;k<4;k++)lanes[k]+=double(read(i+k))+double(read(i+k+4));for(double v:lanes)sum+=v;for(;i+4<=n;i+=4)sum+=((read(i)+read(i+1))+read(i+2))+read(i+3);for(;i<n;i++)sum+=read(i);return sum*(1./double(n));}
static double mean(const Plane&a){int last=-1;const float*p=nullptr;return continuousMean(size_t(a.w)*a.h,[&](size_t at){int y=at/a.w;if(y!=last){check("mean",y,a.h);p=a.row(y);last=y;}return p[at%a.w];});}
static double grid(const Plane&a){std::vector<double> rows(a.h),cols(a.w,0.);for(int y=0;y<a.h;y++){check("grid",y,a.h);const float*p=a.row(y);rows[y]=continuousMean(a.w,[&](size_t i){return p[i];});for(int x=0;x<a.w;x++)cols[x]+=p[x];}for(double&v:cols)v*=1./a.h;std::sort(rows.begin(),rows.end());std::sort(cols.begin(),cols.end());return rows[a.h/50]+cols[a.w/50];}
static float divide(float a,float b,bool vector){if(!vector||b==0||!std::isfinite(b))return a/b;int exponent;float unit=std::frexp(std::abs(b),&exponent)*2.f;exponent--;uint32_t bits;std::memcpy(&bits,&unit,4);bits=reciprocalEstimate[(bits>>15)&255];float inverse;std::memcpy(&inverse,&bits,4);inverse=std::copysign(std::ldexp(inverse,-exponent),b);for(int k=0;k<2;k++)inverse=sherloq_stereo_fma(-b,inverse,2.f)*inverse;return a*inverse;}
static double compute(Plane a,Plane b){const float weights[]={.0448f,.2856f,.3001f,.2363f,.1333f,.1f},worst[]={.2f,.3f,.25f,.2f,.12f,.05f};double dssim=0,maximum=0;
 for(int scale=0;scale<6;scale++){if(a.w<8||a.h<8)break;if(scale){a=area(a,2);b=area(b,2);}auto ma=gaussian(a),mb=gaussian(b),aa=product(ma,ma),bb=product(mb,mb),ab=product(ma,mb),va=minus(gaussian(product(a,a)),aa),vb=minus(gaussian(product(b,b)),bb),cov=minus(gaussian(product(a,b)),ab);Plane map(a.w,a.h);
 for(int y=0;y<a.h;y++){check("ssimulacra",y,a.h);const float*ap=aa.row(y),*bp=bb.row(y),*abp=ab.row(y),*vap=va.row(y),*vbp=vb.row(y),*cp=cov.row(y);float*q=map.output(y);for(int x=0;x<a.w;x++){float t1=std::fma(abp[x],2.f,.0001f),t2=std::fma(cp[x],2.f,.0004f),t3=(ap[x]+bp[x])+.0001f,t4=(vap[x]+vbp[x])+.0004f;q[x]=divide(t1*t2,t3*t4,size_t(y)*a.w+x<(size_t(a.w)*a.h/2)*2);}}
 dssim+=mean(map)*weights[scale];maximum+=weights[scale];
 if(scale==0){Plane edges(a.w,a.h);for(int y=0;y<a.h;y++){check("edges",y,a.h);const float*ap=a.row(y),*bp=b.row(y),*mp=ma.row(y),*np=mb.row(y);float*q=edges.output(y);for(int x=0;x<a.w;x++)q[x]=1.f-std::max(std::abs(bp[x]-np[x])-std::abs(ap[x]-mp[x]),0.f);}dssim+=1.5*mean(edges);maximum+=1.5;dssim+=grid(map);maximum+=2;dssim+=grid(edges);maximum+=2;}
 auto blocks=area(map,4);double minimum=INFINITY;for(int y=0;y<blocks.h;y++){check("worst-block",y,blocks.h);const float*p=blocks.row(y);for(int x=0;x<blocks.w;x++)minimum=std::min(minimum,double(p[x]));}dssim+=.1*minimum*worst[scale];maximum+=.1*worst[scale];}
 dssim=maximum/dssim-1;dssim=std::clamp(dssim,0.,1.);char formatted[64];std::snprintf(formatted,sizeof(formatted),"%.8f",dssim);return std::strtod(formatted,nullptr);}
static double result;
extern "C" int comparison_ssimulacra_paged(int width,int height,int original,char*error){try{stereoFastArithmetic=!original;result=NAN;if(width<8||height<8)return 0;Plane a(width,height),b(width,height);std::vector<unsigned char>rgb(size_t(width)*3);for(int side=0;side<2;side++)for(int y=0;y<height;y++){check("gray",y,height);if(sewarSource(side,y,rgb.data()))throw std::runtime_error("Source failed");float*p=(side?b:a).output(y);for(int x=0;x<width;x++)p[x]=double((rgb[x*3]*9798+rgb[x*3+1]*19235+rgb[x*3+2]*3735+16384)>>15)/255.;}result=compute(a,b);return 0;}catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
extern "C" const double* comparison_ssimulacra_values(){return &result;}
