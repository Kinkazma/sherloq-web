// CM2 ALIKED: Native Kornia CPU RGB/255, separable Gaussian antialias and
// PyTorch NCHW bilinear resize (align_corners=False), longest side 1024.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>
#include <numeric>
#include "../experiments/d2prl/reference-exp.h"
static int reflect(int i,int n){if(n<=1)return 0;while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;}
static std::vector<float> gaussian(double sigma){
 int k=int(std::max(4*sigma,3.));if(k%2==0)k++;std::vector<float> out(k);const float s=float(sigma),den=2.f*(s*s);float sum=0;
 for(int i=0;i<k;i++){const float x=float(i-k/2);out[i]=reference_exp(-(x*x)/den);sum+=out[i];}
 for(float&v:out)v/=sum;return out;
}
extern "C" int learned_prepare(const uint8_t* rgb,int iw,int ih,int ow,int oh,float* output){
 if(!rgb||!output||iw<1||ih<1||ow<1||oh<1||iw>16384||ih>16384||ow>1024||oh>1024)return 0;
 try{
 const int n=iw*ih,on=ow*oh;std::vector<float> input(n*3);for(int c=0;c<3;c++)for(int i=0;i<n;i++)input[c*n+i]=float(rgb[i*3+c])/255.f;
 if(iw>ow||ih>oh){
  const auto kx=gaussian(std::max((double(iw)/ow-1.)/2.,.001)),ky=gaussian(std::max((double(ih)/oh-1.)/2.,.001));std::vector<float> temp(input.size());
  for(int c=0;c<3;c++)for(int y=0;y<ih;y++)for(int x=0;x<iw;x++){float v=0;for(int k=0;k<int(kx.size());k++)v=std::fma(input[c*n+y*iw+reflect(x+k-int(kx.size()/2),iw)],kx[k],v);temp[c*n+y*iw+x]=v;}
  for(int c=0;c<3;c++)for(int y=0;y<ih;y++)for(int x=0;x<iw;x++){float v=0;for(int k=0;k<int(ky.size());k++)v=std::fma(temp[c*n+reflect(y+k-int(ky.size()/2),ih)*iw+x],ky[k],v);input[c*n+y*iw+x]=v;}
 }
 const float sx=float(iw)/ow,sy=float(ih)/oh;
 for(int c=0;c<3;c++)for(int y=0;y<oh;y++){
  const float fy=std::max(0.f,std::fma(sy,float(y)+.5f,-.5f));const int y0=std::min(int(fy),ih-1),y1=std::min(y0+1,ih-1);const float ly=std::clamp(fy-y0,0.f,1.f),hy=1.f-ly;
  for(int x=0;x<ow;x++){
   const float fx=std::max(0.f,std::fma(sx,float(x)+.5f,-.5f));const int x0=std::min(int(fx),iw-1),x1=std::min(x0+1,iw-1);const float lx=std::clamp(fx-x0,0.f,1.f),hx=1.f-lx;const float* a=input.data()+c*n;
   const float top=std::fma(a[y0*iw+x0],hx,a[y0*iw+x1]*lx),bottom=std::fma(a[y1*iw+x0],hx,a[y1*iw+x1]*lx);output[c*on+y*ow+x]=std::fma(top,hy,bottom*ly);
  }
 }return 1;
 }catch(const std::bad_alloc&){return -2;}catch(...){return 0;}
}
extern "C" int aliked_select(const float* scores,const float* nms,const uint8_t* mask,int w,int h,float mean,int* output){
 if(!scores||!nms||!output||w<1||h<1)return -1;
 if(w<5||h<5)return 0;
 try{bool threshold=false;for(int y=2;y<h-2;y++)for(int x=2;x<w-2;x++)if(nms[y*w+x]>.2f)threshold=true;
 std::vector<int> ids;for(int y=2;y<h-2;y++)for(int x=2;x<w-2;x++){int i=y*w+x;if(nms[i]>(threshold?.2f:mean)&&(!mask||mask[i]))ids.push_back(i);}
 if(ids.size()>20000){std::sort(ids.begin(),ids.end(),[&](int a,int b){return scores[a]>scores[b];});ids.resize(20000);}std::copy(ids.begin(),ids.end(),output);return ids.size();
 }catch(const std::bad_alloc&){return -2;}catch(...){return -1;}
}
// Evaluate exactly the same separable filter only at columns consumed by the
// native bilinear resize. Global reflected coordinates are supplied by the row
// owner; no independent-tile filtering or alteration of the Gaussian support.
struct LearnedRows {
 int iw,ih,ow,oh; std::vector<float> kx,ky,input; std::vector<int> xs,ys;std::vector<float> lx,ly;
 LearnedRows(int w,int h,int a,int b):iw(w),ih(h),ow(a),oh(b),input(w*3),xs(a*2),ys(b*2),lx(a),ly(b){
  bool blur=w>a||h>b;kx=blur?gaussian(std::max((double(w)/a-1.)/2.,.001)):std::vector<float>{1};ky=blur?gaussian(std::max((double(h)/b-1.)/2.,.001)):std::vector<float>{1};
  float sx=float(w)/a,sy=float(h)/b;
  for(int x=0;x<a;x++){float v=std::max(0.f,std::fma(sx,float(x)+.5f,-.5f));xs[x*2]=std::min(int(v),w-1);xs[x*2+1]=std::min(xs[x*2]+1,w-1);lx[x]=std::clamp(v-xs[x*2],0.f,1.f);}
  for(int y=0;y<b;y++){float v=std::max(0.f,std::fma(sy,float(y)+.5f,-.5f));ys[y*2]=std::min(int(v),h-1);ys[y*2+1]=std::min(ys[y*2]+1,h-1);ly[y]=std::clamp(v-ys[y*2],0.f,1.f);}
 }
};
extern "C" LearnedRows* learned_rows_create(int w,int h,int a,int b){try{if(w<1||h<1||a<1||b<1)return nullptr;return new LearnedRows(w,h,a,b);}catch(...){return nullptr;}}
extern "C" void learned_rows_destroy(LearnedRows* r){delete r;}
extern "C" int learned_rows_support(LearnedRows* r,int y,int* indices){int k=r->ky.size();for(int t=0;t<2;t++)for(int i=0;i<k;i++)indices[t*k+i]=reflect(r->ys[y*2+t]+i-k/2,r->ih);return k;}
extern "C" int learned_rows_ksize(LearnedRows* r){return r->ky.size();}
extern "C" void learned_rows_horizontal(LearnedRows* r,const uint8_t* rgb,float* output){
 for(int c=0;c<3;c++)for(int x=0;x<r->iw;x++)r->input[c*r->iw+x]=float(rgb[x*3+c])/255.f;
 for(int c=0;c<3;c++)for(int x=0;x<r->ow*2;x++){float v=0;for(int k=0;k<int(r->kx.size());k++)v=std::fma(r->input[c*r->iw+reflect(r->xs[x]+k-int(r->kx.size()/2),r->iw)],r->kx[k],v);output[c*r->ow*2+x]=v;}
}
extern "C" void learned_rows_vertical(LearnedRows* r,const float*const* rows,int y,float* output){
 int k=r->ky.size(),n=r->ow*r->oh;float ly=r->ly[y],hy=1.f-ly;
 for(int c=0;c<3;c++)for(int x=0;x<r->ow;x++){
  float a=0,b=0,d=0,e=0;int i=c*r->ow*2+x*2;
  for(int j=0;j<k;j++){a=std::fma(rows[j][i],r->ky[j],a);b=std::fma(rows[j][i+1],r->ky[j],b);d=std::fma(rows[k+j][i],r->ky[j],d);e=std::fma(rows[k+j][i+1],r->ky[j],e);}
  float lx=r->lx[x],hx=1.f-lx,top=std::fma(a,hx,b*lx),bottom=std::fma(d,hx,e*lx);output[c*n+y*r->ow+x]=std::fma(top,hy,bottom*ly);
 }
}
