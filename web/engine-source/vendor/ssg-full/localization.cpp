// Independently written numerical SSG localization, from documented equations.
// No MATLAB implementation/runtime is included here.
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <cstdlib>
#include <vector>
#include "pocketfft_hdronly.h"
#include "localization-parallel.h"
#include "nearest.h"
using std::vector;using Complex=std::complex<double>;
static int clamp(int v,int n){return std::max(0,std::min(n-1,v));}
static void blur(const double*in,double*out,int w,int h,int r,double sigma,bool replicate){
 vector<double> tmp((size_t)w*h),kernel(2*r+1);double sum=0;for(int i=-r;i<=r;i++){kernel[i+r]=exp(-i*i/(2*sigma*sigma));sum+=kernel[i+r];}for(auto&v:kernel)v/=sum;
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){double v=0;for(int i=-r;i<=r;i++){int xx=x+i;if(replicate||xx>=0&&xx<w)v+=in[(size_t)y*w+clamp(xx,w)]*kernel[i+r];}tmp[(size_t)y*w+x]=v;}});
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){double v=0;for(int i=-r;i<=r;i++){int yy=y+i;if(replicate||yy>=0&&yy<h)v+=tmp[(size_t)clamp(yy,h)*w+x]*kernel[i+r];}out[(size_t)y*w+x]=v;}});
}
// Local overlap-save FFT convolution: bounded workspace independent of image
// dimensions, Float64, actual finite radial kernel, zero image padding.
static void radial(const double*in,double*out,int w,int h,double sigma){
 int k=ceil(6*sqrt(1/(2*sigma))),r=k/2,n=1;while(n<2*k)n*=2;int step=n-2*r;
 vector<double> real((size_t)n*n);vector<Complex> spectrum((size_t)n*(n/2+1)),kernel=spectrum;
 for(int y=0;y<k;y++)for(int x=0;x<k;x++){double dx=x-(k-1)/2.0,dy=y-(k-1)/2.0,d=hypot(dx,dy);if(d<=k/2.0)real[(size_t)((y-r+n)%n)*n+(x-r+n)%n]=exp(-sigma*d);}
 pocketfft::shape_t shape={(size_t)n,(size_t)n},axes={0,1};pocketfft::stride_t sr={(ptrdiff_t)n*8,8},sc={(ptrdiff_t)(n/2+1)*16,16};
 pocketfft::r2c(shape,sr,sc,axes,true,real.data(),kernel.data(),1.0,1);
 for(int top=0;top<h;top+=step)for(int left=0;left<w;left+=step){std::fill(real.begin(),real.end(),0);for(int y=0;y<n;y++){int yy=top+y-r;if(yy<0||yy>=h)continue;for(int x=0;x<n;x++){int xx=left+x-r;if(xx>=0&&xx<w)real[(size_t)y*n+x]=in[(size_t)yy*w+xx];}}
  pocketfft::r2c(shape,sr,sc,axes,true,real.data(),spectrum.data(),1.0,1);for(size_t i=0;i<spectrum.size();i++)spectrum[i]*=kernel[i];pocketfft::c2r(shape,sc,sr,axes,false,spectrum.data(),real.data(),1.0/(n*n),1);
  for(int y=0;y<std::min(step,h-top);y++)for(int x=0;x<std::min(step,w-left);x++)out[(size_t)(top+y)*w+left+x]=real[(size_t)(y+r)*n+x+r];
 }
}
// Each periodic line is an exact O(N) max/min filter using a monotone queue.
static void line(const double*in,double*out,int w,int h,int dx,int dy,int radius,bool dilate){
 vector<int> cells,queue;vector<double> values;cells.reserve(std::max(w,h));queue.resize(std::max(w,h)+2*radius);values.resize(std::max(w,h)+2*radius);
 for(int sy=0;sy<h;sy++)for(int sx=0;sx<w;sx++){int px=sx-dx,py=sy-dy;if(px>=0&&px<w&&py>=0&&py<h)continue;cells.clear();for(int x=sx,y=sy;x>=0&&x<w&&y>=0&&y<h;x+=dx,y+=dy)cells.push_back(y*w+x);int len=cells.size(),first=0,last=0;
  for(int i=-radius;i<len+radius;i++){double v=i<0||i>=len?(dilate?-INFINITY:INFINITY):in[cells[i]];int idx=i+radius;values[idx]=v;while(last>first&&(dilate?values[queue[last-1]]<=v:values[queue[last-1]]>=v))last--;queue[last++]=idx;while(last>first&&queue[first]<idx-2*radius)first++;int center=i-radius;if(center>=0&&center<len)out[cells[center]]=values[queue[first]];}
 }
}
static void n4_f64_original(const double*in,double*out,int w,int h,int radius,bool dilate){
 // Published MATLAB disk4 fixture is the Minkowski sum of four 3-element
 // lines: 37 pixels, 7x7. Larger n4 uses the stated periodic-line radial
 // decomposition; its integer rounding is reported, not called MATLAB exact.
 int b=floor(radius/(2+sqrt(2.0))),a=floor(radius*(sqrt(2.0)-1));
 // Two extra axial elements account for a residual of at least two pixels.
 // This reproduces published n4 disk4/disk5 footprints and disk15/disk50
 // extents; absence of the full MATLAB disk50 oracle remains explicit.
 if(radius-(a+2*b)>1)a++;
 if(radius==1){a=1;b=0;}
 // Preserve paths which leave the image and return through another periodic
 // line. Cropping after each line loses real border pixels in a decomposition.
 int pad=a+2*b,pw=w+2*pad,ph=h+2*pad;vector<double> one((size_t)pw*ph,dilate?-INFINITY:INFINITY),two(one.size());
 for(int y=0;y<h;y++)std::copy(in+(size_t)y*w,in+(size_t)(y+1)*w,one.begin()+(size_t)(y+pad)*pw+pad);
 line(one.data(),two.data(),pw,ph,1,0,a,dilate);line(two.data(),one.data(),pw,ph,0,1,a,dilate);line(one.data(),two.data(),pw,ph,1,1,b,dilate);line(two.data(),one.data(),pw,ph,1,-1,b,dilate);
 for(int y=0;y<h;y++)std::copy(one.begin()+(size_t)(y+pad)*pw+pad,one.begin()+(size_t)(y+pad)*pw+pad+w,out+(size_t)y*w);
}
#include "n4-binary-bitset.h"
static void n4(const double*in,double*out,int w,int h,int radius,bool dilate){if(!ssg_n4_binary_bitset(in,out,w,h,radius,dilate))n4_f64_original(in,out,w,h,radius,dilate);}
static double sample(const double*in,int w,int h,double x,double y){int ix=floor(x),iy=floor(y);double fx=x-ix,fy=y-iy,v=0;for(int yy=0;yy<2;yy++)for(int xx=0;xx<2;xx++)if(ix+xx>=0&&ix+xx<w&&iy+yy>=0&&iy+yy<h)v+=in[(size_t)(iy+yy)*w+ix+xx]*(xx?fx:1-fx)*(yy?fy:1-fy);return v;}
static void warp(const double*in,double*out,int w,int h,const double*m,bool reverse){double a=m[0],b=m[1],tx=m[2],c=m[3],d=m[4],ty=m[5],det=a*d-b*c;
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){double xx=x+1,yy=y+1,sx,sy;if(!reverse){double dx=xx-tx,dy=yy-ty;sx=(d*dx-b*dy)/det;sy=(-c*dx+a*dy)/det;}else{sx=a*xx+b*yy+tx;sy=c*xx+d*yy+ty;}out[(size_t)y*w+x]=sample(in,w,h,sx-1,sy-1);}
}
static void ssim(const double*a,const double*b,double*out,int w,int h,double sigma){size_t n=(size_t)w*h;int r=ceil(3*sigma);vector<double> ma(n),mb(n),aa(n),bb(n),ab(n),tmp(n);
 blur(a,ma.data(),w,h,r,sigma,true);blur(b,mb.data(),w,h,r,sigma,true);for(size_t i=0;i<n;i++)tmp[i]=a[i]*a[i];blur(tmp.data(),aa.data(),w,h,r,sigma,true);for(size_t i=0;i<n;i++)tmp[i]=b[i]*b[i];blur(tmp.data(),bb.data(),w,h,r,sigma,true);for(size_t i=0;i<n;i++)tmp[i]=a[i]*b[i];blur(tmp.data(),ab.data(),w,h,r,sigma,true);
 for(size_t i=0;i<n;i++){double va=std::max(0.0,aa[i]-ma[i]*ma[i]),vb=std::max(0.0,bb[i]-mb[i]*mb[i]),sd=sqrt(va*vb),cov=ab[i]-ma[i]*mb[i],l=(2*ma[i]*mb[i]+.0001)/(ma[i]*ma[i]+mb[i]*mb[i]+.0001),c=(2*sd+.0009)/(va+vb+.0009),s=(cov+.00045)/(sd+.00045);out[i]=l*l*l*c*s*s;}
}
static void components(uint8_t*mask,int w,int h,double area,const uint8_t*points,bool holes=false){size_t n=(size_t)w*h;vector<uint8_t> seen(n);vector<int> queue;queue.reserve(n);
 for(int start=0;start<(int)n;start++){bool wanted=holes?!mask[start]:mask[start];if(!wanted||seen[start])continue;queue.clear();queue.push_back(start);seen[start]=1;bool border=false;int support=0;
  for(size_t j=0;j<queue.size();j++){int i=queue[j],x=i%w,y=i/w;support+=points?points[i]:0;border|=x==0||x==w-1||y==0||y==h-1;int near[4]={x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1};for(int q:near)if(q>=0&&!seen[q]&&(holes?!mask[q]:mask[q])){seen[q]=1;queue.push_back(q);}}
  if(holes){if(!border)for(int q:queue)mask[q]=1;}else if(queue.size()<area||(points&&support<3))for(int q:queue)mask[q]=0;
 }
}
extern "C" {
int ssg_full_phrases(const double*points,const double*invariants,int features,const uint32_t*wordPairs,int wordCount,const double*weights,int spatialK,double ratio,double minimumDistance,uint32_t*outPairs,double*outDistances,uint32_t*outIds,double*outDescriptors){try{
 vector<uint8_t>seen(features);vector<uint32_t>ids;for(int i=0;i<wordCount*2;i++){uint32_t id=wordPairs[i];if(id>=(uint32_t)features)return -1;if(!seen[id]){seen[id]=1;ids.push_back(id);}}
 int count=ids.size();vector<double>coords((size_t)count*2);for(int i=0;i<count;i++){outIds[i]=ids[i];coords[i*2]=points[ids[i]*3];coords[i*2+1]=points[ids[i]*3+1];}FullNearest spatial(coords.data(),2,count);
 full_parallel(count,[&](int i){auto near=spatial.query(i,std::min(spatialK,count-1));for(int d=0;d<24;d++){double maximum=-INFINITY;for(auto n:near)maximum=std::max(maximum,invariants[(size_t)ids[n.id]*24+d]);outDescriptors[(size_t)i*24+d]=weights[ids[i]]*(invariants[(size_t)ids[i]*24+d]+(near.empty()?0:maximum));}});
 if(count<3)return 0;FullNearest descriptor(outDescriptors,24,count);vector<int>matches(count,-1);vector<double>distances((size_t)count*2);
 full_parallel(count,[&](int i){auto near=descriptor.query(i,2);double d1=sqrt(near[0].distance),d2=sqrt(near[1].distance);uint32_t a=ids[i],b=ids[near[0].id];double x=points[a*3]-points[b*3],y=points[a*3+1]-points[b*3+1];if(d1/d2<=ratio&&x*x+y*y>=minimumDistance*minimumDistance){matches[i]=near[0].id;distances[i*2]=d1;distances[i*2+1]=d2;}});
 int output=0;for(int i=0;i<count;i++)if(matches[i]>=0){outPairs[output*2]=ids[i];outPairs[output*2+1]=ids[matches[i]];outDistances[output*2]=distances[i*2];outDistances[output*2+1]=distances[i*2+1];output++;}return output;
 }catch(...){return -2;}}
int ssg_full_morph(const double*in,double*out,int w,int h,int radius,int dilation){try{n4(in,out,w,h,radius,dilation!=0);return 0;}catch(...){return -2;}}
int ssg_full_salience(const float*edge,const double*points,int count,int w,int h,double sigma,double*out){try{size_t n=(size_t)w*h;vector<double> in(n),filtered(n);for(size_t i=0;i<n;i++)in[i]=edge[i];blur(in.data(),filtered.data(),w,h,ceil(3*sqrt(1/(2*sigma))),sqrt(1/(2*sigma)),false);double low=INFINITY,high=-INFINITY;for(int i=0;i<count;i++){int x=round(points[i*3]),y=round(points[i*3+1]);out[i]=filtered[(size_t)y*w+x];low=std::min(low,out[i]);high=std::max(high,out[i]);}for(int i=0;i<count;i++)out[i]=high>low?1+(out[i]-low)/(high-low):1;return 0;}catch(...){return -2;}}
int ssg_full_blur(const double*gray,double*out,int w,int h){try{blur(gray,out,w,h,7,2,false);return 0;}catch(...){return -2;}}
int ssg_full_ssim(const double*a,const double*b,double*out,int w,int h,double sigma){try{ssim(a,b,out,w,h,sigma);return 0;}catch(...){return -2;}}
int ssg_full_roi(const double*points,int count,const uint32_t*pairs,int matches,int w,int h,double sigma,int radius,double*out){try{
 vector<double> counts((size_t)w*h),dilated(counts.size());for(int i=0;i<matches*2;i++){int id=pairs[i],x=round(points[id*3]),y=round(points[id*3+1]),r=floor(10*points[id*3+2]);for(int yy=std::max(0,y-r);yy<=std::min(h-1,y+r);yy++)for(int xx=std::max(0,x-r);xx<=std::min(w-1,x+r);xx++)if((xx-x)*(xx-x)+(yy-y)*(yy-y)<r*r)counts[(size_t)yy*w+xx]++;}
 n4(counts.data(),dilated.data(),w,h,radius,true);radial(dilated.data(),out,w,h,sigma);int k=ceil(6*sqrt(1/(2*sigma)));vector<double> three((size_t)k*k,3),normal(three.size());radial(three.data(),normal.data(),k,k,sigma);double mean=0;for(auto v:normal)mean+=v;mean/=normal.size();for(size_t i=0;i<counts.size();i++)out[i]=std::max(0.0,std::min(1.0,out[i]/mean));return 0;
 }catch(...){return -2;}}
int ssg_full_localize(const double*blurred,const double*roi,const double*matrix,const double*points,int count,int w,int h,double threshold,double minarea,double sigma,int opening,uint8_t*out){try{
 size_t n=(size_t)w*h;vector<double> warped(n),map(n),one(n),two(n);vector<uint8_t> pointsMap(n),current(n);std::fill(out,out+n,0);
 for(int i=0;i<count;i++){int x=round(points[i*2]),y=round(points[i*2+1]);if(x>=0&&x<w&&y>=0&&y<h)pointsMap[(size_t)y*w+x]=1;}
 for(int direction=0;direction<2;direction++){warp(blurred,warped.data(),w,h,matrix,direction);ssim(blurred,warped.data(),map.data(),w,h,sigma);for(size_t i=0;i<n;i++)one[i]=map[i]*roi[i]>=threshold?1:0;n4(one.data(),two.data(),w,h,opening,false);n4(two.data(),one.data(),w,h,opening,true);for(size_t i=0;i<n;i++)current[i]=one[i]>0;
  components(current.data(),w,h,n*minarea,nullptr);components(current.data(),w,h,0,nullptr,true);for(size_t i=0;i<n;i++)out[i]|=current[i];
 }
 components(out,w,h,n*minarea,pointsMap.data());return 0;
 }catch(...){return -2;}}
}
